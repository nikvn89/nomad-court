import { createClient, createAccount } from 'genlayer-js';

const GUEST_KEY = '0x4d91a393c066e8f8c8efaf70e7304bb3b05c5756c1c552a6071b25c4199f1bec';
const HOST_ADDRESS = '0x060c96F1a0ad98897C0E8E03C5f6FEe2eb42fE51';
const CONTRACT = '0x457f048EB69cAaAF2D15117C35f208BC5D033658';

async function testFullFlow() {
    const account = createAccount(GUEST_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    console.log('Creating dispute without value...');
    try {
        const tx = await client.writeContract({
            address: CONTRACT,
            functionName: 'create_dispute',
            args: [HOST_ADDRESS, "https://example.com/rules"]
        });
        console.log('TX Hash:', tx);
    } catch (e) {
        console.error('Error:', e);
    }
}

testFullFlow();
