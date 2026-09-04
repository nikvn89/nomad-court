import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus, ExecutionResult } from 'genlayer-js/types';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const runtimeReportPath = path.join(rootDir, 'STEWARD_NATIVE_PAYOUT_RUNTIME.json');

// Never leave a stale PASS artifact behind after a later failed rerun.
fs.rmSync(runtimeReportPath, { force: true });

function sha256File(relPath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(rootDir, relPath)))
    .digest('hex');
}

const runtimeReport = {
  schema: 'nomadcourt-native-payout-runtime-v6',
  status: 'RUNNING',
  network: 'GenLayer StudioNet',
  generated_at_utc: new Date().toISOString(),
  source_sha256: {
    production_contract: sha256File('contracts/NomadCourt.py'),
    payout_probe: sha256File('tests/contracts/NativePayoutProbe.py'),
    runtime_test: sha256File('scripts/test_native_payout.js'),
  },
  transactions: {},
  assertions: {},
  scope_note:
    'StudioNet/genlayer-js@1.1.8 does not publish txExecutionResult* on the observed Studio path. Atomic rollback is proven by a controlled runtime pair: the rollback parent reaches both native-message emissions, finalizes, creates zero triggered child transactions, moves zero recipient value, and retains the full probe balance. The static gate proves the only rollback probe path raises UserError after those two emissions. The report does not infer an exception enum from missing fields.',
};

const probeCode = fs.readFileSync(
  path.join(__dirname, '../tests/contracts/NativePayoutProbe.py'),
  'utf8',
);

const RPC_URL = 'https://studio.genlayer.com/api';
const PROBE_VALUE = 2_000_000_000_000_000n; // 0.002 GEN
const HALF = PROBE_VALUE / 2n;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function requireKey(name) {
  const value = process.env[name];
  assert(
    typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value),
    `${name} must be set to a 0x-prefixed 32-byte private key`,
  );
  return value;
}

const hostAccount = createAccount(requireKey('HOST_KEY'));
const guestAccount = createAccount(requireKey('GUEST_KEY'));
const strangerAccount = createAccount(requireKey('STRANGER_KEY'));

assert(
  new Set([
    hostAccount.address.toLowerCase(),
    guestAccount.address.toLowerCase(),
    strangerAccount.address.toLowerCase(),
  ]).size === 3,
  'HOST_KEY, GUEST_KEY and STRANGER_KEY must represent three different accounts',
);

