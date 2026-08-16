# NomadCourt

**AI-adjudicated P2P dispute resolution with atomic native settlement on GenLayer.**

NomadCourt is a decentralized dispute-resolution dApp built on GenLayer. A Guest locks a native GEN deposit, both Host and Guest submit evidence, and GenLayer AI validators evaluate the dispute against the agreed house rules.

The Intelligent Contract then deterministically converts the consensus result into an atomic payout between the two parties.

---

## Problem

P2P marketplaces, rentals, and service platforms frequently face disputes that cannot be resolved with deterministic smart-contract rules alone.

Questions such as:

- Did the guest violate the agreed rules?
- Which party's evidence is more credible?
- How serious was the violation?
- What percentage of the deposit should each party receive?

require interpretation of natural-language rules and unstructured evidence.

Traditional smart contracts cannot reliably make these qualitative judgments.

---

## Solution

NomadCourt combines two layers:

### GenLayer AI Adjudication

GenLayer validators evaluate:

- the agreed house rules,
- Host evidence,
- Guest evidence,
- the facts claimed by both parties.

The AI jury determines an appropriate payout split and provides a rationale.

### Deterministic On-Chain Settlement

The Intelligent Contract enforces:

- Guest-funded dispute creation,
- recorded Host and Guest identities,
- party-gated evidence submission,
- strict dispute state transitions,
- resolution only after both parties submit evidence,
- deterministic payout accounting,
- atomic native GEN transfers,
- exact deposit conservation.

The Guest payout is calculated as:

```text
guest_payout = deposit - host_payout
```

This prevents rounding loss and guarantees that the entire deposit is accounted for.

---

## Why GenLayer?

The core dispute question is subjective:

> Given the agreed rules and evidence from both parties, how should the deposit be divided?

A deterministic smart contract cannot reliably interpret natural-language rules and conflicting evidence.

GenLayer provides decentralized AI-validator consensus for this subjective decision.

Once consensus determines the payout percentages, NomadCourt uses deterministic contract logic to enforce the result and settle the deposit.

---

## Security Model

NomadCourt was designed so AI adjudication cannot bypass deterministic contract safeguards.

### Party-Gated Evidence

Only the recorded Host or Guest can submit evidence for a dispute.

A third-party wallet attempting to submit evidence is rejected and the state remains unchanged.

### Resolution Preconditions

A dispute cannot be resolved until both Host and Guest evidence have been submitted.

Premature resolution reverts without modifying the dispute state.

### Real Wallet Authorization

The frontend does not embed private keys.

Host and Guest connect using separate MetaMask accounts, and transaction signing is handled by the user's wallet.

### No Guessed Dispute IDs

`create_dispute()` returns the newly created dispute ID.

The frontend derives that ID from the confirmed creation transaction instead of scanning or guessing IDs.

### No Fabricated UI State

The frontend displays only state returned from `get_dispute()`.

Failed reads are surfaced as errors rather than replaced with placeholder dispute data.

### Atomic Settlement

Resolution calculates both payouts before settlement:

```text
host_payout = deposit * host_share / 100
guest_payout = deposit - host_payout
```

The settlement path preserves the original deposit exactly.

---

## Intelligent Contract Flow

```text
Guest
  │
  │ create_dispute + 10 GEN
  ▼
OPEN DISPUTE
  │
  ├── Guest submits evidence
  │
  └── Host submits evidence
  │
  ▼
GenLayer AI Validator Consensus
  │
  │ evaluates rules + both evidences
  ▼
PAYOUT SPLIT
  │
  ├── Host share
  └── Guest share
  │
  ▼
ATOMIC NATIVE GEN SETTLEMENT
  │
  ▼
RESOLVED
```

---

## Assertion Test Suite

NomadCourt includes an asserting integration suite:

```text
scripts/test_flow.js
```

The test uses three independent accounts:

```text
HOST_KEY
GUEST_KEY
STRANGER_KEY
```

Private keys are supplied through environment variables and are never hardcoded in the test source.

The suite exits non-zero immediately if an assertion fails.

### TEST 1 — Confirmed Dispute ID

Creates a real dispute and derives the dispute ID from the confirmed creation transaction.

It verifies that the returned ID maps to the correct Host and Guest.

```text
PASS: derived dispute ID from transaction result
PASS: returned dispute ID maps to correct Host + Guest
```

No dispute ID is hardcoded or guessed.

### TEST 2 — Unauthorized Evidence Rejection

A third independent Stranger account attempts to submit evidence.

Expected result:

```text
PASS: stranger evidence was rejected / rolled back
PASS: unauthorized evidence left Host + Guest evidence unchanged
```

This proves evidence submission is party-gated.

