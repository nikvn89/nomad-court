// NomadCourt steward runtime diagnostic v5
//
// Purpose: collect the ACTUAL StudioNet / genlayer-js runtime shapes needed to
// finish the steward proof without guessing undocumented fields.
//
// This is diagnostic-only. It does NOT create STEWARD_NATIVE_PAYOUT_RUNTIME.json
// and does NOT claim steward PASS. It writes STEWARD_RUNTIME_DIAGNOSTIC.json.
//
// Safety:
// - private keys are read only from environment variables and never printed;
// - wallet/signing/RPC failures are reported as such, never as contract reverts;
// - arbitrary transaction/calldata blobs are not dumped;
// - only documented SDK surfaces are called for transaction/simulation data.

import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const OUTPUT = path.join(rootDir, 'STEWARD_RUNTIME_DIAGNOSTIC.json');
const PROBE_VALUE = 2_000_000_000_000_000n; // 0.002 GEN
const HALF = PROBE_VALUE / 2n;
const RPC_URL = 'https://studio.genlayer.com/api';

fs.rmSync(OUTPUT, { force: true });

function sha256File(relPath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(rootDir, relPath)))
    .digest('hex');
}

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

const probeCode = fs.readFileSync(
  path.join(rootDir, 'tests/contracts/NativePayoutProbe.py'),
  'utf8',
);

const report = {
  schema: 'nomadcourt-steward-runtime-diagnostic-v5',
  status: 'RUNNING',
  diagnostic_only: true,
  generated_at_utc: new Date().toISOString(),
  network: {
    name: studionet.name,
    id: String(studionet.id),
    isStudio: Boolean(studionet.isStudio),
    rpc: RPC_URL,
  },
  source_sha256: {
    production_contract: sha256File('contracts/NomadCourt.py'),
    payout_probe: sha256File('tests/contracts/NativePayoutProbe.py'),
    diagnostic_script: sha256File('scripts/diagnose_steward_runtime.js'),
  },
  accounts: {
    host: hostAccount.address,
    guest: guestAccount.address,
    sender: strangerAccount.address,
  },
  transactions: {},
  simulations: {},
  observations: {},
  errors: [],
};

function persist() {
  fs.writeFileSync(
    OUTPUT,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

function errorText(err) {
  return err?.message ?? String(err);
}

function scalarType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === 'bigint') return 'bigint';
  return typeof value;
}

function shapeTree(value, depth = 0, maxDepth = 3) {
  if (value === null || value === undefined) return scalarType(value);
  if (Array.isArray(value)) {
    if (depth >= maxDepth) return `array[${value.length}]`;
    return {
      type: `array[${value.length}]`,
      sample: value.length > 0 ? shapeTree(value[0], depth + 1, maxDepth) : null,
    };
  }
  if (typeof value !== 'object') return scalarType(value);

  const keys = Object.keys(value).sort();
  if (depth >= maxDepth) return { type: 'object', keys };

  const children = {};
  for (const key of keys.slice(0, 80)) {
    // Shape only. Do not dump arbitrary payload values such as calldata/code.
    children[key] = shapeTree(value[key], depth + 1, maxDepth);
  }
  return { type: 'object', keys, children };
}

