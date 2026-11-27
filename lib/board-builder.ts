// Token Launch Radar (radar-5.0) — Snapshot Parser, Sibling Hygiene, Board Builder & Gate Validator.

import {
  type BoardRow,
  RADAR_CONFIG,
  type RadarConfig,
  type RadarPayload,
  type Snapshot,
  SnapshotError,
  type SnapshotProtocol,
  compareLex,
  round2,
  round4,
} from './types.ts';
import {
  classifySector,
  fitPeerCalibration,
  isEligibleLivePeer,
  isPreToken,
  runLivePeerLoocv,
  selectNearestLiveComps,
  sortedQuantile,
} from './calibration.ts';
import { computeTokenlessDays, scoreProtocol } from './valuation.ts';
import { buildFarmPlan } from './farm-planner.ts';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_PATTERN = /^[^\s]{1,128}$/;
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

const EXCLUDED_EARLY_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Extract the hyphenated leading slug root (at least 4 chars before the first hyphen), or null. */
function hyphenatedRoot(slug: string): string | null {
  const dash = slug.indexOf('-');
  if (dash < 4) return null;
  return slug.slice(0, dash);
}

/** Collect all leading roots (>= 4 chars) from live-token protocols in the snapshot. */
function buildLiveSlugRoots(liveProtocols: readonly SnapshotProtocol[]): Set<string> {
  const roots = new Set<string>();
  for (const p of liveProtocols) {
    const dash = p.slug.indexOf('-');
    const root = dash >= 0 ? p.slug.slice(0, dash) : p.slug;
    if (root.length >= 4) roots.add(root);
  }
  return roots;
}

