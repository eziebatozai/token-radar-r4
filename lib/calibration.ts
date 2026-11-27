// Token Launch Radar (radar-5.0) — Empirical Calibration, IQR Bands, Comps, and LOOCV.

import {
  type CategoryCalibration,
  type LiveCompRef,
  type LivePeerAuditRow,
  type LoocvMetrics,
  type PeerCalibration,
  RADAR_CONFIG,
  type RadarConfig,
  SECTOR_ORDER,
  type SectorCalibration,
  type SectorName,
  type SnapshotProtocol,
  clamp,
  compareLex,
  round4,
} from './types.ts';
import { scoreProtocol } from './valuation.ts';

const EXCLUDED_PEER_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
]);

/** True when DefiLlama records no token (mcap, gecko_id, and symbol are all null). */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Eligible live DeFi peer for empirical calibration (positive mcap & TVL, non-bridge/non-CEX). */
export function isEligibleLivePeer(p: SnapshotProtocol): boolean {
  if (isPreToken(p)) return false;
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return false;
  if (p.category !== null && EXCLUDED_PEER_CATEGORIES.has(p.category)) return false;
  return true;
}

/** Deterministic mapping of any DefiLlama category string into one of seven economic sectors. */
export function classifySector(category: string | null): SectorName {
  const c = (category ?? '').toLowerCase();
  if (/\bdexs?\b/.test(c) || c.includes('liquidity manager')) {
    return 'Spot DEX & Liquidity';
  }
  if (
    c.includes('derivative') ||
    c.includes('perpetual') ||
    c.includes('option') ||
    c.includes('basis') ||
    c.includes('prediction')
  ) {
    return 'Derivatives & Basis';
  }
  if (c.includes('lending') || c.includes('cdp') || c.includes('stablecoin')) {
    return 'Lending & Credit';
  }
  if (
    c.includes('curator') ||
    c.includes('allocator') ||
    c.includes('yield') ||
    c.includes('farm') ||
    c.includes('indexes') ||
    c.includes('cedefi')
  ) {
    return 'Asset Mgmt & Yield';
  }
  if (
    c.includes('staking') ||
    c.includes('restaking') ||
    c.includes('restaked') ||
    c.includes('btc') ||
    c.includes('collateral')
  ) {
    return 'Staking & Security';
  }
  if (/\brwa\b/.test(c)) {
    return 'RWA & Credit';
  }
  return 'Chains & Infra';
}

/** Symmetric trimmed arithmetic mean: drops floor(n * trimFrac) from each tail when n >= 5. */
export function symmetricTrimmedMean(values: readonly number[], trimFrac: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const drop = sorted.length >= 5 ? Math.floor(sorted.length * trimFrac) : 0;
  const core = sorted.slice(drop, sorted.length - drop);
  let sum = 0;
  for (const v of core) sum += v;
  return sum / core.length;
}

/** Linearly interpolated quantile on an ascending sorted numeric array. */
export function sortedQuantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

interface PeerObs {
  slug: string;
  category: string;
  sector: SectorName;
  logRelTvl: number;
  logRatio: number;
}

/**
 * Calibrate within-sector empirical TVL scale elasticity, size-normalized log-space peer multiples,
 * and empirical Bear/Bull interquartile residual factors from a pool of eligible live peers.
 */
