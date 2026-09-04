# Steward Runtime Verification v6 — Native GEN Payout + Atomic Rollback

## Production source parity

The production contract is unchanged and is **not redeployed**.

Production contract address:

```text
0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7
```

`contracts/NomadCourt.py` SHA-256:

```text
2ff3df46997146288ff918116b57e7ebf7a98777890978063807112b5aede2b5
```

The test-only probe uses the exact same `NativePayout` interface as production. The static gate also proves that `payout_both_then_revert()` calls `_emit_split(host, guest)` and only then raises `gl.vm.UserError`.

Run the static gate:

```bash
npm run test:payout:static
```

## Why v6 changed the runtime proof

The v5 diagnostic observed the actual hosted StudioNet response shape with `genlayer-js@1.1.8`:

- finalized Studio transactions expose `statusName`, `messages`, and triggered-transaction data;
- `txExecutionResultName` / `txExecutionResult` are absent on this Studio decoder path;
- the hosted endpoint rejects the debug-trace RPC as unavailable;
- the deliberate rollback parent still exposes **two emitted messages**, while it commits **zero triggered children** and moves **zero native value**.

Therefore v6 does not use `gen_getTransactionReceipt`, `gen_dbg_traceTransaction`, raw `leader_receipt`, validator internals, or guessed result aliases. Missing execution-enum fields are never interpreted as success or revert.

## Full executable StudioNet proof

Use three independent dedicated test wallets and keep private keys local.

Windows CMD:

```cmd
set HOST_KEY=0x...
set GUEST_KEY=0x...
set STRANGER_KEY=0x...
npm run test:steward
```

### Case A — both native transfers commit

The live test deploys and funds the probe, then calls `payout_both(host, guest)`. It requires all of the following:

```text
finalized parent transaction
messages.length == 2
getTriggeredTransactionIds(parent).length == 2
Host gain == exact Host amount
Guest gain == exact Guest amount
probe balance == 0
```

This proves two native transfers actually committed to two distinct recipients with exact amounts and no remainder left in the probe.

### Case B — both emitted transfers are discarded atomically

The test re-funds the same probe and calls `payout_both_then_revert(host, guest)`. The static gate proves this function has one relevant path: `_emit_split()` emits both native-transfer messages, then `gl.vm.UserError` is raised.

The live test requires:

```text
finalized parent transaction
messages.length == 2
getTriggeredTransactionIds(parent).length == 0
Host balance unchanged
Guest balance unchanged
probe balance unchanged and still equal to the full funded amount
```

The critical runtime distinction is **2 emitted parent messages versus 0 committed child transactions**. Combined with zero balance movement and the source-locked raise-after-emission path, this demonstrates atomic rollback of both emitted native transfers.

The proof does **not** claim that a missing StudioNet execution enum itself identifies `UserError`. If `txExecutionResultName` / `txExecutionResult` are published on a compatible path, v6 checks them as optional corroboration. If absent, no outcome is inferred from that absence.

## Wallet/signing/RPC failures are distinct

A wallet/signing/RPC failure cannot satisfy the rollback assertions:

- transaction submission failure -> immediate FAIL, no contract-revert claim;
- receipt/RPC wait failure -> immediate FAIL;
- triggered-transaction read failure -> immediate FAIL;
- only a submitted, finalized rollback parent with two emitted messages, zero committed children, unchanged recipient balances, and retained probe balance can pass the rollback proof.

This is why v6 does not confuse a transport failure with a contract-level rollback.

## Documented GenVM return decoding

The main `scripts/test_flow.js` continues to derive the returned dispute ID only from:

```text
debugTraceTransaction(...).result_code
debugTraceTransaction(...).return_data
```

It requires successful trace execution before decoding `return_data` and does not fall back to guessed receipt/result/output aliases. This is separate from the v6 native-payout proof, which no longer depends on the hosted StudioNet debug RPC.

## Reviewer artifact

A successful live run writes:

```text
STEWARD_NATIVE_PAYOUT_RUNTIME.json
```

The report contains source hashes, probe address, transaction hashes, emitted-message counts, triggered-child counts, exact balance deltas, the rollback controlled-pair proof, and the scope note about unavailable StudioNet execution-enum fields. It contains no private keys.

The harness deletes any prior runtime PASS artifact at startup. A failed rerun cannot leave a stale PASS file.

Expected final banner:

```text
✅ STEWARD NATIVE PAYOUT STATIC CHECK PASSED
...
✅ NATIVE PAYOUT + ATOMIC ROLLBACK TEST PASSED
```

A fresh StudioNet PASS was completed on 2026-09-04 and the resulting `STEWARD_NATIVE_PAYOUT_RUNTIME.json` is bundled in this resubmission package.

## Diagnostic instrument

`npm run diagnose:steward` remains in the repository as a diagnostic instrument. It is not a PASS artifact. Use it only when a future StudioNet/SDK response shape changes.
