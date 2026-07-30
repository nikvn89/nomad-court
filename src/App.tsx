import React, { useState, useEffect } from 'react';
import { ShieldAlert, Send, Gavel, Scale, Loader2, Link, User, Wallet } from 'lucide-react';
import './index.css';

const CONTRACT_ADDRESS = "0x19093B657847D91FCbFb301bb5465763BDc3c6c2";
const RPC_URL = 'https://studio.genlayer.com/api';

let rpcId = 1;
async function rpc(method: string, params: any[]) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: rpcId++ })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function waitForTx(hash: string, maxWait = 120000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const receipt = await rpc('eth_getTransactionReceipt', [hash]);
      if (receipt) return receipt;
    } catch { /* keep polling */ }
    await sleep(4000);
  }
  throw new Error('Transaction confirmation timed out');
}

function App() {
  const [connected, setConnected] = useState(false);
  const [hostAddr, setHostAddr] = useState('0xFC7b694407fbbc4a20A8AdA59F6D3AbBab49c81B');
  const [guestAddr, setGuestAddr] = useState('0x96c3432a1aaEA3d0B00163ca96a63d81b3FB8480');
  
  const [activeRole, setActiveRole] = useState<'GUEST' | 'HOST'>('GUEST');
  const [rulesUrl, setRulesUrl] = useState('https://en.wikipedia.org/wiki/Etiquette');
  const [disputeId, setDisputeId] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  
  const [disputeData, setDisputeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const activeAddress = activeRole === 'GUEST' ? guestAddr : hostAddr;

  useEffect(() => {
    setEvidenceUrl(window.location.origin + (activeRole === 'GUEST' ? '/demo_guest.txt' : '/demo_host.txt'));
  }, [activeRole]);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!hostAddr.startsWith('0x') || !guestAddr.startsWith('0x')) {
      setErrorMsg('❌ Addresses must start with 0x');
      return;
    }
    setConnected(true);
    setStatusMsg('✅ Connected!');
  };

  const fetchDispute = async (id: string) => {
    if (!id) return;
    setErrorMsg('');
    try {
      const data = await rpc('gen_call', [{
        to: CONTRACT_ADDRESS,
        from: activeAddress,
        data: { function_name: 'get_dispute', function_args: [id] }
      }]);
      if (data && data.result) {
        const parsed = JSON.parse(data.result);
        if (parsed && parsed.host) {
          setDisputeData(parsed);
          return;
        }
      }
      setDisputeData(null);
    } catch (err: any) {
      console.error("Read failed:", err);
      setErrorMsg(`⚠️ Failed to read dispute: ${err.message}`);
      setDisputeData(null);
    }
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setStatusMsg('📝 Submitting create_dispute to GenLayer blockchain...');
    
    try {
      const hash = await rpc('eth_sendTransaction', [{
        to: CONTRACT_ADDRESS,
        from: guestAddr,
        value: '0x64',
        data: {
          function_name: 'create_dispute',
          function_args: [hostAddr, rulesUrl]
        }
      }]);
      setStatusMsg(`⏳ Tx submitted: ${hash}. Waiting for confirmation...`);

      await waitForTx(hash);
      setStatusMsg(`✅ Transaction confirmed! Searching for dispute ID...`);

      // Derive dispute ID from on-chain state
      let foundId = '';
      for (let tryId = 1; tryId <= 100; tryId++) {
        try {
          const res = await rpc('gen_call', [{
            to: CONTRACT_ADDRESS,
            from: guestAddr,
            data: { function_name: 'get_dispute', function_args: [String(tryId)] }
          }]);
          if (res && res.result) {
            const parsed = JSON.parse(res.result);
            if (parsed.guest && parsed.guest.toLowerCase() === guestAddr.toLowerCase() && parsed.status === 'OPEN') {
              foundId = String(tryId);
              break;
            }
          }
        } catch { /* continue */ }
      }

      if (foundId) {
        setDisputeId(foundId);
        setStatusMsg(`✅ Dispute created! On-chain ID: ${foundId}`);
        fetchDispute(foundId);
      } else {
        setStatusMsg(`✅ Transaction confirmed (${hash}). Enter Dispute ID manually.`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`❌ Failed: ${err.message}`);
      setStatusMsg('');
    }
    setLoading(false);
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setStatusMsg(`📎 Submitting evidence as ${activeRole}...`);

    try {
      const hash = await rpc('eth_sendTransaction', [{
        to: CONTRACT_ADDRESS,
        from: activeAddress,
        data: {
          function_name: 'submit_evidence',
          function_args: [disputeId, evidenceUrl]
        }
      }]);
      setStatusMsg(`⏳ Tx submitted: ${hash}. Waiting...`);
      await waitForTx(hash);
      setStatusMsg(`✅ Evidence submitted on-chain!`);
      await sleep(2000);
      fetchDispute(disputeId);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`❌ Failed: ${err.message}`);
      setStatusMsg('');
    }
    setLoading(false);
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setStatusMsg('🤖 AI Jury analyzing evidence... This may take 30-60 seconds.');

    try {
      const hash = await rpc('eth_sendTransaction', [{
        to: CONTRACT_ADDRESS,
        from: activeAddress,
        data: {
          function_name: 'resolve_dispute',
          function_args: [disputeId]
        }
      }]);
      setStatusMsg(`⏳ AI processing... Tx: ${hash}`);
      await waitForTx(hash, 180000); // AI may take longer
      setStatusMsg(`⚖️ Dispute resolved & funds settled atomically!`);
      await sleep(2000);
      fetchDispute(disputeId);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`❌ Failed: ${err.message}`);
      setStatusMsg('');
    }
    setLoading(false);
  };

  // ─── WALLET CONNECT SCREEN ───
  if (!connected) {
    return (
      <div className="min-h-screen bg-[#0a0a14] text-white flex items-center justify-center p-8 font-sans">
        <div className="glass-panel p-8 max-w-lg w-full space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="bg-purple-500/10 p-4 rounded-full border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
              <Scale className="w-10 h-10 text-purple-400" />
            </div>
            <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
              NomadCourt
            </h1>
            <p className="text-sm text-gray-400 text-center">
              Enter your GenLayer Studio wallet addresses to interact with the dispute contract.
            </p>
          </div>
          
          <form onSubmit={handleConnect} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-purple-400 mb-2">
                <Wallet className="w-4 h-4 inline mr-1" /> Host Address
              </label>
              <input 
                type="text" required value={hostAddr} onChange={e => setHostAddr(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-3 px-4 focus:ring-2 focus:ring-purple-500 outline-none font-mono text-xs"
                placeholder="0x..."
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-cyan-400 mb-2">
                <Wallet className="w-4 h-4 inline mr-1" /> Guest Address
              </label>
              <input 
                type="text" required value={guestAddr} onChange={e => setGuestAddr(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-3 px-4 focus:ring-2 focus:ring-cyan-500 outline-none font-mono text-xs"
                placeholder="0x..."
              />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white font-black py-3 rounded-xl shadow-lg transition-all">
              Connect
            </button>
          </form>

          {errorMsg && (
            <div className="text-center text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{errorMsg}</div>
          )}
        </div>
      </div>
    );
  }

  // ─── MAIN APP ───
  return (
    <div className="min-h-screen bg-[#0a0a14] text-white p-8 font-sans selection:bg-purple-500/30">
      <div className="max-w-5xl mx-auto flex flex-col items-center mb-12 space-y-4">
        <div className="bg-purple-500/10 p-4 rounded-full border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
          <Scale className="w-10 h-10 text-purple-400" />
        </div>
        <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          NomadCourt
        </h1>
        <div className="flex gap-4 mt-6">
          <button 
            onClick={() => setActiveRole('GUEST')}
            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 border ${activeRole === 'GUEST' ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-transparent text-cyan-500 border-cyan-500/50'}`}>
            <User className="w-4 h-4" /> Guest
          </button>
          <button 
            onClick={() => setActiveRole('HOST')}
            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 border ${activeRole === 'HOST' ? 'bg-purple-500 text-white border-purple-500' : 'bg-transparent text-purple-500 border-purple-500/50'}`}>
            <User className="w-4 h-4" /> Host
          </button>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          Active: {activeAddress} ({activeRole})
        </div>
      </div>

      {statusMsg && (
        <div className="glass-panel p-4 text-center text-sm font-medium text-purple-300 animate-pulse max-w-5xl mx-auto mb-4">
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
                  type="text" value={hostAddr} readOnly
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4 text-gray-500 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">House Rules URL</label>
                <div className="relative">
                  <Link className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                  <input 
                    type="url" required value={rulesUrl} onChange={e => setRulesUrl(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                    placeholder="https://en.wikipedia.org/wiki/Etiquette"
                  />
                </div>
              </div>
              <button disabled={loading} type="submit" className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold py-2 rounded-lg transition-colors flex justify-center items-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Start Case (Lock 100 GL Deposit)'}
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
                <label className="block text-sm text-gray-400 mb-1">Dispute ID</label>
                <input 
                  type="text" required value={disputeId} onChange={e => {setDisputeId(e.target.value); fetchDispute(e.target.value);}}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4 focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="e.g. 1"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Your Evidence URL (As {activeRole})</label>
                <input 
                  type="url" required value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4 focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="https://..."
                />
              </div>
              <button disabled={loading || !disputeId} type="submit" className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 rounded-lg transition-colors">
                Attach Evidence
              </button>
            </form>
          </div>
        </div>

        <div className="glass-panel p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Case Status</h2>
            <button onClick={() => fetchDispute(disputeId)} className="text-sm text-cyan-400 hover:underline">Refresh</button>
          </div>

          {disputeData ? (
            <div className="flex-1 flex flex-col space-y-6">
              <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                <span className="text-gray-400">Status</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${disputeData.status === 'OPEN' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>
                  {disputeData.status}
                </span>
              </div>
              
              <div className="space-y-2 text-sm text-gray-400 border-b border-gray-800 pb-4">
                <div className="truncate"><span className="text-purple-400 font-bold">Host:</span> {disputeData.host}</div>
                <div className="truncate"><span className="text-cyan-400 font-bold">Guest:</span> {disputeData.guest}</div>
                <div className="truncate text-xs mt-1"><span className="text-gray-500">Rules:</span> {disputeData.rules_url}</div>
                <div className="text-xs mt-2">
                  <span className="text-gray-500">Host Evid: </span>{disputeData.host_evidence_url ? '✅ Submitted' : '⏳ Pending'}<br/>
                  <span className="text-gray-500">Guest Evid: </span>{disputeData.guest_evidence_url ? '✅ Submitted' : '⏳ Pending'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-950/50 p-4 rounded-lg border border-gray-800">
                  <div className="text-sm text-gray-400 mb-1">Host Payout</div>
                  <div className="text-2xl font-black text-white">{disputeData.host_share}%</div>
                </div>
                <div className="bg-gray-950/50 p-4 rounded-lg border border-gray-800">
                  <div className="text-sm text-gray-400 mb-1">Guest Payout</div>
                  <div className="text-2xl font-black text-white">{disputeData.guest_share}%</div>
                </div>
              </div>

              {disputeData.rationale && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <div className="text-sm font-bold text-blue-400 mb-2">⚖️ AI Jury Rationale:</div>
                  <div className="text-sm text-blue-200 leading-relaxed italic">"{disputeData.rationale}"</div>
                </div>
              )}

              <div className="mt-auto pt-6">
                <button 
                  disabled={loading || disputeData.status !== 'OPEN'} 
                  onClick={handleResolve}
                  className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white font-black py-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Gavel className="w-6 h-6" /> Trigger AI Resolution + Atomic Payout</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 space-y-4">
              <Scale className="w-16 h-16 opacity-20" />
              <p>Enter a Dispute ID or create a new case to view details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
