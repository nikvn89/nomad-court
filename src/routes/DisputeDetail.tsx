import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Gavel, Loader2, RefreshCw, Send } from 'lucide-react';
import type { Dispute } from '../types';
import { evidenceCount, phaseOf, readDispute, viewerRole } from '../lib/disputes';
import { CONTRACT_ADDRESS, revertReason, waitFinalized, writeClient } from '../lib/genlayer';
import { sameAddress, shortAddress, weiToGen } from '../lib/format';
import { checkEvidenceUrl } from '../lib/validate';
import StatusPill from '../components/StatusPill';
import EvidenceBlock from '../components/EvidenceBlock';
import VerdictPanel from '../components/VerdictPanel';
import Notice from '../components/Notice';
import Field from '../components/Field';

interface Props {
  account: string | null;
  onConnect: () => void;
}

export default function DisputeDetail({ account, onConnect }: Props) {
  const { id = '' } = useParams();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const found = await readDispute(id);
      setDispute(found);
      setMissing(found === null);
    } catch (err) {
      setError(revertReason(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const role = useMemo(() => viewerRole(dispute, account), [dispute, account]);
  const verdict = useMemo(() => checkEvidenceUrl(evidence), [evidence]);

  const mySubmitted =
    dispute && role === 'GUEST'
      ? Boolean(dispute.guestEvidenceUrl)
      : dispute && role === 'HOST'
        ? Boolean(dispute.hostEvidenceUrl)
        : false;

  const isParty = role === 'GUEST' || role === 'HOST';
  const open = dispute ? phaseOf(dispute) !== 'RESOLVED' : false;
  const canSubmit = Boolean(dispute) && isParty && open && !mySubmitted && verdict.ok && !busy;
  const canResolve =
    Boolean(dispute) && Boolean(account) && open && evidenceCount(dispute!) === 2 && !busy;

  async function send(fn: 'submit_evidence' | 'resolve_dispute') {
    if (!account || !dispute) return;

    setBusy(true);
    setError('');
    setHash('');

    try {
      setStep('Confirm the transaction in your wallet.');
      const client = await writeClient(account);

      const args =
        fn === 'submit_evidence' ? [dispute.id, evidence.trim()] : [dispute.id];

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: fn,
        args,
        // Neither call is payable; the SDK still wants the field spelled out.
        value: 0n,
      });

      setHash(txHash);
      setStep(
        fn === 'resolve_dispute'
          ? 'Submitted. Validators are reading the evidence — this can take a minute.'
          : 'Submitted. Waiting for the network to finalize it…',
      );

      await waitFinalized(client, txHash as `0x${string}`, fn === 'resolve_dispute' ? 45 : 30);
      await load();

      setStep(fn === 'resolve_dispute' ? 'Case adjudicated and settled.' : 'Evidence recorded.');
      if (fn === 'submit_evidence') setEvidence('');
    } catch (err) {
      // A slow adjudication can outlive the wait while still succeeding, so the
      // contract is asked again before anything is called a failure.
      await load();
      setError(revertReason(err));
      setStep('');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="animate-spin" size={18} />
        Reading case #{id}…
      </div>
    );
  }

  if (missing || !dispute) {
    return (
      <div className="glass-panel mx-auto max-w-lg space-y-3 p-8 text-center">
        <h1 className="text-2xl font-bold text-white">No case #{id}</h1>
        <p className="text-gray-400">Nothing has been filed under that number.</p>
        <Link to="/" className="inline-block text-indigo-300 underline">
          Back to the explorer
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Case #{dispute.id}</h1>
          <p className="mt-1 text-sm text-gray-500">
            You are viewing this as{' '}
            <span className="font-semibold text-gray-300">
              {role === 'DISCONNECTED' ? 'a visitor' : role.toLowerCase()}
            </span>
            {isParty ? ' — your role comes from the contract, not from a setting.' : '.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill dispute={dispute} />
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-400 hover:text-gray-100"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <section className="glass-panel grid gap-4 p-6 sm:grid-cols-3">
        <div>
          <p className="text-sm text-gray-500">Guest</p>
          <p className="font-mono text-sm text-gray-200">{shortAddress(dispute.guest, 10, 6)}</p>
          {sameAddress(account, dispute.guest) ? (
            <p className="text-xs text-indigo-300">this is you</p>
          ) : null}
        </div>
        <div>
          <p className="text-sm text-gray-500">Host</p>
          <p className="font-mono text-sm text-gray-200">{shortAddress(dispute.host, 10, 6)}</p>
          {sameAddress(account, dispute.host) ? (
            <p className="text-xs text-indigo-300">this is you</p>
          ) : null}
        </div>
        <div>
          <p className="text-sm text-gray-500">Bond held</p>
          <p className="text-sm text-gray-200">{weiToGen(dispute.depositWei)} GEN</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">House rules the validators read</h2>
        {dispute.rulesUrl.startsWith('http') ? (
          <a
            href={dispute.rulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block break-all text-sm text-indigo-300 underline"
          >
            {dispute.rulesUrl}
          </a>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-gray-300">{dispute.rulesUrl}</p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <EvidenceBlock
          title="Guest evidence"
          url={dispute.guestEvidenceUrl}
          self={sameAddress(account, dispute.guest)}
        />
        <EvidenceBlock
          title="Host evidence"
          url={dispute.hostEvidenceUrl}
          self={sameAddress(account, dispute.host)}
        />
      </section>

      {phaseOf(dispute) === 'RESOLVED' ? <VerdictPanel dispute={dispute} /> : null}

      {step ? <Notice kind="success" txHash={hash || undefined}>{step}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}

      {open ? (
        <section className="glass-panel space-y-5 p-6">
          <h2 className="text-lg font-bold text-white">Act on this case</h2>

          <div className="space-y-3">
            <Field
              label="Submit your evidence"
              status={evidence ? verdict : null}
              hint={
                <>
                  Evidence is referenced by a public link; the file itself is never stored on chain.
                  Upload it somewhere public first — a shared drive folder, an image host, an IPFS
                  gateway — set it to anyone-with-the-link, then paste that link here.
                </>
              }
            >
              <div className="flex gap-2">
                <input
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  spellCheck={false}
                  disabled={!isParty || mySubmitted}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500 disabled:opacity-40"
                />
                {verdict.ok ? (
                  <a
                    href={evidence.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-300"
                  >
                    Test link
                  </a>
                ) : null}
              </div>
            </Field>

            <button
              type="button"
              onClick={() => send('submit_evidence')}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={16} /> Submit evidence
            </button>

            {!account ? (
              <p className="text-xs text-gray-500">
                <button type="button" onClick={onConnect} className="underline">
                  Connect a wallet
                </button>{' '}
                to act on this case.
              </p>
            ) : !isParty ? (
              <p className="text-xs text-gray-500">
                Only the recorded Host or Guest can submit evidence.
              </p>
            ) : mySubmitted ? (
              <p className="text-xs text-gray-500">
                Your evidence is already recorded and cannot be replaced.
              </p>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-gray-800 pt-5">
            <button
              type="button"
              onClick={() => send('resolve_dispute')}
              disabled={!canResolve}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Gavel size={16} /> Ask the validators to adjudicate
            </button>
            <p className="text-xs text-gray-500">
              {evidenceCount(dispute) < 2
                ? 'Both parties must submit evidence before resolution.'
                : !account
                  ? 'Connect any wallet — adjudication is open to anyone once both sides have filed.'
                  : 'Open to anyone: the contract does not restrict who may start adjudication.'}
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
