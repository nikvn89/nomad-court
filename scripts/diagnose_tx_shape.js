// Read-only transaction-shape diagnostic for the installed GenLayerJS + StudioNet.
// Usage:
//   npm run diagnose:tx -- 0xTRANSACTION_HASH
//
// It never reads private keys and never sends a transaction.

import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

const hash = process.argv[2];

if (!hash || !/^0x[0-9a-fA-F]+$/.test(hash)) {
  console.error('usage: npm run diagnose:tx -- 0xTRANSACTION_HASH');
  process.exit(1);
}

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array[${value.length}]`;

  const type = typeof value;
  if (type === 'string') return `string(len=${value.length})`;
  if (type === 'number' || type === 'boolean') return `${type}(${String(value)})`;
  if (type === 'bigint') return `bigint(${value.toString()})`;
  if (type === 'object') return `object{${Object.keys(value).slice(0, 12).join(',')}}`;
  return type;
}

function dump(label, obj) {
  console.log(`\n--- ${label} ---`);

  if (!obj || typeof obj !== 'object') {
    console.log('  value:', describe(obj));
    return;
  }

  console.log('  keys:', Object.keys(obj).sort().join(', '));
  console.log('  statusName:', describe(obj.statusName));
  console.log('  txExecutionResultName:', describe(obj.txExecutionResultName));
  console.log('  txExecutionResult:', describe(obj.txExecutionResult));
  console.log('  txDataDecoded:', describe(obj.txDataDecoded));
  console.log('  recipient:', describe(obj.recipient));
}

const client = createClient({ chain: studionet });

console.log('chain.id:', studionet.id);
console.log('chain.name:', studionet.name);
console.log('chain.isStudio:', studionet.isStudio);

let receipt;
try {
  receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    fullTransaction: true,
    interval: 4000,
    retries: 15,
  });
} catch (err) {
  console.error(
    '\nwaitForTransactionReceipt failed (RPC/transport; NOT a contract revert):',
    err?.message ?? err,
  );
  process.exit(2);
}

dump('waitForTransactionReceipt(fullTransaction: true)', receipt);

let transaction;
try {
  transaction = await client.getTransaction({ hash });
} catch (err) {
  console.error(
    '\ngetTransaction failed (RPC/transport; NOT a contract revert):',
    err?.message ?? err,
  );
  process.exit(2);
}

dump('getTransaction({ hash })', transaction);

console.log('\nDIAGNOSTIC ONLY: no execution outcome is inferred from missing fields.');
