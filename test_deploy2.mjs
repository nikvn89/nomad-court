import { createClient, createAccount } from 'genlayer-js';
import { readFileSync } from 'fs';

const PRIVATE_KEY = '0x32ddc45dd7eb02f12783f89adcf38823ca09174e892174349ebb044558fc5419';

async function deploy() {
    const account = createAccount(PRIVATE_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    // Test with file WITHOUT version comment
    const code = readFileSync('./test_minimal2.py', 'utf-8');
    console.log('Code bytes:', Buffer.from(code).toString('hex').substring(0, 200));
    console.log('Code length:', code.length);

    try {
        const result = await client.deployContract({
            code: code,
            args: []
        });
        console.log('Deploy TX:', result);
    } catch (e) {
        console.error('Deploy error:', e.message);
    }
}

deploy();