### TEST 3 — Premature Resolution Rollback

The suite attempts to resolve the dispute before both evidences exist.

Expected result:

```text
PASS: premature resolution rejected / rolled back
PASS: rollback preserved OPEN status and zero payout shares
```

This verifies failed resolution does not leave partial state changes.

### TEST 4 — Settlement and Balance Conservation

Both authorized parties submit evidence and the dispute is resolved.

The suite verifies:

```text
PASS: Host evidence transaction succeeded and persisted
PASS: Guest evidence transaction succeeded and persisted
PASS: both authorized evidence URLs are present
PASS: resolve_dispute produced RESOLVED state
PASS: dispute status == RESOLVED
PASS: host_share + guest_share == 100
PASS: stored deposit equals original deposit
PASS: Host received exact expected payout
PASS: Guest received exact expected payout
PASS: host_gain + guest_gain == deposit
PASS: no minting, burning, or rounding loss
```

Final result:

```text
✅ ALL TESTS PASSED
```

---

## Live End-to-End Test

The production frontend was also tested using two real MetaMask accounts on GenLayer StudioNet.

Test scenario:

```text
House Rules:
1. No parties allowed. Penalty: 100% of deposit.
2. Quiet hours after 10 PM.
```

Both Host and Guest submitted their evidence independently.

GenLayer AI consensus concluded that the evidence supported a prohibited party and quiet-hours violation.

Final state:

```text
Status: RESOLVED

Host evidence:  ✅
Guest evidence: ✅

Deposit: 10 GEN

Host Payout:  100%
Guest Payout:   0%
```

The full 10 GEN deposit was therefore settled to the Host.

### Resolution Transaction

```text
0xd61025f007a753a7328d33b012eb9055f8ac6f497978ae43fe9a5eb0dce506b2
```

---

## RPC Reliability

StudioNet RPC may occasionally return rate-limit or temporary fetch errors.

The frontend therefore separates:

```text
Transaction submitted
        ↓
Waiting for finalization
        ↓
Confirmed on-chain state
```

Read and finalization requests are routed through a Vercel RPC proxy with bounded backoff.

The UI does not automatically resubmit a write transaction after an ambiguous RPC failure, reducing the risk of duplicate transactions.

Users can refresh the real contract state before deciding whether another transaction is necessary.

---

## Tech Stack

- GenLayer Intelligent Contracts
- GenVM / Python
- GenLayer AI Validator Consensus
- genlayer-js
- React
- TypeScript
- Vite
- MetaMask
- Vercel
- GenLayer StudioNet

---

## Repository Structure

```text
nomad-court/
├── api/
│   └── rpc.ts
├── contracts/
│   └── NomadCourt.py
├── scripts/
│   └── test_flow.js
├── src/
│   └── App.tsx
├── package.json
└── README.md
```

---

## Run the Assertion Suite

Install dependencies:

```bash
npm install
```

Set three independent test private keys.

Windows CMD:

```cmd
set HOST_KEY=0xYOUR_HOST_PRIVATE_KEY
set GUEST_KEY=0xYOUR_GUEST_PRIVATE_KEY
set STRANGER_KEY=0xYOUR_STRANGER_PRIVATE_KEY
npm test
```

The suite is successful only when it ends with:

```text
✅ ALL TESTS PASSED
```

Any failed assertion terminates the process with a non-zero exit status.

> Use dedicated StudioNet test accounts only. Never commit private keys to the repository.

---

## Deployment

### Live dApp

https://nomad-court-iota.vercel.app/

### GitHub

https://github.com/nikvn89/nomad-court

### GenLayer Intelligent Contract

```text
0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7
```

Explorer:

https://explorer-studio.genlayer.com/address/0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7

---

## Steward Feedback Addressed

The current version specifically addresses the previous review:

- ✅ Removed embedded frontend private keys
- ✅ Real Host/Guest authorization through MetaMask
- ✅ Evidence restricted to recorded parties
- ✅ `create_dispute` is payable
- ✅ Exact dispute ID derived from confirmed creation result
- ✅ No ID probing or guessed latest dispute
- ✅ No fabricated fallback state
- ✅ Premature resolution rollback tested
- ✅ Unauthorized evidence rejection tested
- ✅ Supported native payout demonstrated
- ✅ Host + Guest payout conservation asserted
- ✅ No rounding loss
- ✅ Assertion failures terminate the test suite
- ✅ Full MetaMask → evidence → AI consensus → native settlement flow demonstrated on StudioNet

---

## Status

**Fully tested on GenLayer StudioNet.**

NomadCourt demonstrates how GenLayer can combine subjective AI consensus with deterministic contract guarantees to turn real-world disputes into enforceable, atomic on-chain settlements.
