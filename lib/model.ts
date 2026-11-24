// Token Launch Radar (r4) — Value Model, Peer Calibration, and Farm Plan Engine.
//
// Reads the sealed DefiLlama protocol snapshot and produces:
//   1. A ranked pre-token board covering 100% of the snapshot watchlist plus every clean
//      early-stage pre-token protocol below the watchlist floor.
//   2. A transparent, recomputable comparables valuation model derived strictly from
//      snapshot figures (TVL, 7-day growth, token-less duration as_of - listed_at,
//      live-token peer multiples by sector/category, TVL scale, and chain footprint).
//   3. A seven-step, chain- and category-tailored farm plan with explicit gas, capital,
//      and timeframe figures for every ranked protocol.
//   4. A separated live-token peer dataset for peer calibration and market reference.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConfig {
  version: string;
  peer_clip_min: number;
  peer_clip_max: number;
  peer_trim_frac: number;
  peer_sector_prior_k: number;
  peer_cat_prior_k: number;
  peer_thin_prior_k: number;
  peer_mult_min: number;
  peer_mult_max: number;
  growth_floor: number;
  growth_cap: number;
  growth_knee: number;
  growth_pos_slope_low: number;
  growth_pos_slope_high: number;
  growth_neg_slope: number;
  growth_null_mult: number;
  duration_base: number;
  duration_span: number;
  duration_cap_days: number;
  duration_scale_days: number;
  duration_null_mult: number;
  scale_anchor_usd: number;
  scale_exponent: number;
  scale_min: number;
  scale_max: number;
  chain_step: number;
  chain_extra_cap: number;
}

export const MODEL_CONFIG: ModelConfig = {
  version: 'radar-4.1',
  peer_clip_min: 0.02,
  peer_clip_max: 2.0,
  peer_trim_frac: 0.15,
  peer_sector_prior_k: 6,
  peer_cat_prior_k: 4,
  peer_thin_prior_k: 8,
  peer_mult_min: 0.08,
  peer_mult_max: 0.72,
  growth_floor: -65,
  growth_cap: 150,
  growth_knee: 50,
  growth_pos_slope_low: 0.0075,
  growth_pos_slope_high: 0.0035,
  growth_neg_slope: 0.006,
  growth_null_mult: 0.95,
  duration_base: 0.72,
  duration_span: 0.38,
  duration_cap_days: 1460,
  duration_scale_days: 90,
  duration_null_mult: 0.85,
  scale_anchor_usd: 250_000_000,
  scale_exponent: -0.06,
  scale_min: 0.8,
  scale_max: 1.18,
  chain_step: 0.025,
  chain_extra_cap: 6,
};

export interface SectorCalibration {
  sector: string;
  peer_count: number;
  raw_trimmed_median: number;
  calibrated_mult: number;
}

export interface CategoryCalibration {
  category: string;
  sector: string;
  peer_count: number;
  method: 'category' | 'thin-category' | 'sector-fallback';
  raw_trimmed_median: number | null;
  peer_mult: number;
}

export interface PeerCalibration {
  global_peer_count: number;
  global_trimmed_median: number;
  sectors: SectorCalibration[];
  categories: Record<string, CategoryCalibration>;
}

export interface ModelBreakdown {
  sector: string;
  peer_source: string;
  peer_mult: number;
  growth_pct: number | null;
  growth_mult: number;
  tokenless_days: number | null;
  duration_mult: number;
  scale_mult: number;
  chain_count: number;
  chain_mult: number;
}

export interface FarmStepDetail {
  title: string;
  action: string;
  cost: string;
  timeframe: string;
}

export interface FarmSummary {
  capital_usd: number;
  est_gas_usd: number;
  hold_days: number;
  active_chain: string;
  weekly_minutes: number;
  dilution_tier: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  sector: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  cohort: 'watchlist' | 'early';
  token_status: 'pre-token';
  tokenless_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_summary: FarmSummary;
  farm_steps: string[];
}

export interface LivePeerRow {
  slug: string;
  name: string;
  category: string | null;
  sector: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  mcap_tvl_ratio: number | null;
  change_7d: number | null;
  symbol: string | null;
  in_calibration: boolean;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  config: ModelConfig;
  calibration: PeerCalibration;
  summary: {
    snapshot_protocols: number;
    watchlist_size: number;
    board_size: number;
    early_size: number;
    live_peer_count: number;
    total_board_tvl_usd: number;
    total_implied_value_usd: number;
    median_implied_tvl_ratio: number;
  };
  rows: Array<{
    rank: number;
    slug: string;
    name: string;
    category: string | null;
    sector: string;
    chains: string[];
    tvl_usd: number;
    change_7d: number | null;
    listed_at: string | null;
    cohort: 'watchlist' | 'early';
    tokenless_days: number | null;
    implied_value_usd: number;
    model: ModelBreakdown;
    farm_summary: FarmSummary;
    farm_steps: string[];
  }>;
  live: LivePeerRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
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
const EXCLUDED_PEER_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
]);