export function fitPeerCalibration(
  eligiblePeers: readonly SnapshotProtocol[],
  allCategoryNames: readonly string[],
  cfg: RadarConfig = RADAR_CONFIG,
): PeerCalibration {
  const obs: PeerObs[] = eligiblePeers.map((p) => {
    const ratio = clamp(p.mcap_usd! / p.tvl_usd, cfg.peer_ratio_min, cfg.peer_ratio_max);
    return {
      slug: p.slug,
      category: p.category ?? 'Uncategorized',
      sector: classifySector(p.category),
      logRelTvl: Math.log(p.tvl_usd / cfg.anchor_tvl_usd),
      logRatio: Math.log(ratio),
    };
  });

  // 1. Pooled within-sector demeaned OLS slope for log-TVL scale elasticity.
  const secObs = new Map<SectorName, PeerObs[]>();
  for (const o of obs) {
    const arr = secObs.get(o.sector);
    if (arr) arr.push(o);
    else secObs.set(o.sector, [o]);
  }

  let crossSum = 0;
  let sqSum = 0;
  for (const group of secObs.values()) {
    if (group.length < 2) continue;
    let mx = 0;
    let my = 0;
    for (const o of group) {
      mx += o.logRelTvl;
      my += o.logRatio;
    }
    mx /= group.length;
    my /= group.length;
    for (const o of group) {
      const dx = o.logRelTvl - mx;
      const dy = o.logRatio - my;
      crossSum += dx * dy;
      sqSum += dx * dx;
    }
  }

  const rawElasticity = sqSum > 0 ? crossSum / sqSum : cfg.elasticity_prior;
  const n = obs.length;
  const shrunkElasticity =
    (n * rawElasticity + cfg.elasticity_prior_weight * cfg.elasticity_prior) /
    (n + cfg.elasticity_prior_weight);
  const scaleElasticity = round4(clamp(shrunkElasticity, cfg.elasticity_min, cfg.elasticity_max));

  // 2. Size-normalize every live peer's multiple to the $100M TVL anchor in log space.
  const normBySector = new Map<SectorName, number[]>();
  const normByCategory = new Map<string, number[]>();
  const allNormLogs: number[] = [];
  const obsWithNorm = obs.map((o) => {
    const normLog = o.logRatio - scaleElasticity * o.logRelTvl;
    allNormLogs.push(normLog);
    const sList = normBySector.get(o.sector);
    if (sList) sList.push(normLog);
    else normBySector.set(o.sector, [normLog]);
    const cList = normByCategory.get(o.category);
    if (cList) cList.push(normLog);
    else normByCategory.set(o.category, [normLog]);
    return { ...o, normLog };
  });

  const globalLog =
    allNormLogs.length > 0 ? symmetricTrimmedMean(allNormLogs, cfg.trim_fraction) : Math.log(0.25);
  const globalAnchorMult = round4(clamp(Math.exp(globalLog), cfg.peer_mult_min, cfg.peer_mult_max));

  // 3. Sector-level Empirical-Bayes shrinkage in log space.
  const sectorShrunkLog = new Map<SectorName, number>();
  const sectorRawLog = new Map<SectorName, number>();
  for (const sector of SECTOR_ORDER) {
    const vals = normBySector.get(sector) ?? [];
    const rawLog = vals.length > 0 ? symmetricTrimmedMean(vals, cfg.trim_fraction) : globalLog;
    const shrunkLog =
      vals.length > 0
        ? (vals.length * rawLog + cfg.sector_prior_weight * globalLog) /
          (vals.length + cfg.sector_prior_weight)
        : globalLog;
    sectorRawLog.set(sector, rawLog);
    sectorShrunkLog.set(sector, shrunkLog);
  }

  // 4. Empirical Bear / Bull interquartile residual spread per sector (fallback to global if n < 5).
  const residsBySector = new Map<SectorName, number[]>();
  const allResids: number[] = [];
  for (const o of obsWithNorm) {
    const resid = o.normLog - (sectorShrunkLog.get(o.sector) ?? globalLog);
    allResids.push(resid);
    const arr = residsBySector.get(o.sector);
    if (arr) arr.push(resid);
    else residsBySector.set(o.sector, [resid]);
  }
  allResids.sort((a, b) => a - b);
  const globalP25 = sortedQuantile(allResids, 0.25);
  const globalP75 = sortedQuantile(allResids, 0.75);
  const globalBearFactor = round4(clamp(Math.exp(globalP25), cfg.bear_factor_min, cfg.bear_factor_max));
  const globalBullFactor = round4(clamp(Math.exp(globalP75), cfg.bull_factor_min, cfg.bull_factor_max));

  const sectors: SectorCalibration[] = SECTOR_ORDER.map((sector) => {
    const vals = normBySector.get(sector) ?? [];
    const rawLog = sectorRawLog.get(sector) ?? globalLog;
    const shrunkLog = sectorShrunkLog.get(sector) ?? globalLog;
    const secResids = [...(residsBySector.get(sector) ?? [])].sort((a, b) => a - b);
    const p25 = secResids.length >= 5 ? sortedQuantile(secResids, 0.25) : globalP25;
    const p75 = secResids.length >= 5 ? sortedQuantile(secResids, 0.75) : globalP75;
    return {
      sector,
      peer_count: vals.length,
      raw_anchor_mult: round4(Math.exp(rawLog)),
      shrunk_log_mult: round4(shrunkLog),
      calibrated_mult: round4(clamp(Math.exp(shrunkLog), cfg.peer_mult_min, cfg.peer_mult_max)),
      bear_factor: round4(clamp(Math.exp(p25), cfg.bear_factor_min, cfg.bear_factor_max)),
      bull_factor: round4(clamp(Math.exp(p75), cfg.bull_factor_min, cfg.bull_factor_max)),
    };
  });

  // 5. Category-level Empirical-Bayes shrinkage against parent sector log multiple.
  const catSet = new Set<string>(allCategoryNames);
  catSet.add('Uncategorized');
  const categories: Record<string, CategoryCalibration> = {};

  for (const category of [...catSet].sort(compareLex)) {
    const sector = classifySector(category === 'Uncategorized' ? null : category);
    const secLog = sectorShrunkLog.get(sector) ?? globalLog;
    const vals = normByCategory.get(category) ?? [];
    let method: CategoryCalibration['method'];
    let rawAnchor: number | null = null;
    let shrunkLog: number;

    if (vals.length >= 3) {
      const rawLog = symmetricTrimmedMean(vals, cfg.trim_fraction);
      rawAnchor = round4(Math.exp(rawLog));
      shrunkLog =
        (vals.length * rawLog + cfg.category_prior_weight * secLog) /
        (vals.length + cfg.category_prior_weight);
      method = 'category';
    } else if (vals.length === 2) {
      const rawLog = (vals[0]! + vals[1]!) / 2;
      rawAnchor = round4(Math.exp(rawLog));
      shrunkLog =
        (2 * rawLog + cfg.thin_category_prior_weight * secLog) /
        (2 + cfg.thin_category_prior_weight);
      method = 'thin-category';
    } else {
      rawAnchor = vals.length === 1 ? round4(Math.exp(vals[0]!)) : null;
      shrunkLog = secLog;
      method = 'sector-prior';
    }

    categories[category] = {
      category,
      sector,
      peer_count: vals.length,
      method,
      raw_anchor_mult: rawAnchor,
      peer_mult: round4(clamp(Math.exp(shrunkLog), cfg.peer_mult_min, cfg.peer_mult_max)),
    };
  }

  return {
    global_peer_count: obs.length,
    raw_elasticity: round4(rawElasticity),
    scale_elasticity: scaleElasticity,
    global_log_mult: round4(globalLog),
    global_anchor_mult: globalAnchorMult,
    global_bear_factor: globalBearFactor,
    global_bull_factor: globalBullFactor,
    sectors,
    categories,
  };
}

