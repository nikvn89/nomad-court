import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Field from '../components/Field';
import Notice from '../components/Notice';
import { checkEvidenceUrl, checkHostAddress } from '../lib/validate';
import { genToWei, shortAddress, weiToGen } from '../lib/format';
import { publishText } from '../lib/disputes';
import {
  CONTRACT_ADDRESS,
  decodeDisputeIdFromLeaderReceipt,
  revertReason,
  waitFinalized,
  writeClient,
} from '../lib/genlayer';

type RulesMode = 'LINK' | 'TEXT';

interface Props {
  account: string | null;
  onConnect: () => void;
}

export default function NewDispute({ account, onConnect }: Props) {
  const navigate = useNavigate();

  const [host, setHost] = useState('');
  const [rulesMode, setRulesMode] = useState<RulesMode>('LINK');
  const [rulesLink, setRulesLink] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [deposit, setDeposit] = useState('10');

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');

  const hostVerdict = useMemo(() => checkHostAddress(host, account), [host, account]);
  const linkVerdict = useMemo(() => checkEvidenceUrl(rulesLink), [rulesLink]);
  const depositWei = useMemo(() => genToWei(deposit), [deposit]);

  const depositVerdict = !deposit.trim()
    ? { ok: false, message: 'Enter the bond you want to lock.' }
    : depositWei === null
      ? { ok: false, message: 'Use a plain number of GEN, for example 10 or 2.5.' }
      : depositWei === 0n
        ? { ok: false, message: 'Dispute creation requires a positive deposit value.' }
        : { ok: true, message: `Locks ${weiToGen(depositWei)} GEN until the case is adjudicated.` };

  const rulesReady = rulesMode === 'LINK' ? linkVerdict.ok : rulesText.trim().length > 0;
  const ready = Boolean(account) && hostVerdict.ok && depositVerdict.ok && rulesReady && !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!account || !ready || depositWei === null) return;

    setBusy(true);
    setError('');
    setHash('');

    try {
      let rulesUrl = rulesLink.trim();

      if (rulesMode === 'TEXT') {
        setStep('Publishing your house rules so the validators can read them…');
        rulesUrl = await publishText(rulesText.trim());
      }

      setStep('Confirm the transaction in your wallet.');
      const client = await writeClient(account);

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_dispute',
        args: [host.trim(), rulesUrl],
        value: depositWei,
      });

      setHash(txHash);
      setStep('Submitted. Waiting for the network to finalize it…');

      const receipt = await waitFinalized(client, txHash as `0x${string}`);
      const id = decodeDisputeIdFromLeaderReceipt(receipt);

      navigate(`/dispute/${id}`);
    } catch (err) {
      setError(revertReason(err));
      setStep('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">File a case</h1>
        <p className="mt-2 text-gray-400">
          You are the guest. You name the host, agree the rules the validators will read, and lock a
          bond. Both sides then submit evidence, and the bond is split by the verdict.
        </p>
      </div>

      {!account ? (
        <Notice kind="info">
          Connect a wallet to file a case.{' '}
          <button type="button" onClick={onConnect} className="underline">
            Connect now
          </button>
        </Notice>
      ) : null}

      <form onSubmit={submit} className="glass-panel space-y-6 p-6">
        <Field
          label="Host wallet address"
          status={host ? hostVerdict : null}
          hint="The other party to the case. It cannot be the wallet you are connected with."
        >
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            spellCheck={false}
            placeholder="0x…"
            className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 font-mono text-sm text-gray-100 outline-none focus:border-indigo-500"
          />
          {host && hostVerdict.ok ? (
            <span className="mt-1 block font-mono text-xs text-gray-500">
              {shortAddress(host, 10, 8)}
            </span>
          ) : null}
        </Field>

        <div className="space-y-3">
          <span className="block text-sm font-semibold text-gray-200">House rules</span>
          <div className="flex gap-2">
            {(['LINK', 'TEXT'] as RulesMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRulesMode(mode)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  rulesMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-800 text-gray-400'
                }`}
              >
                {mode === 'LINK' ? 'Link to them' : 'Write them out'}
              </button>
            ))}
          </div>

          {rulesMode === 'LINK' ? (
            <Field
              label=""
              status={rulesLink ? linkVerdict : null}
              hint="A public link anyone can open — a listing page, a shared document, a booking confirmation."
            >
              <input
                value={rulesLink}
                onChange={(e) => setRulesLink(e.target.value)}
                spellCheck={false}
                placeholder="https://…"
                className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
              />
            </Field>
          ) : (
            <Field
              label=""
              hint="Your text is published to a public paste service and the link is stored on chain. Do not include anything private."
              status={
                rulesText.trim()
                  ? { ok: true, message: `${rulesText.trim().length} characters` }
                  : null
              }
            >
              <textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={6}
                placeholder="Check-in was 3pm, the listing promised working air conditioning…"
                className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
              />
            </Field>
          )}
        </div>

        <Field
          label="Bond to lock (GEN)"
          status={deposit ? depositVerdict : null}
          hint="Held by the contract until the case is adjudicated, then split between the two sides by the verdict."
        >
          <input
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
          />
          {depositWei !== null && depositWei > 0n ? (
            <span className="mt-1 block font-mono text-xs text-gray-500">
              {depositWei.toString()} wei
            </span>
          ) : null}
        </Field>

        {step ? <Notice kind="info" txHash={hash || undefined}>{step}</Notice> : null}
        {error ? <Notice kind="error">{error}</Notice> : null}

        <button
          type="submit"
          disabled={!ready}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : null}
          {busy ? 'Working…' : 'File the case and lock the bond'}
        </button>

        {!ready && account && !busy ? (
          <p className="text-center text-xs text-gray-500">
            Fill in every field above before the case can be filed.
          </p>
        ) : null}
      </form>
    </div>
  );
}
