import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const proxy = readFileSync(new URL('../api/rpc.ts', import.meta.url), 'utf8');

const deriveStart = app.indexOf('const deriveDisputeId = (receipt');
const deriveEnd = app.indexOf('const ensureRoleClient', deriveStart);

assert.notEqual(deriveStart, -1, 'deriveDisputeId is missing from src/App.tsx');
assert.notEqual(deriveEnd, -1, 'could not isolate deriveDisputeId in src/App.tsx');

const derive = app.slice(deriveStart, deriveEnd);

const decoderStart = app.indexOf('function decodeDisputeIdFromLeaderReceipt');
const decoderEnd = app.indexOf('function App()', decoderStart);

assert.notEqual(
  decoderStart,
  -1,
  'decodeDisputeIdFromLeaderReceipt is missing from src/App.tsx',
);
assert.notEqual(decoderEnd, -1, 'could not isolate dispute-ID decoder');

const decoder = app.slice(decoderStart, decoderEnd);

assert.ok(
  !app.includes('findReturnedString'),
  'recursive findReturnedString fallback must be deleted',
);
assert.ok(
  !app.includes('debugTraceTransaction'),
  'frontend must not depend on the unavailable StudioNet debug RPC',
);
assert.ok(
  !derive.includes('getTransaction'),
  'deriveDisputeId must not fetch or scan a second transaction object',
);
assert.match(
  derive,
  /decodeDisputeIdFromLeaderReceipt\(receipt\)/,
  'deriveDisputeId must use the exact accepted leader result decoder',
);
assert.match(
  decoder,
  /receipt\?\.consensus_data\?\.leader_receipt\?\.\[0\]\?\.result/,
  'decoder must read only consensus_data.leader_receipt[0].result',
);
assert.match(
  decoder,
  /result\.status !== 'return'/,
  'decoder must reject non-return leader results',
);
assert.match(
  decoder,
  /result\?\.payload\?\.readable/,
  'decoder must require the SDK-decoded readable return payload',
);
assert.ok(
  !decoder.includes('Object.values'),
  'decoder must not recursively inspect unrelated receipt fields',
);
assert.match(
  app,
  /const receipt = await waitFinalized\(hash as `0x\$\{string\}`\);\s*const returnedId = deriveDisputeId\(receipt\);/,
  'create_dispute must finalize before decoding its accepted leader result',
);
assert.ok(
  !proxy.includes('gen_dbg_traceTransaction'),
  'RPC proxy must not advertise the unavailable StudioNet debug method',
);

const decoderSource = `${decoder}\nexport { decodeDisputeIdFromLeaderReceipt };`;
const decoderJavaScript = ts.transpileModule(decoderSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const decoderModule = await import(
  `data:text/javascript;base64,${Buffer.from(decoderJavaScript).toString('base64')}`
);

const receiptFor = (readable, status = 'return') => ({
  consensus_data: {
    leader_receipt: [
      {
        result: {
          status,
          payload: { readable },
        },
      },
    ],
  },
});

assert.equal(
  decoderModule.decodeDisputeIdFromLeaderReceipt(receiptFor('"5"')),
  '5',
);
assert.equal(
  decoderModule.decodeDisputeIdFromLeaderReceipt(receiptFor('"123"')),
  '123',
);
assert.throws(
  () => decoderModule.decodeDisputeIdFromLeaderReceipt({}),
  /missing consensus_data\.leader_receipt/,
);
assert.throws(
  () => decoderModule.decodeDisputeIdFromLeaderReceipt(receiptFor('"5"', 'rollback')),
  /must be "return"/,
);
assert.throws(
  () => decoderModule.decodeDisputeIdFromLeaderReceipt(receiptFor('5')),
  /non-canonical dispute ID/,
);
assert.throws(
  () => decoderModule.decodeDisputeIdFromLeaderReceipt(receiptFor('"abc"')),
  /non-canonical dispute ID/,
);

console.log('✅ APP DISPUTE-ID SOURCE CHECK PASSED');
