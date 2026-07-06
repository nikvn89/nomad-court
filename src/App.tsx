import React, { useState } from 'react';
import { createClient, createAccount } from 'genlayer-js';
import { ShieldAlert, Send, Gavel, Scale, Loader2, Link } from 'lucide-react';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x205c232aC6fbD5e579C8b8bB763a46bF11a097Ed';

// Dùng một Private Key ảo để ký giao dịch trên Testnet
const account = createAccount('0x1111111111111111111111111111111111111111111111111111111111111111');
const client = createClient({
  endpoint: 'https://studio.genlayer.com/rpc',
  account: account,
});

function App() {
  const [disputeId, setDisputeId] = useState('');
  const [rulesUrl, setRulesUrl] = useState('');
  const [hostUrl, setHostUrl] = useState('');
  const [guestUrl, setGuestUrl] = useState('');
  
  const [disputeData, setDisputeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('Creating dispute on GenLayer...');
    try {
      // Gọi public.write function 'create_dispute'
      const res = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_dispute',
        args: [
          '0x1234567890123456789012345678901234567890', // Mock Host Address
          rulesUrl
        ],
        value: 100n // Mock deposit amount (100)
      });
      
      const newId = res.result; // Trả về Dispute ID từ Smart Contract
      setDisputeId(newId);
      setStatusMsg(`Dispute created successfully! ID: ${newId}`);
      await fetchDispute(newId);
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('Submitting evidence...');
    try {
      await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'submit_evidence',
        args: [disputeId, hostUrl, guestUrl]
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
    setStatusMsg('AI Jury is reading evidence and calculating consensus...');
    try {
      await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'resolve_dispute',
        args: [disputeId]
      });
      setStatusMsg('Dispute resolved! AI Verdict reached.');
      await fetchDispute(disputeId);
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const fetchDispute = async (id: string) => {
    try {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_dispute',
        args: [id]
      });
      const data = JSON.parse(res.result);
      if (data.status) {
        setDisputeData(data);
      }
    } catch (err) {
      console.log('Not found');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 py-12">
      
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-4 bg-purple-500/10 rounded-full border border-purple-500/20 mb-4">
          <Scale className="w-12 h-12 text-purple-400" />
        </div>
        <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
          NomadCourt
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Decentralized Airbnb Dispute Resolution powered by GenLayer's Non-deterministic AI Execution.
        </p>
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
          <div className="glass-panel p-6 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-cyan-400" /> 
              1. Open New Dispute
            </h2>
            <form onSubmit={handleCreateDispute} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">House Rules URL (Text/Doc)</label>
                <div className="relative">
                  <Link className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                  <input 
                    type="url" required value={rulesUrl} onChange={e => setRulesUrl(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                    placeholder="https://example.com/rules.txt"
                  />
                </div>
              </div>
              <button disabled={loading} type="submit" className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold py-2 rounded-lg transition-colors flex justify-center items-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Start Case (Lock 100$ Deposit)'}
              </button>
            </form>
          </div>

          <div className="glass-panel p-6 space-y-4 opacity-75 focus-within:opacity-100 transition-opacity">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Send className="w-5 h-5 text-purple-400" /> 
              2. Submit Evidence
            </h2>
            <form onSubmit={handleSubmitEvidence} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Dispute ID</label>
                <input 
                  type="text" required value={disputeId} onChange={e => setDisputeId(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4 focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="e.g. 1"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Host Evidence URL</label>
                <input 
                  type="url" required value={hostUrl} onChange={e => setHostUrl(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4 focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Guest Evidence URL</label>
                <input 
                  type="url" required value={guestUrl} onChange={e => setGuestUrl(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4 focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="https://..."
                />
              </div>
              <button disabled={loading || !disputeId} type="submit" className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 rounded-lg transition-colors">
                Attach to Case
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