/** Select up to 3 nearest live-token comparable peers prioritizing exact category, then sector. */
export function selectNearestLiveComps(
  target: SnapshotProtocol,
  eligiblePeers: readonly SnapshotProtocol[],
  limit = 3,
): LiveCompRef[] {
  const targetLogTvl = Math.log(Math.max(target.tvl_usd, 1));
  const targetCat = target.category ?? 'Uncategorized';
  const targetSec = classifySector(target.category);

  const byDist = (a: SnapshotProtocol, b: SnapshotProtocol): number => {
    const da = Math.abs(Math.log(Math.max(a.tvl_usd, 1)) - targetLogTvl);
    const db = Math.abs(Math.log(Math.max(b.tvl_usd, 1)) - targetLogTvl);
    if (Math.abs(da - db) > 1e-12) return da - db;
    return compareLex(a.slug, b.slug);
  };

  const chosen: LiveCompRef[] = [];
  const used = new Set<string>([target.slug]);

  const addFrom = (pool: SnapshotProtocol[], level: LiveCompRef['match_level']): void => {
    const sorted = pool.filter((p) => !used.has(p.slug)).sort(byDist);
    for (const peer of sorted) {
      if (chosen.length >= limit) break;
      used.add(peer.slug);
      chosen.push({
        slug: peer.slug,
        name: peer.name,
        symbol: peer.symbol,
        category: peer.category,
        tvl_usd: peer.tvl_usd,
        mcap_usd: peer.mcap_usd!,
        mcap_tvl_ratio: round4(peer.mcap_usd! / peer.tvl_usd),
        match_level: level,
      });
    }
  };

  addFrom(
    eligiblePeers.filter((p) => (p.category ?? 'Uncategorized') === targetCat),
    'category',
  );
  if (chosen.length < limit) {
    addFrom(
      eligiblePeers.filter((p) => classifySector(p.category) === targetSec),
      'sector',
    );
  }
  if (chosen.length < limit) {
    addFrom([...eligiblePeers], 'global');
  }
  return chosen;
}

