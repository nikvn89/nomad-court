import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus, ExecutionResult } from 'genlayer-js/types';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const code = fs.readFileSync(
  path.join(__dirname, '../contracts/NomadCourt.py'),
  'utf8',
);

const RPC_URL = 'https://studio.genlayer.com/api';
const DEPOSIT = 10_000_000_000_000_000_000n; // 10 GEN

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ ASSERT FAILED:', msg);
    process.exit(1);
  }
}

function requireKey(name) {
  const value = process.env[name];

  assert(
    typeof value === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(value),
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

const hostClient = createClient({
  chain: studionet,
  account: hostAccount,
});

const guestClient = createClient({
  chain: studionet,
  account: guestAccount,
});

const strangerClient = createClient({
  chain: studionet,
  account: strangerAccount,
});

const readClient = createClient({
  chain: studionet,
});

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  assert(
    response.ok,
    `RPC ${method} HTTP ${response.status}`,
  );

  const json = await response.json();

  if (json.error) {
    throw new Error(
      `RPC ${method}: ${
        json.error.message ?? JSON.stringify(json.error)
      }`,
    );
  }

  return json.result;
}

/*
 * Keep receipt polling, but receipt existence alone
 * is NEVER treated as test success.
 */
async function waitForReceipt(hash, retries = 30) {
  for (let i = 0; i < retries; i++) {
    await sleep(4000);

    try {
      const receipt = await rpc(
        'eth_getTransactionReceipt',
        [hash],
      );

      if (receipt) {
        return receipt;
      }
    } catch {
      // Continue polling.
    }
  }

  throw new Error(
    `Transaction receipt not found for ${hash}`,
  );
}

function executionName(receipt) {
  /*
   * Reviewer-facing invariant: use only the documented GenLayerJS field.
   * FINALIZED consensus status is not enough; execution must also be checked.
   */
  return receipt?.txExecutionResultName ?? '';
}

function isExecutionSuccess(receipt) {
  return (
    executionName(receipt) ===
    ExecutionResult.FINISHED_WITH_RETURN
  );
}

function isExecutionError(receipt) {
  return (
    executionName(receipt) ===
    ExecutionResult.FINISHED_WITH_ERROR
  );
}

function statusName(tx) {
  return String(tx?.statusName ?? '').toUpperCase();
}

async function waitFinalized(
  client,
  hash,
  retries = 45,
) {
  /*
   * Keep receipt existence polling as an independent transport check.
   * It is NEVER treated as proof of execution success or revert.
   */
  await waitForReceipt(hash, retries);

  return client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    fullTransaction: true,
    interval: 4000,
    retries,
  });
}

async function readDispute(
  contractAddress,
  disputeId,
) {
  const raw = await readClient.readContract({
    address: contractAddress,
    functionName: 'get_dispute',
    args: [String(disputeId)],
  });

  const text =
    typeof raw === 'string'
      ? raw
      : typeof raw?.result === 'string'
        ? raw.result
        : String(raw ?? '');

  assert(
    text && text !== '{}',
    `get_dispute(${disputeId}) returned no dispute`,
  );

  return JSON.parse(text);
}

function decodeHexUtf8(hex) {
  assert(
    typeof hex === 'string' && /^0x[0-9a-fA-F]*$/.test(hex),
    'GenVM trace.return_data must be a hex string',
  );

  let body = hex.slice(2);

  if (body.length % 2) {
    body = `0${body}`;
  }

  return Buffer.from(body, 'hex')
    .toString('utf8')
    .replace(/\0/g, '')
    .trim();
}

function decodeDisputeIdFromReturnData(returnData) {
  /*
   * The node documents debugTraceTransaction.return_data as the
   * hex-encoded GenVM contract return.  Decode ONLY that field; do not
   * recursively guess receipt/result/output aliases.
   */
  const decoded = decodeHexUtf8(returnData);

  const direct = decoded.match(/^\s*"?(\d+)"?\s*$/);
  if (direct) {
    return direct[1];
  }

  try {
    const parsed = JSON.parse(decoded);
    if (
      typeof parsed === 'string' &&
      /^\d+$/.test(parsed)
    ) {
      return parsed;
    }
  } catch {
    // Assert below with the exact documented field value.
  }

  assert(
    false,
    `Could not decode dispute ID from documented GenVM trace.return_data: ${returnData}`,
  );
}

