# NomadCourt Testing Guide

## Steward-focused native payout runtime test — v6

Run:

```cmd
npm run test:steward
```

The command first runs `npm run test:payout:static`, which locks the test probe to the exact production `NativePayout` interface, confirms two production `emit_transfer()` calls and exact remainder conservation, proves the rollback probe raises only after `_emit_split()`, and verifies that `create_dispute()` return decoding uses only documented GenVM `trace.return_data`.

The live test in `scripts/test_native_payout.js` then executes a controlled pair on the same test-only probe.

### Successful payout parent

Required assertions:

- finalized parent transaction;
- `messages.length == 2`;
- `getTriggeredTransactionIds(parent).length == 2`;
- exact Host balance gain;
- exact Guest balance gain;
- probe balance becomes zero.

### Deliberate rollback parent

The source-locked function emits both native-transfer messages and then raises `gl.vm.UserError`. Runtime must show:

- finalized parent transaction;
- `messages.length == 2` — execution reached both emissions;
- `getTriggeredTransactionIds(parent).length == 0` — neither child committed;
- Host balance unchanged;
- Guest balance unchanged;
- probe retains the full funded amount.

This controlled pair is the atomic-rollback proof. The hosted StudioNet path observed in v5 does not publish `txExecutionResult*` and does not expose the debug-trace RPC, so v6 does not guess raw receipt internals or infer a revert from missing fields. If the documented execution enum appears on another compatible path, it is checked only as optional corroboration.

Wallet rejection, signing failure, HTTP/RPC failure, receipt failure, or triggered-transaction read failure is always a test FAIL and is never classified as a contract revert.

At startup, the runtime harness deletes any stale `STEWARD_NATIVE_PAYOUT_RUNTIME.json`. A successful run writes a fresh reviewer-safe artifact with no private keys.

Do not claim a fresh runtime PASS until the console ends with:

```text
✅ STEWARD NATIVE PAYOUT STATIC CHECK PASSED
✅ NATIVE PAYOUT + ATOMIC ROLLBACK TEST PASSED
```

and the generated `STEWARD_NATIVE_PAYOUT_RUNTIME.json` is retained.

See `STEWARD_RUNTIME_VERIFICATION.md` for the shortest reviewer procedure.

---

This guide provides a reproducible way to verify the main security and settlement properties of NomadCourt on GenLayer StudioNet.

NomadCourt includes:

- automated assertion testing via `scripts/test_flow.js`
- live MetaMask testing through the Vercel frontend
- real native GEN settlement verification

---

## 1. Requirements

Install project dependencies:

```bash
npm install
```

You need three independent StudioNet test accounts:

```text
HOST
GUEST
STRANGER
```

Use dedicated test wallets only.

Do not use wallets containing real assets.

Do not commit private keys to GitHub.

---

## 2. Configure Test Accounts

The test suite reads private keys only from environment variables.

### Windows CMD

```cmd
set HOST_KEY=0xYOUR_HOST_PRIVATE_KEY
set GUEST_KEY=0xYOUR_GUEST_PRIVATE_KEY
set STRANGER_KEY=0xYOUR_STRANGER_PRIVATE_KEY
```

The three accounts must be different.

Each account should have enough StudioNet GEN to submit transactions.

---

## 3. Run the Automated Test Suite

Run:

```cmd
npm test
```

The test suite automatically:

```text
Deploys a fresh NomadCourt contract
        ↓
Creates a funded dispute
        ↓
Derives the returned dispute ID
        ↓
Tests unauthorized evidence
        ↓
Tests premature resolution rollback
        ↓
Submits Host + Guest evidence
        ↓
Runs AI resolution
        ↓
Checks real recipient balances
```

The script exits non-zero immediately if an assertion fails.

A successful run ends with:

```text
✅ ALL TESTS PASSED
```

---

# Automated Assertions

## TEST 1 — Exact Dispute ID

The Guest creates a real dispute with a native GEN deposit.

The test derives the dispute ID from the confirmed `create_dispute` transaction result.

It does not hardcode:

```text
dispute_id = 1
```

and does not probe sequential IDs.

Expected output:

