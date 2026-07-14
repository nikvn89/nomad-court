import React, { useState } from 'react';
import { createClient, createAccount } from 'genlayer-js';
import { ShieldAlert, Send, Gavel, Scale, Loader2, Link, User } from 'lucide-react';
import './index.css';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x65eC86D2926b58898613af185fB6CbFDd845C332';

// Mock test accounts for Host and Guest
const HOST_PK = '0x1111111111111111111111111111111111111111111111111111111111111111';
const GUEST_PK = '0x2222222222222222222222222222222222222222222222222222222222222222';
const hostAccount = createAccount(HOST_PK);
const guestAccount = createAccount(GUEST_PK);

// Clients with different signers
const hostClient = createClient({ endpoint: '/api/rpc', account: hostAccount });
const guestClient = createClient({ endpoint: '/api/rpc', account: guestAccount });
const readClient = createClient({ endpoint: '/api/rpc' });

function App() {
  const [activeRole, setActiveRole] = useState<'GUEST' | 'HOST'>('GUEST');
  const activeClient = activeRole === 'GUEST' ? guestClient : hostClient;
  const activeAccount = activeRole === 'GUEST' ? guestAccount : hostAccount;

  const [disputeId, setDisputeId] = useState('');
  const [rulesUrl, setRulesUrl] = useState('https://en.wikipedia.org/wiki/Etiquette');
  const [evidenceUrl, setEvidenceUrl] = useState('https://en.wikipedia.org/wiki/Accident');
  
  const [disputeData, setDisputeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRole !== 'GUEST') {
      setStatusMsg('Only the Guest can create a new dispute.');
      return;
    }
    
    setLoading(true);
    setStatusMsg('Creating dispute on GenLayer... Waiting for transaction confirmation.');
    try {
      // 1. Dispatch transaction
      const res = await guestClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_dispute',
        args: [hostAccount.address, rulesUrl],
        value: 0n
      });
      
      // Wait for block confirmation
      await new Promise(r => setTimeout(r, 4000));
      
      // The GenVM writeContract returns the returned ID in res.result
      let newId = res && res.result ? res.result : '';
      
      if (!newId) {
          // Fallback if result is empty
          const latestRes = await readClient.readContract({
              address: CONTRACT_ADDRESS,
              functionName: 'get_guest_latest_dispute',
              args: [guestAccount.address]
          });
          newId = latestRes.result;
      }
      
      if (newId) {
        setDisputeId(newId);
        setStatusMsg(`Dispute created successfully! Confirmed ID: ${newId}`);
        await fetchDispute(newId);
      } else {
        setStatusMsg('Dispute created, but could not derive ID from state yet. Network might be slow.');
      }
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(`Submitting evidence as ${activeRole}...`);
    try {
      await activeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'submit_evidence',
        args: [disputeId, evidenceUrl] // Smart contract validates role restrictions
      });
      setStatusMsg('Evidence submitted successfully!');
      await fetchDispute(disputeId);
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const handleResolve = async () => {
    setLoading(true);
    setStatusMsg('AI Jury is analyzing evidence & rules...');
    try {
      await activeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'resolve_dispute',
        args: [disputeId]
      });
      setStatusMsg('Dispute resolved & funds distributed atomically!');
      await fetchDispute(disputeId);
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const fetchDispute = async (id: string) => {
    try {
      const res = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_dispute',
        args: [id]
      });
      const data = JSON.parse(res.result);
      if (data.status) {
        setDisputeData(data);
      } else {
        setDisputeData(null);
      }
    } catch (err) {
      console.log('Not found');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 py-12">
      
      {/* Header & Role Switcher */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-4 bg-purple-500/10 rounded-full border border-purple-500/20 mb-4">
          <Scale className="w-12 h-12 text-purple-400" />
        </div>
        <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
          NomadCourt
        </h1>
        
        {/* Mock Wallet/Role Switcher */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <button 
            onClick={() => { setActiveRole('GUEST'); setEvidenceUrl('https://en.wikipedia.org/wiki/Accident'); }}
            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 border ${activeRole === 'GUEST' ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-transparent text-cyan-500 border-cyan-500/50'}`}>
            <User className="w-4 h-4" /> Guest View
          </button>
          <button 
            onClick={() => { setActiveRole('HOST'); setEvidenceUrl('https://en.wikipedia.org/wiki/Vandalism'); }}
            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 border ${activeRole === 'HOST' ? 'bg-purple-500 text-white border-purple-500' : 'bg-transparent text-purple-500 border-purple-500/50'}`}>
            <User className="w-4 h-4" /> Host View
          </button>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          Active Address: {activeAccount.address}
        </div>
      </div>

      {statusMsg && (
        <div className="glass-panel p-4 text-center text-sm font-medium text-purple-300 animate-pulse">
          {statusMsg}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid md:grid-cols-2 gap-8">
        
        {/* Left Column: Actions */}
        <div className="space-y-6">
          <div className={`glass-panel p-6 space-y-4 ${activeRole !== 'GUEST' && 'opacity-50 pointer-events-none'}`}>
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
                  <span className="text-gray-500">Host Evid: </span>{disputeData.host_evidence_url ? '✅ Submitted' : '❌ Pending'}<br/>
                  <span className="text-gray-500">Guest Evid: </span>{disputeData.guest_evidence_url ? '✅ Submitted' : '❌ Pending'}
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
