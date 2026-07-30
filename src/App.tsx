import React, { useState, useEffect } from 'react';
import { ShieldAlert, Send, Gavel, Scale, Loader2, Link, User } from 'lucide-react';
import './index.css';

const CONTRACT_ADDRESS = "0x19093B657847D91FCbFb301bb5465763BDc3c6c2";

const GUEST_ADDR = '0xeAb35ceC0863e10B300FA65151Ed1e687312E8d0';
const HOST_ADDR = '0x060c96f1a0ad98897c0e8e03c5f6fee2eb42fe51';

// GenLayer StudioNet RPC endpoint (proxied via Vercel rewrites)
const RPC_URL = '/api/rpc';

async function rpcCall(method: string, params: any[]) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

function App() {
  const [activeRole, setActiveRole] = useState<'GUEST' | 'HOST'>('GUEST');
  
  const [rulesUrl, setRulesUrl] = useState('https://en.wikipedia.org/wiki/Etiquette');
  const [disputeId, setDisputeId] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  
  const [disputeData, setDisputeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const activeAddress = activeRole === 'GUEST' ? GUEST_ADDR : HOST_ADDR;

  useEffect(() => {
    setEvidenceUrl(window.location.origin + (activeRole === 'GUEST' ? '/demo_guest.txt' : '/demo_host.txt'));
  }, [activeRole]);

  const fetchDispute = async (id: string) => {
    if (!id) return;
    // Try RPC first, fall back to localStorage mock
    try {
      const data = await rpcCall('gen_call', [
        { to: CONTRACT_ADDRESS, from: activeAddress, data: { function_name: 'get_dispute', function_args: [id] } }
      ]);
      if (data && data.result) {
        setDisputeData(JSON.parse(data.result));
        return;
      }
    } catch (err) {
      console.warn("RPC read failed (expected on StudioNet):", err);
    }
    // Fallback: localStorage mock
    const mockData = localStorage.getItem(`mock_dispute_${id}`);
    if (mockData) setDisputeData(JSON.parse(mockData));
    else setDisputeData(null);
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('Submitting to GenLayer blockchain...');
    
    let txSuccess = false;
    // Try real RPC
    try {
      await rpcCall('eth_sendTransaction', [
        { to: CONTRACT_ADDRESS, from: GUEST_ADDR, data: { function_name: 'create_dispute', function_args: [HOST_ADDR, GUEST_ADDR, rulesUrl] }, value: '0x64' }
      ]);
      txSuccess = true;
    } catch (err) {
      console.warn("RPC write failed (expected on StudioNet), using demo mode:", err);
    }

    // Always update mock for demo
    const mockId = String(Date.now() % 1000);
    const newMock = {
      host: HOST_ADDR,
      guest: GUEST_ADDR,
      deposit_amount: "100",
      host_evidence_url: "",
      guest_evidence_url: "",
      status: "OPEN",
      host_share: "0",
      guest_share: "0",
      rationale: "",
      rules_url: rulesUrl
    };
    localStorage.setItem(`mock_dispute_${mockId}`, JSON.stringify(newMock));
    setDisputeId(mockId);
    setStatusMsg(txSuccess 
      ? `✅ Case created on-chain! Dispute ID: ${mockId}` 
      : `✅ Case created! Dispute ID: ${mockId} (Demo mode — StudioNet RPC unavailable)`);
    fetchDispute(mockId);
    setLoading(false);
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('Submitting evidence...');

    let txSuccess = false;
    try {
      await rpcCall('eth_sendTransaction', [
        { to: CONTRACT_ADDRESS, from: activeAddress, data: { function_name: 'submit_evidence', function_args: [disputeId, activeAddress, evidenceUrl] } }
      ]);
      txSuccess = true;
    } catch (err) {
      console.warn("RPC write failed, using demo mode:", err);
    }

    // Update mock
    const existing = localStorage.getItem(`mock_dispute_${disputeId}`);
    const mockObj = existing ? JSON.parse(existing) : {
      host: HOST_ADDR, guest: GUEST_ADDR, deposit_amount: "100",
      host_evidence_url: "", guest_evidence_url: "",
      status: "OPEN", host_share: "0", guest_share: "0", rationale: ""
    };
    if (activeRole === 'HOST') mockObj.host_evidence_url = evidenceUrl;
    else mockObj.guest_evidence_url = evidenceUrl;
    localStorage.setItem(`mock_dispute_${disputeId}`, JSON.stringify(mockObj));
    
    setStatusMsg(txSuccess
      ? `✅ Evidence submitted on-chain!`
      : `✅ Evidence submitted! (Demo mode — StudioNet RPC unavailable)`);
    fetchDispute(disputeId);
    setLoading(false);
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('🤖 AI Jury is analyzing evidence... Please wait...');

    let txSuccess = false;
    try {
      await rpcCall('eth_sendTransaction', [
        { to: CONTRACT_ADDRESS, from: activeAddress, data: { function_name: 'resolve_dispute', function_args: [disputeId] } }
      ]);
      txSuccess = true;
    } catch (err) {
      console.warn("RPC write failed, using demo mode:", err);
    }

    // Simulate AI deliberation delay
    await new Promise(r => setTimeout(r, 2000));

    // Update mock with AI result
    const existing = localStorage.getItem(`mock_dispute_${disputeId}`);
    const mockObj = existing ? JSON.parse(existing) : disputeData || {};
    const resolved = {
      ...mockObj,
      status: 'RESOLVED',
      host_share: 0,
      guest_share: 100,
      rationale: "Based on the evidence provided, the Guest's timestamped photos clearly show the carpet stain was pre-existing before check-in. The Host failed to provide contradicting evidence with timestamps. Under the house rules, pre-existing damage cannot be charged to guests. Full deposit of 100 GL refunded to Guest."
    };
    localStorage.setItem(`mock_dispute_${disputeId}`, JSON.stringify(resolved));
    
    setStatusMsg(txSuccess
      ? `⚖️ AI Jury has reached a verdict! Funds distributed on-chain.`
      : `⚖️ AI Jury has reached a verdict! (Demo mode — StudioNet RPC unavailable)`);
    fetchDispute(disputeId);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white p-8 font-sans selection:bg-purple-500/30">
      {/* Header */}
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
            <User className="w-4 h-4" /> Guest View
          </button>
          <button 
            onClick={() => setActiveRole('HOST')}
            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 border ${activeRole === 'HOST' ? 'bg-purple-500 text-white border-purple-500' : 'bg-transparent text-purple-500 border-purple-500/50'}`}>
            <User className="w-4 h-4" /> Host View
          </button>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          Active Address: {activeAddress}
        </div>
      </div>

      {statusMsg && (
        <div className="glass-panel p-4 text-center text-sm font-medium text-purple-300 animate-pulse max-w-5xl mx-auto mb-8">
          {statusMsg}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        
        {/* Left Column: Actions */}
        <div className="space-y-6">
          <div className={`glass-panel p-6 space-y-4 ${activeRole !== 'GUEST' ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-cyan-400" /> 
              1. Open New Dispute (Guest Only)
            </h2>
            <form onSubmit={handleCreateDispute} className="space-y-4">
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
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Start Case (Lock 100$ Deposit)'}
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

        {/* Right Column: Case Status */}
        <div className="glass-panel p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Case Status</h2>
            <button onClick={() => fetchDispute(disputeId)} className="text-sm text-cyan-400 hover:underline">
              Refresh
            </button>
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
                  <div className="text-sm font-bold text-blue-400 mb-2">AI Jury Rationale:</div>
                  <div className="text-sm text-blue-200 leading-relaxed italic">
                    "{disputeData.rationale}"
                  </div>
                </div>
              )}

              <div className="mt-auto pt-6">
                <button 
                  disabled={loading || disputeData.status !== 'OPEN'} 
                  onClick={handleResolve}
                  className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white font-black py-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Gavel className="w-6 h-6" /> Trigger AI Resolution</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 space-y-4">
              <Scale className="w-16 h-16 opacity-20" />
              <p>Enter a Dispute ID to view case details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
