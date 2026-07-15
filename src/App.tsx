import React, { useState } from 'react';
import { createClient, createAccount } from 'genlayer-js';
import { ShieldAlert, Send, Gavel, Scale, Loader2, Link, User } from 'lucide-react';
import './index.css';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x6833DF2eB3da8FF116B8DB198cce167D992E6a28';

const readClient = createClient({ endpoint: '/api/rpc' });

function App() {
  const [hostKey, setHostKey] = useState('0x32ddc45dd7eb02f12783f89adcf38823ca09174e892174349ebb044558fc5419');
  const [guestKey, setGuestKey] = useState('0x4d91a393c066e8f8c8efaf70e7304bb3b05c5756c1c552a6071b25c4199f1bec');
  const [isConnected, setIsConnected] = useState(false);
  const [clients, setClients] = useState<any>(null);

  const [activeRole, setActiveRole] = useState<'GUEST' | 'HOST'>('GUEST');

  const [disputeId, setDisputeId] = useState('');
  const [rulesUrl, setRulesUrl] = useState(window.location.origin + '/demo_rules.txt');
  const [evidenceUrl, setEvidenceUrl] = useState(window.location.origin + '/demo_guest.txt');
  
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
      let txRes: any;
      try {
        txRes = await clients.guestClient.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: 'create_dispute',
          args: [clients.hostAccount.address, rulesUrl]
        });
      } catch (e: any) {
        setStatusMsg(`TX Reverted: ${e.message}`);
        setLoading(false);
        return;
      }
      
      let debugMsg = txRes ? JSON.stringify(txRes).substring(0, 50) : 'No TX';
      
      // 2. Derive dispute ID from on-chain state (Confirmed Path)
      let newId = '';
      
      // GenVM StudioNet can take 30-40 seconds to reach consensus. Poll every 5s for up to 60s.
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 5000)); 
        setStatusMsg(`Waiting for blockchain consensus... (Attempt ${attempt + 1}/12)`);
        
        const checkIds = Array.from({length: 20}, (_, i) => 20 - i);
        const promises = checkIds.map(async (guessId) => {
          try {
            const res = await readClient.readContract({
              address: CONTRACT_ADDRESS,
              functionName: 'get_dispute',
              args: [guessId.toString()]
            });
            const rawData = res.result ? res.result : res;
            const d = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            const cleanGuest = d.guest ? d.guest.toLowerCase().replace('0x', '') : '';
            const cleanLocal = clients.guestAccount.address.toLowerCase().replace('0x', '');
            
            if (d.status === 'OPEN' && cleanGuest.includes(cleanLocal)) {
              return guessId.toString();
            }
          } catch (e) {
            // ignore
          }
          return null;
        });
        
        const results = await Promise.all(promises);
        const found = results.filter(Boolean);
        
        if (found.length > 0) {
          newId = found[0]; // first one in the array is the highest ID
          break; // Found it! Exit polling loop
        }
      }
      
      if (newId) {
        setDisputeId(newId);
        setStatusMsg(`Dispute created successfully! Confirmed ID: ${newId}`);
        await fetchDispute(newId);
      } else {
        setStatusMsg(`Could not derive ID. TX: ${debugMsg}. (It might just be slow, try refreshing the page later)`);
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
        args: [disputeId, evidenceUrl]
      });
      
      // Wait for consensus
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000));
        setStatusMsg(`Waiting for blockchain consensus... (Attempt ${i + 1}/12)`);
        try {
          const res = await readClient.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_dispute',
            args: [disputeId]
          });
          const rawData = res.result ? res.result : res;
          const d = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
          if (activeRole === 'GUEST' && d.guest_evidence_url) break;
          if (activeRole === 'HOST' && d.host_evidence_url) break;
        } catch(e) {}
      }
      
      setStatusMsg('Evidence submitted successfully!');
      await fetchDispute(disputeId);
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const handleResolve = async () => {
    setLoading(true);
    setStatusMsg('AI Jury is analyzing evidence & rules... (This may take 40s)');
    try {
      await activeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'resolve_dispute',
        args: [disputeId]
      });
      
      // Wait for consensus
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 5000));
        setStatusMsg(`Waiting for AI Consensus on Blockchain... (Attempt ${i + 1}/15)`);
        try {
          const res = await readClient.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_dispute',
            args: [disputeId]
          });
          const rawData = res.result ? res.result : res;
          const d = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
          if (d.status === 'RESOLVED') break;
        } catch(e) {}
      }
      
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
      const rawData = res.result ? res.result : res;
      const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      if (data && data.status) {
        setDisputeData(data);
      } else {
        setDisputeData(null);
      }
    } catch (err) {
      console.log('Not found');
    }
  };

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hAcc = createAccount(hostKey);
      const gAcc = createAccount(guestKey);
      const hClient = createClient({ endpoint: '/api/rpc', account: hAcc });
      const gClient = createClient({ endpoint: '/api/rpc', account: gAcc });
      
      setClients({
        hostAccount: hAcc,
        guestAccount: gAcc,
        hostClient: hClient,
        guestClient: gClient
      });
      setIsConnected(true);
    } catch (err: any) {
      alert("Invalid Private Key format. Make sure it is a valid hex string starting with 0x.");
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md glass-panel p-8 space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center p-4 bg-purple-500/10 rounded-full border border-purple-500/20 mb-2">
              <Scale className="w-12 h-12 text-purple-400" />
            </div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">Connect Wallets</h1>
            <p className="text-sm text-gray-400">Enter GenLayer testnet private keys (with gas) to interact with the dispute contract.</p>
          </div>
          
          <form onSubmit={handleConnect} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-purple-400 mb-2">Host Private Key</label>
              <input type="password" required value={hostKey} onChange={e => setHostKey(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg py-3 px-4 focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm" placeholder="0x..." />
            </div>
            <div>
              <label className="block text-sm font-bold text-cyan-400 mb-2">Guest Private Key</label>
              <input type="password" required value={guestKey} onChange={e => setGuestKey(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg py-3 px-4 focus:ring-2 focus:ring-cyan-500 outline-none font-mono text-sm" placeholder="0x..." />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white font-black py-4 rounded-xl shadow-lg transition-transform transform active:scale-95">
              Connect to GenLayer
            </button>
          </form>
        </div>
      </div>
    );
  }

  const activeClient = activeRole === 'GUEST' ? clients.guestClient : clients.hostClient;
  const activeAccount = activeRole === 'GUEST' ? clients.guestAccount : clients.hostAccount;

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
            onClick={() => { setActiveRole('GUEST'); setEvidenceUrl(window.location.origin + '/demo_guest.txt'); }}
            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 border ${activeRole === 'GUEST' ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-transparent text-cyan-500 border-cyan-500/50'}`}>
            <User className="w-4 h-4" /> Guest View
          </button>
          <button 
            onClick={() => { setActiveRole('HOST'); setEvidenceUrl(window.location.origin + '/demo_host.txt'); }}
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
