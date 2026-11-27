// Token Launch Radar (radar-5.0) — Shared Types and Immutable Model Configuration.

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

export type SectorName =
  | 'Spot DEX & Liquidity'
  | 'Derivatives & Basis'
  | 'Lending & Credit'
  | 'Asset Mgmt & Yield'
  | 'Staking & Security'
  | 'RWA & Credit'
  | 'Chains & Infra';

export const SECTOR_ORDER: readonly SectorName[] = [
  'Spot DEX & Liquidity',
  'Derivatives & Basis',
  'Lending & Credit',
  'Asset Mgmt & Yield',
  'Staking & Security',
  'RWA & Credit',
  'Chains & Infra',
];

export interface RadarConfig {
  readonly version: string;
  readonly anchor_tvl_usd: number;
  readonly peer_ratio_min: number;
  readonly peer_ratio_max: number;
  readonly trim_fraction: number;
  readonly elasticity_prior: number;
  readonly elasticity_prior_weight: number;
  readonly elasticity_min: number;
  readonly elasticity_max: number;
  readonly sector_prior_weight: number;
  readonly category_prior_weight: number;
  readonly thin_category_prior_weight: number;
  readonly peer_mult_min: number;
  readonly peer_mult_max: number;
  readonly scale_mult_min: number;
  readonly scale_mult_max: number;
  readonly growth_min_pct: number;
  readonly growth_max_pct: number;
  readonly growth_asinh_scale: number;
  readonly growth_sensitivity: number;
  readonly growth_mult_min: number;
  readonly growth_mult_max: number;
  readonly growth_null_mult: number;
  readonly duration_base: number;
  readonly duration_span: number;
  readonly duration_half_life_days: number;
  readonly duration_null_mult: number;
  readonly chain_log_step: number;
  readonly chain_mult_min: number;
  readonly chain_mult_max: number;
  readonly bear_factor_min: number;
  readonly bear_factor_max: number;
  readonly bull_factor_min: number;
  readonly bull_factor_max: number;
}

export const RADAR_CONFIG: RadarConfig = Object.freeze({
  version: 'radar-5.0',
  anchor_tvl_usd: 100_000_000,
  peer_ratio_min: 0.015,
  peer_ratio_max: 2.5,
  trim_fraction: 0.15,
  elasticity_prior: -0.2,
  elasticity_prior_weight: 20,
  elasticity_min: -0.3,
  elasticity_max: -0.08,
  sector_prior_weight: 5,
  category_prior_weight: 4,
  thin_category_prior_weight: 7,
  peer_mult_min: 0.05,
  peer_mult_max: 0.85,
  scale_mult_min: 0.35,
  scale_mult_max: 1.75,
  growth_min_pct: -75,
  growth_max_pct: 250,
  growth_asinh_scale: 20,
  growth_sensitivity: 0.14,
  growth_mult_min: 0.65,
  growth_mult_max: 1.55,
  growth_null_mult: 0.96,
  duration_base: 0.72,
  duration_span: 0.36,
  duration_half_life_days: 240,
  duration_null_mult: 0.88,
  chain_log_step: 0.04,
  chain_mult_min: 1.0,
  chain_mult_max: 1.12,
  bear_factor_min: 0.35,
  bear_factor_max: 0.85,
  bull_factor_min: 1.2,
  bull_factor_max: 2.6,
});

export interface SectorCalibration {
  sector: SectorName;
  peer_count: number;
  raw_anchor_mult: number;
  shrunk_log_mult: number;
  calibrated_mult: number;
  bear_factor: number;
  bull_factor: number;
}

export interface CategoryCalibration {
  category: string;
  sector: SectorName;
  peer_count: number;
  method: 'category' | 'thin-category' | 'sector-prior';
  raw_anchor_mult: number | null;
  peer_mult: number;
}

export interface PeerCalibration {
  global_peer_count: number;
  raw_elasticity: number;
  scale_elasticity: number;
  global_log_mult: number;
  global_anchor_mult: number;
  global_bear_factor: number;
  global_bull_factor: number;
  sectors: SectorCalibration[];
  categories: Record<string, CategoryCalibration>;
}

export interface LoocvMetrics {
  peer_count: number;
  mean_abs_log_error: number;
  median_abs_log_error: number;
  within_2x_count: number;
  within_2x_pct: number;
  within_3x_count: number;
  within_3x_pct: number;
  spearman_rho: number;
}

export interface LiveCompRef {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl_ratio: number;
  match_level: 'category' | 'sector' | 'global';
}

export interface ValuationRange {
  bear_usd: number;
  base_usd: number;
  bull_usd: number;
  bear_factor: number;
  bull_factor: number;
}

export interface ValuationBreakdown {
  sector: SectorName;
  peer_source: string;
  peer_mult: number;
  scale_mult: number;
  growth_pct: number | null;
  growth_mult: number;
  tokenless_days: number | null;
  duration_mult: number;
  chain_count: number;
  chain_mult: number;
}

export interface FarmStepStructured {
  step: number;
  title: string;
  action: string;
  cost: string;
  timeframe: string;
}

export interface FarmSummary {
  capital_usd: number;
  est_gas_usd: number;
  gas_drag_pct: number;
  hold_days: number;
  active_chain: string;
  active_gas_token: string;
  is_low_fee: boolean;
  secondary_chain: string | null;
  weekly_minutes: number;
  dilution_tier: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  sector: SectorName;
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
  range: ValuationRange;
  model: ValuationBreakdown;
  comps: LiveCompRef[];
  farm_summary: FarmSummary;
  farm_steps: string[];
}

export interface LivePeerAuditRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  sector: SectorName;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl_ratio: number;
  loocv_pred_usd: number;
  abs_log_error: number;
  within_2x: boolean;
  change_7d: number | null;
}

export interface RadarSummary {
  snapshot_protocols: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_total_count: number;
  live_peer_count: number;
  sibling_filtered_count: number;
  sibling_filtered_slugs: string[];
  total_board_tvl_usd: number;
  total_implied_value_usd: number;
  median_implied_tvl_ratio: number;
  median_farm_gas_usd: number;
}

export interface RadarPayload {
  as_of: string;
  source: string;
  floor_usd: number;
  config: RadarConfig;
  calibration: PeerCalibration;
  loocv: LoocvMetrics;
  summary: RadarSummary;
  rows: Array<{
    rank: number;
    slug: string;
    name: string;
    category: string | null;
    sector: SectorName;
    chains: string[];
    tvl_usd: number;
    change_7d: number | null;
    listed_at: string | null;
    cohort: 'watchlist' | 'early';
    tokenless_days: number | null;
    implied_value_usd: number;
    range: ValuationRange;
    model: ValuationBreakdown;
    comps: LiveCompRef[];
    farm_summary: FarmSummary;
    farm_steps: string[];
  }>;
  live: LivePeerAuditRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function compareLex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