/** Average-tie rank vector for Spearman rank correlation. */
function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((v, idx) => ({ v, idx })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.v === indexed[i]!.v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k]!.idx] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Spearman rank correlation between two equal-length numeric series. */
export function spearmanCorrelation(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const rx = averageRanks(xs);
  const ry = averageRanks(ys);
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += rx[i]!;
    my += ry[i]!;
  }
  mx /= n;
  my /= n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i]! - mx;
    const dy = ry[i]! - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den > 0 ? num / den : 0;
}

/**
 * Full Leave-One-Out Cross-Validation across all eligible live peers.
 * Refits scale elasticity and hierarchical log-space calibration on the remaining n-1 peers
 * before scoring each held-out peer with the exact valuation engine.
 */
export function runLivePeerLoocv(
  eligiblePeers: readonly SnapshotProtocol[],
  allCategoryNames: readonly string[],
  asOf: string,
  cfg: RadarConfig = RADAR_CONFIG,
): { metrics: LoocvMetrics; liveAuditRows: LivePeerAuditRow[] } {
  const absErrors: number[] = [];
  const preds: number[] = [];
  const actuals: number[] = [];
  let within2x = 0;
  let within3x = 0;

  const liveAuditRows: LivePeerAuditRow[] = [];

  for (let i = 0; i < eligiblePeers.length; i++) {
    const heldOut = eligiblePeers[i]!;
    const train = eligiblePeers.filter((_, idx) => idx !== i);
    const looCal = fitPeerCalibration(train, allCategoryNames, cfg);
    const scored = scoreProtocol(heldOut, asOf, looCal, cfg);
    const predUsd = scored.implied_value_usd;
    const actualUsd = heldOut.mcap_usd!;
    const ratio = predUsd / actualUsd;
    const absErr = Math.abs(Math.log(ratio));
    const ok2 = ratio >= 0.5 && ratio <= 2.0;
    const ok3 = ratio >= 1 / 3 && ratio <= 3.0;

    absErrors.push(absErr);
    preds.push(predUsd);
    actuals.push(actualUsd);
    if (ok2) within2x++;
    if (ok3) within3x++;

    liveAuditRows.push({
      slug: heldOut.slug,
      name: heldOut.name,
      symbol: heldOut.symbol,
      category: heldOut.category,
      sector: classifySector(heldOut.category),
      chains: [...heldOut.chains],
      tvl_usd: heldOut.tvl_usd,
      mcap_usd: actualUsd,
      mcap_tvl_ratio: round4(actualUsd / heldOut.tvl_usd),
      loocv_pred_usd: predUsd,
      abs_log_error: round4(absErr),
      within_2x: ok2,
      change_7d: heldOut.change_7d,
    });
  }

  liveAuditRows.sort((a, b) => {
    if (b.mcap_usd !== a.mcap_usd) return b.mcap_usd - a.mcap_usd;
    return compareLex(a.slug, b.slug);
  });

  const sortedErr = [...absErrors].sort((a, b) => a - b);
  const meanErr =
    absErrors.length > 0 ? absErrors.reduce((s, v) => s + v, 0) / absErrors.length : 0;
  const medianErr = sortedQuantile(sortedErr, 0.5);
  const n = eligiblePeers.length;

  const metrics: LoocvMetrics = {
    peer_count: n,
    mean_abs_log_error: round4(meanErr),
    median_abs_log_error: round4(medianErr),
    within_2x_count: within2x,
    within_2x_pct: n > 0 ? round4((within2x / n) * 100) : 0,
    within_3x_count: within3x,
    within_3x_pct: n > 0 ? round4((within3x / n) * 100) : 0,
    spearman_rho: round4(spearmanCorrelation(preds, actuals)),
  };

  return { metrics, liveAuditRows };
}
