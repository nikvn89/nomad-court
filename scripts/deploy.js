import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const privateKey = process.env.DEPLOYER_KEY;

if (
  !privateKey ||
  !/^0x[0-9a-fA-F]{64}$/.test(privateKey)
) {
  console.error('❌ Missing or invalid DEPLOYER_KEY');
  process.exit(1);
}

const account = createAccount(privateKey);

const client = createClient({
  chain: studionet,
  account,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const code = fs.readFileSync(
  path.join(__dirname, '../contracts/NomadCourt.py'),
  'utf8',
);

async function deploy() {
  console.log('🚀 Deploying NomadCourt.py to GenLayer StudioNet...');

  try {
    const hash = await client.deployContract({
      code,
      args: [],
    });

    console.log('✅ Deploy transaction submitted:', hash);
    console.log('⏳ Waiting for FINALIZED...');

    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: true,
      interval: 5000,
      retries: 60,
    });

    const contractAddress =
      receipt?.data?.contract_address ??
      receipt?.data?.contractAddress ??
      receipt?.contract_address ??
      receipt?.contractAddress;

    if (!contractAddress) {
      console.error('❌ Could not derive contract address');
      console.error(JSON.stringify(receipt, null, 2));
      process.exit(1);
    }

    console.log('🎉 CONTRACT DEPLOYED SUCCESSFULLY!');
    console.log('📜 Contract address:', contractAddress);
    console.log(
      `🔎 Explorer: https://explorer-studio.genlayer.com/address/${contractAddress}`,
    );
  } catch (err) {
    console.error('❌ Deploy failed:', err);
    process.exit(1);
  }
}

deploy();