```text
✅ PASS: derived dispute ID from transaction result
✅ PASS: returned dispute ID maps to correct Host + Guest
```

This verifies that the test is operating on the exact dispute it created.

---

## TEST 2 — Unauthorized Evidence Rejection

The third `STRANGER` account attempts to call:

```text
submit_evidence(dispute_id, evidence_url)
```

The Stranger is neither the recorded Host nor Guest.

The test then reads the dispute state and verifies that neither evidence field changed.

Expected output:

```text
✅ PASS: stranger evidence was rejected / rolled back
✅ PASS: unauthorized evidence left Host + Guest evidence unchanged
```

This verifies that evidence submission is restricted to the recorded parties.

---

## TEST 3 — Premature Resolution Rollback

Before both parties submit evidence, the test calls:

```text
resolve_dispute(dispute_id)
```

The resolution must not succeed.

Afterward, the test verifies:

```text
status == OPEN
host_share == 0
guest_share == 0
```

Expected output:

```text
✅ PASS: premature resolution rejected / rolled back
✅ PASS: rollback preserved OPEN status and zero payout shares
```

This demonstrates that a failed resolution does not leave partial settlement state.

---

## TEST 4 — Full Resolution and Balance Conservation

The recorded Host submits evidence.

The recorded Guest submits evidence.

The test verifies that both evidence URLs persist onchain.

Then it records the Host and Guest balances before resolution.

A third account triggers:

```text
resolve_dispute(dispute_id)
```

Using a third account as the resolver keeps Host and Guest balance changes clean for payout verification.

After resolution, the test verifies:

```text
status == RESOLVED
```

and:

```text
host_share + guest_share == 100
```

The expected payouts are calculated exactly as the contract does:

```text
host_payout =
    deposit * host_share / 100

guest_payout =
    deposit - host_payout
```

The test then compares the real StudioNet balances before and after settlement.

Expected output:

```text
✅ PASS: Host evidence transaction succeeded and persisted
✅ PASS: Guest evidence transaction succeeded and persisted
✅ PASS: both authorized evidence URLs are present
✅ PASS: resolve_dispute produced RESOLVED state
✅ PASS: dispute status == RESOLVED
✅ PASS: host_share + guest_share == 100
✅ PASS: stored deposit equals original deposit
✅ PASS: Host received exact expected payout
✅ PASS: Guest received exact expected payout
✅ PASS: host_gain + guest_gain == deposit
✅ PASS: no minting, burning, or rounding loss
```

Final result:

```text
✅ ALL TESTS PASSED
```

---

# 4. StudioNet Rate Limits

StudioNet may occasionally return:

```text
HTTP 429
```

or:

```text
Failed to fetch
```

The test suite includes bounded retry/backoff for balance and RPC reads.

If StudioNet remains rate-limited, wait briefly and rerun:

```cmd
npm test
```

Do not interpret an RPC transport failure as a passing assertion.

---

# 5. Live Frontend Test

Live dApp:

```text
https://nomad-court-iota.vercel.app/
```

Main deployed contract:

```text
0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7
```

Explorer:

```text
https://explorer-studio.genlayer.com/address/0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7
```

The frontend uses MetaMask.

No Host or Guest private key is entered into the website.

---

## Frontend Step 1 — Assign Guest

Open MetaMask and select the account that will act as Guest.

In NomadCourt:

```text
Guest
→ Connect / Assign Current MetaMask as GUEST
```

Confirm that the Guest address appears in the UI.

---

## Frontend Step 2 — Assign Host

Switch MetaMask to a different account.

In NomadCourt:

```text
Host
→ Connect / Assign Current MetaMask as HOST
```

The Host and Guest addresses must be different.

---

## Frontend Step 3 — Create Dispute

Switch MetaMask back to Guest.

Select a demo scenario or provide your own House Rules.

Click:

```text
Start Case (Lock 10 GEN Deposit)
```

Sign once in MetaMask.

Wait for finalization.

The UI must display:

```text
✅ New dispute finalized. Returned Case ID: X
```

The Case ID must come from the confirmed creation transaction.

It must not be guessed or discovered by scanning IDs.

