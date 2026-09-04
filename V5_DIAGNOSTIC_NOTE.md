# NomadCourt v5 diagnostic-first package

Production contract remains unchanged and must not be redeployed:

`0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7`

Production source SHA256:

`2ff3df46997146288ff918116b57e7ebf7a98777890978063807112b5aede2b5`

## Why this package exists

The static steward gate passes, but the live StudioNet endpoint observed during
runtime testing did not provide the execution proof through the paths previously
attempted:

- direct `gen_getTransactionReceipt` -> method not found;
- `debugTraceTransaction` / `gen_dbg_traceTransaction` -> method not found;
- `waitForTransactionReceipt(... fullTransaction:true)` and `getTransaction()`
  did not expose `txExecutionResultName` / `txExecutionResult` in the observed
  Studio path.

Rather than guess another field path, v5 captures the actual documented SDK
surfaces in one controlled run.

## Run

```bash
npm run diagnose:steward
```

The run requires `STRANGER_KEY`, `HOST_KEY`, and `GUEST_KEY` to be set locally as
fresh test-wallet private keys. Do not paste those keys into chat or commit them.

## Expected artifact

```text
STEWARD_RUNTIME_DIAGNOSTIC.json
```

Upload that JSON for review even if the command ends `INCOMPLETE`; the script
persists partial diagnostics on failure.

This file is diagnostic evidence, not the final steward PASS artifact.