/** Strict parser and validator for the sealed DefiLlama snapshot JSON. */
export function parseSnapshot(rawText: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new SnapshotError(`invalid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SnapshotError('snapshot root must be an object');
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.as_of !== 'string' || !DATE_PATTERN.test(obj.as_of)) {
    throw new SnapshotError('snapshot.as_of must be YYYY-MM-DD');
  }
  if (typeof obj.source !== 'string' || obj.source.trim().length === 0) {
    throw new SnapshotError('snapshot.source must be a non-empty string');
  }
  if (typeof obj.floor_usd !== 'number' || !Number.isSafeInteger(obj.floor_usd) || obj.floor_usd <= 0) {
    throw new SnapshotError('snapshot.floor_usd must be a positive integer');
  }
  if (!Array.isArray(obj.protocols) || obj.protocols.length === 0) {
    throw new SnapshotError('snapshot.protocols must be a non-empty array');
  }
  if (!Array.isArray(obj.watchlist) || !obj.watchlist.every((s) => typeof s === 'string' && s.length > 0)) {
    throw new SnapshotError('snapshot.watchlist must be an array of non-empty slug strings');
  }

  const protocols: SnapshotProtocol[] = obj.protocols.map((item, idx) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new SnapshotError(`snapshot.protocols[${idx}] must be an object`);
    }
    const r = item as Record<string, unknown>;
    if (typeof r.slug !== 'string' || !SLUG_PATTERN.test(r.slug)) {
      throw new SnapshotError(`snapshot.protocols[${idx}].slug invalid`);
    }
    if (typeof r.name !== 'string' || r.name.trim().length === 0) {
      throw new SnapshotError(`snapshot.protocols[${idx}].name invalid`);
    }
    if (r.category !== null && typeof r.category !== 'string') {
      throw new SnapshotError(`snapshot.protocols[${idx}].category invalid`);
    }
    if (!Array.isArray(r.chains) || !r.chains.every((c) => typeof c === 'string')) {
      throw new SnapshotError(`snapshot.protocols[${idx}].chains invalid`);
    }
    if (typeof r.tvl_usd !== 'number' || !Number.isFinite(r.tvl_usd) || r.tvl_usd < 0) {
      throw new SnapshotError(`snapshot.protocols[${idx}].tvl_usd invalid`);
    }
    if (r.change_7d !== null && (typeof r.change_7d !== 'number' || !Number.isFinite(r.change_7d))) {
      throw new SnapshotError(`snapshot.protocols[${idx}].change_7d invalid`);
    }
    if (r.mcap_usd !== null && (typeof r.mcap_usd !== 'number' || !Number.isFinite(r.mcap_usd))) {
      throw new SnapshotError(`snapshot.protocols[${idx}].mcap_usd invalid`);
    }
    if (r.listed_at !== null && typeof r.listed_at !== 'string') {
      throw new SnapshotError(`snapshot.protocols[${idx}].listed_at invalid`);
    }
    if (r.gecko_id !== null && typeof r.gecko_id !== 'string') {
      throw new SnapshotError(`snapshot.protocols[${idx}].gecko_id invalid`);
    }
    if (r.symbol !== null && typeof r.symbol !== 'string') {
      throw new SnapshotError(`snapshot.protocols[${idx}].symbol invalid`);
    }
    return {
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: [...r.chains],
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      gecko_id: r.gecko_id,
      symbol: r.symbol,
    };
  });

  return {
    as_of: obj.as_of,
    source: obj.source,
    floor_usd: obj.floor_usd,
    protocols,
    watchlist: [...obj.watchlist],
  };
}

function passesBaseEarlyHygiene(p: SnapshotProtocol, floorUsd: number): boolean {
  if (!isPreToken(p)) return false;
  if (p.tvl_usd >= floorUsd) return false;
  if (p.category !== null && EXCLUDED_EARLY_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Build the complete radar-5.0 ranked board, live-peer LOOCV audit, and dashboard payload. */
export function buildRadar(
  snapshot: Snapshot,
  cfg: RadarConfig = RADAR_CONFIG,
): { board: BoardRow[]; payload: RadarPayload } {
  const allCategories = [...new Set(snapshot.protocols.map((p) => p.category ?? 'Uncategorized'))].sort(compareLex);
  const liveAll = snapshot.protocols.filter((p) => !isPreToken(p));
  const eligiblePeers = liveAll.filter(isEligibleLivePeer);
  const liveRoots = buildLiveSlugRoots(liveAll);

  const calibration = fitPeerCalibration(eligiblePeers, allCategories, cfg);
  const { metrics: loocv, liveAuditRows } = runLivePeerLoocv(
    eligiblePeers,
    allCategories,
    snapshot.as_of,
    cfg,
  );

  const bySlug = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) bySlug.set(p.slug, p);

  const watchlistSet = new Set(snapshot.watchlist);
  const selected: Array<{ proto: SnapshotProtocol; cohort: 'watchlist' | 'early' }> = [];

  for (const slug of snapshot.watchlist) {
    const proto = bySlug.get(slug);
    if (proto) selected.push({ proto, cohort: 'watchlist' });
  }

  const siblingFilteredSlugs: string[] = [];
  for (const p of snapshot.protocols) {
    if (watchlistSet.has(p.slug)) continue;
    if (!passesBaseEarlyHygiene(p, snapshot.floor_usd)) continue;
    const root = hyphenatedRoot(p.slug);
    if (root !== null && liveRoots.has(root)) {
      siblingFilteredSlugs.push(p.slug);
      continue;
    }
    selected.push({ proto: p, cohort: 'early' });
  }
  siblingFilteredSlugs.sort(compareLex);

  const scored: BoardRow[] = selected.map(({ proto, cohort }) => {
    const val = scoreProtocol(proto, snapshot.as_of, calibration, cfg);
    const days = computeTokenlessDays(snapshot.as_of, proto.listed_at);
    const plan = buildFarmPlan(proto, days);
    const comps = selectNearestLiveComps(proto, eligiblePeers, 3);
    return {
      rank: 0,
      slug: proto.slug,
      name: proto.name,
      category: proto.category,
      sector: classifySector(proto.category),
      chains: [...proto.chains],
      tvl_usd: proto.tvl_usd,
      change_7d: proto.change_7d,
      mcap_usd: proto.mcap_usd,
      listed_at: proto.listed_at,
      gecko_id: proto.gecko_id,
      symbol: proto.symbol,
      cohort,
      token_status: 'pre-token',
      tokenless_days: days,
      implied_value_usd: val.implied_value_usd,
      range: val.range,
      model: val.breakdown,
      comps,
      farm_summary: plan.summary,
      farm_steps: plan.strings,
    };
  });

  // Deterministic ranking: descending implied_value_usd, ascending slug tie-breaker.
  scored.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    return compareLex(a.slug, b.slug);
  });

  for (let i = 0; i < scored.length; i++) {
    scored[i]!.rank = i + 1;
  }

  let totalTvl = 0;
  let totalImplied = 0;
  const ratios: number[] = [];
  const gases: number[] = [];
  let earlyCount = 0;
  for (const row of scored) {
    totalTvl += row.tvl_usd;
    totalImplied += row.implied_value_usd;
    if (row.tvl_usd > 0) ratios.push(row.implied_value_usd / row.tvl_usd);
    gases.push(row.farm_summary.est_gas_usd);
    if (row.cohort === 'early') earlyCount++;
  }
  ratios.sort((a, b) => a - b);
  gases.sort((a, b) => a - b);

  const payload: RadarPayload = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    config: cfg,
    calibration,
    loocv,
    summary: {
      snapshot_protocols: snapshot.protocols.length,
      watchlist_size: snapshot.watchlist.length,
      board_size: scored.length,
      early_size: earlyCount,
      live_total_count: liveAll.length,
      live_peer_count: eligiblePeers.length,
      sibling_filtered_count: siblingFilteredSlugs.length,
      sibling_filtered_slugs: siblingFilteredSlugs,
      total_board_tvl_usd: totalTvl,
      total_implied_value_usd: totalImplied,
      median_implied_tvl_ratio: round4(sortedQuantile(ratios, 0.5)),
      median_farm_gas_usd: round2(sortedQuantile(gases, 0.5)),
    },
    rows: scored.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      sector: r.sector,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      cohort: r.cohort,
      tokenless_days: r.tokenless_days,
      implied_value_usd: r.implied_value_usd,
      range: r.range,
      model: r.model,
      comps: r.comps,
      farm_summary: r.farm_summary,
      farm_steps: r.farm_steps,
    })),
    live: liveAuditRows,
  };

  return { board: scored, payload };
}

/** Validate the complete board against every gate contract invariant. Returns null if valid. */
export function boardIssue(board: readonly BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board row count ${board.length} outside [100, 4000]`;
  }
  const knownSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seenSlugs = new Set<string>();
  const seenRanks = new Set<number>();
  const distinctValues = new Set<number>();

  let prevValue = Infinity;
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (!SLUG_PATTERN.test(row.slug) || !knownSlugs.has(row.slug)) {
      return `invalid or unknown slug: ${row.slug}`;
    }
    if (seenSlugs.has(row.slug)) return `duplicate slug: ${row.slug}`;
    seenSlugs.add(row.slug);

    if (typeof row.name !== 'string' || row.name.trim().length === 0) {
      return `empty name for ${row.slug}`;
    }
    if (!Number.isSafeInteger(row.rank) || row.rank !== i + 1 || seenRanks.has(row.rank)) {
      return `rank sequence invalid at index ${i}: got ${row.rank}`;
    }
    seenRanks.add(row.rank);

    if (
      !Number.isSafeInteger(row.implied_value_usd) ||
      row.implied_value_usd <= 0 ||
      row.implied_value_usd > 100_000_000_000_000
    ) {
      return `invalid implied_value_usd for ${row.slug}: ${row.implied_value_usd}`;
    }
    if (row.implied_value_usd > prevValue) {
      return `implied_value_usd increased at rank ${row.rank} (${row.slug})`;
    }
    prevValue = row.implied_value_usd;
    distinctValues.add(row.implied_value_usd);

    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `farm_steps count invalid for ${row.slug}`;
    }
    for (let s = 0; s < row.farm_steps.length; s++) {
      const trimmed = row.farm_steps[s]!.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `farm_steps[${s}] length ${trimmed.length} outside [20, 600] for ${row.slug}`;
      }
    }
  }

  if (distinctValues.size < 2) {
    return 'board implied_value_usd values are constant';
  }

  for (const wlSlug of snapshot.watchlist) {
    if (!seenSlugs.has(wlSlug)) {
      return `missing watchlist slug: ${wlSlug}`;
    }
  }

  return null;
}

/** Serialize the dashboard payload cleanly for data.js (escaping </script> safely). */
export function serializeDataScript(payload: RadarPayload): string {
  const safeJson = JSON.stringify(payload).replace(/<\//g, '<\\/');
  return `window.RADAR = ${safeJson};\n`;
}
