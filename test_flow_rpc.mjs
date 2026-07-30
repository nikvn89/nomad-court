import { createClient, createAccount } from 'genlayer-js';

const GUEST_KEY = '0x4d91a393c066e8f8c8efaf70e7304bb3b05c5756c1c552a6071b25c4199f1bec';
const HOST_ADDRESS = '0x060c96F1a0ad98897C0E8E03C5f6FEe2eb42fE51';
const CONTRACT = '0x8E20b4A01088328fbd3Eb678D7a0E1665e925905';

async function testFullFlow() {
    const account = createAccount(GUEST_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    console.log('Using Guest Address:', account.address);
    console.log('Creating dispute...');
    
    try {
        const tx = await client.writeContract({
            address: CONTRACT,
            functionName: 'create_dispute',
            args: [HOST_ADDRESS, "https://example.com/rules"],
            value: 100n
        });
        console.log('TX Hash:', tx);
        
        console.log('Waiting for consensus...');
        let newId = '';
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 6000));
            try {
                const res = await client.readContract({
                    address: CONTRACT,
                    functionName: 'get_guest_latest_dispute',
                    args: [account.address]
                });
                console.log(`Poll ${i} get_guest_latest_dispute:`, res.result);
                if (res.result && res.result !== '""' && res.result !== 'null' && res.result !== '') {
                    newId = res.result.replace(/"/g, '').trim();
                    break;
                }
            } catch (e) {
                console.log(`Poll ${i} failed`);
            }
        }
        
        if (newId) {
            console.log('SUCCESS! Dispute ID derived:', newId);
            const data = await client.readContract({
                address: CONTRACT,
                functionName: 'get_dispute',
                args: [newId]
            });
            console.log('Dispute Data:', data.result);
        } else {
            console.log('FAILED to derive ID');
        }
        
    } catch (e) {
        console.error('Error:', e);
    }
}

testFullFlow();
