import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus, ExecutionResult } from 'genlayer-js/types';
import { ShieldAlert, Send, Gavel, Scale, Loader2, User, Wallet } from 'lucide-react';
import './index.css';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}

const CONTRACT_ADDRESS = '0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7';

type Role = 'GUEST' | 'HOST';

function executionName(receipt: any) {
  return (
    receipt?.txExecutionResultName ??
    receipt?.tx_execution_result_name ??
    receipt?.executionResultName ??
    receipt?.execution_result_name ??
    ''
  );
}

function executionFailed(receipt: any) {
  const name = executionName(receipt);
  return (
    name === ExecutionResult.FINISHED_WITH_ERROR ||
    name === 'FINISHED_WITH_ERROR' ||
    name === 'ERROR'
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

function findReturnedString(value: any, depth = 0): string | null {
  if (depth > 6 || value == null) return null;

  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d+$/.test(text)) return text;

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string' && parsed) return parsed;
    } catch {}

    const decoded = decodeHexUtf8(text);
    const match = decoded.match(/^\s*"?(\d+)"?\s*$/);
    if (match) return match[1];

    try {
      const parsed = JSON.parse(decoded);
      if (typeof parsed === 'string' && parsed) return parsed;
    } catch {}

    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findReturnedString(item, depth + 1);
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
      'txExecutionResult',
      'tx_execution_result',
      'executionResult',
      'execution_result',
    ]) {
      if (key in value) {
        const found = findReturnedString(value[key], depth + 1);
        if (found) return found;
      }
    }

    for (const child of Object.values(value)) {
      const found = findReturnedString(child, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function App() {
  const [hostAddress, setHostAddress] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [activeRole, setActiveRole] = useState<Role>('GUEST');

  const [rulesUrl, setRulesUrl] = useState('');
  const [disputeId, setDisputeId] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  const [disputeData, setDisputeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submittedHash, setSubmittedHash] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const proxyRpc =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/rpc`
      : '/api/rpc';

  const readClient = useMemo(
    () => createClient({ endpoint: proxyRpc }),
    [proxyRpc],
  );

  const connected = Boolean(hostAddress || guestAddress);
  const activeAddress = activeRole === 'HOST' ? hostAddress : guestAddress;

  useEffect(() => {
    setEvidenceUrl('');
  }, [activeRole]);

  const makeWalletClient = async (expectedAddress?: string) => {
    if (!window.ethereum) {
      throw new Error('MetaMask was not detected');
    }

    const accounts: string[] = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    const current = accounts?.[0];
    if (!current) throw new Error('No MetaMask account selected');

    if (
      expectedAddress &&
      current.toLowerCase() !== expectedAddress.toLowerCase()
    ) {
      throw new Error(
        `Switch MetaMask to ${expectedAddress} before continuing. Current account is ${current}.`,
      );
    }

    const client = createClient({
      chain: studionet,
      account: current as `0x${string}`,
      provider: window.ethereum,
    });

    // Current GenLayerJS can switch/add StudioNet itself. No hand-written
    // chainId/RPC constants are needed in the app.
    await client.connect('studionet');

    return { client, address: current };
  };

  const connectActiveRole = async () => {
    setErrorMsg('');
    setStatusMsg('');

    try {
      const { address } = await makeWalletClient();

      if (activeRole === 'HOST') {
        if (guestAddress && guestAddress.toLowerCase() === address.toLowerCase()) {
          throw new Error('Host and Guest must use different addresses');
        }
        setHostAddress(address);
      } else {
        if (hostAddress && hostAddress.toLowerCase() === address.toLowerCase()) {
          throw new Error('Host and Guest must use different addresses');
        }
        setGuestAddress(address);
      }

      setStatusMsg(`✅ ${activeRole} wallet assigned: ${address}`);
    } catch (err: any) {
      setErrorMsg(`❌ Wallet connection failed: ${err.message}`);
    }
  };

  const parseDispute = (raw: any) => {
    const text =
      typeof raw === 'string'
        ? raw
        : typeof raw?.result === 'string'
          ? raw.result
          : '';

    if (!text || text === '{}') {
      throw new Error('Dispute does not exist or returned empty data');
    }

    const parsed = JSON.parse(text);
    if (!parsed?.host) throw new Error('Malformed dispute response');
    return parsed;
  };

  const fetchDispute = async (id = disputeId) => {
    if (!id) {
      setDisputeData(null);
      setErrorMsg('❌ No dispute ID selected');
      return null;
    }

    setErrorMsg('');

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
      // Never fabricate host/guest/deposit/share values.
      setDisputeData(null);
      setErrorMsg(`❌ Could not load dispute #${id}: ${err.message}`);
      return null;
    }
  };

  const waitFinalized = async (hash: `0x${string}`, retries = 45) => {
    let lastError: any = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const receipt = await readClient.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.FINALIZED,
          fullTransaction: true,
          interval: 12_000,
          retries: 1,
        });

        if (executionFailed(receipt)) {
          throw new Error(`Transaction reverted (${executionName(receipt)})`);
        }

        return receipt;
      } catch (err: any) {
        lastError = err;

        const msg = String(err?.message ?? err ?? '').toLowerCase();
        const transient =
          msg.includes('429') ||
          msg.includes('rate limit') ||
          msg.includes('rate limited') ||
          msg.includes('failed to fetch') ||
          msg.includes('timeout') ||
          msg.includes('pending');

        if (!transient && attempt >= 3) {
          throw err;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(5_000 + attempt * 2_000, 20_000)),
        );
      }
    }

    throw new Error(
      `Finalization timeout: ${lastError?.message ?? lastError ?? 'unknown error'}`,
    );
  };

  const deriveDisputeId = async (
    hash: `0x${string}`,
    receipt: any,
  ) => {
    // Preserve the working path that successfully returned Case ID 4:
    // decode the confirmed full receipt first.
    let returnedId = findReturnedString(receipt);
    if (returnedId) return returnedId;

    // Safe fallback: inspect the confirmed transaction object.
    // Never probe get_dispute(1..10) and never guess a latest ID.
    try {
      const tx = await readClient.getTransaction({ hash });
      returnedId = findReturnedString(tx);

      if (returnedId) {
        return returnedId;
      }
    } catch {
      // Fall through to a hard error.
    }

    throw new Error(
      'create_dispute finalized but its returned dispute ID could not be decoded',
    );
  };

  const ensureRoleClient = async (role: Role) => {
    const expected = role === 'HOST' ? hostAddress : guestAddress;
    if (!expected) throw new Error(`${role} wallet has not been assigned`);
    const { client } = await makeWalletClient(expected);
    return client;
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hostAddress || !guestAddress) {
      setErrorMsg('❌ Assign both Host and Guest wallets first');
      return;
    }
    if (hostAddress.toLowerCase() === guestAddress.toLowerCase()) {
      setErrorMsg('❌ Host and Guest must be different addresses');
      return;
    }
    if (!rulesUrl.trim()) {
      setErrorMsg('❌ House Rules cannot be empty');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const guestClient = await ensureRoleClient('GUEST');

      let finalRulesUrl = rulesUrl.trim();
      if (!finalRulesUrl.startsWith('http')) {
        setStatusMsg('⏳ Uploading custom rules text to Bytebin...');
        const res = await fetch('https://bytebin.lucko.me/post', {
          method: 'POST',
          body: finalRulesUrl,
          headers: { 'Content-Type': 'text/plain' },
        });
        if (!res.ok) throw new Error(`Bytebin upload failed (${res.status})`);
        const json = await res.json();
        finalRulesUrl = `https://bytebin.lucko.me/${json.key}`;
      }

      setStatusMsg('📝 MetaMask: sign create_dispute with 10 GEN deposit...');
      const hash = await guestClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_dispute',
        args: [hostAddress, finalRulesUrl],
        value: 10_000_000_000_000_000_000n,
      });

      setSubmittedHash(hash);
      setStatusMsg(`📨 Submitted ${hash}. Waiting for FINALIZED...`);
      const receipt = await waitFinalized(hash as `0x${string}`);

      const returnedId = await deriveDisputeId(
        hash as `0x${string}`,
        receipt,
      );

      setDisputeId(returnedId);
      await fetchDispute(returnedId);
      setStatusMsg(`✅ New dispute finalized. Returned Case ID: ${returnedId}`);
    } catch (err: any) {
      setErrorMsg(`❌ Create dispute failed: ${err.message}`);
      setStatusMsg('');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!disputeId) {
      setErrorMsg('❌ Create or enter a real dispute ID first');
      return;
    }
    if (!evidenceUrl.trim()) {
      setErrorMsg('❌ Evidence cannot be empty');
      return;
    }

    const current = await fetchDispute(disputeId);
    const alreadySubmitted =
      activeRole === 'HOST'
        ? Boolean(current?.host_evidence_url)
        : Boolean(current?.guest_evidence_url);

    if (alreadySubmitted) {
      setErrorMsg(`❌ ${activeRole} evidence is already finalized for Case #${disputeId}`);
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const activeClient = await ensureRoleClient(activeRole);

      let finalEvidenceUrl = evidenceUrl.trim();
      if (!finalEvidenceUrl.startsWith('http')) {
        setStatusMsg('⏳ Uploading custom evidence to Bytebin...');
        const res = await fetch('https://bytebin.lucko.me/post', {
          method: 'POST',
          body: finalEvidenceUrl,
          headers: { 'Content-Type': 'text/plain' },
        });
        if (!res.ok) throw new Error(`Bytebin upload failed (${res.status})`);
        const json = await res.json();
        finalEvidenceUrl = `https://bytebin.lucko.me/${json.key}`;
      }

      setStatusMsg(`📎 MetaMask: submit evidence as ${activeRole}...`);
      const hash = await activeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'submit_evidence',
        args: [disputeId, finalEvidenceUrl],
      });

      setSubmittedHash(hash);
      setStatusMsg(`📨 ${activeRole} evidence submitted: ${hash}. Waiting for FINALIZED...`);

      await waitFinalized(hash as `0x${string}`, 30);

      const state = await fetchDispute(disputeId);
      const persisted =
        activeRole === 'HOST'
          ? Boolean(state?.host_evidence_url)
          : Boolean(state?.guest_evidence_url);

      if (!persisted) {
        throw new Error('Transaction finalized but evidence was not found in accepted state');
      }

      setStatusMsg(`✅ ${activeRole} evidence finalized. Tx: ${hash}`);
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '');

      if (
        msg.toLowerCase().includes('429') ||
        msg.toLowerCase().includes('rate limit') ||
        msg.toLowerCase().includes('failed to fetch')
      ) {
        setErrorMsg(
          '❌ StudioNet RPC is rate-limited. No automatic resubmit was performed. Click Refresh first; retry only if your evidence is still missing.',
        );
      } else {
        setErrorMsg(`❌ Evidence transaction failed: ${msg}`);
      }
      setStatusMsg('');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!disputeId) {
      setErrorMsg('❌ No dispute ID selected');
      return;
    }

    if (loading) {
      return;
    }

    const before = await fetchDispute(disputeId);

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
    setErrorMsg('');

    try {
      const activeClient = await ensureRoleClient(activeRole);

      setStatusMsg(
        '🤖 MetaMask: sign one resolution transaction. AI consensus may take 30–60s+.',
      );

      const hash = await activeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'resolve_dispute',
        args: [disputeId],
      });

      setSubmittedHash(hash);
      setStatusMsg(`📨 Resolution submitted: ${hash}. Waiting for FINALIZED...`);

      try {
        await waitFinalized(hash as `0x${string}`, 45);
      } catch (err: any) {
        const state = await fetchDispute(disputeId);

        if (state?.status === 'RESOLVED') {
          setStatusMsg(`✅ Resolved and settled. Tx: ${hash}`);
          return;
        }

        throw err;
      }

      const state = await fetchDispute(disputeId);

      if (!state || state.status !== 'RESOLVED') {
        throw new Error(
          'Resolution transaction finalized but contract state is not RESOLVED',
        );
      }

      setStatusMsg(`✅ Resolved and settled. Tx: ${hash}`);
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '');

      if (
        msg.toLowerCase().includes('429') ||
        msg.toLowerCase().includes('rate limit') ||
        msg.toLowerCase().includes('failed to fetch')
      ) {
        setErrorMsg(
          '❌ StudioNet RPC is rate-limited. The app did NOT automatically resubmit. Click Refresh first to avoid double-submit.',
        );
      } else {
        setErrorMsg(`❌ Resolution failed: ${msg}`);
      }

      setStatusMsg('');
    } finally {
      setLoading(false);
    }
  };

  const resetDemo = () => {
    setRulesUrl('');
    setEvidenceUrl('');
    setDisputeId('');
    setDisputeData(null);
    setStatusMsg('');
    setErrorMsg('');
    setSubmittedHash('');
  };

  const loadScenario = (type: 1 | 2 | 3) => {
    if (type === 1) {
      setRulesUrl(
        '1. No parties allowed. Penalty: 100% of deposit.\n2. Quiet hours after 10 PM.',
      );
      setEvidenceUrl(
        activeRole === 'HOST'
          ? 'The neighbors called the police at 1 AM because of loud club music. The guest brought 15 strangers for a party. I request the full deposit as penalty.'
          : "I did not host a party. It was just a 'study group' with 15 friends. We accidentally played music a bit too loud. Please return my deposit!",
      );
    } else if (type === 2) {
      setRulesUrl(
        'Deposit fully refunded if check-out is on time (by 12 PM) and no furniture is broken. Standard cleaning fee is already included in the rent.',
      );
      setEvidenceUrl(
        activeRole === 'HOST'
          ? "The guest checked out on time and furniture is intact. However, they left 2 trash bags in the kitchen instead of taking them to the public bin. I suffered emotional damage from this mess, so I am confiscating the entire deposit!"
          : "I cleaned up and checked out at 11 AM. The rules state standard cleaning is included, so leaving trash bags in the kitchen is normal. The host's demand for the full deposit due to 'emotional damage' is ridiculous. Give me my money back!",
      );
    } else {
      setRulesUrl(
        'Pets allowed. However, guests must maintain cleanliness and pay for any damages caused by their pets.',
      );
      setEvidenceUrl(
        activeRole === 'HOST'
          ? "The guest's dog bit a small hole in my old sofa. Even though it's an old sofa, I cherish it. I demand 100% of the deposit so I can buy a brand new sofa!"
          : "I admit my dog caused a small scratch on the sofa. But that sofa was already heavily worn and torn before I arrived! I agree to pay 20% of the deposit for the scratch, but taking 100% to buy a brand new sofa is a scam!",
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white p-8 font-sans selection:bg-purple-500/30">
      <div className="max-w-5xl mx-auto flex flex-col items-center mb-8 space-y-4">
        <div className="bg-purple-500/10 p-4 rounded-full border border-purple-500/20">
          <Scale className="w-10 h-10 text-purple-400" />
        </div>
        <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          NomadCourt
        </h1>

        <div className="flex gap-3">
          <button
            onClick={() => setActiveRole('GUEST')}
            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 border ${
              activeRole === 'GUEST'
                ? 'bg-cyan-500 text-black border-cyan-500'
                : 'text-cyan-500 border-cyan-500/50'
            }`}
          >
            <User className="w-4 h-4" /> Guest
          </button>
          <button
            onClick={() => setActiveRole('HOST')}
            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 border ${
              activeRole === 'HOST'
                ? 'bg-purple-500 text-white border-purple-500'
                : 'text-purple-500 border-purple-500/50'
            }`}
          >
            <User className="w-4 h-4" /> Host
          </button>
          <button
            onClick={resetDemo}
            className="px-4 py-2 rounded-full font-bold border border-gray-600 text-gray-400"
          >
            Start New Case
          </button>
        </div>

        <button
          onClick={connectActiveRole}
          disabled={loading}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 font-black flex gap-2 items-center"
        >
          <Wallet className="w-4 h-4" />
          Connect / Assign Current MetaMask as {activeRole}
        </button>

        <div className="text-xs font-mono text-gray-500 text-center space-y-1">
          <div>Host: {hostAddress || 'not assigned'}</div>
          <div>Guest: {guestAddress || 'not assigned'}</div>
          <div>Active role: {activeRole} — {activeAddress || 'wallet not assigned'}</div>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => loadScenario(n as 1 | 2 | 3)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 hover:border-cyan-500 rounded-lg text-xs font-bold text-gray-300"
            >
              🎭 Scenario {n}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className="glass-panel p-4 text-center text-sm font-medium text-purple-300 max-w-5xl mx-auto mb-4">
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
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-cyan-400" />
              1. Open New Dispute (Guest Only)
            </h2>
            <form onSubmit={handleCreateDispute} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Host Address</label>
                <input
                  readOnly
                  value={hostAddress}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4 text-gray-500 font-mono text-xs"
                />
              </div>
              <textarea
                required
                value={rulesUrl}
                onChange={(e) => setRulesUrl(e.target.value)}
                rows={4}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4"
                placeholder="House Rules URL or raw text"
              />
              <button
                disabled={loading || !hostAddress || !guestAddress}
                className="w-full bg-cyan-500 text-black font-bold py-2 rounded-lg flex justify-center"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Start Case (Lock 10 GEN Deposit)'}
              </button>
            </form>
          </div>

          <div className="glass-panel p-6 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Send className="w-5 h-5 text-purple-400" />
              2. Submit Evidence
            </h2>
            <form onSubmit={handleSubmitEvidence} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Dispute ID — returned by create_dispute
                </label>
                <input
                  value={disputeId}
                  onChange={(e) => setDisputeId(e.target.value.trim())}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4"
                  placeholder="Create a case, or enter an explicit known ID"
                />
              </div>
              <textarea
                required
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                rows={4}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4"
                placeholder={`Evidence URL or raw text as ${activeRole}`}
              />
              <button
                disabled={loading || !disputeId || !activeAddress}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 rounded-lg"
              >
                Attach Evidence
              </button>
            </form>
          </div>
        </div>

        <div className="glass-panel p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Case Status</h2>
            <button
              onClick={() => fetchDispute()}
              disabled={!disputeId}
              className="text-sm text-cyan-400 hover:underline disabled:opacity-40"
            >
              Refresh
            </button>
          </div>

          {disputeData ? (
            <div className="flex-1 flex flex-col space-y-6">
              <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                <span className="text-gray-400">Status</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  disputeData.status === 'OPEN'
                    ? 'bg-yellow-500/20 text-yellow-300'
                    : 'bg-green-500/20 text-green-300'
                }`}>
                  {disputeData.status}
                </span>
              </div>

              <div className="space-y-2 text-sm text-gray-400 border-b border-gray-800 pb-4">
                <div className="truncate"><b className="text-purple-400">Host:</b> {disputeData.host}</div>
                <div className="truncate"><b className="text-cyan-400">Guest:</b> {disputeData.guest}</div>
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
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <div className="text-sm font-bold text-blue-400 mb-2">
                    ⚖️ AI Jury Rationale
                  </div>
                  <div className="text-sm text-blue-200 italic">
                    "{disputeData.rationale}"
                  </div>
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
                className="mt-auto w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-black py-4 rounded-xl flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Gavel className="w-6 h-6" />
                    Trigger AI Resolution
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 space-y-4">
              <Scale className="w-16 h-16 opacity-20" />
              <p>No fabricated state. Create a case or enter a known dispute ID.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
