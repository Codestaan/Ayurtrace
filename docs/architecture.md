# Architecture & design notes

## Actors
| Actor | Wallet role | Writes |
|---|---|---|
| Admin | deployer | roles, recalls |
| Farmer | `Farmer` | batch creation (harvest) |
| Lab | `Lab` | test result + report hash |
| Processor | `Processor` | processing record |
| Distributor | `Distributor` | transport record |
| Retailer | `Retailer` | retail record |
| Customer | none | read-only |

## State machine
```
Harvested --(Lab: recordLabTest)--> LabTested --(Processor, only if labPassed)--> Processed
   --(Distributor)--> Distributed --(Retailer)--> Retail
Admin recall: any time, freezes all further writes on the batch.
```

## Data placement
- **On-chain:** batch metadata, stage, actor, timestamp, location text, IPFS CID, notes.
- **Off-chain (IPFS):** photos, certificates, lab PDFs. Only the CID is stored, which keeps gas low and makes the evidence tamper-evident (changing a file changes its CID).

## Threat model (summary)
| Risk | Mitigation / status |
|---|---|
| Fake participant writes records | Role-gated; admin vets wallets |
| Skipping the lab test | Contract blocks processing unless `labPassed` |
| Editing history | Append-only `history`; no update/delete functions |
| Rogue lab certifies bad herbs | Not solved on-chain: use accredited labs, revoke via `grantRole(addr, None)` |
| Fake data entered honestly-looking | Out of scope: needs sensors / signed lab reports |
| Admin key compromise | Use multisig in production |
| Malicious text in notes (XSS) | Frontend escapes all on-chain strings before rendering |

## Why Polygon (Amoy)
Low fees and EVM compatibility, so the same Solidity and tooling work, and a student can deploy to a public testnet for free.