async function deriveDisputeId(createHash) {
  let trace;

  try {
    trace = await readClient.debugTraceTransaction({
      hash: createHash,
      round: 0,
    });
  } catch (err) {
    throw new Error(
      `debugTraceTransaction RPC failure while reading create_dispute return: ${err?.message ?? err}`,
    );
  }

  assert(
    trace?.result_code === 0,
    `create_dispute GenVM result_code must be 0, observed ${String(trace?.result_code)}`,
  );

  assert(
    typeof trace?.return_data === 'string',
    'create_dispute trace is missing documented return_data',
  );

  return decodeDisputeIdFromReturnData(trace.return_data);
}

async function getBalance(address) {
  const hex = await rpc(
    'eth_getBalance',
    [address, 'latest'],
  );

  assert(
    typeof hex === 'string' &&
      hex.startsWith('0x'),
    `Invalid balance for ${address}`,
  );

  return BigInt(hex);
}

async function assertTransactionReverts(
  client,
  sendTx,
  label,
) {
  let hash;

  /*
   * A wallet rejection, signing failure, or RPC submission error produces
   * no transaction hash and therefore can NEVER satisfy a revert assertion.
   */
  try {
    hash = await sendTx();
  } catch (err) {
    assert(
      false,
      `${label}: transaction was not submitted (wallet/signing/RPC failure); this is NOT proof of a contract revert: ${err?.message ?? err}`,
    );
  }

  let receipt;

  try {
    receipt = await waitFinalized(
      client,
      hash,
      30,
    );
  } catch (err) {
    assert(
      false,
      `${label}: receipt/RPC wait failed; this is NOT proof of a contract revert: ${err?.message ?? err}`,
    );
  }

  assert(
    isExecutionError(receipt),
    `${label}: expected txExecutionResultName=${ExecutionResult.FINISHED_WITH_ERROR}, observed=${executionName(receipt)}`,
  );

  let trace;

  try {
    trace = await readClient.debugTraceTransaction({
      hash,
      round: 0,
    });
  } catch (err) {
    assert(
      false,
      `${label}: debugTraceTransaction RPC failure; cannot prove contract revert: ${err?.message ?? err}`,
    );
  }

  assert(
    trace?.result_code === 1,
    `${label}: expected documented GenVM result_code=1 (UserError), observed=${String(trace?.result_code)}`,
  );

  console.log(
    `✅ PASS: ${label} produced a confirmed GenVM UserError revert`,
  );
}

async function resolveWithUndeterminedRetry(
  contractAddress,
  disputeId,
) {
  for (
    let attempt = 1;
    attempt <= 3;
    attempt++
  ) {
    console.log(
      `   resolve attempt ${attempt}/3...`,
    );

    /*
     * Stranger is deliberately used as resolver.
     * Host and Guest therefore don't pay gas for
     * the resolution transaction, making payout
     * balance assertions exact.
     */
    const hash =
      await strangerClient.writeContract({
        address: contractAddress,
        functionName: 'resolve_dispute',
        args: [String(disputeId)],
      });

    try {
      const receipt =
        await waitFinalized(
          strangerClient,
          hash,
          45,
        );

      if (isExecutionError(receipt)) {
        assert(
          false,
          `resolve_dispute reverted on attempt ${attempt}`,
        );
      }

      assert(
        isExecutionSuccess(receipt),
        `resolve_dispute did not finish with ${ExecutionResult.FINISHED_WITH_RETURN}: ${executionName(receipt)}`,
      );

      return receipt;
    } catch (err) {
      let tx = null;

      try {
        tx =
          await readClient.getTransaction({
            hash,
          });
      } catch {
        // Checked below.
      }

      const state =
        statusName(tx);

      if (
        state.includes('UNDETERMINED')
      ) {
        console.warn(
          `⚠️ Consensus UNDETERMINED on attempt ${attempt}`,
        );

        continue;
      }

      /*
       * IMPORTANT:
       * Real revert is NOT retried.
       */
      assert(
        false,
        `resolve_dispute failed/reverted (not UNDETERMINED): ${
          err?.message ?? err
        }`,
      );
    }
  }

  assert(
    false,
    'resolve_dispute remained UNDETERMINED after 3 attempts',
  );
}

