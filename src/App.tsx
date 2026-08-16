import React, { useMemo, useState } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { ShieldAlert, Send, Gavel, Scale, Loader2, User, Wallet } from 'lucide-react';
import './index.css';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any }) => Promise<any>;
    };
  }
}

const CONTRACT_ADDRESS = '0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7';
const EXPLORER_BASE = 'https://explorer-studio.genlayer.com';

type Role = 'GUEST' | 'HOST';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimitError(err: any) {
  const text = String(err?.message ?? err ?? '').toLowerCase();
  return (
    text.includes('rate limit') ||
    text.includes('rate limited') ||
    text.includes('429') ||
    text.includes('failed to fetch')
  );
}

function decodeHexUtf8(hex: string) {
  if (!hex?.startsWith('0x')) return '';
  try {
    const body = hex.slice(2);
    const bytes = new Uint8Array(
      body.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [],
    );
    return new TextDecoder().decode(bytes).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

function findReturnedId(value: any, depth = 0): string | null {
  if (value == null || depth > 8) return null;

  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d+$/.test(t)) return t;

    try {
      const parsed = JSON.parse(t);
      if (typeof parsed === 'string' && /^\d+$/.test(parsed.trim())) {
        return parsed.trim();
      }
    } catch {}

    const decoded = decodeHexUtf8(t);
    const m = decoded.match(/^\s*"?(\d+)"?\s*$/);
    return m?.[1] ?? null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findReturnedId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    for (const key of [
      'returnValue',
      'return_value',
      'returnData',
      'return_data',
      'output',
      'result',
      'executionResult',
      'execution_result',
      'txExecutionResult',
      'tx_execution_result',
      'data',
    ]) {
      if (key in value) {
        const found = findReturnedId(value[key], depth + 1);
        if (found) return found;
      }
    }
  }

  return null;
}