function jsonScalar(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

function documentedTransactionSnapshot(value) {
  if (!value || typeof value !== 'object') {
    return { available: false, type: scalarType(value) };
  }

  const decoded =
    value.txDataDecoded && typeof value.txDataDecoded === 'object'
      ? value.txDataDecoded
      : null;

  return {
    available: true,
    top_level_keys: Object.keys(value).sort(),
    shape: shapeTree(value),
    documented_fields: {
      hash: jsonScalar(value.hash),
      txId: jsonScalar(value.txId),
      statusName: jsonScalar(value.statusName),
      txExecutionResultName: jsonScalar(value.txExecutionResultName),
      txExecutionResult: jsonScalar(value.txExecutionResult),
      lifecycle: jsonScalar(value.lifecycle),
      queuePosition: jsonScalar(value.queuePosition),
      recipient: jsonScalar(value.recipient),
      txDataDecoded_type: scalarType(value.txDataDecoded),
      txDataDecoded_keys: decoded ? Object.keys(decoded).sort() : [],
      txDataDecoded_contractAddress: decoded
        ? jsonScalar(decoded.contractAddress)
        : null,
      messages_type: scalarType(value.messages),
      messages_count: Array.isArray(value.messages) ? value.messages.length : null,
    },
  };
}

const RECEIPT_FIELD_NAMES = new Set([
  'result_code',
  'return_data',
  'stderr',
  'genvm_log',
]);

function findDocumentedGenVmReceiptFields(value, pathPrefix = '$', depth = 0, out = []) {
  if (depth > 6 || value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 5); i += 1) {
      findDocumentedGenVmReceiptFields(value[i], `${pathPrefix}[${i}]`, depth + 1, out);
    }
    return out;
  }

  if (typeof value !== 'object') return out;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${pathPrefix}.${key}`;
    if (RECEIPT_FIELD_NAMES.has(key)) {
      out.push({
        path: childPath,
        field: key,
        type: scalarType(child),
        value:
          key === 'result_code' &&
          (typeof child === 'number' || typeof child === 'bigint' || typeof child === 'string')
            ? String(child)
            : null,
      });
    }
    findDocumentedGenVmReceiptFields(child, childPath, depth + 1, out);
  }
  return out;
}

function simulationSnapshot(value) {
  if (!value || typeof value !== 'object') {
    return {
      available: value !== undefined,
      type: scalarType(value),
      shape: shapeTree(value),
      documented_genvm_receipt_fields_found: [],
    };
  }
  return {
    available: true,
    top_level_keys: Object.keys(value).sort(),
    shape: shapeTree(value),
    feeAccounting_type: scalarType(value.feeAccounting),
    documented_genvm_receipt_fields_found: findDocumentedGenVmReceiptFields(value),
  };
}

function printTxSummary(label, snapshot) {
  console.log(`\n--- ${label} ---`);
  if (!snapshot?.available) {
    console.log('unavailable:', snapshot?.error ?? snapshot?.type ?? 'unknown');
    return;
  }
  const f = snapshot.documented_fields ?? {};
  console.log('keys:', (snapshot.top_level_keys ?? []).join(', '));
  console.log('statusName:', String(f.statusName));
  console.log('txExecutionResultName:', String(f.txExecutionResultName));
  console.log('txExecutionResult:', String(f.txExecutionResult));
  console.log('recipient:', String(f.recipient));
  console.log('txDataDecoded.contractAddress:', String(f.txDataDecoded_contractAddress));
}

async function rpc(method, params) {
  let response;
  try {
    response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });
  } catch (err) {
    throw new Error(`RPC transport failure for ${method}: ${errorText(err)}`);
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
  assert(typeof hex === 'string' && /^0x[0-9a-fA-F]+$/.test(hex), `Invalid balance for ${address}`);
  return BigInt(hex);
}

async function submitOrFail(sendTx, label) {
  try {
    const hash = await sendTx();
    console.log(`${label} tx: ${hash}`);
    return hash;
  } catch (err) {
    throw new Error(
      `${label}: transaction was not submitted (wallet/signing/RPC failure); this is NOT proof of a contract revert: ${errorText(err)}`,
    );
  }
}

async function captureTransactionViews(hash, label) {
  const entry = { hash, views: {} };
  report.transactions[label] = entry;
  persist();

  try {
    const simple = await readClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: false,
      interval: 4000,
      retries: 60,
    });
    entry.views.wait_finalized_fullTransaction_false = documentedTransactionSnapshot(simple);
    printTxSummary(`${label}: waitForTransactionReceipt(fullTransaction:false)`, entry.views.wait_finalized_fullTransaction_false);
  } catch (err) {
    entry.views.wait_finalized_fullTransaction_false = {
      available: false,
      error_classification: 'receipt/RPC wait failure; NOT a contract revert',
      error: errorText(err),
    };
  }
  persist();

  try {
    const full = await readClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: true,
      interval: 4000,
      retries: 20,
    });
    entry.views.wait_finalized_fullTransaction_true = documentedTransactionSnapshot(full);
    printTxSummary(`${label}: waitForTransactionReceipt(fullTransaction:true)`, entry.views.wait_finalized_fullTransaction_true);
  } catch (err) {
    entry.views.wait_finalized_fullTransaction_true = {
      available: false,
      error_classification: 'receipt/RPC wait failure; NOT a contract revert',
      error: errorText(err),
    };
  }
  persist();

  try {
    const tx = await readClient.getTransaction({ hash });
    entry.views.getTransaction = documentedTransactionSnapshot(tx);
    printTxSummary(`${label}: getTransaction`, entry.views.getTransaction);
  } catch (err) {
    entry.views.getTransaction = {
      available: false,
      error_classification: 'getTransaction RPC/read failure; NOT a contract revert',
      error: errorText(err),
    };
  }

  persist();
  return entry;
}

function candidateDeploymentAddress(txEntry) {
  const ordered = [
    txEntry?.views?.wait_finalized_fullTransaction_false,
    txEntry?.views?.wait_finalized_fullTransaction_true,
    txEntry?.views?.getTransaction,
  ];

  for (const view of ordered) {
    const f = view?.documented_fields;
    if (!f) continue;
    const candidate = f.txDataDecoded_contractAddress ?? f.recipient;
    if (typeof candidate === 'string' && /^0x[0-9a-fA-F]{40}$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function captureSimulation(label, args) {
  try {
    const simulation = await strangerClient.simulateWriteContract({
      ...args,
      includeReceipt: true,
    });
    const snap = simulationSnapshot(simulation);
    report.simulations[label] = { status: 'RETURNED', ...snap };
    console.log(`\n--- simulation ${label} ---`);
    console.log('top-level keys:', (snap.top_level_keys ?? []).join(', '));
    console.log(
      'documented GenVM receipt fields found:',
      snap.documented_genvm_receipt_fields_found.length,
    );
    for (const found of snap.documented_genvm_receipt_fields_found) {
      console.log(`  ${found.path}: ${found.field} type=${found.type} value=${String(found.value)}`);
    }
  } catch (err) {
    report.simulations[label] = {
      status: 'THREW',
      note: 'Simulation exception is recorded as simulation/RPC execution feedback only; it is not used as proof that a submitted on-chain transaction reverted.',
      error: errorText(err),
    };
    console.log(`\n--- simulation ${label} THREW ---`);
    console.log(errorText(err));
  }
  persist();
}

async function pollExactGains(hostBefore, guestBefore, hostGain, guestGain, retries = 25) {
  for (let i = 0; i < retries; i += 1) {
    const hostNow = await getBalance(hostAccount.address);
    const guestNow = await getBalance(guestAccount.address);
    if (hostNow - hostBefore === hostGain && guestNow - guestBefore === guestGain) {
      return { hostNow, guestNow };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return {
    hostNow: await getBalance(hostAccount.address),
    guestNow: await getBalance(guestAccount.address),
  };
}

async function cleanupIfFunded(probeAddress) {
  if (!probeAddress) return;
  let balance;
  try {
    balance = await getBalance(probeAddress);
  } catch (err) {
    report.observations.cleanup = { status: 'BALANCE_READ_FAILED', error: errorText(err) };
    persist();
    return;
  }

  if (balance === 0n) {
    report.observations.cleanup = { status: 'NOT_NEEDED', probe_balance_wei: '0' };
    persist();
    return;
  }

  try {
    const hostBefore = await getBalance(hostAccount.address);
    const guestBefore = await getBalance(guestAccount.address);
    const hostExpected = balance / 2n;
    const guestExpected = balance - hostExpected;

    const hash = await submitOrFail(
      () =>
        strangerClient.writeContract({
          address: probeAddress,
          functionName: 'payout_both',
          args: [hostAccount.address, guestAccount.address],
        }),
      'diagnostic cleanup payout',
    );

    const txEntry = await captureTransactionViews(hash, 'cleanup_payout');
    const after = await pollExactGains(
      hostBefore,
      guestBefore,
      hostExpected,
      guestExpected,
      25,
    );
    const probeAfter = await getBalance(probeAddress);

    report.observations.cleanup = {
      status: 'ATTEMPTED',
      hash,
      host_gain_wei: (after.hostNow - hostBefore).toString(),
      guest_gain_wei: (after.guestNow - guestBefore).toString(),
      expected_host_gain_wei: hostExpected.toString(),
      expected_guest_gain_wei: guestExpected.toString(),
      probe_after_wei: probeAfter.toString(),
      exact_cleanup_observed:
        after.hostNow - hostBefore === hostExpected &&
        after.guestNow - guestBefore === guestExpected &&
        probeAfter === 0n,
      transaction_view_key: Object.keys(report.transactions).find((k) => report.transactions[k] === txEntry) ?? 'cleanup_payout',
    };
  } catch (err) {
    report.observations.cleanup = {
      status: 'FAILED',
      error: errorText(err),
      note: 'Cleanup failure is not reclassified as a contract revert.',
    };
  }
  persist();
}

let probeAddress = null;

async function run() {
  console.log('🔎 NomadCourt steward runtime diagnostic v5');
  console.log('DIAGNOSTIC ONLY — this run does not claim steward PASS.');
  console.log('Host:   ', hostAccount.address);
  console.log('Guest:  ', guestAccount.address);
  console.log('Sender: ', strangerAccount.address);
  console.log('chain.isStudio:', Boolean(studionet.isStudio));

  // A. Deploy the exact test-only payout probe and compare the documented SDK views.
  const deployHash = await submitOrFail(
    () => strangerClient.deployContract({ code: probeCode, args: [] }),
    'probe deploy',
  );
  const deployEntry = await captureTransactionViews(deployHash, 'probe_deploy');
  probeAddress = candidateDeploymentAddress(deployEntry);
  assert(
    probeAddress,
    'probe deploy finalized but no deployment address was discoverable from txDataDecoded.contractAddress or recipient',
  );
  report.probe_address = probeAddress;
  console.log('\nProbe address:', probeAddress);
  persist();

  // B. Fund the probe. Balance state is used only to establish the later simulation/runtime precondition.
  const fundHash = await submitOrFail(
    () =>
      strangerClient.writeContract({
        address: probeAddress,
        functionName: 'fund',
        args: [],
        value: PROBE_VALUE,
      }),
    'probe funding #1',
  );
  await captureTransactionViews(fundHash, 'fund_1');
  const fundedBalance1 = await getBalance(probeAddress);
  report.observations.fund_1 = {
    expected_probe_balance_wei: PROBE_VALUE.toString(),
    observed_probe_balance_wei: fundedBalance1.toString(),
    exact: fundedBalance1 === PROBE_VALUE,
  };
  assert(fundedBalance1 === PROBE_VALUE, `fund #1 did not establish probe balance ${PROBE_VALUE}; observed ${fundedBalance1}`);
  persist();

  // C. Successful actual payout: collect transaction shapes and exact recipient deltas.
  const hostBeforeSuccess = await getBalance(hostAccount.address);
  const guestBeforeSuccess = await getBalance(guestAccount.address);
  const successHash = await submitOrFail(
    () =>
      strangerClient.writeContract({
        address: probeAddress,
        functionName: 'payout_both',
        args: [hostAccount.address, guestAccount.address],
      }),
    'payout_both success',
  );
  await captureTransactionViews(successHash, 'success_payout');
  const successAfter = await pollExactGains(
    hostBeforeSuccess,
    guestBeforeSuccess,
    HALF,
    PROBE_VALUE - HALF,
  );
  const probeAfterSuccess = await getBalance(probeAddress);
  report.observations.success_payout = {
    host_gain_wei: (successAfter.hostNow - hostBeforeSuccess).toString(),
    guest_gain_wei: (successAfter.guestNow - guestBeforeSuccess).toString(),
    expected_host_gain_wei: HALF.toString(),
    expected_guest_gain_wei: (PROBE_VALUE - HALF).toString(),
    probe_after_wei: probeAfterSuccess.toString(),
    exact_two_transfer_effect_observed:
      successAfter.hostNow - hostBeforeSuccess === HALF &&
      successAfter.guestNow - guestBeforeSuccess === PROBE_VALUE - HALF &&
      probeAfterSuccess === 0n,
  };
  persist();

  // D. Re-fund so both success and deliberate rollback simulations see the same
  // persistent starting state. Simulation itself must not mutate that state.
  const fund2Hash = await submitOrFail(
    () =>
      strangerClient.writeContract({
        address: probeAddress,
        functionName: 'fund',
        args: [],
        value: PROBE_VALUE,
      }),
    'probe funding #2',
  );
  await captureTransactionViews(fund2Hash, 'fund_2');
  const fundedBalance2 = await getBalance(probeAddress);
  assert(fundedBalance2 === PROBE_VALUE, `fund #2 did not establish probe balance ${PROBE_VALUE}; observed ${fundedBalance2}`);
  report.observations.fund_2 = {
    expected_probe_balance_wei: PROBE_VALUE.toString(),
    observed_probe_balance_wei: fundedBalance2.toString(),
    exact: fundedBalance2 === PROBE_VALUE,
  };
  persist();

  // E. Documented simulateWriteContract(includeReceipt:true) capability probe.
  // These are diagnostic observations only; no simulation result is accepted as
  // proof of the submitted on-chain rollback transaction.
  await captureSimulation('payout_both_success', {
    address: probeAddress,
    functionName: 'payout_both',
    args: [hostAccount.address, guestAccount.address],
  });

  await captureSimulation('payout_both_then_revert', {
    address: probeAddress,
    functionName: 'payout_both_then_revert',
    args: [hostAccount.address, guestAccount.address],
  });

  const probeAfterSimulations = await getBalance(probeAddress);
  report.observations.simulation_non_mutation = {
    probe_before_wei: fundedBalance2.toString(),
    probe_after_wei: probeAfterSimulations.toString(),
    unchanged: probeAfterSimulations === fundedBalance2,
  };
  persist();

  // F. Submit the actual rollback transaction and collect every documented SDK
  // transaction view plus balances and triggered child IDs.
  const hostBeforeRollback = await getBalance(hostAccount.address);
  const guestBeforeRollback = await getBalance(guestAccount.address);
  const probeBeforeRollback = await getBalance(probeAddress);

  const rollbackHash = await submitOrFail(
    () =>
      strangerClient.writeContract({
        address: probeAddress,
        functionName: 'payout_both_then_revert',
        args: [hostAccount.address, guestAccount.address],
      }),
    'payout_both_then_revert actual',
  );
  await captureTransactionViews(rollbackHash, 'rollback_parent');

  let triggered = null;
  try {
    triggered = await readClient.getTriggeredTransactionIds({ hash: rollbackHash });
    report.observations.rollback_triggered_transactions = {
      status: 'RETURNED',
      count: Array.isArray(triggered) ? triggered.length : null,
      ids: Array.isArray(triggered) ? triggered : null,
    };
  } catch (err) {
    report.observations.rollback_triggered_transactions = {
      status: 'RPC_READ_FAILED',
      error: errorText(err),
      note: 'RPC/read failure is NOT a contract revert.',
    };
  }
  persist();

  await new Promise((resolve) => setTimeout(resolve, 6000));
  const hostAfterRollback = await getBalance(hostAccount.address);
  const guestAfterRollback = await getBalance(guestAccount.address);
  const probeAfterRollback = await getBalance(probeAddress);

  report.observations.rollback_balances = {
    host_before_wei: hostBeforeRollback.toString(),
    host_after_wei: hostAfterRollback.toString(),
    host_delta_wei: (hostAfterRollback - hostBeforeRollback).toString(),
    guest_before_wei: guestBeforeRollback.toString(),
    guest_after_wei: guestAfterRollback.toString(),
    guest_delta_wei: (guestAfterRollback - guestBeforeRollback).toString(),
    probe_before_wei: probeBeforeRollback.toString(),
    probe_after_wei: probeAfterRollback.toString(),
    probe_delta_wei: (probeAfterRollback - probeBeforeRollback).toString(),
    all_unchanged:
      hostAfterRollback === hostBeforeRollback &&
      guestAfterRollback === guestBeforeRollback &&
      probeAfterRollback === probeBeforeRollback,
    note:
      'Balance result is an observation only in v5. Final steward proof must still bind the submitted transaction to a documented execution outcome rather than infer a revert from unchanged balances alone.',
  };
  persist();

  // G. Cleanup retained probe funds so the diagnostic does not intentionally strand them.
  await cleanupIfFunded(probeAddress);

  report.status = 'COMPLETE';
  report.completed_at_utc = new Date().toISOString();
  report.next_step =
    'Upload this diagnostic artifact. Use the observed documented SDK/simulation shapes to make one minimal final proof patch; do not infer missing execution outcome fields.';
  persist();

  console.log('\n✅ STEWARD RUNTIME DIAGNOSTIC COMPLETE');
  console.log('Artifact:', OUTPUT);
  console.log('This is diagnostic evidence only — NOT a steward PASS artifact.');
}

run().catch(async (err) => {
  const message = errorText(err);
  report.status = 'INCOMPLETE';
  report.errors.push({
    at_utc: new Date().toISOString(),
    message,
    note: 'Failure is not reclassified as a contract revert unless a documented execution outcome explicitly establishes that fact.',
  });

  try {
    await cleanupIfFunded(probeAddress);
  } catch (cleanupErr) {
    report.errors.push({
      at_utc: new Date().toISOString(),
      message: `cleanup exception: ${errorText(cleanupErr)}`,
    });
  }

  report.completed_at_utc = new Date().toISOString();
  persist();
  console.error('\n❌ DIAGNOSTIC INCOMPLETE:', message);
  console.error('Partial artifact was still written:', OUTPUT);
  process.exit(1);
});