const strangerClient = createClient({ chain: studionet, account: strangerAccount });
const readClient = createClient({ chain: studionet });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpc(method, params) {
  let response;
  try {
    response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
  } catch (err) {
    throw new Error(`RPC transport failure for ${method}: ${err?.message ?? err}`);
  }

  assert(response.ok, `RPC ${method} HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) {
    throw new Error(`RPC ${method} returned error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  return json.result;
}

async function getBalance(address) {
  const hex = await rpc('eth_getBalance', [address, 'latest']);
  assert(
    typeof hex === 'string' && hex.startsWith('0x'),
    `Invalid balance response for ${address}`,
  );
  return BigInt(hex);
}

function expectedExecutionCode(expected) {
  if (expected === ExecutionResult.FINISHED_WITH_RETURN) return 1;
  if (expected === ExecutionResult.FINISHED_WITH_ERROR) return 2;
  throw new Error(`Unsupported expected execution result: ${String(expected)}`);
}

function documentedExecutionRecord(transaction, source) {
  if (!transaction || typeof transaction !== 'object') return null;
  const hasName = typeof transaction.txExecutionResultName === 'string';
  const hasCode = transaction.txExecutionResult !== undefined && transaction.txExecutionResult !== null;
  if (!hasName && !hasCode) return null;
  return {
    source,
    transaction,
    name: hasName ? transaction.txExecutionResultName : undefined,
    code: hasCode ? transaction.txExecutionResult : undefined,
  };
}

async function getExecutionRecord(receipt, hash) {
  const finalizedRecord = documentedExecutionRecord(
    receipt,
    'genlayer-js:waitForTransactionReceipt',
  );
  if (finalizedRecord) return finalizedRecord;

  let transaction = null;
  let readError = null;
  try {
    transaction = await readClient.getTransaction({ hash });
  } catch (err) {
    readError = err;
  }

  const persistedRecord = documentedExecutionRecord(
    transaction,
    'genlayer-js:getTransaction',
  );
  if (persistedRecord) return persistedRecord;

  return {
    source: readError
      ? 'documented-execution-enum-unavailable:getTransaction-rpc-failure'
      : 'documented-execution-enum-unavailable-on-studionet',
    transaction,
    name: undefined,
    code: undefined,
    readError: readError?.message ?? (readError ? String(readError) : null),
  };
}

// Optional corroboration only. On the observed StudioNet decoder path these fields
// are absent. Their absence is NEVER interpreted as success or revert.
async function requireExecutionIfPublished(receipt, hash, expected, label) {
  const record = await getExecutionRecord(receipt, hash);
  const expectedCode = expectedExecutionCode(expected);
  const observedCode =
    record.code === undefined || record.code === null ? undefined : Number(record.code);
  const enumAvailable = typeof record.name === 'string' || observedCode !== undefined;

  if (enumAvailable) {
    assert(
      record.name === expected || observedCode === expectedCode,
      `${label}: published execution enum disagrees with expected ${expected}; observed name=${String(record.name)}, code=${String(record.code)}`,
    );
  }

  runtimeReport.transactions[`${label.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_execution`] = {
    source: record.source,
    expectedTxExecutionResultName: expected,
    txExecutionResultName: record.name ?? null,
    txExecutionResult:
      record.code === undefined || record.code === null ? null : String(record.code),
    optionalGetTransactionRpcError: record.readError ?? null,
    note: enumAvailable
      ? 'Published GenLayerJS execution enum matched the expected result.'
      : 'StudioNet/SDK did not publish txExecutionResult*. No execution outcome is inferred from that absence.',
  };
  return record;
}

async function waitFinalized(client, hash, label) {
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: true,
      interval: 4000,
      retries: 45,
    });
  } catch (err) {
    throw new Error(
      `${label}: receipt/RPC wait failed; this is NOT proof of a contract revert: ${err?.message ?? err}`,
    );
  }

  assert(
    receipt?.statusName === 'FINALIZED',
    `${label}: expected a finalized on-chain transaction, observed statusName=${String(receipt?.statusName)}`,
  );
  return receipt;
}

async function submitOrFail(sendTx, label) {
  try {
    return await sendTx();
  } catch (err) {
    throw new Error(
      `${label}: transaction was not submitted (wallet/signing/RPC failure); this is NOT a contract revert: ${err?.message ?? err}`,
    );
  }
}

function requireEmittedMessageCount(receipt, expectedCount, label) {
  assert(
    Array.isArray(receipt?.messages),
    `${label}: full finalized transaction did not expose messages as an array`,
  );
  assert(
    receipt.messages.length === expectedCount,
    `${label}: expected ${expectedCount} emitted message(s), observed ${receipt.messages.length}`,
  );
  runtimeReport.transactions[`${label.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_messages`] = {
    emitted_message_count: receipt.messages.length,
    note: 'Only the documented/observed top-level message count is asserted; member internals are not decoded.',
  };
  return receipt.messages.length;
}

async function getTriggeredIdsOrFail(hash, label) {
  try {
    const ids = await readClient.getTriggeredTransactionIds({ hash });
    assert(Array.isArray(ids), `${label}: getTriggeredTransactionIds returned a non-array`);
    return ids;
  } catch (err) {
    throw new Error(
      `${label}: getTriggeredTransactionIds RPC/read failure; this is NOT proof of a contract revert: ${err?.message ?? err}`,
    );
  }
}

async function waitForExactRecipientGains(
  hostBefore,
  guestBefore,
  expectedHostGain,
  expectedGuestGain,
  retries = 20,
) {
  for (let i = 0; i < retries; i++) {
    const hostNow = await getBalance(hostAccount.address);
    const guestNow = await getBalance(guestAccount.address);
    if (
      hostNow - hostBefore === expectedHostGain &&
      guestNow - guestBefore === expectedGuestGain
    ) {
      return { hostNow, guestNow };
    }
    await sleep(2000);
  }

  const hostNow = await getBalance(hostAccount.address);
  const guestNow = await getBalance(guestAccount.address);
  throw new Error(
    `recipient payout mismatch after polling: hostGain=${hostNow - hostBefore}, guestGain=${guestNow - guestBefore}`,
  );
}

