[![make.fun token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/eziebatozai/token-radar-r4/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/eziebatozai/token-radar-r4/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Launch Radar (r4)

A deterministic, zero-network token launch radar built for the [make.fun `token-radar-01` bounty](https://make.fun/bounty/token-radar-01). It reads the sealed DefiLlama protocol snapshot, separates already-trading protocols from pre-token candidates, calibrates live-token sector and category multiples, ranks **178 pre-token protocols** (all **40 watchlist** protocols `>= $50M` TVL plus **138 clean early-radar** protocols `< $50M` TVL), and generates a tailored 7-step farm plan with explicit capital, gas, and timeframe estimates for every protocol.

## Value Model (`radar-4.1`)

Every implied valuation is computed strictly from snapshot figures using five transparent, 4-decimal rounded multipliers:

```
implied_value_usd = max(1, round(tvl_usd × peer_mult × growth_mult × duration_mult × scale_mult × chain_mult))
```

1. **Hierarchical Peer Multiple (`peer_mult`)** — calibrated from `101` live-token non-bridge DeFi peers (`mcap_usd / tvl_usd` clipped to `[0.02, 2.00]`, 15% symmetric trimmed median):
   - Protocols map cleanly by category into five economic sector families (`Trading & Liquidity`, `RWA & Infrastructure`, `Asset Mgmt & Yield`, `Lending & Credit`, `Staking & Security`), each shrunk toward the global trimmed median (`k = 6`).
   - Categories with `n >= 3` live peers shrink their trimmed median toward their sector prior (`k = 4`); thin categories with `n = 2` shrink strongly (`k = 8`); thin or empty categories (`n <= 1`) inherit their economic sector prior directly rather than letting single-peer outliers distort multiples.
   - Bounded to `[0.08, 0.72]`.
2. **Responsive 7-Day Growth Momentum (`growth_mult`)** — captures near-term TVL velocity while explicitly handling missing telemetry:
   - Clamped to `[-65%, +150%]`.
   - Positive momentum: `+0.75%` per percentage point up to `+50%` (`1.375x`), then `+0.35%` per point up to `+150%` (`1.725x`).
   - Negative momentum: `-0.60%` per point down to `-65%` (`0.610x`).
   - Unreported `change_7d === null`: explicit `0.9500x` conservative prior.
3. **Explicit Token-less Duration (`duration_mult`)** — measures how long the protocol has operated without a token (`as_of − listed_at`, in whole days):
   - Smooth concave curve: `0.72 + 0.38 × ln(1 + min(days, 1460) / 90) / ln(1 + 1460 / 90)` (`0.7200x` at day 0 to `1.1000x` at 4+ years).
   - Unreported `listed_at === null`: explicit `0.8500x` conservative prior.
4. **TVL Scale Elasticity (`scale_mult`)** — `clamp((tvl_usd / $250M)^−0.06, 0.80, 1.18)`, reflecting empirical Mcap/TVL compression at mega-TVL scale.
5. **Multi-Chain Footprint (`chain_mult`)** — `1 + 0.025 × min(max(chains − 1, 0), 6)` (`1.0000x` single-chain baseline up to `1.1500x` at 7+ chains).

Because each multiplier is rounded to 4 decimals before multiplication, `main.ts` and `dashboard/app.js` independently recompute every row's `implied_value_usd` and verify exact dollar-for-dollar parity with `board.json`.

## Tailored 7-Step Farm Plans

Every row carries seven concrete, non-generic farming steps tailored dynamically from its **chains**, **category**, **TVL dilution tier**, **token-less duration**, and **7-day TVL momentum**:
- **Chain-aware gas routing**: prefers low-fee L2/Solana execution chains (`~$0.14–$3.50` total plan gas) when multi-chain, and switches Ethereum/Bitcoin L1-only protocols to off-peak monthly batching with higher minimum capital so gas stays economically rational.
- **TVL-tiered capital sizing**: `$500` (Flagship `>=$500M`), `$250` (Core Watchlist), `$150` (Mid-Cap Watchlist), `$100` (Early Radar), `$50` (Emerging risk-capped).
- **Category-specific mechanics**: tailored playbooks across Risk Curators, Onchain Capital Allocators, DEXs & Liquidity Managers, Lending & Collateral Markets, CDPs & Stablecoins, Derivatives & Basis Trading, RWAs, Restaking & Staking, Yield Vaults, Chains & Payments, and Insurance/Prediction/Governance.
- **Explicit cost and timeframe** on every step plus a per-protocol summary strip (`Target Capital`, `Est. Total Gas`, `Hold Horizon`, `Active Chain`).

## Dashboard

- Static, zero-network HTML/CSS/JS (`dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js`, totaling ~54 KB — strictly under the 64 KB dossier text cap with zero truncation).
- Multi-axis filtering (Search, Cohort tabs, Category, Chain, 7d Momentum), full column sorting, Top-8 & Sector Calibration charts, a slide-over per-protocol detail drawer with valuation waterfall + live parity audit + 7-step farm plan, a separated Live Peers tab, and an interactive Model Sensitivity Sandbox.

## Run Locally

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22+ standard library only, no network, deterministic across repeated runs.

## Repository Layout

- `main.ts` — entrypoint, parity verifier, dashboard static auditor, and bundle/dossier writer.
- `lib/model.ts` — hierarchical peer calibration, `radar-4.1` value model, board builder, and 7-step farm plan engine.
- `vendor/makefun-board.ts` — kit dossier builder (unchanged).
- `dashboard/` — static dashboard (`index.html`, `app.css`, `app.js`).
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png` (`1440×1040`, 306–330 KiB each).
- `LICENSE` — MIT (`SPDX-License-Identifier: MIT`).
