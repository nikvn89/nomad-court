# NomadCourt — AI-Powered Airbnb Dispute Resolution on GenLayer

A decentralized Web3 dApp that acts as an **impartial AI jury** for P2P short-term rental disputes (e.g., Airbnb). Built on [GenLayer](https://genlayer.com), it uses non-deterministic AI execution to evaluate multi-source evidence and autonomously calculate fair security deposit splits.

## Live Demo

🌐 **https://nomad-court-iota.vercel.app**

📜 **Smart Contract (GenVM):** [`0x8f5642c7db691f91e29A22104aD856Cfb00e1D22`](https://explorer-studio.genlayer.com/address/0x8f5642c7db691f91e29A22104aD856Cfb00e1D22)

## How It Works

1. **Guest** opens a dispute by locking a 10 GEN deposit on-chain.
2. Both **Host** and **Guest** write their custom evidence in the DApp. The frontend automatically uploads this raw text to a decentralized text-storage (bytebin.lucko.me) and passes the URL to the smart contract.
3. Anyone triggers **AI Resolution** — the Intelligent Contract:
   - Fetches evidence from the generated URLs via `gl.nondet.web.render()`
   - Sends everything to an LLM via `gl.nondet.exec_prompt()`
   - Uses **Production-Grade AI Consensus** — Validators re-run the AI LLM prompt. To account for natural LLM variance in real-world messy disputes, consensus is reached if the Validator's fault percentage is within a ±25% margin of error compared to the Leader. This ensures 100% uptime while rejecting malicious nodes.
4. The deposit is split via **atomic `emit_transfer()` payouts** to the Host and Guest's Externally Owned Accounts (EOAs).

## Architecture

```
┌─────────────┐      genlayer-js SDK       ┌──────────────────────┐
│  React + TS │  ◄───────────────────────►  │  GenLayer StudioNet  │
│  (Vercel)   │     writeContract /         │                      │
│             │     readContract            │  NomadCourt.py       │
└─────────────┘                             │  (Intelligent        │
                                            │   Contract)          │
                                            └──────────────────────┘
```

## Key Security Features

- **`gl.message.sender`** enforces caller identity on-chain — only the recorded Host/Guest can submit evidence for their side
- **Atomic settlement** — both payouts execute in a single transaction; if one fails, everything reverts
- **No embedded signers** — users connect with their own GenLayer private keys

## Testing the DApp

You don't need to manually find or paste URLs anymore! 
- **Built-in Scenarios:** The DApp includes 3 one-click "Scenario" buttons at the top of the page. Clicking them will automatically pre-fill realistic House Rules and Evidence texts for both Host and Guest.
- **Raw Text Support:** You can type any raw text directly into the House Rules or Evidence fields. The React frontend will automatically upload your text to a decentralized text-storage provider (bytebin.lucko.me) and pass the generated URL to the Smart Contract behind the scenes!

## Repository Structure

```
├── contracts/
│   └── NomadCourt.py       # GenLayer Intelligent Contract (Python)
├── scripts/
│   ├── deploy.js           # Deployment script
│   └── test_flow.js        # End-to-end integration test
├── src/
│   ├── App.tsx             # React frontend (TypeScript)
│   ├── index.css           # Styles
│   └── main.tsx            # Entry point
├── index.html              # HTML shell
├── package.json            # Dependencies
├── vercel.json             # Vercel proxy config (RPC rewrite)
└── vite.config.ts          # Vite build config
```

## Run Locally

```bash
npm install
npm run dev
```

## Run Tests

```bash
npm run test
```

## Tech Stack

- **Smart Contract:** GenLayer Intelligent Contract (Python) with `gl.nondet` AI execution
- **Frontend:** React + TypeScript + Vite
- **SDK:** genlayer-js v0.5.13
- **Deployed Contract**

NomadCourt is currently deployed on the GenLayer StudioNet at:
`0x8f5642c7db691f91e29A22104aD856Cfb00e1D22`
