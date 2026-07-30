import { createClient } from 'genlayer-js';

const client = createClient({
    endpoint: 'https://studio.genlayer.com/api',
});

async function testRead() {
    try {
        const res2 = await client.readContract({
            address: '0x457f048EB69cAaAF2D15117C35f208BC5D033658',
            functionName: 'get_guest_latest_dispute',
            args: ["0xeAb35ceC0863e10B300FA65151Ed1e687312E8d0"]
        });
        console.log('Result for checksummed address:', res2.result !== undefined ? res2.result : res2);

        const res3 = await client.readContract({
            address: '0x457f048EB69cAaAF2D15117C35f208BC5D033658',
            functionName: 'get_guest_latest_dispute',
            args: ["0xeab35cec0863e10b300fa65151ed1e687312e8d0"]
        });
        console.log('Result for lowercased address:', res3.result !== undefined ? res3.result : res3);
        
        // Also let's scan all IDs up to 5
        for (let i = 1; i <= 5; i++) {
            const res = await client.readContract({
                address: '0x457f048EB69cAaAF2D15117C35f208BC5D033658',
                functionName: 'get_dispute',
                args: [i.toString()]
            });
            console.log(`Dispute ${i}:`, res.result);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

testRead();
