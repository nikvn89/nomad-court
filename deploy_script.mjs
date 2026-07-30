import { createClient, createAccount } from 'genlayer-js';
import { readFileSync } from 'fs';

const PRIVATE_KEY = '0x32ddc45dd7eb02f12783f89adcf38823ca09174e892174349ebb044558fc5419';

async function deploy() {
    const account = createAccount(PRIVATE_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    console.log('Deploying from account:', account.address);

    const code = readFileSync('./deploy_clean.py', 'utf-8');
    console.log('Code size:', code.length, 'bytes');
    
    // Verify no non-ASCII
    for (let i = 0; i < code.length; i++) {
        if (code.charCodeAt(i) > 127) {
            console.error('NON-ASCII at position', i, ':', code.charCodeAt(i));
            return;
        }
    }
    console.log('Code is 100% ASCII clean');

    try {
        const result = await client.deployContract({
            code: code,
            args: []
        });
        console.log('Deploy result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Deploy error:', e.message);
        console.error('Full error:', JSON.stringify(e, null, 2));
    }
}

deploy();
