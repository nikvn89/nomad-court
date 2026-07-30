import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('node_modules/genlayer-js/package.json', 'utf8'));
console.log('genlayer-js version:', pkg.version);

// Now let's try deploying via raw fetch to see exactly what genlayer-js sends
const code = readFileSync('./test_minimal2.py', 'utf-8');

// Try deploying via raw JSON-RPC
const body = JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_sendTransaction',
    params: [{
        from: '0x060c96F1a0ad98897C0E8E03C5f6FEe2eb42fE51',
        data: JSON.stringify({
            contract_code: code,
            constructor_args: '[]'
        })
    }],
    id: 1
});

console.log('Raw request body:', body.substring(0, 500));

const resp = await fetch('https://studio.genlayer.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body
});
const result = await resp.json();
console.log('Result:', JSON.stringify(result, null, 2));
