import { createClient } from 'genlayer-js';

const client = createClient({
    endpoint: 'https://studio.genlayer.com/api',
});

async function testRead() {
    try {
        const res = await client.readContract({
            address: '0x8E20b4A01088328fbd3Eb678D7a0E1665e925905',
            functionName: 'get_dispute',
            args: ["1"]
        });
        console.log('Result for get_dispute(1):', res.result !== undefined ? res.result : res);
        
        const res2 = await client.readContract({
            address: '0x8E20b4A01088328fbd3Eb678D7a0E1665e925905',
            functionName: 'get_guest_latest_dispute',
            args: ["0xeAb35ceC0863e10B300FA65151Ed1e687312E8d0"]
        });
        console.log('Result for get_guest_latest_dispute:', res2.result !== undefined ? res2.result : res2);
    } catch (e) {
        console.error('Error:', e);
    }
}

testRead();
