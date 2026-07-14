# NomadCourt - GenLayer Web3 Dispute Resolution

A decentralized Web3 application built on GenLayer that acts as an impartial jury for P2P short-term rental disputes (e.g., Airbnb). It connects directly to the GenLayer Intelligent Contract via the `genlayer-js` SDK, utilizing non-deterministic AI execution to concurrently evaluate multi-source evidence (House Rules, Host evidence, Guest evidence). 

## 🚀 Recent Updates (Based on Judge Feedback)
We have completely overhauled the architecture to ensure a production-ready, secure, and trustless flow:

1. **Real Party Accounts & Roles:** Replaced the embedded signer with a dual-role architecture. The frontend now simulates distinct Web3 Wallets for the Host and Guest, ensuring multi-party interaction.
2. **Strict Evidence Restriction:** The Intelligent Contract (`submit_evidence`) now enforces cryptographically secure role checks. The Host can only submit Host evidence, and the Guest can only submit Guest evidence. Third-party tampering is strictly blocked.
3. **Confirmed Transaction Path Derivation:** The frontend no longer guesses Dispute IDs. It waits for block confirmation and queries the on-chain state (`get_guest_latest_dispute`) to derive the mathematically confirmed Dispute ID directly from the transaction path.
4. **Atomic Payable Settlements:** Replaced `try-except` fallback logic with strict `_Recipient.emit_transfer()` calls. If either the Host or Guest payout fails (e.g., lack of funds), the entire resolution transaction reverts atomically, protecting the locked security deposit.
5. **Full Flow Repository Test:** We added `test_flow.js` in the repository root to programmatically simulate and verify the entire lifecycle (Creation -> Restriction Checks -> Resolution -> Payout).

## 🛠 Deployed Contract Details
**Contract Address:** `0x65eC86D2926b58898613af185fB6CbFDd845C332`
**Network:** GenLayer StudioNet

## 🧪 How to run the automated test
To verify the full flow and atomicity:
```bash
npm install genlayer-js
node test_flow.js
```