export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function compareSlug(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankableEarly(p: SnapshotProtocol, floorUsd: number): boolean {
  if (!isPreToken(p)) return false;
  if (p.tvl_usd >= floorUsd) return false;
  if (p.category !== null && EXCLUDED_EARLY_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Deterministic economic sector family derived solely from DefiLlama category. */
export function sectorOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (/\b(lending|cdp|collateral|stablecoin)\b/.test(c) || c.includes('lending') || c.includes('stablecoin')) {
    return 'Lending & Credit';
  }
  if (/\b(dexs?|derivatives?|perpetuals?|options?|basis|prediction|liquidity manager)\b/.test(c)) {
    return 'Trading & Liquidity';
  }
  if (/\b(curators?|allocator|yield|farm|farming|indexes|cedefi)\b/.test(c)) {
    return 'Asset Mgmt & Yield';
  }
  if (/\b(staking|restaking|restaked|btc|governance)\b/.test(c)) {
    return 'Staking & Security';
  }
  return 'RWA & Infrastructure';
}

/** Exact whole-day count from listed_at to as_of (token-less duration), or null if unlisted. */
export function tokenlessDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** Symmetric trimmed median: drops `trimFrac` from each tail when n >= 5, then takes median. */
export function trimmedMedian(values: readonly number[], trimFrac: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const k = sorted.length >= 5 ? Math.floor(sorted.length * trimFrac) : 0;
  const core = sorted.slice(k, sorted.length - k);
  const mid = Math.floor(core.length / 2);
  return core.length % 2 === 1 ? core[mid]! : (core[mid - 1]! + core[mid]!) / 2;
}

/** Calibrate live-token Mcap/TVL peer multiples hierarchically (Global -> Sector -> Category). */
export function calibratePeers(snapshot: Snapshot, cfg: ModelConfig = MODEL_CONFIG): PeerCalibration {
  const eligible = snapshot.protocols.filter(
    (p) =>
      !isPreToken(p) &&
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.tvl_usd > 0 &&
      (p.category === null || !EXCLUDED_PEER_CATEGORIES.has(p.category)),
  );

  const allRatios = eligible.map((p) => clamp(p.mcap_usd! / p.tvl_usd, cfg.peer_clip_min, cfg.peer_clip_max));
  const globalMed = allRatios.length > 0 ? trimmedMedian(allRatios, cfg.peer_trim_frac) : 0.25;

  const bySector = new Map<string, number[]>();
  const byCategory = new Map<string, number[]>();
  for (const p of eligible) {
    const ratio = clamp(p.mcap_usd! / p.tvl_usd, cfg.peer_clip_min, cfg.peer_clip_max);
    const sec = sectorOf(p.category);
    const cat = p.category ?? 'Uncategorized';
    const sList = bySector.get(sec);
    if (sList) sList.push(ratio);
    else bySector.set(sec, [ratio]);
    const cList = byCategory.get(cat);
    if (cList) cList.push(ratio);
    else byCategory.set(cat, [ratio]);
  }

  const sectorNames = [
    'Lending & Credit',
    'Trading & Liquidity',
    'Asset Mgmt & Yield',
    'Staking & Security',
    'RWA & Infrastructure',
  ];
  const sectorMap = new Map<string, number>();
  const sectors: SectorCalibration[] = sectorNames.map((sector) => {
    const vals = bySector.get(sector) ?? [];
    const raw = vals.length > 0 ? trimmedMedian(vals, cfg.peer_trim_frac) : globalMed;
    const shrunk =
      vals.length > 0
        ? (vals.length * raw + cfg.peer_sector_prior_k * globalMed) / (vals.length + cfg.peer_sector_prior_k)
        : globalMed;
    const mult = round4(clamp(shrunk, cfg.peer_mult_min, cfg.peer_mult_max));
    sectorMap.set(sector, mult);
    return {
      sector,
      peer_count: vals.length,
      raw_trimmed_median: round4(raw),
      calibrated_mult: mult,
    };
  });

  const allCategories = new Set<string>();
  for (const p of snapshot.protocols) allCategories.add(p.category ?? 'Uncategorized');

  const categories: Record<string, CategoryCalibration> = {};
  for (const category of [...allCategories].sort(compareSlug)) {
    const sector = sectorOf(category === 'Uncategorized' ? null : category);
    const sectorPrior = sectorMap.get(sector) ?? round4(globalMed);
    const vals = byCategory.get(category) ?? [];
    let method: CategoryCalibration['method'];
    let raw: number | null = null;
    let peerMult: number;
    if (vals.length >= 3) {
      raw = round4(trimmedMedian(vals, cfg.peer_trim_frac));
      const shrunk = (vals.length * raw + cfg.peer_cat_prior_k * sectorPrior) / (vals.length + cfg.peer_cat_prior_k);
      peerMult = round4(clamp(shrunk, cfg.peer_mult_min, cfg.peer_mult_max));
      method = 'category';
    } else if (vals.length === 2) {
      raw = round4(trimmedMedian(vals, cfg.peer_trim_frac));
      const shrunk = (vals.length * raw + cfg.peer_thin_prior_k * sectorPrior) / (vals.length + cfg.peer_thin_prior_k);
      peerMult = round4(clamp(shrunk, cfg.peer_mult_min, cfg.peer_mult_max));
      method = 'thin-category';
    } else {
      raw = vals.length === 1 ? round4(vals[0]!) : null;
      peerMult = sectorPrior;
      method = 'sector-fallback';
    }
    categories[category] = {
      category,
      sector,
      peer_count: vals.length,
      method,
      raw_trimmed_median: raw,
      peer_mult: peerMult,
    };
  }

  return {
    global_peer_count: eligible.length,
    global_trimmed_median: round4(globalMed),
    sectors,
    categories,
  };
}

/** Compute transparent, recomputable implied value and every rounded multiplier for one protocol. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  calibration: PeerCalibration,
  cfg: ModelConfig = MODEL_CONFIG,
): { implied: number; breakdown: ModelBreakdown } {
  const catKey = p.category ?? 'Uncategorized';
  const sector = sectorOf(p.category);
  const catCal = calibration.categories[catKey];
  const peerMult = catCal ? catCal.peer_mult : round4(clamp(calibration.global_trimmed_median, cfg.peer_mult_min, cfg.peer_mult_max));
  const peerSource = !catCal
    ? `global prior (n=${calibration.global_peer_count})`
    : catCal.method === 'category'
      ? `category trimmed median (n=${catCal.peer_count})`
      : catCal.method === 'thin-category'
        ? `thin category shrunk to ${sector} (n=${catCal.peer_count})`
        : `${sector} sector prior (cat n=${catCal.peer_count})`;

  // Growth multiplier: responsive asymmetric curve, explicit discount for null change_7d.
  let growthPct: number | null = null;
  let growthMult: number;
  if (p.change_7d === null || !Number.isFinite(p.change_7d)) {
    growthMult = round4(cfg.growth_null_mult);
  } else {
    growthPct = round4(clamp(p.change_7d, cfg.growth_floor, cfg.growth_cap));
    if (growthPct >= 0) {
      const boost =
        growthPct <= cfg.growth_knee
          ? growthPct * cfg.growth_pos_slope_low
          : cfg.growth_knee * cfg.growth_pos_slope_low + (growthPct - cfg.growth_knee) * cfg.growth_pos_slope_high;
      growthMult = round4(1 + boost);
    } else {
      growthMult = round4(1 + growthPct * cfg.growth_neg_slope);
    }
  }

  // Explicit token-less duration multiplier from as_of - listed_at.
  const days = tokenlessDays(asOf, p.listed_at);
  let durationMult: number;
  if (days === null) {
    durationMult = round4(cfg.duration_null_mult);
  } else {
    const capped = Math.min(days, cfg.duration_cap_days);
    const norm = Math.log1p(capped / cfg.duration_scale_days) / Math.log1p(cfg.duration_cap_days / cfg.duration_scale_days);
    durationMult = round4(cfg.duration_base + cfg.duration_span * norm);
  }

  // TVL scale elasticity (larger protocols carry slightly tighter Mcap/TVL multiples).
  const ratioToAnchor = Math.max(p.tvl_usd, 1) / cfg.scale_anchor_usd;
  const scaleMult = round4(clamp(Math.pow(ratioToAnchor, cfg.scale_exponent), cfg.scale_min, cfg.scale_max));

  // Multi-chain distribution footprint (1 chain = 1.0000x baseline).
  const chainCount = p.chains.length;
  const extraChains = Math.min(Math.max(chainCount - 1, 0), cfg.chain_extra_cap);
  const chainMult = round4(1 + cfg.chain_step * extraChains);

  // Multiply using the exact rounded 4-decimal multipliers so dashboard recomputation matches byte-for-byte.
  const implied = Math.max(1, Math.round(p.tvl_usd * peerMult * growthMult * durationMult * scaleMult * chainMult));

  return {
    implied,
    breakdown: {
      sector,
      peer_source: peerSource,
      peer_mult: peerMult,
      growth_pct: growthPct,
      growth_mult: growthMult,
      tokenless_days: days,
      duration_mult: durationMult,
      scale_mult: scaleMult,
      chain_count: chainCount,
      chain_mult: chainMult,
    },
  };
}

interface ChainProfile {
  chain: string;
  gasToken: string;
  txCostUsd: number;
  bufferUsd: number;
  isLowFee: boolean;
  note: string;
}

const LOW_FEE_L2_CHAINS = new Set([
  'Base',
  'Arbitrum',
  'Optimism',
  'Monad',
  'Ink',
  'Plasma',
  'Mantle',
  'zkSync Era',
  'Polygon',
  'Avalanche',
  'Flare',
  'Plume Mainnet',
  'Berachain',
  'Arc',
  'RISE',
  'Mezo',
  'Abstract',
  'Sonic',
  'Scroll',
  'Linea',
]);

function profileForChain(chain: string): ChainProfile {
  if (chain === 'Ethereum') {
    return {
      chain,
      gasToken: 'ETH',
      txCostUsd: 6.5,
      bufferUsd: 45,
      isLowFee: false,
      note: 'batch transactions off-peak below 10 gwei',
    };
  }
  if (chain === 'Solana') {
    return {
      chain,
      gasToken: 'SOL',
      txCostUsd: 0.03,
      bufferUsd: 10,
      isLowFee: true,
      note: 'keep 0.05 SOL for fees and account rent',
    };
  }
  if (chain === 'Bitcoin' || chain === 'BSquared' || chain === 'Babylon Genesis') {
    return {
      chain,
      gasToken: 'BTC',
      txCostUsd: 5.0,
      bufferUsd: 25,
      isLowFee: false,
      note: 'allow 20-45 minutes for confirmation finality',
    };
  }
  if (chain === 'Binance') {
    return {
      chain,
      gasToken: 'BNB',
      txCostUsd: 0.15,
      bufferUsd: 8,
      isLowFee: true,
      note: 'fast 3-second blocks on BNB Smart Chain',
    };
  }
  if (chain === 'Tron') {
    return {
      chain,
      gasToken: 'TRX',
      txCostUsd: 1.5,
      bufferUsd: 15,
      isLowFee: false,
      note: 'budget TRX energy for TRC-20 approvals',
    };
  }
  if (chain === 'Sui' || chain === 'Algorand' || chain === 'Stellar' || chain === 'Ripple' || chain === 'Noble' || chain === 'Hyperliquid L1' || chain === 'Bittensor') {
    const tokenMap: Record<string, string> = {
      Sui: 'SUI',
      Algorand: 'ALGO',
      Stellar: 'XLM',
      Ripple: 'XRP',
      Noble: 'USDC',
      'Hyperliquid L1': 'USDC',
      Bittensor: 'TAO',
    };
    return {
      chain,
      gasToken: tokenMap[chain] ?? 'native gas',
      txCostUsd: 0.05,
      bufferUsd: 8,
      isLowFee: true,
      note: 'sub-dollar execution with instant finality',
    };
  }
  if (LOW_FEE_L2_CHAINS.has(chain)) {
    return {
      chain,
      gasToken: 'ETH/native gas',
      txCostUsd: 0.2,
      bufferUsd: 10,
      isLowFee: true,
      note: 'low-fee EVM execution suitable for weekly cadence',
    };
  }
  return {
    chain,
    gasToken: 'native gas',
    txCostUsd: 0.4,
    bufferUsd: 12,
    isLowFee: true,
    note: 'confirm RPC endpoint and native gas token before bridging',
  };
}

function selectActiveChain(chains: readonly string[]): { active: ChainProfile; secondary: string | null } {
  if (chains.length === 0) {
    return { active: profileForChain('primary chain'), secondary: null };
  }
  const lowFeeList = chains.filter((c) => profileForChain(c).isLowFee);
  if (lowFeeList.length > 0) {
    const primary = profileForChain(chains[0]!).isLowFee ? chains[0]! : lowFeeList[0]!;
    const sec = lowFeeList.find((c) => c !== primary) ?? null;
    return { active: profileForChain(primary), secondary: sec };
  }
  return { active: profileForChain(chains[0]!), secondary: chains.length > 1 ? chains[1]! : null };
}

function tierForTvl(tvlUsd: number, isHighGas: boolean): { capital: number; dilution: string; posture: string } {
  if (tvlUsd >= 500_000_000) {
    return { capital: 500, dilution: 'Flagship (high dilution)', posture: 'size above dust thresholds so points accrue steadily' };
  }
  if (tvlUsd >= 100_000_000) {
    return { capital: 250, dilution: 'Core Watchlist', posture: 'balanced allocation for multi-epoch scoring' };
  }
  if (tvlUsd >= 50_000_000) {
    return {
      capital: isHighGas ? 250 : 150,
      dilution: 'Mid-Cap Watchlist',
      posture: isHighGas ? 'sized up so L1 gas stays under 12% of capital' : 'meaningful share without over-concentrating capital',
    };
  }
  if (tvlUsd >= 15_000_000) {
    return { capital: isHighGas ? 200 : 100, dilution: 'Early Radar (low dilution)', posture: 'early epoch entry where smaller balances rank higher' };
  }
  return { capital: isHighGas ? 150 : 50, dilution: 'Emerging (risk-capped)', posture: 'strictly cap capital and token approvals on newer contracts' };
}

function holdDaysFor(days: number | null, change7d: number | null): number {
  if (change7d !== null && change7d >= 10) return 60;
  if (days === null) return 45;
  if (days < 180) return 60;
  if (days < 450) return 45;
  return 30;
}

function fmtGas(usd: number): string {
  return usd < 10 ? `$${usd.toFixed(2)}` : `$${Math.round(usd)}`;
}

/** Generate 7 concrete, tailored farm steps and a summary strip for any protocol from snapshot data alone. */
export function buildFarmPlan(
  p: SnapshotProtocol,
  days: number | null,
): { summary: FarmSummary; details: FarmStepDetail[]; strings: string[] } {
  const { active, secondary } = selectActiveChain(p.chains);
  const tier = tierForTvl(p.tvl_usd, !active.isLowFee);
  const hold = holdDaysFor(days, p.change_7d);
  const weeks = Math.max(4, Math.ceil(hold / 7));
  const c = (p.category ?? '').toLowerCase();

  const entryGas = round4(active.txCostUsd * 2.0);
  const touchpoints = active.isLowFee ? weeks : Math.max(1, Math.floor(weeks / 4));
  const recurringGasPerTx = round4(active.txCostUsd * 1.1);
  let recurringTotalGas = round4(recurringGasPerTx * touchpoints);
  const exitGas = round4(active.txCostUsd * 1.8);

  let primaryAction: string;
  let secondaryAction: string;
  let secondaryCost: string;
  let recurringAction: string;
  let exitNote: string;
  let secGas = secondary ? round4(profileForChain(secondary).txCostUsd * 1.5) : round4(active.txCostUsd * 1.2);
  let secIsFree = false;

  if (c.includes('curator')) {
    primaryAction = `Deposit $${tier.capital} of USDC or ETH into ${p.name}'s highest-liquidity curated vault on ${active.chain} after verifying curator fee and market utilization.`;
    if (secondary) {
      secondaryAction = `Mirror a $30 satellite deposit in a ${p.name} vault on ${secondary} to establish multi-chain vault share ownership.`;
      secondaryCost = `~${fmtGas(secGas)} gas (${secondary}) + $30 satellite deposit`;
    } else {
      secondaryAction = `Keep ${p.name} vault receipt shares in the depositing wallet (or an officially whitelisted wrapper only) so curator attribution never breaks.`;
      secondaryCost = '$0 (no extra transactions)';
      secGas = 0;
      secIsFree = true;
    }
    recurringAction = active.isLowFee
      ? `Review vault APY, utilization cap, and epoch leaderboard on ${p.name} weekly; top up $10-$20 every two weeks rather than hopping vaults.`
      : `Monitor vault APY and utilization off-chain weekly; batch one on-chain top-up per month off-peak to keep ${active.chain} gas disciplined.`;
    exitNote = `Redeem ${p.name} vault shares when utilization sits below 90% (allow 10 minutes or a short liquidity queue), then revoke ERC-20 allowances.`;
  } else if (c.includes('allocator')) {
    primaryAction = `Mint $${tier.capital} of ${p.name} receipt shares on ${active.chain} via its core allocator vault and confirm share balance on-chain.`;
    if (secondary) {
      secondaryAction = `Deploy $30 of ${p.name} receipt shares on ${secondary} so activity registers across two networks.`;
      secondaryCost = `~${fmtGas(secGas)} gas (${secondary}) + $30 side allocation`;
    } else {
      secondaryAction = `Check whether ${p.name} credits boosted points for locking or supplying 25% of receipt shares into a partner money market.`;
      secondaryCost = `~${fmtGas(secGas)} gas (optional boost leg)`;
    }
    recurringAction = active.isLowFee
      ? `Confirm share exchange-rate accrual and points multiplier weekly on ${p.name}, adding one small qualifying top-up every 14 days.`
      : `Track exchange-rate accrual off-chain weekly and execute one batched top-up per month during low-gwei hours on ${active.chain}.`;
    exitNote = `Submit a redemption request on ${p.name} (budget 1-7 days if an async withdrawal queue applies) and revoke unlimited approvals.`;
  } else if (/\bdexs?\b/.test(c) || c.includes('liquidity manager')) {
    const lpAmt = Math.round(tier.capital * 0.7);
    const swapAmt = tier.capital - lpAmt;
    primaryAction = `Provide $${lpAmt} to a deep stable-or-major pool on ${p.name} (${active.chain}) and execute two organic swaps totaling $${swapAmt} across distinct pairs.`;
    if (secondary) {
      secondaryAction = `Execute two swaps ($25 each, ~0.10% pool fee) on ${p.name}'s ${secondary} deployment to capture multi-chain trader multipliers.`;
      secondaryCost = `~${fmtGas(secGas)} gas (${secondary}) + ~$0.05 swap fees`;
    } else {
      secondaryAction = `Collect accrued swap fees or tighten your ${p.name} LP range once if spot price drifts, proving active liquidity management.`;
      secondaryCost = `~${fmtGas(secGas)} gas + ~0.05%-0.25% pool fee`;
    }
    recurringAction = active.isLowFee
      ? `Execute one organic swap ($20-$50, ~0.10% fee) on ${p.name} each week to maintain active-trader streak tiers.`
      : `Run one batched swap ($40-$60) every 3-4 weeks during off-peak hours on ${active.chain} while LP fees accrue continuously.`;
    exitNote = `Withdraw LP tokens and accrued fees from ${p.name} on ${active.chain}, swap residual dust back to USDC, and revoke router approvals.`;
  } else if (c.includes('lending') || c.includes('collateral')) {
    const borrowAmt = Math.round(tier.capital * 0.35);
    primaryAction = `Supply $${tier.capital} of USDC or blue-chip collateral on ${p.name} (${active.chain}) and enable collateral mode.`;
    secondaryAction = `Borrow ~$${borrowAmt} (35% LTV, keeping health factor above 1.9) in a correlated asset on ${p.name} to qualify for both supply and borrow tracks.`;
    secondaryCost = `~${fmtGas(secGas)} borrow gas + ~3%-6% APR net borrow spread`;
    recurringAction = active.isLowFee
      ? `Check borrow rate and health factor on ${p.name} weekly; repay $5-$10 of interest every two weeks to log ongoing participation.`
      : `Monitor health factor off-chain weekly and execute one interest repayment per month off-peak on ${active.chain}.`;
    exitNote = `Repay the $${borrowAmt} borrow balance in full on ${p.name}, withdraw your $${tier.capital} collateral, and revoke pool approvals.`;
  } else if (c.includes('cdp') || c.includes('stablecoin')) {
    const mintAmt = Math.round(tier.capital * 0.5);
    primaryAction = `Lock $${tier.capital} of collateral in a ${p.name} vault on ${active.chain} and mint $${mintAmt} of its stable asset at >=180% collateralization.`;
    secondaryAction = `Stake the minted $${mintAmt} inside ${p.name}'s stability pool or paired liquidity pool to earn secondary holding points.`;
    secondaryCost = `~${fmtGas(secGas)} stake gas + minting fee (typically 0%-0.5%)`;
    recurringAction = active.isLowFee
      ? `Check collateral ratio and stability-pool rewards weekly on ${p.name}; claim or compound small rewards bi-weekly.`
      : `Track collateral ratio off-chain weekly and claim stability rewards once per month off-peak on ${active.chain}.`;
    exitNote = `Withdraw from the stability pool, burn the $${mintAmt} debt to close the ${p.name} CDP cleanly, retrieve collateral, and revoke approvals.`;
  } else if (c.includes('deriv') || c.includes('basis') || c.includes('perp') || c.includes('option')) {
    primaryAction = `Deposit $${tier.capital} of USDC margin into ${p.name} on ${active.chain} and open a conservative <=2x maker limit position or delta-neutral basis pair.`;
    secondaryAction = `Cycle one hedged maker position (budget ~0.04% maker/taker fees plus funding drift) to build verified notional volume and open-interest hours.`;
    secondaryCost = `~${fmtGas(secGas)} margin gas + ~$0.40-$1.50 trading fees`;
    recurringAction = active.isLowFee
      ? `Place 1-2 low-leverage maker orders per week on ${p.name} while keeping net directional exposure near neutral.`
      : `Maintain open basis/margin interest continuously and rebalance once every 3-4 weeks off-peak on ${active.chain}.`;
    exitNote = `Close all open derivatives positions on ${p.name}, settle unrealized PnL and funding, withdraw USDC margin, and log total fee drag.`;
  } else if (c.includes('rwa')) {
    primaryAction = `Complete any wallet eligibility check on ${p.name} (${active.chain}), then mint or acquire $${tier.capital} of its yield-bearing RWA token with USDC.`;
    if (secondary) {
      secondaryAction = `Verify whether ${p.name} credits multi-chain balances on ${secondary} and bridge a $25 tranche only if incentivized.`;
      secondaryCost = `~${fmtGas(secGas)} gas (${secondary}) if bridged, else $0`;
    } else {
      secondaryAction = `Hold the ${p.name} RWA token continuously in the minting wallet (avoiding frequent transfers) so daily balance snapshots register cleanly.`;
      secondaryCost = '$0 (pure holding leg)';
      secGas = 0;
      secIsFree = true;
    }
    recurringAction = `Review RWA yield accrual, reserve attestations, and epoch tracker on ${p.name} weekly without triggering extra redemption fees.`;
    recurringTotalGas = 0;
    exitNote = `Submit an RWA redemption back to USDC on ${p.name} (budget T+1 to T+2 settlement window and ~0.05%-0.15% redemption fee if applicable).`;
  } else if (c.includes('restak') || c.includes('stak') || c.includes('btc')) {
    primaryAction = `Stake or restake $${tier.capital} of the native asset (or liquid staking receipt) through ${p.name} on ${active.chain} and delegate to an active operator.`;
    secondaryAction = `Verify operator uptime and commission on ${p.name} and keep the staking receipt in one wallet rather than splitting balances.`;
    secondaryCost = '$0 (off-chain operator verification)';
    secGas = 0;
    secIsFree = true;
    recurringAction = active.isLowFee
      ? `Check operator performance and accrued staking points on ${p.name} weekly; claim or restake epoch rewards bi-weekly.`
      : `Monitor operator uptime off-chain weekly and batch one reward claim at exit to avoid unnecessary ${active.chain} gas.`;
    exitNote = `Initiate unstaking on ${p.name} (plan for a 7-21 day unbonding queue depending on chain rules), claim principal, and revoke approvals.`;
  } else if (c.includes('yield') || c.includes('farm') || c.includes('cedefi') || c.includes('index')) {
    primaryAction = `Deposit $${tier.capital} of USDC or paired base asset into ${p.name}'s highest-TVL audited vault on ${active.chain}.`;
    if (secondary) {
      secondaryAction = `Open a $25 companion vault position on ${p.name} via ${secondary} to qualify across multiple network deployments.`;
      secondaryCost = `~${fmtGas(secGas)} gas (${secondary}) + $25 side vault`;
    } else {
      secondaryAction = `Check ${p.name}'s deposit/performance fee schedule (typically 0%-0.5% deposit or ~10% of yield) and leave shares compounding untouched.`;
      secondaryCost = '$0 (fee audit only)';
      secGas = 0;
      secIsFree = true;
    }
    recurringAction = active.isLowFee
      ? `Harvest or compound vault yield every 14 days on ${p.name} and verify epoch attribution remains active.`
      : `Let vault shares auto-compound untouched and check epoch points off-chain weekly to minimize ${active.chain} gas.`;
    exitNote = `Withdraw principal plus accrued yield from ${p.name} on ${active.chain}, confirm no early-exit fee, and revoke spender approvals.`;
  } else if (c.includes('chain') || c.includes('payment') || c.includes('card')) {
    primaryAction = `Bridge or fund $${tier.capital} onto ${p.name} (${active.chain}) via its official bridge/ramp and execute two native transfers.`;
    secondaryAction = `Interact with at least two distinct ecosystem apps or settlement routes on ${p.name} so your address builds organic contract diversity.`;
    secondaryCost = `~${fmtGas(secGas)} execution gas`;
    recurringAction = active.isLowFee
      ? `Send 2-3 organic transactions per week on ${p.name} across different days to maintain active-week streaks.`
      : `Send 1 batched settlement transaction every 2-3 weeks on ${p.name} to sustain active-month history.`;
    exitNote = `Bridge principal back from ${p.name} via the canonical exit (allow 10 min to 7 days depending on bridge design) and archive tx logs.`;
  } else {
    primaryAction = `Commit $${tier.capital} of USDC into ${p.name}'s core audited contract on ${active.chain} and confirm position receipt on-chain.`;
    secondaryAction = secondary
      ? `Complete a $25 qualifying interaction on ${p.name} via ${secondary} to record multi-chain presence.`
      : `Participate in a second distinct epoch, market, or governance vote on ${p.name} to establish non-sybil engagement.`;
    secondaryCost = `~${fmtGas(secGas)} gas${secondary ? ` (${secondary}) + $25 side leg` : ''}`;
    recurringAction = active.isLowFee
      ? `Execute one qualifying on-chain action on ${p.name} every 7-14 days to maintain active-epoch streaks.`
      : `Monitor epoch snapshots off-chain weekly and submit one batched check-in per month off-peak on ${active.chain}.`;
    exitNote = `Unwind or settle your ${p.name} position cleanly on ${active.chain} after the hold window and revoke unlimited approvals.`;
  }

  const totalGas = round4(active.txCostUsd + entryGas + (secIsFree ? 0 : secGas) + recurringTotalGas + exitGas);
  const holdNote =
    p.change_7d !== null && p.change_7d <= -10
      ? ` Note: 7d TVL dropped ${p.change_7d.toFixed(1)}%, so check pool liquidity depth before extending past ${hold} days.`
      : ` Strategy: ${tier.posture}.`;

  const details: FarmStepDetail[] = [
    {
      title: '1. Dedicated wallet & gas buffer',
      action: `Create an isolated farming wallet for ${p.name} on ${active.chain}, fund $${active.bufferUsd} of ${active.gasToken} (${active.note}), and store keys offline.`,
      cost: `~${fmtGas(active.txCostUsd)} funding gas + $${active.bufferUsd} ${active.gasToken} buffer`,
      timeframe: '10 minutes',
    },
    {
      title: '2. Core capital deployment',
      action: primaryAction,
      cost: `$${tier.capital} capital + ~${fmtGas(entryGas)} entry gas`,
      timeframe: '15 minutes',
    },
    {
      title: '3. Secondary multiplier leg',
      action: secondaryAction,
      cost: secondaryCost,
      timeframe: secIsFree ? '5 minutes' : '15 minutes',
    },
    {
      title: '4. Recurring activity cadence',
      action: recurringAction,
      cost: recurringTotalGas === 0 ? '$0 off-chain monitoring' : `~${fmtGas(recurringGasPerTx)}/tx (~${fmtGas(recurringTotalGas)} over ${hold}d)`,
      timeframe: `10 min/week for ${weeks} weeks`,
    },
    {
      title: '5. Qualifying hold & liquidity guard',
      action: `Maintain the $${tier.capital} position across at least ${hold} days so multiple epoch snapshots capture your balance.${holdNote}`,
      cost: `$${tier.capital} locked capital ($0 maintenance fee)`,
      timeframe: `${hold} days continuous hold`,
    },
    {
      title: '6. Epoch audit & claim hygiene',
      action: `Verify accrued points or epoch status directly inside ${p.name}'s official app before unwinding; never sign blind permit requests or pay third-party claim fees.`,
      cost: '$0 verification cost',
      timeframe: '10 minutes before exit',
    },
    {
      title: '7. Unwind, revoke & farm ledger',
      action: `${exitNote} Log wallet, dates, tx hashes, and ~${fmtGas(totalGas)} cumulative gas.`,
      cost: `~${fmtGas(exitGas)} exit & revoke gas (~${fmtGas(totalGas)} total plan gas)`,
      timeframe: '15 minutes (+ queue if applicable)',
    },
  ];

  const strings = details.map((d) => {
    let line = `${d.title}: ${d.action} Cost: ${d.cost}. Timeframe: ${d.timeframe}.`;
    if (line.length > 600) line = `${line.slice(0, 596)}...`;
    if (line.length < 20) line = `${line} Verify on-chain.`;
    return line;
  });

  return {
    summary: {
      capital_usd: tier.capital,
      est_gas_usd: totalGas,
      hold_days: hold,
      active_chain: active.chain,
      weekly_minutes: 10,
      dilution_tier: tier.dilution,
    },
    details,
    strings,
  };
}

export function buildBoard(snapshot: Snapshot, cfg: ModelConfig = MODEL_CONFIG): {
  board: BoardRow[];
  calibration: PeerCalibration;
  live: LivePeerRow[];
} {
  const calibration = calibratePeers(snapshot, cfg);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlistSet = new Set(snapshot.watchlist);

  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankableEarly(p, snapshot.floor_usd)) {
      chosen.set(p.slug, p);
    }
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, breakdown } = scoreProtocol(p, snapshot.as_of, calibration, cfg);
    const farm = buildFarmPlan(p, breakdown.tokenless_days);
    return { p, implied, breakdown, farm };
  });

  scored.sort((a, b) => b.implied - a.implied || compareSlug(a.p.slug, b.p.slug));

  const board: BoardRow[] = scored.map((entry, idx) => ({
    rank: idx + 1,
    slug: entry.p.slug,
    name: entry.p.name,
    category: entry.p.category,
    sector: entry.breakdown.sector,
    chains: entry.p.chains,
    tvl_usd: entry.p.tvl_usd,
    change_7d: entry.p.change_7d,
    mcap_usd: entry.p.mcap_usd,
    listed_at: entry.p.listed_at,
    gecko_id: entry.p.gecko_id,
    symbol: entry.p.symbol,
    cohort: watchlistSet.has(entry.p.slug) ? 'watchlist' : 'early',
    token_status: 'pre-token',
    tokenless_days: entry.breakdown.tokenless_days,
    implied_value_usd: entry.implied,
    model: entry.breakdown,
    farm_summary: entry.farm.summary,
    farm_steps: entry.farm.strings,
  }));

  const live: LivePeerRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || compareSlug(a.slug, b.slug))
    .slice(0, 60)
    .map((p) => {
      const ratio = p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null;
      const inCal =
        p.mcap_usd !== null &&
        p.mcap_usd > 0 &&
        p.tvl_usd > 0 &&
        (p.category === null || !EXCLUDED_PEER_CATEGORIES.has(p.category));
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        sector: sectorOf(p.category),
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd,
        mcap_tvl_ratio: ratio,
        change_7d: p.change_7d,
        symbol: p.symbol,
        in_calibration: inCal,
      };
    });

  return { board, calibration, live };
}

