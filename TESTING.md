# NomadCourt Testing Guide

## Steward-focused native payout runtime test — v6

Run:

```cmd
npm run test:steward
```

The command first runs `npm run test:payout:static`, which locks the test probe to the exact production `NativePayout` interface, confirms two production `emit_transfer()` calls and exact remainder conservation, proves the rollback probe raises only after `_emit_split()`, and verifies that `create_dispute()` return decoding uses only the accepted leader's exact SDK result field: `consensus_data.leader_receipt[0].result.payload.readable`.

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

## Frontend walkthrough — moved

The browser walkthrough that used to sit here described the earlier build, which
asked the user to assign a wallet to a role by hand and offered demo scenario
buttons. That interface is gone: roles are now read from the contract, and the
scenario buttons were deleted.

The current walkthrough, with the transactions from a full run on the deployed
contract, is in
[docs/FRONTEND_RUNTIME_EVIDENCE.md](docs/FRONTEND_RUNTIME_EVIDENCE.md), and the
screenshots are in [docs/evidence/](docs/evidence/).

Everything above this line — the automated suite, TEST 1 to TEST 4, and the
native-payout runtime proof — concerns the contract, which has not changed, and
still applies.

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

# 10. Requested Exact-ID Fix — Fresh StudioNet Case 5

The requested dispute-ID correction was verified against a real finalized
`create_dispute` transaction:

```text
Create transaction:
0xc12e44054dab716282b68c6d78a8c14b98a8a7e12038922775af7c1af5625a58

Explorer Return Value: "5"
Decoded Case ID:       5
```

The production decoder now reads only:

```text
consensus_data.leader_receipt[0].result.payload.readable
```

after requiring:

```text
result.status == "return"
```

It does not recursively scan the receipt, fetch and scan the transaction, guess
a latest ID, or depend on the unavailable hosted StudioNet debug RPC.

The same Case ID was then completed with both assigned wallets:

```text
Host:  0x146e44881d35814ba582d265af5b97ef2695ec8e
Guest: 0x6276095faea15108740445ff277fda8c304657f4

Status:         RESOLVED
Host evidence:  present
Guest evidence: present
Host payout:    0%
Guest payout:   100%
```

Resolution transaction:

```text
0x2d750478d5ae1382ed388f29aa9ace6108d82a3b0293d782b86df2a29a2320e2
```

Browser evidence:

```text
evidence/case-5-resolved.png
SHA-256: ae25b1a7d5b71a347caa71558c343dae98cbeb6295da42156e996233f151f077
```

This lifecycle evidence supplements the source-locked decoder test. It does not
replace the exact-field assertions in `npm run test:id-source`.
