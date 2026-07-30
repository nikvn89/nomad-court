import { createClient, createAccount } from 'genlayer-js';
import { readFileSync } from 'fs';

const PRIVATE_KEY = '0x32ddc45dd7eb02f12783f89adcf38823ca09174e892174349ebb044558fc5419';

async function deployAndTest() {
    const account = createAccount(PRIVATE_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    let codeRaw = readFileSync('./test_vm6.py', 'utf-8');
    codeRaw = codeRaw.replace(/\r/g, '');

    console.log('Deploying test_vm6...');
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
        console.log('Calling return_as_hex...');
        const r1 = await client.writeContract({ address, functionName: 'return_as_hex', args: [] });
        console.log('return_as_hex TX:', r1);
        
        console.log('Calling return_str...');
        const r2 = await client.writeContract({ address, functionName: 'return_str', args: [] });
        console.log('return_str TX:', r2);

        console.log('Calling return_host...');
        const r3 = await client.writeContract({ address, functionName: 'return_host', args: ["0x060c96F1a0ad98897C0E8E03C5f6FEe2eb42fE51"] });
        console.log('return_host TX:', r3);
    } catch(e) {
        console.error('Test error:', e);
    }
}

deployAndTest();
