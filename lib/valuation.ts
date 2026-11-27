// Token Launch Radar (radar-5.0) — Pure Valuation Scoring Engine and Parity Verifier.

import {
  type BoardRow,
  type PeerCalibration,
  RADAR_CONFIG,
  type RadarConfig,
  type SnapshotProtocol,
  type ValuationBreakdown,
  type ValuationRange,
  clamp,
  round4,
} from './types.ts';
import { classifySector } from './calibration.ts';

const MS_PER_DAY = 86_400_000;

/** Exact whole-day elapsed time between listed_at and as_of at UTC midnight, floored at 0. */
export function computeTokenlessDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const endMs = Date.parse(`${asOf}T00:00:00Z`);
  const startMs = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(endMs) || !Number.isFinite(startMs)) return null;
  return Math.max(0, Math.floor((endMs - startMs) / MS_PER_DAY));
}

/**
 * Score a single protocol with radar-5.0's five 4-decimal rounded multipliers:
 *   implied_value_usd = max(1, round(tvl_usd * peer_mult * scale_mult * growth_mult * duration_mult * chain_mult))
 */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  calibration: PeerCalibration,
  cfg: RadarConfig = RADAR_CONFIG,
): {
  implied_value_usd: number;
  range: ValuationRange;
  breakdown: ValuationBreakdown;
} {
  const catKey = p.category ?? 'Uncategorized';
  const sector = classifySector(p.category);
  const catCal = calibration.categories[catKey];

  // 1. Size-Normalized Peer Multiple
  const peerMult = catCal
    ? catCal.peer_mult
    : round4(clamp(calibration.global_anchor_mult, cfg.peer_mult_min, cfg.peer_mult_max));
  const peerSource = !catCal
    ? `global anchor prior (n=${calibration.global_peer_count})`
    : catCal.method === 'category'
      ? `category log-trimmed (n=${catCal.peer_count})`
      : catCal.method === 'thin-category'
        ? `thin category shrunk to ${sector} (n=${catCal.peer_count})`
        : `${sector} sector prior (cat n=${catCal.peer_count})`;

  // 2. Empirical TVL Scale Elasticity
  const relTvl = Math.max(p.tvl_usd, 1) / cfg.anchor_tvl_usd;
  const scaleMult = round4(
    clamp(Math.pow(relTvl, calibration.scale_elasticity), cfg.scale_mult_min, cfg.scale_mult_max),
  );

  // 3. Smooth Saturating 7-Day Growth Momentum (inverse-hyperbolic-sine curve)
  let growthPct: number | null = null;
  let growthMult: number;
  if (p.change_7d === null || !Number.isFinite(p.change_7d)) {
    growthMult = round4(cfg.growth_null_mult);
  } else {
    const clampedPct = clamp(p.change_7d, cfg.growth_min_pct, cfg.growth_max_pct);
    growthPct = round4(clampedPct);
    const rawGrowth = Math.exp(
      cfg.growth_sensitivity * Math.asinh(clampedPct / cfg.growth_asinh_scale),
    );
    growthMult = round4(clamp(rawGrowth, cfg.growth_mult_min, cfg.growth_mult_max));
  }

  // 4. Michaelis-Menten Token-less Duration Curve (half-life 240 days)
  const days = computeTokenlessDays(asOf, p.listed_at);
  let durationMult: number;
  if (days === null) {
    durationMult = round4(cfg.duration_null_mult);
  } else {
    const saturation = days / (days + cfg.duration_half_life_days);
    durationMult = round4(cfg.duration_base + cfg.duration_span * saturation);
  }

  // 5. Log-Diminishing Multi-Chain Footprint
  const chainCount = p.chains.length;
  const effectiveChains = Math.max(chainCount, 1);
  const chainMult = round4(
    clamp(1 + cfg.chain_log_step * Math.log(effectiveChains), cfg.chain_mult_min, cfg.chain_mult_max),
  );

  // Exact whole-dollar product using the five 4-decimal rounded multipliers in fixed order.
  const impliedValueUsd = Math.max(
    1,
    Math.round(p.tvl_usd * peerMult * scaleMult * growthMult * durationMult * chainMult),
  );

  // Empirical Bear (P25) and Bull (P75) sector IQR valuation bounds.
  const secCal = calibration.sectors.find((s) => s.sector === sector);
  const bearFactor = secCal ? secCal.bear_factor : calibration.global_bear_factor;
  const bullFactor = secCal ? secCal.bull_factor : calibration.global_bull_factor;
  const bearUsd = Math.max(1, Math.round(impliedValueUsd * bearFactor));
  const bullUsd = Math.max(1, Math.round(impliedValueUsd * bullFactor));

  return {
    implied_value_usd: impliedValueUsd,
    range: {
      bear_usd: bearUsd,
      base_usd: impliedValueUsd,
      bull_usd: bullUsd,
      bear_factor: bearFactor,
      bull_factor: bullFactor,
    },
    breakdown: {
      sector,
      peer_source: peerSource,
      peer_mult: peerMult,
      scale_mult: scaleMult,
      growth_pct: growthPct,
      growth_mult: growthMult,
      tokenless_days: days,
      duration_mult: durationMult,
      chain_count: chainCount,
      chain_mult: chainMult,
    },
  };
}

/**
 * Independently recompute every row's implied_value_usd and Bear/Bull bounds from its raw TVL
 * and 4-decimal rounded multipliers, reporting the first single-dollar discrepancy if any.
 */
export function verifyValuationParity(rows: readonly BoardRow[]): string | null {
  for (const row of rows) {
    const m = row.model;
    const expected = Math.max(
      1,
      Math.round(row.tvl_usd * m.peer_mult * m.scale_mult * m.growth_mult * m.duration_mult * m.chain_mult),
    );
    if (expected !== row.implied_value_usd) {
      return `${row.slug}: expected ${expected} from rounded multipliers, got ${row.implied_value_usd}`;
    }
    const expBear = Math.max(1, Math.round(expected * row.range.bear_factor));
    const expBull = Math.max(1, Math.round(expected * row.range.bull_factor));
    if (expBear !== row.range.bear_usd || expBull !== row.range.bull_usd) {
      return `${row.slug}: IQR range mismatch (${expBear}/${expBull} vs ${row.range.bear_usd}/${row.range.bull_usd})`;
    }
  }
  return null;
}
