import { createClient, createAccount } from 'genlayer-js';
import { readFileSync } from 'fs';

const PRIVATE_KEY = '0x32ddc45dd7eb02f12783f89adcf38823ca09174e892174349ebb044558fc5419';

async function deploy() {
    const account = createAccount(PRIVATE_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    const code = readFileSync('./test_minimal.py', 'utf-8');
    console.log('Code:', JSON.stringify(code));
    console.log('Code length:', code.length);

    try {
        const result = await client.deployContract({
            code: code,
            args: []
        });
        console.log('Deploy TX:', result);
        
        // Wait for confirmation
        await new Promise(r => setTimeout(r, 10000));
        
        // Get receipt
        const receipt = await client.getTransactionReceipt({ hash: result });
        console.log('Receipt:', JSON.stringify(receipt, null, 2));
    } catch (e) {
        console.error('Deploy error:', e);
    }
}

deploy();
