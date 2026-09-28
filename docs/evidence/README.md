# Screenshots

Taken on 2026-09-28 against <https://nomad-court-iota.vercel.app/> and the
deployed contract `0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7`. Transaction
hashes for the run are in [../FRONTEND_RUNTIME_EVIDENCE.md](../FRONTEND_RUNTIME_EVIDENCE.md).

| File | What it shows |
|---|---|
| `01-explorer-public.png` | `/` in a private window with no wallet available. Five cases read from the contract, totals computed from those reads. |
| `02-connect-ok.png` | The navbar control after connecting. No `wallet_getSnaps` request is made. |
| `03-role-auto-guest.png` | Case #4 with the guest wallet: "viewing this as **guest**", "this is you" beside Guest. |
| `04-role-auto-host.png` | **The same case at the same URL** with the host wallet: "as **host**", and the marker has moved to Host. Nothing on screen was changed by hand. |
| `05-form-blocked-host-is-self.png` | Filing with the host set to the connected wallet. The form refuses it and the button stays disabled — no transaction is sent. |
| `06-role-auto-observer.png` | Case #1, where the wallet is neither party: the evidence field is disabled and carries the contract's own sentence. |
| `07-observer-can-adjudicate.png` | Case #6 with a third wallet. Labelled an observer, yet adjudication is available, because `resolve_dispute` does not restrict its caller. |
| `08-verdict-settled.png` | Case #6 after adjudication: 100% guest / 0% host, 10 GEN / 0 GEN, with the validators' rationale. |

Images 03 and 04 are the pair to read together: one case, one URL, two wallets,
two roles, no persona switch anywhere in the app.
