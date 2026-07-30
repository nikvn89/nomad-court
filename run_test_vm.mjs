import { createClient, createAccount } from 'genlayer-js';

const GUEST_KEY = '0x4d91a393c066e8f8c8efaf70e7304bb3b05c5756c1c552a6071b25c4199f1bec';
const HOST_ADDRESS = '0x060c96F1a0ad98897C0E8E03C5f6FEe2eb42fE51';
const CONTRACT = '0xc65184b1b6B4A16E3E7fd735d7437399F2b014f5';

async function testMethods() {
    const account = createAccount(GUEST_KEY);
    const client = createClient({
        endpoint: 'https://studio.genlayer.com/api',
        account: account
    });

    console.log('Testing test_sender...');
    try {
        const tx1 = await client.writeContract({
            address: CONTRACT,
            functionName: 'test_sender',
            args: []
        });
        console.log('test_sender TX:', tx1);
    } catch (e) {
        console.error('Error test_sender:', e);
    }
    
    console.log('Testing test_address_arg...');
    try {
        const tx2 = await client.writeContract({
            address: CONTRACT,
            functionName: 'test_address_arg',
            args: [HOST_ADDRESS]
        });
        console.log('test_address_arg TX:', tx2);
    } catch (e) {
        console.error('Error test_address_arg:', e);
    }
    
    // Check results after a delay
    await new Promise(r => setTimeout(r, 10000));
    
    try {
        const res1 = await client.readContract({
            address: CONTRACT,
            functionName: 'get_val',
            args: ["sender_str"]
        });
        console.log('Val sender_str:', res1.result);
        
        const res2 = await client.readContract({
            address: CONTRACT,
            functionName: 'get_val',
            args: ["host_str"]
        });
        console.log('Val host_str:', res2.result);
    } catch(e) {
        console.error('Read error:', e);
    }
}

testMethods();
