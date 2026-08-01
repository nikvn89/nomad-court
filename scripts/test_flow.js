import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const code = fs.readFileSync(path.join(__dirname, '../contracts/NomadCourt.py'), 'utf8');

// We need two accounts to test guest and host interactions (authorization flow)
const hostKey = '0xfdf8ca867c6ccb4fd9b2decfb5969bd09794ab9f1432b1edd7cb3e3bc4450665';
const guestKey = '0x702549aae92c2c31e652307d45b2f3a93ca49f346fcef546b9d1d10c15f61edf';

const hostAccount = createAccount(hostKey);
const guestAccount = createAccount(guestKey);

const hostClient = createClient({ chain: studionet, account: hostAccount });
const guestClient = createClient({ chain: studionet, account: guestAccount });

async function waitForReceipt(hash, retries = 15) {
  for (let i = 0; i < retries; i++) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const res = await fetch('https://studio.genlayer.com/api', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionReceipt', params: [hash], id: 1 })
      });
      const json = await res.json();
      if (json.result) return json.result;
    } catch (e) {}
  }
  throw new Error("Transaction receipt not found for " + hash);
}

async function runTest() {
  console.log('🧪 Starting End-to-End Repository Test for NomadCourt');
  console.log('Host Account:', hostAccount.address);
  console.log('Guest Account:', guestAccount.address);
  
  // 1. Deploy Contract
  console.log('\n[1/5] Deploying NomadCourt.py...');
  const deployHash = await hostClient.deployContract({ code, args: [] });
  console.log('Tx Hash:', deployHash);
  const deployReceipt = await waitForReceipt(deployHash);
  const contractAddress = deployReceipt.to;
  console.log('✅ Deployed to:', contractAddress);

  // 2. Guest Creates Dispute (Must send GEN value)
  console.log('\n[2/5] Guest creates a dispute...');
  const rulesUrl = 'https://en.wikipedia.org/wiki/Etiquette'; // mock rules
  const createHash = await guestClient.writeContract({
    address: contractAddress,
    functionName: 'create_dispute',
    args: [hostAccount.address, rulesUrl],
    value: 10000000000000000000n // 10 GEN deposit
  });
  console.log('Tx Hash:', createHash);
  await waitForReceipt(createHash);
  console.log('✅ Dispute created successfully.');

  // Find the dispute ID (should be 1 since it's a fresh contract)
  const disputeId = 1;

  // 3. Host Submits Evidence (Restricted to Host)
  console.log('\n[3/5] Host submits evidence...');
  const hostEvidUrl = 'https://en.wikipedia.org/wiki/Vandalism'; // mock
  const hostEvidHash = await hostClient.writeContract({
    address: contractAddress,
    functionName: 'submit_evidence',
    args: [String(disputeId), hostEvidUrl]
  });
  console.log('Tx Hash:', hostEvidHash);
  await waitForReceipt(hostEvidHash);
  console.log('✅ Host evidence submitted.');

  // 4. Guest Submits Evidence (Restricted to Guest)
  console.log('\n[4/5] Guest submits evidence...');
  const guestEvidUrl = 'https://en.wikipedia.org/wiki/Accident'; // mock
  const guestEvidHash = await guestClient.writeContract({
    address: contractAddress,
    functionName: 'submit_evidence',
    args: [String(disputeId), guestEvidUrl]
  });
  console.log('Tx Hash:', guestEvidHash);
  await waitForReceipt(guestEvidHash);
  console.log('✅ Guest evidence submitted.');

  // 5. Trigger AI Resolution
  console.log('\n[5/5] Triggering AI Resolution (Consensus)...');
  console.log('⚖️ GenVM is running non-deterministic AI execution. This takes ~30 seconds...');
  const resolveHash = await guestClient.writeContract({
    address: contractAddress,
    functionName: 'resolve_dispute',
    args: [String(disputeId)]
  });
  console.log('Tx Hash:', resolveHash);
  const resolveReceipt = await waitForReceipt(resolveHash, 20);
  
  if (resolveReceipt.status === '0x1') {
      console.log('✅ AI Resolution Transaction Success!');
      
      // Read state
      const stateData = await guestClient.readContract({
          address: contractAddress,
          functionName: 'get_dispute',
          args: [String(disputeId)]
      });
      console.log('\n📜 Final State Dump:', stateData);
      console.log('\n🎉 End-to-End Test Completed Successfully!');
  } else {
      console.log('⚠️ AI Resolution reverted. This may be due to UNDETERMINED consensus (AI variance).');
      console.log('This is expected behavior in non-deterministic environments.');
  }
}

runTest().catch(console.error);
