# Steward Runtime Verification — Native GEN Payout + Atomic Rollback

This repository revision addresses the Aug 31 steward request without changing the production NomadCourt business contract.

## Production contract parity

`contracts/NomadCourt.py` is intentionally unchanged in this repository patch.

SHA-256:

```text
2ff3df46997146288ff918116b57e7ebf7a98777890978063807112b5aede2b5
```

The new runtime proof lives in a **test-only** contract:

```text
tests/contracts/NativePayoutProbe.py
```

and its executable StudioNet test:

```text
scripts/test_native_payout.js
```

## What the runtime proof does

The probe uses the same documented native payout primitive as NomadCourt:

```python
@gl.evm.contract_interface
class NativePayout:
    class View:
        pass
    class Write:
        pass

NativePayout(Address(recipient)).emit_transfer(value=amount)
```

The test runs two independent cases.

### A. Successful two-recipient payout

1. Deploy the test-only probe.
2. Fund it with native GEN.
3. Record Host and Guest StudioNet balances.
4. Call `payout_both(host, guest)`.
5. Require finalized `txExecutionResultName == FINISHED_WITH_RETURN`.
6. Require `debugTraceTransaction(...).result_code == 0`.
7. Prove Host and Guest each received the exact expected native GEN amount.
8. Prove the probe balance is zero.

### B. Atomic rollback after both payout messages are emitted

1. Fund the probe again.
2. Record Host, Guest, and probe balances.
3. Call `payout_both_then_revert(host, guest)`.
4. The contract emits **both** native payout messages and only then raises `gl.vm.UserError`.
5. Require finalized `txExecutionResultName == FINISHED_WITH_ERROR`.
6. Require `debugTraceTransaction(...).result_code == 1` (documented UserError result).
7. Require `getTriggeredTransactionIds()` to return zero child transactions.
8. Prove Host balance did not change.
9. Prove Guest balance did not change.
10. Prove the probe retained the complete funded amount.
11. Run a successful cleanup payout so the test does not intentionally strand the rollback funds.

This proves rollback of the payout messages themselves, not merely rollback of storage that occurred before a transfer.

## Wallet/RPC failures are not accepted as contract reverts

Both `scripts/test_flow.js` and `scripts/test_native_payout.js` now fail if transaction submission throws before returning a transaction hash.

A required contract revert is accepted only when the submitted transaction reaches finalization and the documented execution evidence says:

```text
txExecutionResultName == FINISHED_WITH_ERROR
debugTraceTransaction.result_code == 1
```

Therefore wallet rejection, signing failure, HTTP failure, timeout, or other RPC/transport failure cannot produce a false PASS for a revert test.

## Documented GenVM return decoding only

`scripts/test_flow.js` no longer recursively searches receipt/result/output aliases for the `create_dispute()` return value.

It now reads only:

```text
debugTraceTransaction(...).result_code
debugTraceTransaction(...).return_data
```

The test requires `result_code == 0` and decodes the dispute ID only from the documented hex `return_data` field.

## Run

Install dependencies, set three dedicated StudioNet test keys, then run the focused steward proof:

```bash
npm install

export HOST_KEY=0x...
export GUEST_KEY=0x...
export STRANGER_KEY=0x...

npm run test:payout
```

On Windows CMD:

```cmd
set HOST_KEY=0x...
set GUEST_KEY=0x...
set STRANGER_KEY=0x...
npm run test:payout
```

A successful runtime ends with:

```text
✅ NATIVE PAYOUT + ATOMIC ROLLBACK TEST PASSED
```

Run the broader NomadCourt integration suite separately with:

```bash
npm test
```

## GenLayer documentation used

- Native GEN / EOA payout: https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers
- External messages: https://docs.genlayer.com/developers/intelligent-contracts/features/messages
- GenLayerJS transaction execution, traces, and triggered transaction IDs: https://docs.genlayer.com/api-references/genlayer-js/transactions
- GenVM trace fields (`result_code`, `return_data`): https://docs.genlayer.com/api-references/genlayer-node/debug/gen_dbg_traceTransaction

## Evidence status

The source-level changes can be syntax-checked locally. A new PASS claim should be made only after `npm run test:payout` is actually executed against StudioNet and the transaction hashes/output are recorded.
