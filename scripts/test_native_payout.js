import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus, ExecutionResult } from 'genlayer-js/types';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const probeCode = fs.readFileSync(
  path.join(__dirname, '../tests/contracts/NativePayoutProbe.py'),
  'utf8',
);

const RPC_URL = 'https://studio.genlayer.com/api';
const PROBE_VALUE = 2_000_000_000_000_000n; // 0.002 GEN
const HALF = PROBE_VALUE / 2n;

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
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

const strangerClient = createClient({
  chain: studionet,
  account: strangerAccount,
});

const readClient = createClient({
  chain: studionet,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    throw new Error(
      `RPC transport failure for ${method}: ${err?.message ?? err}`,
    );
  }

  assert(response.ok, `RPC ${method} HTTP ${response.status}`);

  const json = await response.json();

  if (json.error) {
    throw new Error(
      `RPC ${method} returned error: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
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

function requireExecution(receipt, expected, label) {
  const observed = receipt?.txExecutionResultName;

  assert(
    observed === expected,
    `${label}: expected txExecutionResultName=${expected}, observed=${String(observed)}`,
  );
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

async function requireTraceCode(hash, expectedCode, label) {
  let trace;

  try {
    trace = await readClient.debugTraceTransaction({
      hash,
      round: 0,
    });
  } catch (err) {
    throw new Error(
      `${label}: debugTraceTransaction RPC failure: ${err?.message ?? err}`,
    );
  }

  assert(
    trace?.result_code === expectedCode,
    `${label}: expected documented GenVM result_code=${expectedCode}, observed=${String(trace?.result_code)}`,
  );

  return trace;
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

  const receipt = await waitFinalized(strangerClient, hash, 'probe deploy');
  requireExecution(
    receipt,
    ExecutionResult.FINISHED_WITH_RETURN,
    'probe deploy',
  );
  await requireTraceCode(hash, 0, 'probe deploy');

  const address = receipt?.contractAddress;

  assert(address, 'probe deploy: finalized receipt has no contractAddress');

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

  const receipt = await waitFinalized(strangerClient, hash, label);
  requireExecution(receipt, ExecutionResult.FINISHED_WITH_RETURN, label);
  await requireTraceCode(hash, 0, label);

  const balance = await getBalance(address);
  assert(
    balance === PROBE_VALUE,
    `${label}: probe balance expected ${PROBE_VALUE}, observed ${balance}`,
  );
}

async function run() {
  console.log('🧪 NomadCourt native payout + atomic rollback proof');
  console.log('Host:    ', hostAccount.address);
  console.log('Guest:   ', guestAccount.address);
  console.log('Sender:  ', strangerAccount.address);

  const probeAddress = await deployProbe();
  console.log('✅ PASS: test-only NativePayoutProbe deployed:', probeAddress);

  // ------------------------------------------------------------------
  // TEST A: both external native transfers actually arrive.
  // ------------------------------------------------------------------
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

  const successReceipt = await waitFinalized(
    strangerClient,
    successHash,
    'payout_both',
  );

  requireExecution(
    successReceipt,
    ExecutionResult.FINISHED_WITH_RETURN,
    'payout_both',
  );
  await requireTraceCode(successHash, 0, 'payout_both');

  await waitForExactRecipientGains(
    hostBeforeSuccess,
    guestBeforeSuccess,
    HALF,
    PROBE_VALUE - HALF,
  );

  assert(
    (await getBalance(probeAddress)) === 0n,
    'payout_both: probe balance was not fully transferred',
  );

  console.log('✅ PASS: first native transfer reached Host exactly');
  console.log('✅ PASS: second native transfer reached Guest exactly');
  console.log('✅ PASS: successful parent committed both transfers');

  // ------------------------------------------------------------------
  // TEST B: emit both transfers, then raise UserError.  Contract revert
  // must be proven by execution result + GenVM trace, not by a send/RPC
  // exception, and neither recipient may receive value.
  // ------------------------------------------------------------------
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

  const revertReceipt = await waitFinalized(
    strangerClient,
    revertHash,
    'payout_both_then_revert',
  );

  requireExecution(
    revertReceipt,
    ExecutionResult.FINISHED_WITH_ERROR,
    'payout_both_then_revert',
  );

  const revertTrace = await requireTraceCode(
    revertHash,
    1,
    'payout_both_then_revert',
  );

  assert(
    typeof revertTrace?.return_data === 'string',
    'payout_both_then_revert: documented trace.return_data field is missing',
  );

  let triggered;
  try {
    triggered = await readClient.getTriggeredTransactionIds({ hash: revertHash });
  } catch (err) {
    throw new Error(
      `payout_both_then_revert: getTriggeredTransactionIds RPC failure: ${err?.message ?? err}`,
    );
  }

  assert(
    Array.isArray(triggered) && triggered.length === 0,
    `payout_both_then_revert: reverted parent unexpectedly created ${Array.isArray(triggered) ? triggered.length : 'non-array'} triggered transaction(s)`,
  );

  // Give finalization side effects time to surface before declaring that
  // balances did not move.
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
    probeAfterRollback === probeBeforeRollback &&
      probeAfterRollback === PROBE_VALUE,
    `atomic rollback failed: probe balance changed from ${probeBeforeRollback} to ${probeAfterRollback}`,
  );

  console.log('✅ PASS: contract revert proven by FINISHED_WITH_ERROR');
  console.log('✅ PASS: GenVM trace.result_code == 1 (UserError)');
  console.log('✅ PASS: reverted parent created zero triggered transactions');
  console.log('✅ PASS: both recipient balances remained unchanged');
  console.log('✅ PASS: probe retained the full funded value after rollback');

  // Cleanup so the test does not intentionally strand the rollback funds.
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

  const cleanupReceipt = await waitFinalized(
    strangerClient,
    cleanupHash,
    'rollback cleanup payout',
  );

  requireExecution(
    cleanupReceipt,
    ExecutionResult.FINISHED_WITH_RETURN,
    'rollback cleanup payout',
  );
  await requireTraceCode(cleanupHash, 0, 'rollback cleanup payout');

  await waitForExactRecipientGains(
    cleanupHostBefore,
    cleanupGuestBefore,
    HALF,
    PROBE_VALUE - HALF,
  );

  assert(
    (await getBalance(probeAddress)) === 0n,
    'cleanup payout did not empty the probe balance',
  );

  console.log('✅ PASS: rollback funds recovered by a later successful payout');
  console.log('\n✅ NATIVE PAYOUT + ATOMIC ROLLBACK TEST PASSED');
}

run().catch((err) => {
  console.error('❌ NATIVE PAYOUT TEST FAILED:', err?.message ?? err);
  process.exit(1);
});
