import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import path from 'path';

const privateKey = '0xfdf8ca867c6ccb4fd9b2decfb5969bd09794ab9f1432b1edd7cb3e3bc4450665';
const account = createAccount(privateKey);
const client = createClient({ chain: studionet, account });

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const code = fs.readFileSync(path.join(__dirname, '../contracts/NomadCourt.py'), 'utf8');

async function deploy() {
  console.log('🚀 Deploying NomadCourt.py to GenLayer StudioNet...');
  try {
    const hash = await client.deployContract({
      code: code,
      args: []
    });
    console.log('✅ Deploy Transaction Sent! Tx Hash:', hash);
    console.log('⏳ Waiting for block confirmation...');
    
    // Wait a few seconds for network confirmation
    await new Promise(r => setTimeout(r, 6000));
    
    // Fetch receipt to get contract address
    const res = await fetch('https://studio.genlayer.com/api', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        jsonrpc: '2.0', 
        method: 'eth_getTransactionReceipt', 
        params: [hash], 
        id: 1 
      })
    });
    
    const json = await res.json();
    if (json.result && json.result.to) {
      console.log('🎉 CONTRACT DEPLOYED SUCCESSFULLY!');
      console.log('📜 YOUR NEW CONTRACT ADDRESS:', json.result.to);
      console.log('\n👉 Next steps:');
      console.log('1. Copy the address above.');
      console.log('2. Paste it into src/App.tsx at line 8 (CONTRACT_ADDRESS).');
      console.log('3. Paste it into README.md.');
    } else {
      console.log('⚠️ Could not fetch receipt. Check GenLayer Explorer for hash:', hash);
    }
  } catch (err) {
    console.error('❌ Deploy failed:', err);
  }
}
deploy();
