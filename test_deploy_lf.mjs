import { createClient, createAccount } from 'genlayer-js';
import { readFileSync } from 'fs';

const PRIVATE_KEY = '0x32ddc45dd7eb02f12783f89adcf38823ca09174e892174349ebb044558fc5419';

async function deploy() {
    const account = createAccount(PRIVATE_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    let codeRaw = readFileSync('./deploy_clean.py', 'utf-8');
    
    // STRICTLY FORCE LF ONLY (remove all \r)
    codeRaw = codeRaw.replace(/\r/g, '');

    console.log('Deploying from account:', account.address);
    console.log('Code size (LF only):', codeRaw.length, 'bytes');

    try {
        const result = await client.deployContract({
            code: codeRaw,
            args: []
        });
        console.log('Deploy TX:', result);
    } catch (e) {
        console.error('Deploy error:', e.message);
    }
}

deploy();