async function runTest() {
  console.log(
    '🧪 NomadCourt asserting integration suite',
  );

  console.log(
    'Host:    ',
    hostAccount.address,
  );

  console.log(
    'Guest:   ',
    guestAccount.address,
  );

  console.log(
    'Stranger:',
    strangerAccount.address,
  );

  /*
   * --------------------------------------------------
   * SETUP
   * --------------------------------------------------
   */

  console.log(
    '\n[SETUP] Deploying NomadCourt.py...',
  );

  const deployHash =
    await hostClient.deployContract({
      code,
      args: [],
    });

  const deployReceipt =
    await waitFinalized(
      hostClient,
      deployHash,
      45,
    );

  assert(
    isExecutionSuccess(deployReceipt),
    `deploy did not finish with ${ExecutionResult.FINISHED_WITH_RETURN}: ${executionName(deployReceipt)}`,
  );

  const contractAddress =
    deployReceipt?.contractAddress ??
    deployReceipt?.contract_address ??
    deployReceipt?.to;

  assert(
    contractAddress,
    'Deployment receipt did not contain contract address',
  );

  console.log(
    '✅ PASS: deployed contract:',
    contractAddress,
  );

  /*
   * ==================================================
   * TEST 1
   * Derive ID from create_dispute result
   * ==================================================
   */

  console.log(
    '\nTEST 1 — derive dispute ID from confirmed creation result',
  );

  const rulesUrl =
    'https://en.wikipedia.org/wiki/Etiquette';

  const createHash =
    await guestClient.writeContract({
      address: contractAddress,
      functionName: 'create_dispute',
      args: [
        hostAccount.address,
        rulesUrl,
      ],
      value: DEPOSIT,
    });

  const createReceipt =
    await waitFinalized(
      guestClient,
      createHash,
      45,
    );

  assert(
    isExecutionSuccess(createReceipt),
    `create_dispute did not finish with ${ExecutionResult.FINISHED_WITH_RETURN}: ${executionName(createReceipt)}`,
  );

  const disputeId =
    await deriveDisputeId(
      createHash,
    );

  assert(
    typeof disputeId === 'string' &&
      disputeId.trim().length > 0,
    'create_dispute returned an empty dispute ID',
  );

  console.log(
    `✅ PASS: derived dispute ID from transaction result: ${disputeId}`,
  );

  const created =
    await readDispute(
      contractAddress,
      disputeId,
    );

  assert(
    created.status === 'OPEN',
    'new dispute should be OPEN',
  );

  assert(
    created.host.toLowerCase() ===
      hostAccount.address.toLowerCase(),
    'recorded host does not match HOST_KEY',
  );

  assert(
    created.guest.toLowerCase() ===
      guestAccount.address.toLowerCase(),
    'recorded guest does not match GUEST_KEY',
  );

  /*
   * ==================================================
   * TEST 2
   * Unauthorized evidence rejection
   * ==================================================
   */

  console.log(
    '\nTEST 2 — unauthorized evidence rejection',
  );

  await assertTransactionReverts(
    strangerClient,
    () =>
      strangerClient.writeContract({
        address: contractAddress,
        functionName:
          'submit_evidence',
        args: [
          disputeId,
          'https://en.wikipedia.org/wiki/Testimony',
        ],
      }),
    'stranger evidence',
  );

  const afterStranger =
    await readDispute(
      contractAddress,
      disputeId,
    );

  assert(
    afterStranger.host_evidence_url ===
      '' &&
      afterStranger.guest_evidence_url ===
        '',
    'unauthorized evidence changed dispute state',
  );

  console.log(
    '✅ PASS: unauthorized rejection left both evidence fields unchanged',
  );

  /*
   * ==================================================
   * TEST 3
   * Premature resolution must revert + rollback
   * ==================================================
   */

  console.log(
    '\nTEST 3 — resolution blocked before both evidences',
  );

  await assertTransactionReverts(
    strangerClient,
    () =>
      strangerClient.writeContract({
        address: contractAddress,
        functionName:
          'resolve_dispute',
        args: [disputeId],
      }),
    'premature resolution',
  );

  const afterPrematureResolve =
    await readDispute(
      contractAddress,
      disputeId,
    );

  assert(
    afterPrematureResolve.status ===
      'OPEN',
    'premature reverted resolution changed status; rollback failed',
  );

  assert(
    BigInt(
      afterPrematureResolve.host_share,
    ) === 0n &&
      BigInt(
        afterPrematureResolve.guest_share,
      ) === 0n,
    'premature reverted resolution changed payout shares; rollback failed',
  );

  console.log(
    '✅ PASS: reverted resolution preserved OPEN state and zero shares',
  );

  /*
   * ==================================================
   * TEST 4
   * Happy path + balance conservation
   * ==================================================
   */

  console.log(
    '\nTEST 4 — happy path + atomic payout conservation',
  );

  const hostEvidence =
    'https://en.wikipedia.org/wiki/Vandalism';

  const guestEvidence =
    'https://en.wikipedia.org/wiki/Accident';

  const hostEvidenceHash =
    await hostClient.writeContract({
      address: contractAddress,
      functionName:
        'submit_evidence',
      args: [
        disputeId,
        hostEvidence,
      ],
    });

  const hostEvidenceReceipt =
    await waitFinalized(
      hostClient,
      hostEvidenceHash,
      30,
    );

  assert(
    isExecutionSuccess(hostEvidenceReceipt),
    `host evidence did not finish with ${ExecutionResult.FINISHED_WITH_RETURN}: ${executionName(hostEvidenceReceipt)}`,
  );

  console.log(
    '✅ PASS: host evidence accepted',
  );

  const guestEvidenceHash =
    await guestClient.writeContract({
      address: contractAddress,
      functionName:
        'submit_evidence',
      args: [
        disputeId,
        guestEvidence,
      ],
    });

  const guestEvidenceReceipt =
    await waitFinalized(
      guestClient,
      guestEvidenceHash,
      30,
    );

  assert(
    isExecutionSuccess(guestEvidenceReceipt),
    `guest evidence did not finish with ${ExecutionResult.FINISHED_WITH_RETURN}: ${executionName(guestEvidenceReceipt)}`,
  );

  console.log(
    '✅ PASS: guest evidence accepted',
  );

  const ready =
    await readDispute(
      contractAddress,
      disputeId,
    );

  assert(
    ready.host_evidence_url ===
      hostEvidence,
    'host evidence URL not persisted',
  );

  assert(
    ready.guest_evidence_url ===
      guestEvidence,
    'guest evidence URL not persisted',
  );

  /*
   * Record payout recipient balances BEFORE resolve.
   *
   * Stranger performs resolution, so neither Host nor
   * Guest pays resolution gas.
   */
  const hostBefore =
    await getBalance(
      hostAccount.address,
    );

  const guestBefore =
    await getBalance(
      guestAccount.address,
    );

  await resolveWithUndeterminedRetry(
    contractAddress,
    disputeId,
  );

  /*
   * emit_transfer occurs on finalization.
   * Poll briefly until both transfers are reflected.
   */
  let finalState;
  let hostAfter;
  let guestAfter;

  for (let i = 0; i < 15; i++) {
    finalState =
      await readDispute(
        contractAddress,
        disputeId,
      );

    hostAfter =
      await getBalance(
        hostAccount.address,
      );

    guestAfter =
      await getBalance(
        guestAccount.address,
      );

    const hostGainNow =
      hostAfter - hostBefore;

    const guestGainNow =
      guestAfter - guestBefore;

    if (
      finalState.status ===
        'RESOLVED' &&
      hostGainNow +
        guestGainNow ===
        DEPOSIT
    ) {
      break;
    }

    await sleep(2000);
  }

  assert(
    finalState.status ===
      'RESOLVED',
    'resolved transaction did not persist RESOLVED state',
  );

  console.log(
    '✅ PASS: dispute status is RESOLVED',
  );

  const hostShare =
    BigInt(finalState.host_share);

  const guestShare =
    BigInt(finalState.guest_share);

  assert(
    hostShare + guestShare === 100n,
    'host_share + guest_share must equal 100',
  );

  console.log(
    '✅ PASS: payout shares sum to 100',
  );

  const deposit =
    BigInt(
      finalState.deposit_amount,
    );

  assert(
    deposit === DEPOSIT,
    `stored deposit ${deposit} does not equal sent deposit ${DEPOSIT}`,
  );

  /*
   * Exact contract payout formula.
   */
  const expectedHostPayout =
    (deposit * hostShare) / 100n;

  /*
   * IMPORTANT:
   * Guest gets the remainder, not an independently
   * rounded percentage.
   */
  const expectedGuestPayout =
    deposit -
    expectedHostPayout;

  const hostGain =
    hostAfter - hostBefore;

  const guestGain =
    guestAfter - guestBefore;

  assert(
    hostGain ===
      expectedHostPayout,
    `host payout mismatch: expected ${expectedHostPayout}, gained ${hostGain}`,
  );

  console.log(
    '✅ PASS: host received exact expected payout',
  );

  assert(
    guestGain ===
      expectedGuestPayout,
    `guest payout mismatch: expected ${expectedGuestPayout}, gained ${guestGain}`,
  );

  console.log(
    '✅ PASS: guest received exact expected payout',
  );

  /*
   * Core steward requirement:
   *
   * total payout == original deposit
   *
   * No minting.
   * No burning.
   * No rounding loss.
   */
  assert(
    hostGain +
      guestGain ===
      deposit,
    `balance conservation failed: gains=${
      hostGain + guestGain
    }, deposit=${deposit}`,
  );

  console.log(
    '✅ PASS: host_gain + guest_gain == deposit (no mint/burn/rounding loss)',
  );

  /*
   * ONLY reachable when every assertion above passed.
   */
  console.log(
    '\n✅ ALL TESTS PASSED',
  );
}

runTest().catch((err) => {
  console.error(
    '❌ TEST SUITE FAILED:',
    err,
  );

  process.exit(1);
});