export default function App() {
  const [hostAddress, setHostAddress] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [activeRole, setActiveRole] = useState<Role>('GUEST');

  const [rulesUrl, setRulesUrl] = useState('');
  const [disputeId, setDisputeId] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [disputeData, setDisputeData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const proxyRpc =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/rpc`
      : '/api/rpc';

  // ALL reads/finalization checks go through Vercel proxy.
  const readClient = useMemo(
    () => createClient({ endpoint: proxyRpc }),
    [proxyRpc],
  );

  const activeAddress = activeRole === 'HOST' ? hostAddress : guestAddress;

  async function ensureStudioNetInMetaMask() {
    if (!window.ethereum) throw new Error('MetaMask was not detected');

    const chainId = Number((studionet as any).id);
    const chainIdHex = `0x${chainId.toString(16)}`;

    const params = {
      chainId: chainIdHex,
      chainName: (studionet as any).name || 'GenLayer StudioNet',
      nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
      rpcUrls: [proxyRpc],
      blockExplorerUrls: [EXPLORER_BASE],
    };

    try {
      // Calling add first gives MetaMask the proxied RPC URL.
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [params],
      });
    } catch {
      // Existing network is fine; switch below.
    }

    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  }

  async function connectActiveRole() {
    setErrorMsg('');
    setStatusMsg('');

    try {
      if (!window.ethereum) throw new Error('MetaMask was not detected');

      await ensureStudioNetInMetaMask();

      const accounts: string[] = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      const address = accounts?.[0];
      if (!address) throw new Error('No MetaMask account selected');

      if (
        activeRole === 'HOST' &&
        guestAddress &&
        guestAddress.toLowerCase() === address.toLowerCase()
      ) {
        throw new Error('Host and Guest must use different addresses');
      }

      if (
        activeRole === 'GUEST' &&
        hostAddress &&
        hostAddress.toLowerCase() === address.toLowerCase()
      ) {
        throw new Error('Host and Guest must use different addresses');
      }

      if (activeRole === 'HOST') setHostAddress(address);
      else setGuestAddress(address);

      setStatusMsg(`✅ ${activeRole} wallet assigned: ${address}`);
    } catch (err: any) {
      setErrorMsg(`❌ Wallet connection failed: ${err.message}`);
    }
  }

  async function getWalletClient(expected: string) {
    if (!window.ethereum) throw new Error('MetaMask was not detected');

    await ensureStudioNetInMetaMask();

    const accounts: string[] = await window.ethereum.request({
      method: 'eth_accounts',
    });

    const current = accounts?.[0];
    if (!current) throw new Error('No active MetaMask account');

    if (current.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`Switch MetaMask to ${expected} before continuing`);
    }

    return createClient({
      chain: studionet,
      account: current as `0x${string}`,
      provider: window.ethereum,
    });
  }

  function parseDispute(raw: any) {
    const text =
      typeof raw === 'string'
        ? raw
        : typeof raw?.result === 'string'
          ? raw.result
          : '';

    if (!text || text === '{}') throw new Error('Dispute not found');

    const parsed = JSON.parse(text);
    if (!parsed?.host) throw new Error('Malformed dispute response');
    return parsed;
  }

  async function fetchDispute(id = disputeId, quiet = false) {
    if (!id) return null;

    try {
      const raw = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_dispute',
        args: [id],
      });

      const parsed = parseDispute(raw);
      setDisputeData(parsed);
      return parsed;
    } catch (err: any) {
      if (!quiet) {
        setDisputeData(null);
        setErrorMsg(`❌ Could not load dispute #${id}: ${err.message}`);
      }
      return null;
    }
  }

  async function waitForFinalized(hash: `0x${string}`, maxMinutes = 5) {
    const deadline = Date.now() + maxMinutes * 60_000;

    // One SDK waiter, via proxy. No browser-side tight raw RPC loop.
    while (Date.now() < deadline) {
      try {
        return await readClient.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.FINALIZED,
          fullTransaction: true,
          interval: 12_000,
          retries: 1,
        });
      } catch (err: any) {
        if (!isRateLimitError(err)) {
          // Some SDK versions throw while tx is still pending.
          await sleep(12_000);
          continue;
        }
        await sleep(18_000);
      }
    }

    throw new Error('Finalization timed out. Transaction may still finalize on StudioNet.');
  }

  async function deriveCreatedId(hash: `0x${string}`, receipt: any) {
    let id = findReturnedId(receipt);
    if (id) return id;

    // Safe fallback: query confirmed tx object through proxy, never probe IDs.
    try {
      const tx = await readClient.getTransaction({ hash });
      id = findReturnedId(tx);
      if (id) return id;
    } catch {}

    throw new Error('Could not decode the returned dispute ID from the confirmed creation transaction');
  }

  async function uploadTextIfNeeded(value: string) {
    const trimmed = value.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }

    const res = await fetch('https://bytebin.lucko.me/post', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: trimmed,
    });

    if (!res.ok) throw new Error(`Bytebin upload failed (${res.status})`);
    const json = await res.json();
    return `https://bytebin.lucko.me/${json.key}`;
  }

  async function handleCreateDispute(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;
    if (!hostAddress || !guestAddress) {
      setErrorMsg('❌ Assign both Host and Guest wallets first');
      return;
    }
    if (!rulesUrl.trim()) {
      setErrorMsg('❌ House Rules cannot be empty');
      return;
    }

    setLoading(true);
    setPendingAction('create');
    setErrorMsg('');

    try {
      const guestClient = await getWalletClient(guestAddress);
      const finalRulesUrl = await uploadTextIfNeeded(rulesUrl);

      setStatusMsg('📝 Sign create_dispute in MetaMask. Submit once only.');
      const hash = await guestClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_dispute',
        args: [hostAddress, finalRulesUrl],
        value: 10_000_000_000_000_000_000n,
      });

      // Submission success is separated from finalization.
      setStatusMsg(`📨 Submitted: ${hash}. Waiting for FINALIZED...`);

      const receipt = await waitForFinalized(hash as `0x${string}`, 5);
      const returnedId = await deriveCreatedId(hash as `0x${string}`, receipt);

      setDisputeId(returnedId);
      await fetchDispute(returnedId, true);

      setStatusMsg(`✅ New dispute finalized. Returned Case ID: ${returnedId}`);
    } catch (err: any) {
      if (isRateLimitError(err)) {
        setErrorMsg(
          '❌ StudioNet RPC is rate-limited. No automatic resubmit was performed. Wait a moment, Refresh state, then retry only if no transaction was submitted.',
        );
      } else {
        setErrorMsg(`❌ Create dispute failed: ${err.message}`);
      }
      setStatusMsg('');
    } finally {
      setPendingAction('');
      setLoading(false);
    }
  }

  async function handleSubmitEvidence(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;
    if (!disputeId) {
      setErrorMsg('❌ No real dispute ID selected');
      return;
    }
    if (!activeAddress) {
      setErrorMsg(`❌ Assign the ${activeRole} wallet first`);
      return;
    }
    if (!evidenceUrl.trim()) {
      setErrorMsg('❌ Evidence cannot be empty');
      return;
    }

    // Prevent accidental duplicate submit based on real chain state.
    const before = await fetchDispute(disputeId, true);
    const alreadySubmitted =
      activeRole === 'HOST'
        ? Boolean(before?.host_evidence_url)
        : Boolean(before?.guest_evidence_url);

    if (alreadySubmitted) {
      setErrorMsg(`❌ ${activeRole} evidence is already finalized for Case #${disputeId}`);
      return;
    }

    setLoading(true);
    setPendingAction('evidence');
    setErrorMsg('');

    try {
      const client = await getWalletClient(activeAddress);
      const finalEvidenceUrl = await uploadTextIfNeeded(evidenceUrl);

      setStatusMsg(`📎 Sign ${activeRole} evidence in MetaMask. Submit once only.`);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'submit_evidence',
        args: [disputeId, finalEvidenceUrl],
      });

      setStatusMsg(`📨 ${activeRole} evidence submitted: ${hash}. Waiting for FINALIZED...`);

      // IMPORTANT: no fake UI update before chain finalization.
      await waitForFinalized(hash as `0x${string}`, 4);

      const state = await fetchDispute(disputeId, true);
      const persisted =
        activeRole === 'HOST'
          ? Boolean(state?.host_evidence_url)
          : Boolean(state?.guest_evidence_url);

      if (!persisted) {
        throw new Error('Transaction finalized but evidence is not present in accepted state');
      }

      setStatusMsg(`✅ ${activeRole} evidence finalized. Tx: ${hash}`);
    } catch (err: any) {
      if (isRateLimitError(err)) {
        setErrorMsg(
          '❌ StudioNet RPC is rate-limited. The app did NOT automatically resubmit. Click Refresh first; retry only if your evidence is still missing.',
        );
      } else {
        setErrorMsg(`❌ Evidence transaction failed: ${err.message}`);
      }
      setStatusMsg('');
    } finally {
      setPendingAction('');
      setLoading(false);
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;
    if (!disputeId || !activeAddress) return;

    const before = await fetchDispute(disputeId, true);
    if (!before) {
      setErrorMsg('❌ Could not load current dispute state');
      return;
    }
    if (before.status === 'RESOLVED') {
      setErrorMsg('❌ This dispute is already RESOLVED');
      return;
    }
    if (!before.host_evidence_url || !before.guest_evidence_url) {
      setErrorMsg('❌ Both Host and Guest evidence are required');
      return;
    }

    setLoading(true);
    setPendingAction('resolve');
    setErrorMsg('');

    try {
      const client = await getWalletClient(activeAddress);

      setStatusMsg('🤖 Sign resolution transaction. AI consensus may take 30–60s+.');
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'resolve_dispute',
        args: [disputeId],
      });

      setStatusMsg(`📨 Resolution submitted: ${hash}. Waiting for consensus/finalization...`);

      await waitForFinalized(hash as `0x${string}`, 6);

      // State is the final truth. Do not infer success from receipt.status alone.
      for (let i = 0; i < 12; i++) {
        const state = await fetchDispute(disputeId, true);
        if (state?.status === 'RESOLVED') {
          setStatusMsg(`✅ RESOLVED. Native GEN settlement finalized. Tx: ${hash}`);
          return;
        }
        await sleep(10_000);
      }

      throw new Error('Transaction finalized but RESOLVED state was not observed');
    } catch (err: any) {
      if (isRateLimitError(err)) {
        setErrorMsg(
          '❌ StudioNet RPC is rate-limited. Resolution was NOT automatically resubmitted. Refresh Case Status first to avoid double-resolving.',
        );
      } else {
        setErrorMsg(`❌ Resolution failed: ${err.message}`);
      }
      setStatusMsg('');
    } finally {
      setPendingAction('');
      setLoading(false);
    }
  }

  function resetDemo() {
    setRulesUrl('');
    setEvidenceUrl('');
    setDisputeId('');
    setDisputeData(null);
    setStatusMsg('');
    setErrorMsg('');
  }

  function loadScenario(type: 1 | 2 | 3) {
    if (type === 1) {
      setRulesUrl('1. No parties allowed. Penalty: 100% of deposit.\n2. Quiet hours after 10 PM.');
      setEvidenceUrl(
        activeRole === 'HOST'
          ? 'The neighbors called the police at 1 AM because of loud club music. The guest brought 15 strangers for a party. I request the full deposit as penalty.'
          : "I did not host a party. It was just a 'study group' with 15 friends. We accidentally played music a bit too loud. Please return my deposit!",
      );
    } else if (type === 2) {
      setRulesUrl('Deposit fully refunded if check-out is on time (by 12 PM) and no furniture is broken. Standard cleaning fee is already included in the rent.');
      setEvidenceUrl(
        activeRole === 'HOST'
          ? "The guest checked out on time and furniture is intact. They left 2 trash bags in the kitchen. I request the deposit."
          : "I cleaned up and checked out at 11 AM. Standard cleaning is included in the rules. Please return my deposit.",
      );
    } else {
      setRulesUrl('Pets allowed. Guests must maintain cleanliness and pay for damages caused by pets.');
      setEvidenceUrl(
        activeRole === 'HOST'
          ? "The guest's dog damaged the sofa. I request compensation from the deposit."
          : 'My dog caused a small scratch, but the sofa was already heavily worn. A limited deduction is appropriate.',
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white p-8 font-sans">
      <div className="max-w-5xl mx-auto flex flex-col items-center mb-8 space-y-4">
        <div className="bg-purple-500/10 p-4 rounded-full border border-purple-500/20">
          <Scale className="w-10 h-10 text-purple-400" />
        </div>

        <h1 className="text-5xl font-black bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          NomadCourt
        </h1>

        <div className="flex gap-3">
          <button
            onClick={() => setActiveRole('GUEST')}
            disabled={loading}
            className={`px-4 py-2 rounded-full font-bold border ${
              activeRole === 'GUEST'
                ? 'bg-cyan-500 text-black border-cyan-500'
                : 'text-cyan-500 border-cyan-500/50'
            }`}
          >
            <User className="w-4 h-4 inline mr-2" />
            Guest
          </button>

          <button
            onClick={() => setActiveRole('HOST')}
            disabled={loading}
            className={`px-4 py-2 rounded-full font-bold border ${
              activeRole === 'HOST'
                ? 'bg-purple-500 text-white border-purple-500'
                : 'text-purple-500 border-purple-500/50'
            }`}
          >
            <User className="w-4 h-4 inline mr-2" />
            Host
          </button>

          <button
            onClick={resetDemo}
            disabled={loading}
            className="px-4 py-2 rounded-full font-bold border border-gray-600 text-gray-400"
          >
            Start New Case
          </button>
        </div>

        <button
          onClick={connectActiveRole}
          disabled={loading}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 font-black"
        >
          <Wallet className="w-4 h-4 inline mr-2" />
          Connect / Assign Current MetaMask as {activeRole}
        </button>

        <div className="text-xs font-mono text-gray-500 text-center">
          <div>Host: {hostAddress || 'not assigned'}</div>
          <div>Guest: {guestAddress || 'not assigned'}</div>
          <div>Active role: {activeRole} — {activeAddress || 'not assigned'}</div>
        </div>

        <div className="flex gap-3">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              disabled={loading}
              onClick={() => loadScenario(n as 1 | 2 | 3)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs"
            >
              🎭 Scenario {n}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className="glass-panel p-4 text-center text-sm text-purple-300 max-w-5xl mx-auto mb-4">
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="max-w-5xl mx-auto mb-4 p-4 text-center text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
          {errorMsg}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        <div className="space-y-6">
          <div className={`glass-panel p-6 space-y-4 ${activeRole !== 'GUEST' ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-xl font-bold">
              <ShieldAlert className="w-5 h-5 text-cyan-400 inline mr-2" />
              1. Open New Dispute (Guest Only)
            </h2>

            <form onSubmit={handleCreateDispute} className="space-y-4">
              <input
                readOnly
                value={hostAddress}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4"
                placeholder="Assign Host first"
              />

              <textarea
                value={rulesUrl}
                onChange={(e) => setRulesUrl(e.target.value)}
                rows={4}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4"
                placeholder="House Rules URL or raw text"
              />

              <button
                disabled={loading || !hostAddress || !guestAddress}
                className="w-full bg-cyan-500 text-black font-bold py-2 rounded-lg"
              >
                {loading && pendingAction === 'create'
                  ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  : 'Start Case (Lock 10 GEN Deposit)'}
              </button>
            </form>
          </div>

          <div className="glass-panel p-6 space-y-4">
            <h2 className="text-xl font-bold">
              <Send className="w-5 h-5 text-purple-400 inline mr-2" />
              2. Submit Evidence
            </h2>

            <form onSubmit={handleSubmitEvidence} className="space-y-4">
              <input
                value={disputeId}
                onChange={(e) => setDisputeId(e.target.value.trim())}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4"
                placeholder="Case ID returned by create_dispute"
              />

              <textarea
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                rows={4}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4"
                placeholder={`Evidence URL or raw text as ${activeRole}`}
              />

              <button
                disabled={loading || !disputeId || !activeAddress}
                className="w-full bg-purple-500 text-white font-bold py-2 rounded-lg"
              >
                {loading && pendingAction === 'evidence'
                  ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  : 'Attach Evidence'}
              </button>
            </form>
          </div>
        </div>

        <div className="glass-panel p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Case Status</h2>
            <button
              onClick={() => fetchDispute()}
              disabled={!disputeId || loading}
              className="text-sm text-cyan-400 disabled:opacity-40"
            >
              Refresh
            </button>
          </div>

          {disputeData ? (
            <div className="flex-1 flex flex-col space-y-6">
              <div className="flex justify-between border-b border-gray-800 pb-4">
                <span className="text-gray-400">Status</span>
                <span>{disputeData.status}</span>
              </div>

              <div className="space-y-2 text-sm text-gray-400">
                <div><b className="text-purple-400">Host:</b> {disputeData.host}</div>
                <div><b className="text-cyan-400">Guest:</b> {disputeData.guest}</div>
                <div>Deposit: {disputeData.deposit_amount}</div>
                <div>Host evidence: {disputeData.host_evidence_url ? '✅' : '⏳'}</div>
                <div>Guest evidence: {disputeData.guest_evidence_url ? '✅' : '⏳'}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-950/50 p-4 rounded-lg border border-gray-800">
                  <div className="text-sm text-gray-400">Host Payout</div>
                  <div className="text-2xl font-black">{disputeData.host_share}%</div>
                </div>

                <div className="bg-gray-950/50 p-4 rounded-lg border border-gray-800">
                  <div className="text-sm text-gray-400">Guest Payout</div>
                  <div className="text-2xl font-black">{disputeData.guest_share}%</div>
                </div>
              </div>

              {disputeData.rationale && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm">
                  {disputeData.rationale}
                </div>
              )}

              <button
                disabled={
                  loading ||
                  disputeData.status !== 'OPEN' ||
                  !disputeData.host_evidence_url ||
                  !disputeData.guest_evidence_url ||
                  !activeAddress
                }
                onClick={handleResolve}
                className="mt-auto w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-black py-4 rounded-xl"
              >
                {loading && pendingAction === 'resolve'
                  ? <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  : <>
                      <Gavel className="w-6 h-6 inline mr-2" />
                      Trigger AI Resolution
                    </>}
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              No fabricated state. Create a case or enter a known dispute ID.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
