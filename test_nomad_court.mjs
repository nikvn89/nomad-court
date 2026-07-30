import { createClient } from 'genlayer-js';
import { readFileSync } from 'fs';

const account = {
    address: '0xeAb35ceC0863e10B300FA65151Ed1e687312E8d0',
    privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111',
};

const client = createClient({
    account: account
});

async function run() {
    let codeRaw = readFileSync('./NomadCourt.py', 'utf-8');
    codeRaw = codeRaw.replace(/\r/g, '');

    console.log('Deploying NomadCourt...');
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
        console.log('Calling create_dispute...');
        const r1 = await client.writeContract({ 
            address, 
            functionName: 'create_dispute', 
            args: ["0xHost", "0xGuest", "ipfs://test"] 
        });
        console.log('create_dispute TX:', r1);
        
        await new Promise(r => setTimeout(r, 10000));
        
        console.log('Calling get_dispute...');
        const r2 = await client.readContract({ 
            address, 
            functionName: 'get_dispute', 
            args: ["1"] 
        });
        console.log('get_dispute 1:', r2.result);
    } catch(e) {
        console.error('Test error:', e);
    }
}

run();
