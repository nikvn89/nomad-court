# Changelog

## 2026-09-27 — Production front end, in answer to the steward review

**Contract source and deployment address are unchanged.**
`contracts/NomadCourt.py` still hashes to
`2ff3df46997146288ff918116b57e7ebf7a98777890978063807112b5aede2b5` and the app
still points at `0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7`. Everything below
is front end only.

### Wallet connection

- Removed the `client.connect('studionet')` call. It asked the wallet for
  `wallet_getSnaps` / `wallet_requestSnaps`, which is the
  `method [wallet_getSnaps] doesn't has corresponding handler` failure the
  steward hit; MetaMask Snaps are not needed to send a transaction.
- The app now switches networks with `wallet_switchEthereumChain` and falls back
  to `wallet_addEthereumChain` on error 4902.
- Wallet connection moved to a standard connect control in the navbar, with live
  `accountsChanged` and `chainChanged` handling that re-reads state instead of
  reloading the page.

### Test-bench artifacts removed

- Deleted the three `Scenario` buttons, the demo reset, the manual
  GUEST/HOST toggle and the "assign this MetaMask account as …" flow. Deleted,
  not hidden: none of it remains in the bundle.

### Multi-page application

- Added routing: `/` explorer, `/dispute/new`, `/dashboard`, `/dispute/:id`.
- Split the single 788-line `App.tsx` into routes, components and a typed
  library. `App.tsx` is now 57 lines of layout.
- Added `vercel.json` so deep links survive a refresh, with the `/api/` rule
  ahead of the SPA rule so the RPC proxy is not swallowed.

### Public dispute explorer

- `/` lists every case read straight from the contract, with filters, per-case
  bonds in GEN, evidence progress, consensus splits and rationales.
- The explorer uses the read-only client, so it works with no wallet installed.
- Totals (cases filed, bonds locked in open cases, cases adjudicated) are
  computed from the scan, never hard-coded.

### Roles from contract state

- The connected wallet is compared against each case's recorded `host` and
  `guest`. No role switch remains anywhere in the app.
- Controls that belong to the other side stay visible but disabled, carrying the
  contract's own message, so the mechanism is legible without switching wallets.

### Form guidance and validation

- Host address, evidence link and bond amount are separate validated inputs.
  Anything the contract would reject is blocked before a transaction is signed:
  a host equal to the connected wallet, the zero address, a non-`http(s)`
  evidence value, a zero bond.
- The bond is entered in GEN with the wei equivalent shown; it was previously
  hard-coded at 10 GEN.
- House rules are either a validated link or free text that the app publishes and
  links, with an on-screen note that the text leaves the browser.
- Evidence help explains that the contract stores a link and that the file must
  be published somewhere public first.

### Types, tests and build

- Added `tsconfig.json`, `tsconfig.app.json` and `tsconfig.node.json`. The repo
  had no TypeScript configuration at all, so nothing had ever been type-checked.
  The first run caught a real error: two `writeContract` calls were missing the
  `value` field the SDK requires.
- `npm run build` is now `tsc -b && vite build`.
- Added Vitest with 48 tests covering wei/GEN conversion, input validation, the
  `"{}"` sentinel, the id walk, role derivation, phase and totals, and rendering
  — including that a model-written rationale is escaped.
- Split `genlayer-js` into its own chunk: application code dropped from 695 kB to
  200 kB.

### Runtime evidence

- Ran the whole lifecycle on the deployed contract as case #6 with three wallets:
  `create_dispute` → guest `submit_evidence` → host `submit_evidence` →
  `resolve_dispute`, all four `SUCCESS` and `FINALIZED`. Adjudication was signed
  by a wallet that is neither party, which the page labelled an observer.
  Transactions and observed state are in
  [docs/FRONTEND_RUNTIME_EVIDENCE.md](docs/FRONTEND_RUNTIME_EVIDENCE.md).
- Both refusals were checked at the form with no transaction sent: a host equal
  to the connected wallet, and plain text in the evidence field.

### Follow-up fix

- The evidence field used to answer plain text with "A link cannot contain
  spaces or line breaks", which sent the user to delete the spaces and be
  refused a second time. It now says the input is not a link at all. Two tests
  cover both spellings.