export function buildRadar(snapshot: Snapshot, cfg: ModelConfig = MODEL_CONFIG): { board: BoardRow[]; radar: RadarData } {
  const { board, calibration, live } = buildBoard(snapshot, cfg);
  const earlySize = board.filter((r) => r.cohort === 'early').length;
  const totalTvl = board.reduce((sum, r) => sum + r.tvl_usd, 0);
  const totalImplied = board.reduce((sum, r) => sum + r.implied_value_usd, 0);
  const ratios = board.map((r) => r.implied_value_usd / Math.max(r.tvl_usd, 1));
  const medRatio = round4(trimmedMedian(ratios, 0));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    config: cfg,
    calibration,
    summary: {
      snapshot_protocols: snapshot.protocols.length,
      watchlist_size: snapshot.watchlist.length,
      board_size: board.length,
      early_size: earlySize,
      live_peer_count: calibration.global_peer_count,
      total_board_tvl_usd: totalTvl,
      total_implied_value_usd: totalImplied,
      median_implied_tvl_ratio: medRatio,
    },
    rows: board.map((r) => ({
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
      model: r.model,
      farm_summary: r.farm_summary,
      farm_steps: r.farm_steps,
    })),
    live,
  };

  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json must be a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json missing valid as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json missing source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json missing positive integer floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json missing protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json missing watchlist string array');
  }

  const protocols: SnapshotProtocol[] = o.protocols.map((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new SnapshotError(`protocol ${i} is not an object`);
    }
    const p = item as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} lacks slug, name, or finite tvl_usd`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board has ${board.length} rows (must be 100..4000)`;
  }
  const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of board) {
    if (!snapSlugs.has(r.slug)) return `unknown slug ${r.slug}`;
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (!r.name || r.name.trim().length === 0) return `${r.slug} has empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has invalid implied_value_usd ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `${r.slug} has ${r.farm_steps.length} farm_steps`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has farm step length ${t.length}`;
    }
  }
  const missingWl = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missingWl.length > 0) return `missing watchlist slugs: ${missingWl.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `row ${i} has rank ${board[i]!.rank}, expected ${i + 1}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `rank ${i + 1} outranks rank ${i} on implied_value_usd`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'all rows share identical implied_value_usd';
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
