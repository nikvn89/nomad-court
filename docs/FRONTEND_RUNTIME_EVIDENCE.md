# Front-end runtime evidence — steward revision

Contract source and deployment address are **unchanged** by this revision.

```text
Contract   0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7
Source     contracts/NomadCourt.py
SHA-256    2ff3df46997146288ff918116b57e7ebf7a98777890978063807112b5aede2b5
Network    GenLayer StudioNet (chain 61999)
App        https://nomad-court-iota.vercel.app/
Date       2026-09-28
```

## Wallets used

| Role in case #6 | Address | Why it is here |
|---|---|---|
| Guest | `0x6276095FAEA15108740445ff277fdA8c304657F4` | filed the case and locked the bond |
| Host | `0x146e44881d35814bA582D265AF5b97ef2695ec8e` | named by the guest, filed the rebuttal |
| Neither | `0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE` | started adjudication as a third party |

No wallet is hard-coded anywhere in the contract or the app.

## A. Read path, no wallet at all

Opened `/` in a private window with no wallet extension available. The explorer
listed every case on the contract and computed its own totals from those reads:
5 cases filed, 20 GEN locked across the two open ones, 3 adjudicated. Opening a
settled case showed both evidence links, the split and the rationale.

This is the read-only client: it carries no provider, so the explorer is
readable by anyone.

## B. Wallet connection

Connected with the standard control in the navbar. The wallet attached, the
control showed the truncated address and a StudioNet badge, and **no
`wallet_getSnaps` request was made** — the `client.connect()` call that produced
`method [wallet_getSnaps] doesn't has corresponding handler` is gone, replaced by
`wallet_switchEthereumChain` with a `wallet_addEthereumChain` fallback.

## C. Validation before signing

Two inputs were refused at the form, with no transaction sent in either case:

| Input | What the form said | What the contract would have said |
|---|---|---|
| Host address = the connected wallet | `Host and Guest must be different accounts.` | `Host and Guest must be different accounts` |
| Evidence = `the room was dirty` | `Evidence must be a link starting with https:// — plain text is rejected on chain.` | `Evidence must be a public HTTP/HTTPS URL` |

## D. Roles read from contract state

Case #4 was opened at the same URL with two different wallets. Nothing on screen
was changed by hand; the app compares the connected wallet against the case's
recorded `host` and `guest`.

| Wallet | What the page said | Where "this is you" appeared |
|---|---|---|
| `0x6276…57f4` | You are viewing this as **guest** | next to Guest |
| `0x146e…ec8e` | You are viewing this as **host** | next to Host |
| `0x037f…1cde` | You are viewing this as **observer** | nowhere |

On case #1, where the connected wallet is neither party, the evidence field was
disabled and carried the contract's own sentence,
`Only the recorded Host or Guest can submit evidence`.

## E. Full lifecycle, case #6

House rules were typed into the form and published, so the validators can fetch
them: <https://bytebin.lucko.me/JwqodBAfuJ>

| Step | Wallet | Method | Observed result | Transaction |
|---|---|---|---|---|
| 1 | Guest | `create_dispute` | `SUCCESS`, `FINALIZED`, return value `"6"` | [`0xb5340979…fbf0e`](https://explorer-studio.genlayer.com/tx/0xb5340979fc39fca3ec42b7bff9498e23eb47bd9e4d1ad74051b83f5ae48fbf0e) |
| 2 | Guest | `submit_evidence` | `SUCCESS`, `FINALIZED`, case at 1/2 | [`0x0c57851c…7cc4d`](https://explorer-studio.genlayer.com/tx/0x0c57851c6d5cb6321af8171ef6084e1b172191cbb50ee782c7815d8923a7cc4d) |
| 3 | Host | `submit_evidence` | `SUCCESS`, `FINALIZED`, case ready | [`0xf6bbea4c…307f9`](https://explorer-studio.genlayer.com/tx/0xf6bbea4cfaf0c2745e145f72a7578f951fc22b9b71fe3e0867c0149b5cd307f9) |
| 4 | Neither party | `resolve_dispute` | `SUCCESS`, `FINALIZED`, settled | [`0x61f2f9db…5efd8`](https://explorer-studio.genlayer.com/tx/0x61f2f9db34460517602ac5d26e70a01bac06b4fe13a6d30db7ebbf020c35efd8) |

Step 1 returned `"6"` and the app navigated straight to `/dispute/6`. The case id
is read from the accepted leader's GenVM result, so nobody has to know or type
it.

Step 4 was signed by a wallet that is neither host nor guest. The page labelled
it an observer and still allowed adjudication, because `resolve_dispute` does not
restrict its caller. That is the contract's design, and the app now reflects it
instead of hiding it.

### Evidence submitted

- Guest: <https://gist.github.com/nikvn89/da9565dd9c6c57132374d517e0710144>
- Host: <https://gist.githubusercontent.com/nikvn89/f44b86cde03e09c8788344ea3ec37359/raw/74f38189de5e80caedd1886a60a122b4e2bb4ac1/host-evidence.txt>

### Consensus outcome

The equivalence-principle output on transaction 4:

```json
{"guest_share":100,"host_share":0,"reason":"The house rules explicitly promise a full refund if the air conditioning is not functional on arrival. The guest reported the failure immediately, and the host's failure to respond until the following morning prevented any troubleshooting or resolution, effectively leaving the guest without the prom"}
```

The page then showed 100% guest / 0% host, 10 GEN / 0 GEN, and that rationale.

## What this run does NOT prove

- **Nothing about the contract changed, so nothing about the contract is
  re-proved here.** The native-payout and dispute-id evidence from the earlier
  submissions still stands on its own and is unaffected.
- **The rationale is stored truncated.** `resolve_dispute` clips the model's
  `reason` to 300 characters, which is why the text above ends mid-word. That is
  existing contract behaviour, not display truncation, and changing it would mean
  a redeployment.
- **One adjudication is one sample.** It shows the pipeline works end to end; it
  says nothing about how the validators would rule on a different dispute.
- **Cases #1 and #4 were left at 0/2 on purpose.** They pre-date this revision
  and were used only to demonstrate role detection.