async function deployProbe() {
  const hash = await submitOrFail(
    () => strangerClient.deployContract({ code: probeCode, args: [] }),
    'probe deploy',
  );
  runtimeReport.transactions.probe_deploy = hash;

  const receipt = await waitFinalized(strangerClient, hash, 'probe deploy');
  const deployExecution = await requireExecutionIfPublished(
    receipt,
    hash,
    ExecutionResult.FINISHED_WITH_RETURN,
    'probe deploy',
  );

  const address =
    receipt?.txDataDecoded?.contractAddress ??
    receipt?.contractAddress ??
    receipt?.recipient ??
    deployExecution?.transaction?.txDataDecoded?.contractAddress ??
    deployExecution?.transaction?.contractAddress ??
    deployExecution?.transaction?.recipient;

  assert(address, 'probe deploy: finalized transaction has no deployment address');
  runtimeReport.probe_address = address;
  return address;
}

async function fundProbe(address, label) {
  const hash = await submitOrFail(
    () =>
      strangerClient.writeContract({
        address,
        functionName: 'fund',
        args: [],
        value: PROBE_VALUE,
      }),
    label,
  );

  runtimeReport.transactions[label === 'success probe funding' ? 'success_funding' : 'rollback_funding'] = hash;
  const receipt = await waitFinalized(strangerClient, hash, label);
  await requireExecutionIfPublished(
    receipt,
    hash,
    ExecutionResult.FINISHED_WITH_RETURN,
    label,
  );

  const balance = await getBalance(address);
  assert(balance === PROBE_VALUE, `${label}: probe balance expected ${PROBE_VALUE}, observed ${balance}`);
}

