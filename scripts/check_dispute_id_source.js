import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const proxy = readFileSync(new URL('../api/rpc.ts', import.meta.url), 'utf8');

const deriveStart = app.indexOf('const deriveDisputeId = async');
const deriveEnd = app.indexOf('const ensureRoleClient', deriveStart);

assert.notEqual(deriveStart, -1, 'deriveDisputeId is missing from src/App.tsx');
assert.notEqual(deriveEnd, -1, 'could not isolate deriveDisputeId in src/App.tsx');

const derive = app.slice(deriveStart, deriveEnd);

const decoderStart = app.indexOf('function decodeHexUtf8');
const decoderEnd = app.indexOf('function App()', decoderStart);

assert.notEqual(decoderStart, -1, 'decodeHexUtf8 is missing from src/App.tsx');
assert.notEqual(decoderEnd, -1, 'could not isolate dispute-ID decoders');

assert.ok(
  !app.includes('findReturnedString'),
  'recursive findReturnedString fallback must be deleted',
);
assert.ok(
  !derive.includes('getTransaction'),
  'deriveDisputeId must not inspect the transaction object',
);
assert.ok(
  !derive.includes('receipt'),
  'deriveDisputeId must not inspect the finalized receipt',
);
assert.match(
  derive,
  /debugTraceTransaction\(\{ hash, round: 0 \}\)/,
  'deriveDisputeId must call debugTraceTransaction for round 0',
);
assert.match(
  derive,
  /trace\?\.result_code !== 0/,
  'deriveDisputeId must reject an unsuccessful GenVM result',
);
assert.match(
  derive,
  /typeof trace\?\.return_data !== 'string'/,
  'deriveDisputeId must require trace.return_data',
);
assert.match(
  derive,
  /decodeDisputeIdFromReturnData\(trace\.return_data\)/,
  'deriveDisputeId must decode only trace.return_data',
);
assert.match(
  app,
  /await waitFinalized\(hash as `0x\$\{string\}`\);[\s\S]*?deriveDisputeId\(hash as `0x\$\{string\}`\)/,
  'create_dispute must finalize before deriving its returned ID',
);
assert.ok(
  proxy.includes("'gen_dbg_traceTransaction'"),
  'the exact genlayer-js@1.1.8 trace RPC must be retryable',
);

const decoderSource = `${app.slice(decoderStart, decoderEnd)}\nexport { decodeHexUtf8, decodeDisputeIdFromReturnData };`;
const decoderJavaScript = ts.transpileModule(decoderSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const decoderModule = await import(
  `data:text/javascript;base64,${Buffer.from(decoderJavaScript).toString('base64')}`
);

assert.equal(decoderModule.decodeDisputeIdFromReturnData('0x3132'), '12');
assert.equal(decoderModule.decodeDisputeIdFromReturnData('0x22333422'), '34');
assert.throws(
  () => decoderModule.decodeDisputeIdFromReturnData('not-hex'),
  /must be a hex string/,
);
assert.throws(
  () => decoderModule.decodeDisputeIdFromReturnData('0x2261626322'),
  /Could not decode dispute ID/,
);

console.log('✅ APP DISPUTE-ID SOURCE CHECK PASSED');