Expected state:

```text
Status: OPEN

Host evidence:  ⏳
Guest evidence: ⏳

Host Payout:  0%
Guest Payout: 0%
```

---

## Frontend Step 4 — Guest Evidence

Remain on the Guest account.

Submit Guest evidence.

Sign once in MetaMask.

Wait for:

```text
✅ GUEST evidence finalized
```

Expected state:

```text
Guest evidence: ✅
Host evidence:  ⏳
```

---

## Frontend Step 5 — Host Evidence

Switch MetaMask to the recorded Host.

Select the Host role and assign the current wallet.

Submit Host evidence.

Sign once in MetaMask.

Wait for:

```text
✅ HOST evidence finalized
```

Expected state:

```text
Host evidence:  ✅
Guest evidence: ✅
Status: OPEN
```

---

## Frontend Step 6 — Resolve

With both evidences present, click:

```text
Trigger AI Resolution
```

Sign once in MetaMask.

GenLayer validator consensus may take 30–60 seconds or longer.

Do not submit another resolution transaction while the first one is pending.

Expected final state:

```text
Status: RESOLVED

Host Payout:  XX%
Guest Payout: YY%
```

with:

```text
XX + YY = 100
```

---

# 6. Verified Live Case — Host Wins

A full Vercel end-to-end test was completed with:

```text
House Rules:
1. No parties allowed. Penalty: 100% of deposit.
2. Quiet hours after 10 PM.
```

Both parties submitted evidence.

Final result:

```text
Status: RESOLVED

Host evidence:  ✅
Guest evidence: ✅

Deposit: 10 GEN

Host Payout:  100%
Guest Payout:   0%
```

Resolution transaction:

```text
0xd61025f007a753a7328d33b012eb9055f8ac6f497978ae43fe9a5eb0dce506b2
```

---

# 7. Verified Live Case — Guest Wins

A second Vercel end-to-end test used rules where the deposit was refundable if:

```text
check-out was on time
and no furniture was broken
```

Standard cleaning was already included.

Both parties submitted evidence.

Final result:

```text
Status: RESOLVED

Host evidence:  ✅
Guest evidence: ✅

Deposit: 10 GEN

Host Payout:    0%
Guest Payout: 100%
```

Resolution transaction:

```text
0x2382fdf0c935c5479d58fa6e611aca7e4380072761fe7b34ad9ae1d670ad486e
```

These opposite outcomes demonstrate that payout results are not hardcoded by the frontend.

---

# 8. RPC and Double-Submit Protection

The frontend separates:

```text
Transaction submitted
        ↓
Waiting for FINALIZED
        ↓
Read confirmed contract state
```

Read/finalization traffic is routed through:

```text
/api/rpc
```

The Vercel RPC proxy applies bounded retry/backoff for transient StudioNet errors.

If a write transaction encounters an ambiguous RPC failure, the frontend does not automatically send the write again.

The user should refresh the real case state first.

This reduces accidental duplicate submissions.

---

# 9. What Reviewers Should Verify

A reviewer can verify the project quickly by checking:

```text
1. npm test ends with ALL TESTS PASSED

2. Stranger cannot alter evidence

3. Premature resolve leaves state OPEN

4. Returned Case ID comes from create_dispute result

5. Host + Guest evidence persist independently

6. Resolution produces RESOLVED state

7. host_share + guest_share == 100

8. Host and Guest receive exact expected native GEN payouts

9. host_gain + guest_gain == original deposit

10. Frontend uses MetaMask and contains no embedded private keys
```

---

## Expected Final Result

A successful automated verification ends with:

```text
✅ ALL TESTS PASSED
```

A successful browser verification ends with:

```text
Status: RESOLVED
Host evidence: ✅
Guest evidence: ✅
Host Payout + Guest Payout = 100%
```

> StudioNet compatibility note (runtime-proof v6): v5 observed two parent messages on both success and rollback. Success committed two triggered children and exact recipient gains; rollback committed zero triggered children and moved zero value while retaining the probe balance. `txExecutionResult*` was absent and the hosted debug RPC unavailable, so v6 does not rely on either.

---
