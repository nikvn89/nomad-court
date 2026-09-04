import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}
function pass(message) { console.log(`✅ ${message}`); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function normalize(text) { return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim(); }

function extractNativePayoutInterface(source, label) {
  const match = source.match(
    /@gl\.evm\.contract_interface\s*\nclass NativePayout:\s*\n(?:[\s\S]*?)class Write:\s*\n\s*pass/,
  );
  if (!match) fail(`${label}: NativePayout interface not found`);
  return normalize(match[0]);
}

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) fail(`scripts/test_flow.js: function ${name} not found`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  return source.slice(start, end > start ? end : undefined);
}

const production = read('contracts/NomadCourt.py');
const probe = read('tests/contracts/NativePayoutProbe.py');
const payoutTest = read('scripts/test_native_payout.js');
const flowTest = read('scripts/test_flow.js');

const prodInterface = extractNativePayoutInterface(production, 'production');
const probeInterface = extractNativePayoutInterface(probe, 'probe');
if (prodInterface !== probeInterface) fail('test probe NativePayout interface diverges from production NomadCourt.py');
pass('probe uses the exact production NativePayout interface');

const prodEmits = (production.match(/\.emit_transfer\s*\(/g) || []).length;
if (prodEmits !== 2) fail(`production payout path must contain exactly two emit_transfer calls; found ${prodEmits}`);
pass('production payout path contains exactly two native transfer emissions');

if (!/guest_payout\s*=\s*\(\s*total_deposit\s*-\s*host_payout/s.test(production)) {
  fail('production guest payout must be the exact remainder after host payout');
}
pass('production payout conserves the full deposit via exact remainder');

if (!/def _emit_split\([\s\S]*?NativePayout\([\s\S]*?host_addr[\s\S]*?emit_transfer\([\s\S]*?host_amount[\s\S]*?NativePayout\([\s\S]*?guest_addr[\s\S]*?emit_transfer\([\s\S]*?guest_amount/s.test(probe)) {
  fail('probe does not visibly emit both native transfers through the production primitive');
}
pass('probe success path emits both native transfers');

if (!/def payout_both_then_revert[\s\S]*?self\._emit_split\(host, guest\)[\s\S]*?raise gl\.vm\.UserError\(/s.test(probe)) {
  fail('probe rollback path must raise UserError only after both transfer messages are emitted');
}
pass('probe rollback path fails only after both transfer messages are emitted');

for (const required of [
  'ExecutionResult.FINISHED_WITH_RETURN',
  'ExecutionResult.FINISHED_WITH_ERROR',
  'StudioNet/SDK did not publish txExecutionResult*',
  'No execution outcome is inferred from that absence',
  'requireEmittedMessageCount(successReceipt, 2',
  'requireEmittedMessageCount(\n    revertReceipt,\n    2',
  "successTriggered.length === 2",
  "rollbackTriggered.length === 0",
  'hostAfterRollback === hostBeforeRollback',
  'guestAfterRollback === guestBeforeRollback',
  'probeAfterRollback === probeBeforeRollback',
  'transaction was not submitted (wallet/signing/RPC failure); this is NOT a contract revert',
  'receipt/RPC wait failed; this is NOT proof of a contract revert',
  'getTriggeredTransactionIds RPC/read failure; this is NOT proof of a contract revert',
  'atomic_rollback_proof',
  'parent reached both payout emissions',
]) {
  if (!payoutTest.includes(required)) fail(`runtime payout test is missing required proof condition: ${required}`);
}

for (const forbidden of [
  'gen_getTransactionReceipt',
  'debugTraceTransaction',
  'gen_dbg_traceTransaction',
  'leader_receipt',
  'leaderReceipt',
  'execution_result',
  'executionResult',
]) {
  if (payoutTest.includes(forbidden)) fail(`runtime payout test contains an unavailable/undocumented execution fallback: ${forbidden}`);
}
pass('runtime proof uses finalized parent messages, triggered child IDs, exact balances, and optional documented execution enum only when published');
pass('runtime test distinguishes pre-chain wallet/signing/RPC failures from the finalized rollback parent');
pass('runtime test proves both committed transfers and atomic discard of both emitted transfers');

const derive = extractFunction(flowTest, 'deriveDisputeId', 'getBalance');
if (!derive.includes('trace?.return_data') || !derive.includes('trace.return_data')) {
  fail('create_dispute ID decoder does not use documented GenVM trace.return_data');
}
for (const forbidden of ['receipt?.result', 'receipt?.output', 'receipt?.returnValue', 'transaction?.result']) {
  if (derive.includes(forbidden)) fail(`create_dispute ID decoder contains undocumented fallback: ${forbidden}`);
}
pass('create_dispute ID decoding is restricted to documented GenVM trace.return_data');

console.log('\n✅ STEWARD NATIVE PAYOUT STATIC CHECK PASSED');