async function run() {
  console.log('🧪 NomadCourt native payout + atomic rollback proof v6');
  console.log('Host:    ', hostAccount.address);
  console.log('Guest:   ', guestAccount.address);
  console.log('Sender:  ', strangerAccount.address);

  const probeAddress = await deployProbe();
  console.log('✅ PASS: test-only NativePayoutProbe deployed:', probeAddress);

  // TEST A — both native transfers commit.
  await fundProbe(probeAddress, 'success probe funding');
  const hostBeforeSuccess = await getBalance(hostAccount.address);
  const guestBeforeSuccess = await getBalance(guestAccount.address);

  const successHash = await submitOrFail(
    () =>
      strangerClient.writeContract({
        address: probeAddress,
        functionName: 'payout_both',
        args: [hostAccount.address, guestAccount.address],
      }),
    'payout_both',
  );
  runtimeReport.transactions.success_payout = successHash;

  const successReceipt = await waitFinalized(strangerClient, successHash, 'payout_both');
  await requireExecutionIfPublished(
    successReceipt,
    successHash,
    ExecutionResult.FINISHED_WITH_RETURN,
    'payout_both',
  );
  const successMessageCount = requireEmittedMessageCount(successReceipt, 2, 'payout_both');
  const successTriggered = await getTriggeredIdsOrFail(successHash, 'payout_both');
  assert(
    successTriggered.length === 2,
    `payout_both: expected 2 triggered native-transfer transactions, observed ${successTriggered.length}`,
  );

  await waitForExactRecipientGains(
    hostBeforeSuccess,
    guestBeforeSuccess,
    HALF,
    PROBE_VALUE - HALF,
  );

  const hostAfterSuccess = await getBalance(hostAccount.address);
  const guestAfterSuccess = await getBalance(guestAccount.address);
  const probeAfterSuccess = await getBalance(probeAddress);

  assert(probeAfterSuccess === 0n, 'payout_both: probe balance was not fully transferred');

  runtimeReport.success_case = {
    emitted_message_count: successMessageCount,
    triggered_transaction_count: successTriggered.length,
    triggered_transaction_ids: successTriggered,
    host_before_wei: hostBeforeSuccess.toString(),
    guest_before_wei: guestBeforeSuccess.toString(),
    host_after_wei: hostAfterSuccess.toString(),
    guest_after_wei: guestAfterSuccess.toString(),
    host_gain_wei: (hostAfterSuccess - hostBeforeSuccess).toString(),
    guest_gain_wei: (guestAfterSuccess - guestBeforeSuccess).toString(),
    probe_after_wei: probeAfterSuccess.toString(),
  };

  console.log('✅ PASS: payout parent emitted exactly two native-transfer messages');
  console.log('✅ PASS: successful parent created exactly two triggered transactions');
  console.log('✅ PASS: first native transfer reached Host exactly');
  console.log('✅ PASS: second native transfer reached Guest exactly');
  console.log('✅ PASS: probe balance drained to zero');

  // TEST B — same two messages are emitted, then the only probe path raises.
  // Runtime must show that those emissions are discarded atomically.
  await fundProbe(probeAddress, 'rollback probe funding');
  const hostBeforeRollback = await getBalance(hostAccount.address);
  const guestBeforeRollback = await getBalance(guestAccount.address);
  const probeBeforeRollback = await getBalance(probeAddress);

  const revertHash = await submitOrFail(
    () =>
      strangerClient.writeContract({
        address: probeAddress,
        functionName: 'payout_both_then_revert',
        args: [hostAccount.address, guestAccount.address],
      }),
    'payout_both_then_revert',
  );
  runtimeReport.transactions.rollback_parent = revertHash;

  const revertReceipt = await waitFinalized(
    strangerClient,
    revertHash,
    'payout_both_then_revert',
  );
  const rollbackExecution = await requireExecutionIfPublished(
    revertReceipt,
    revertHash,
    ExecutionResult.FINISHED_WITH_ERROR,
    'payout_both_then_revert',
  );

  // Critical v5 observation: StudioNet retains the two parent emissions in the
  // finalized transaction view even though the child transfers are rolled back.
  const rollbackMessageCount = requireEmittedMessageCount(
    revertReceipt,
    2,
    'payout_both_then_revert',
  );

  const rollbackTriggered = await getTriggeredIdsOrFail(
    revertHash,
    'payout_both_then_revert',
  );
  assert(
    rollbackTriggered.length === 0,
    `payout_both_then_revert: expected zero committed triggered transactions, observed ${rollbackTriggered.length}`,
  );

  await sleep(6000);
  const hostAfterRollback = await getBalance(hostAccount.address);
  const guestAfterRollback = await getBalance(guestAccount.address);
  const probeAfterRollback = await getBalance(probeAddress);

  assert(
    hostAfterRollback === hostBeforeRollback,
    `atomic rollback failed: Host gained ${hostAfterRollback - hostBeforeRollback}`,
  );
  assert(
    guestAfterRollback === guestBeforeRollback,
    `atomic rollback failed: Guest gained ${guestAfterRollback - guestBeforeRollback}`,
  );
  assert(
    probeAfterRollback === probeBeforeRollback && probeAfterRollback === PROBE_VALUE,
    `atomic rollback failed: probe balance changed from ${probeBeforeRollback} to ${probeAfterRollback}`,
  );

  runtimeReport.atomic_rollback_proof = {
    parent_transaction_finalized: true,
    parent_emitted_message_count: rollbackMessageCount,
    committed_triggered_transaction_count: rollbackTriggered.length,
    host_delta_wei: (hostAfterRollback - hostBeforeRollback).toString(),
    guest_delta_wei: (guestAfterRollback - guestBeforeRollback).toString(),
    probe_delta_wei: (probeAfterRollback - probeBeforeRollback).toString(),
    probe_balance_retained_wei: probeAfterRollback.toString(),
    structural_precondition:
      'static steward check asserts payout_both_then_revert calls _emit_split(host, guest), which emits both NativePayout transfers, and then immediately raises gl.vm.UserError on its only path',
    proof_statement:
      'The finalized parent reached both payout emissions (messages.length == 2), but committed zero triggered children and moved zero recipient value while retaining the full funded probe balance. Together with the source-locked single rollback path, this demonstrates atomic discard of both emitted native transfers.',
  };

  runtimeReport.rollback_case = {
    expected_optional_execution_enum: ExecutionResult.FINISHED_WITH_ERROR,
    observed_optional_execution_enum: rollbackExecution?.name ?? null,
    execution_enum_source: rollbackExecution?.source ?? null,
    emitted_message_count: rollbackMessageCount,
    triggered_transaction_count: rollbackTriggered.length,
    host_before_wei: hostBeforeRollback.toString(),
    host_after_wei: hostAfterRollback.toString(),
    guest_before_wei: guestBeforeRollback.toString(),
    guest_after_wei: guestAfterRollback.toString(),
    probe_before_wei: probeBeforeRollback.toString(),
    probe_after_wei: probeAfterRollback.toString(),
  };

  console.log('✅ PASS: rollback parent finalized after emitting both native-transfer messages');
  console.log('✅ PASS: rollback parent committed zero triggered transactions');
  console.log('✅ PASS: Host and Guest balances remained unchanged');
  console.log('✅ PASS: probe retained the full funded balance');
  if (rollbackExecution?.name === ExecutionResult.FINISHED_WITH_ERROR) {
    console.log('✅ PASS: optional GenLayerJS execution enum also reports FINISHED_WITH_ERROR');
  } else {
    console.log('ℹ️  StudioNet/SDK omitted txExecutionResult*; no exception class was inferred from the missing enum');
  }

  // Cleanup retained rollback funds with the already-proven success path.
  const cleanupHostBefore = await getBalance(hostAccount.address);
  const cleanupGuestBefore = await getBalance(guestAccount.address);
  const cleanupHash = await submitOrFail(
    () =>
      strangerClient.writeContract({
        address: probeAddress,
        functionName: 'payout_both',
        args: [hostAccount.address, guestAccount.address],
      }),
    'rollback cleanup payout',
  );
  runtimeReport.transactions.rollback_cleanup = cleanupHash;

  const cleanupReceipt = await waitFinalized(
    strangerClient,
    cleanupHash,
    'rollback cleanup payout',
  );
  await requireExecutionIfPublished(
    cleanupReceipt,
    cleanupHash,
    ExecutionResult.FINISHED_WITH_RETURN,
    'rollback cleanup payout',
  );
  requireEmittedMessageCount(cleanupReceipt, 2, 'rollback cleanup payout');
  const cleanupTriggered = await getTriggeredIdsOrFail(cleanupHash, 'rollback cleanup payout');
  assert(cleanupTriggered.length === 2, `cleanup payout expected 2 triggered transactions, observed ${cleanupTriggered.length}`);

  await waitForExactRecipientGains(
    cleanupHostBefore,
    cleanupGuestBefore,
    HALF,
    PROBE_VALUE - HALF,
  );
  assert((await getBalance(probeAddress)) === 0n, 'cleanup payout did not empty the probe balance');
  console.log('✅ PASS: rollback funds recovered by a later successful payout');

  runtimeReport.status = 'PASS';
  runtimeReport.completed_at_utc = new Date().toISOString();
  runtimeReport.assertions = {
    production_primitive_runtime_verified: true,
    both_native_transfers_committed: true,
    success_parent_emitted_two_messages: true,
    success_parent_created_two_triggered_transactions: true,
    rollback_parent_finalized: true,
    rollback_parent_reached_both_emissions: true,
    rollback_triggered_transaction_count_zero: true,
    rollback_recipient_balances_unchanged: true,
    rollback_probe_balance_retained: true,
    atomic_rollback_proven_by_controlled_pair: true,
    wallet_or_rpc_failure_not_accepted_as_contract_revert: true,
    tx_execution_enum_treated_as_optional_corroboration_only: true,
    no_undocumented_execution_receipt_fallback_used: true,
  };

  fs.writeFileSync(runtimeReportPath, `${JSON.stringify(runtimeReport, null, 2)}\n`, 'utf8');
  console.log('✅ PASS: wrote reviewer-safe runtime evidence:', runtimeReportPath);
  console.log('\n✅ NATIVE PAYOUT + ATOMIC ROLLBACK TEST PASSED');
}

run().catch((err) => {
  console.error('❌ NATIVE PAYOUT TEST FAILED:', err?.message ?? err);
  process.exit(1);
});
