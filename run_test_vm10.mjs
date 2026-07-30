import { createClient, createAccount } from 'genlayer-js';
import { readFileSync } from 'fs';

const PRIVATE_KEY = '0x32ddc45dd7eb02f12783f89adcf38823ca09174e892174349ebb044558fc5419';

async function deployAndTest() {
    const account = createAccount(PRIVATE_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    let codeRaw = readFileSync('./test_vm27.py', 'utf-8');
    codeRaw = codeRaw.replace(/\r/g, '');

    console.log('Deploying test_vm27...');
    let address = '';
    try {
        const result = await client.deployContract({
            code: codeRaw,
            args: []
        });
        console.log('Deploy TX:', result);
        
        for(let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 4000));
            const resp = await fetch('https://studio.genlayer.com/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getTransactionReceipt',
                    params: [result],
                    id: 1
                })
            });
            const r = await resp.json();
            if (r.result && r.result.to) {
                address = r.result.to;
                console.log('Deployed at:', address);
                break;
            }
        }
    } catch (e) {
        console.error('Deploy error:', e.message);
        return;
    }

    if (!address) return;

    try {
        await new Promise(r => setTimeout(r, 4000));
        console.log('Calling ping...');
        const r2 = await client.readContract({ address, functionName: 'ping', args: [] });
        console.log('ping:', r2.result);
    } catch(e) {
        console.error('Test error:', e);
    }
}

deployAndTest();
