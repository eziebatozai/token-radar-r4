[![make.fun token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/eziebatozai/token-radar-r4/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/eziebatozai/token-radar-r4/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Launch Radar (`radar-5.0`)

A deterministic, zero-network token launch radar built for the [make.fun `token-radar-01` bounty](https://make.fun/bounty/token-radar-01). It reads the sealed DefiLlama protocol snapshot, separates all **416 already-trading protocols** and **4 hyphenated live-token sibling products** (`flying-tulip-ftusd`, `kava-mint`, `manta-cedefi`, `metalx-swap`) from the pre-token board, fits an empirical within-sector TVL scale elasticity and size-normalized log-space peer calibration across **101 eligible live DeFi peers**, validates itself out-of-sample via **Leave-One-Out Cross-Validation (LOOCV)**, ranks **174 strictly pre-token protocols** (all **40 watchlist** protocols `>= $50M` TVL plus **134 clean early-radar** protocols `< $50M` TVL), and generates a tailored 6-step farm plan with explicit capital, native gas token, gas-to-capital drag, and timeframe estimates for every protocol.

## Value Model (`radar-5.0`)

Every implied valuation is computed strictly from snapshot figures using five transparent, 4-decimal rounded multipliers:

```
implied_value_usd = max(1, round(tvl_usd × peer_mult × scale_mult × growth_mult × duration_mult × chain_mult))
```

1. **Size-Normalized Hierarchical Peer Multiple (`peer_mult`)** — calibrated from `101` live-token non-bridge DeFi peers (`mcap_usd / tvl_usd` clipped to `[0.015, 2.50]`):
   - Every live peer is normalized to a `$100M` TVL anchor in log space (`ln(ratio) - elasticity × ln(tvl / $100M)`) before aggregation so mega-TVL peers do not confound category multiples.
   - Protocols map deterministically into seven economic sectors (`Spot DEX & Liquidity`, `Derivatives & Basis`, `Lending & Credit`, `Asset Mgmt & Yield`, `Staking & Security`, `RWA & Credit`, `Chains & Infra`), each shrunk in log space toward the global 15% symmetric trimmed mean (`k = 5`).
   - Categories with `n >= 3` live peers shrink toward their parent sector (`k = 4`); thin categories (`n = 2`) shrink strongly (`k = 7`); sparse categories (`n <= 1`) inherit their parent sector directly. Bounded to `[0.05, 0.85]`.
2. **Empirical TVL Scale Elasticity (`scale_mult`)** — pooled within-sector demeaned log-log OLS slope estimated directly from the 101 live peers (shrunk toward `-0.20` with weight `20`, clamped to `[-0.30, -0.08]`, fitting to `-0.3000` on the sealed snapshot): `clamp((tvl_usd / $100M)^elasticity, 0.35, 1.75)`.
3. **Smooth Saturating 7-Day Growth Momentum (`growth_mult`)** — `clamp(exp(0.14 × asinh(clamp(change_7d, -75, 250) / 20)), 0.65, 1.55)` with explicit `0.9600x` conservative prior when `change_7d` is null.
4. **Michaelis-Menten Token-less Duration (`duration_mult`)** — `0.72 + 0.36 × days / (days + 240)` computed from `as_of − listed_at` in whole UTC days, with explicit `0.8800x` prior when unlisted.
5. **Log-Diminishing Multi-Chain Footprint (`chain_mult`)** — `clamp(1 + 0.04 × ln(max(chains, 1)), 1.00, 1.12)`.

Each sector's 25th- and 75th-percentile size-adjusted live-peer log residuals produce empirical **Bear / Base / Bull** interquartile valuation bounds per protocol. Both `main.ts` and `dashboard/radar.js` independently recompute every row's exact whole-dollar valuation and verify dollar-for-dollar parity with `board.json`.

### Out-of-Sample LOOCV Validation (`n = 101` Live DeFi Peers)

- **Mean Absolute Log Error**: `1.565` (down from `1.671` in `radar-4.1`)
- **Median Absolute Log Error**: `1.351` (down from `1.383` in `radar-4.1`)
- **Within-2x Accuracy**: `28.7%` (`29/101`, up from `18.8%` in `radar-4.1`)
- **Within-3x Accuracy**: `42.6%` (`43/101`)
- **Spearman Rank Correlation**: `0.420`

## Tailored 6-Step Farm Plans

Every row carries six concrete, non-generic farming steps tailored dynamically from its **chains**, **category**, **TVL dilution tier**, **token-less duration**, and **7-day momentum**:
- **Native chain gas catalog (40+ chains)**: names exact native gas tokens (`ETH`, `SOL`, `BNB`, `MON`, `POL`, `AVAX`, `APT`, `BERA`, `S`, `FLR`, `PLUME`, `XPL`, `HYPE/USDC`, `TAO`, `SUI`, `XLM`, `TRX`, `BTC`, etc.), prefers low-fee execution chains, and switches L1-only deployments to batched monthly cadence.
- **TVL-tiered capital sizing & gas drag**: `$500` Flagship (`>=$500M`), `$250` Core Watchlist (`$100M–$500M`), `$150` Mid-Cap Watchlist (`$50M–$100M`, `$250` L1-only), `$100` Early Radar (`$15M–$50M`, `$200` L1-only), `$50` Emerging (`<$15M`, `$150` L1-only), reporting explicit **Gas-to-Capital Drag (%)**.
- **Twelve category playbooks**: tailored execution, secondary legs, hold horizons (`30–60d` with drawdown guards), and unwind/revoke instructions.

## Dashboard

- Static, zero-network HTML/CSS/JS (`dashboard/index.html`, `dashboard/radar.css`, `dashboard/charts.js`, `dashboard/radar.js` — strictly under the 64 KB dossier text cap with zero truncation).
- Custom **Warm Ivory, Deep Obsidian, Forest Emerald & Burnished Copper** palette with bespoke SVG **Empirical Log-TVL vs Mcap/TVL Calibration** scatter/slope plot, clickable **Top-8 Valuations** chart with Bear–Bull whiskers, multi-axis filtering (Search, Cohort, Sector, Category, Chain, 7d Momentum, Low-Gas toggle), full column sorting, 101-row separated **Live Peers** LOOCV audit table, **Model & Validation** tab with 3-slider sensitivity sandbox, and a zero-clipping slide-over **Detail Drawer** showing the Valuation Waterfall, Exact Parity Badge, Top-3 Nearest Live Peer Comps, 5-stat Farm Summary Strip, and all 6 Farm Steps above the fold.

## Run Locally

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22+ standard library only, no network, byte-for-byte deterministic across repeated runs.

## Repository Layout

- `main.ts` — deterministic CLI entrypoint, parity verifier, static dashboard auditor, and dossier writer.
- `lib/types.ts` — shared TypeScript interfaces and immutable `radar-5.0` configuration.
- `lib/calibration.ts` — empirical within-sector elasticity, 7-sector log-space calibration, IQR bands, live comps, and LOOCV.
- `lib/valuation.ts` — pure 5-multiplier valuation engine and independent parity verifier.
- `lib/farm-planner.ts` — 40+-chain gas catalog and 12-category 6-step farm plan engine.
- `lib/board-builder.ts` — snapshot parser, sibling-product hygiene filter, deterministic ranker, and gate validator.
- `vendor/makefun-board.ts` — kit dossier builder (unchanged).
- `dashboard/` — static dashboard (`index.html`, `radar.css`, `charts.js`, `radar.js`).
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png` (`1440×1040`, 300–350 KB each).
- `LICENSE` — MIT (`SPDX-License-Identifier: MIT`).
