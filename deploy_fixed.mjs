import { createClient, createAccount } from 'genlayer-js';
import { readFileSync } from 'fs';

const PRIVATE_KEY = '0x32ddc45dd7eb02f12783f89adcf38823ca09174e892174349ebb044558fc5419';

async function deploy() {
    const account = createAccount(PRIVATE_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    let codeRaw = readFileSync('./NomadCourt.py', 'utf-8');
    codeRaw = codeRaw.replace(/\r/g, ''); // Ensure LF only

    console.log('Deploying fixed contract...');
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
