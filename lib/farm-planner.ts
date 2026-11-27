// Token Launch Radar (radar-5.0) — Tailored 6-Step Farming Playbook Engine.

import {
  type FarmStepStructured,
  type FarmSummary,
  type SnapshotProtocol,
  round2,
  round4,
} from './types.ts';

export interface ChainGasProfile {
  chain: string;
  gasToken: string;
  txCostUsd: number;
  bufferUsd: number;
  isLowFee: boolean;
  note: string;
}

const CHAIN_PROFILES: Record<string, Omit<ChainGasProfile, 'chain'>> = {
  Ethereum: {
    gasToken: 'ETH',
    txCostUsd: 6.2,
    bufferUsd: 45,
    isLowFee: false,
    note: 'batch actions off-peak below 10 gwei',
  },
  Solana: {
    gasToken: 'SOL',
    txCostUsd: 0.03,
    bufferUsd: 10,
    isLowFee: true,
    note: 'retain 0.05 SOL for fees and account rent',
  },
  Bitcoin: {
    gasToken: 'BTC',
    txCostUsd: 4.8,
    bufferUsd: 25,
    isLowFee: false,
    note: 'allow 20-45 minutes for L1 confirmation finality',
  },
  Binance: {
    gasToken: 'BNB',
    txCostUsd: 0.14,
    bufferUsd: 8,
    isLowFee: true,
    note: '3-second BNB Smart Chain finality',
  },
  Tron: {
    gasToken: 'TRX',
    txCostUsd: 1.4,
    bufferUsd: 15,
    isLowFee: false,
    note: 'budget TRX energy for TRC-20 contract approvals',
  },
  Sui: {
    gasToken: 'SUI',
    txCostUsd: 0.04,
    bufferUsd: 8,
    isLowFee: true,
    note: 'sub-second finality with negligible gas',
  },
  Aptos: {
    gasToken: 'APT',
    txCostUsd: 0.04,
    bufferUsd: 8,
    isLowFee: true,
    note: 'fast MoveVM execution under $0.05/tx',
  },
  Base: {
    gasToken: 'ETH',
    txCostUsd: 0.08,
    bufferUsd: 10,
    isLowFee: true,
    note: 'sub-dime OP-Stack execution on Base',
  },
  Arbitrum: {
    gasToken: 'ETH',
    txCostUsd: 0.1,
    bufferUsd: 10,
    isLowFee: true,
    note: 'fast Arbitrum One rollup execution',
  },
  Optimism: {
    gasToken: 'ETH',
    txCostUsd: 0.08,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee OP Mainnet execution',
  },
  Monad: {
    gasToken: 'MON',
    txCostUsd: 0.06,
    bufferUsd: 10,
    isLowFee: true,
    note: 'high-throughput Monad EVM execution',
  },
  'Hyperliquid L1': {
    gasToken: 'HYPE/USDC',
    txCostUsd: 0.05,
    bufferUsd: 10,
    isLowFee: true,
    note: 'keep HYPE for HyperEVM gas and USDC for margin',
  },
  Plasma: {
    gasToken: 'XPL',
    txCostUsd: 0.06,
    bufferUsd: 10,
    isLowFee: true,
    note: 'stablecoin-optimized Plasma gas schedule',
  },
  Avalanche: {
    gasToken: 'AVAX',
    txCostUsd: 0.15,
    bufferUsd: 10,
    isLowFee: true,
    note: 'sub-2-second C-Chain finality',
  },
  Unichain: {
    gasToken: 'ETH',
    txCostUsd: 0.08,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee Unichain L2 execution',
  },
  'Robinhood Chain': {
    gasToken: 'ETH',
    txCostUsd: 0.1,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee EVM L2 execution',
  },
  Berachain: {
    gasToken: 'BERA',
    txCostUsd: 0.12,
    bufferUsd: 10,
    isLowFee: true,
    note: 'keep BERA for proof-of-liquidity vault gas',
  },
  Polygon: {
    gasToken: 'POL',
    txCostUsd: 0.06,
    bufferUsd: 8,
    isLowFee: true,
    note: 'low-fee Polygon PoS execution',
  },
  Sonic: {
    gasToken: 'S',
    txCostUsd: 0.04,
    bufferUsd: 8,
    isLowFee: true,
    note: 'sub-second Sonic finality with low gas',
  },
  Flare: {
    gasToken: 'FLR',
    txCostUsd: 0.05,
    bufferUsd: 8,
    isLowFee: true,
    note: 'low-fee Flare EVM execution',
  },
  'Plume Mainnet': {
    gasToken: 'PLUME',
    txCostUsd: 0.08,
    bufferUsd: 10,
    isLowFee: true,
    note: 'RWA-focused Plume EVM gas buffer',
  },
  Katana: {
    gasToken: 'ETH',
    txCostUsd: 0.1,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee Katana L2 execution',
  },
  Linea: {
    gasToken: 'ETH',
    txCostUsd: 0.15,
    bufferUsd: 10,
    isLowFee: true,
    note: 'zkEVM Linea rollup execution',
  },
  Scroll: {
    gasToken: 'ETH',
    txCostUsd: 0.14,
    bufferUsd: 10,
    isLowFee: true,
    note: 'zkEVM Scroll rollup execution',
  },
  Ink: {
    gasToken: 'ETH',
    txCostUsd: 0.08,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee Ink OP-Stack execution',
  },
  Abstract: {
    gasToken: 'ETH',
    txCostUsd: 0.1,
    bufferUsd: 10,
    isLowFee: true,
    note: 'zk-rollup Abstract L2 execution',
  },
  Arc: {
    gasToken: 'USDC',
    txCostUsd: 0.08,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee Arc execution',
  },
  Stellar: {
    gasToken: 'XLM',
    txCostUsd: 0.02,
    bufferUsd: 8,
    isLowFee: true,
    note: 'keep 5 XLM base reserve for trustlines',
  },
  Bittensor: {
    gasToken: 'TAO',
    txCostUsd: 0.05,
    bufferUsd: 10,
    isLowFee: true,
    note: 'sub-dollar Bittensor subnet execution',
  },
  Hemi: {
    gasToken: 'ETH',
    txCostUsd: 0.12,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee Hemi EVM execution',
  },
  TAC: {
    gasToken: 'TAC',
    txCostUsd: 0.08,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee TAC EVM adapter execution',
  },
  'zkSync Era': {
    gasToken: 'ETH',
    txCostUsd: 0.12,
    bufferUsd: 10,
    isLowFee: true,
    note: 'low-fee zkSync Era execution',
  },
  Mantle: {
    gasToken: 'MNT',
    txCostUsd: 0.08,
    bufferUsd: 8,
    isLowFee: true,
    note: 'low-fee Mantle L2 execution',
  },
  Noble: {
    gasToken: 'USDC',
    txCostUsd: 0.04,
    bufferUsd: 8,
    isLowFee: true,
    note: 'Cosmos IBC native USDC settlement',
  },
  Algorand: {
    gasToken: 'ALGO',
    txCostUsd: 0.02,
    bufferUsd: 8,
    isLowFee: true,
    note: 'instant 3-second Algorand finality',
  },
  Ripple: {
    gasToken: 'XRP',
    txCostUsd: 0.02,
    bufferUsd: 10,
    isLowFee: true,
    note: 'maintain XRPL account base reserve',
  },
  Mezo: {
    gasToken: 'BTC',
    txCostUsd: 0.25,
    bufferUsd: 12,
    isLowFee: true,
    note: 'Bitcoin-backed Mezo EVM execution',
  },
  BSquared: {
    gasToken: 'BTC',
    txCostUsd: 0.3,
    bufferUsd: 12,
    isLowFee: true,
    note: 'Bitcoin L2 gas reserve',
  },
  'Babylon Genesis': {
    gasToken: 'BABY',
    txCostUsd: 0.08,
    bufferUsd: 10,
    isLowFee: true,
    note: 'Babylon staking finality execution',
  },
  Starknet: {
    gasToken: 'STRK/ETH',
    txCostUsd: 0.12,
    bufferUsd: 10,
    isLowFee: true,
    note: 'Cairo rollup execution with STRK or ETH gas',
  },
  Sei: {
    gasToken: 'SEI',
    txCostUsd: 0.03,
    bufferUsd: 8,
    isLowFee: true,
    note: 'sub-second Sei EVM execution',
  },
};

export function chainGasProfile(chain: string): ChainGasProfile {
  const hit = CHAIN_PROFILES[chain];
  if (hit) return { chain, ...hit };
  return {
    chain,
    gasToken: 'native gas',
    txCostUsd: 0.3,
    bufferUsd: 12,
    isLowFee: true,
    note: 'verify official RPC and native gas token before bridging',
  };
}

function selectActiveAndSecondary(chains: readonly string[]): {
  active: ChainGasProfile;
  secondary: ChainGasProfile | null;
} {
  if (chains.length === 0) {
    return { active: chainGasProfile('primary chain'), secondary: null };
  }
  const lowFees = chains.filter((c) => chainGasProfile(c).isLowFee);
  if (lowFees.length > 0) {
    const primary = lowFees[0]!;
    const secName = lowFees.find((c) => c !== primary) ?? null;
    return {
      active: chainGasProfile(primary),
      secondary: secName ? chainGasProfile(secName) : null,
    };
  }
  return {
    active: chainGasProfile(chains[0]!),
    secondary: chains.length > 1 ? chainGasProfile(chains[1]!) : null,
  };
}

function tvlSizingTier(
  tvlUsd: number,
  isHighGasOnly: boolean,
): { capital: number; label: string; posture: string } {
  if (tvlUsd >= 500_000_000) {
    return {
      capital: 500,
      label: 'Flagship (>=$500M)',
      posture: 'high-TVL dilution tier; size above dust thresholds for steady epoch credit',
    };
  }
  if (tvlUsd >= 100_000_000) {
    return {
      capital: 250,
      label: 'Core Watchlist',
      posture: 'core watchlist tier; balanced principal for multi-epoch scoring',
    };
  }
  if (tvlUsd >= 50_000_000) {
    return {
      capital: isHighGasOnly ? 250 : 150,
      label: 'Mid-Cap Watchlist',
      posture: isHighGasOnly
        ? 'sized to $250 so L1 gas drag stays economically rational'
        : 'mid-cap dilution tier with solid points-per-dollar efficiency',
    };
  }
  if (tvlUsd >= 15_000_000) {
    return {
      capital: isHighGasOnly ? 200 : 100,
      label: 'Early Radar',
      posture: 'early-radar tier where smaller balances rank higher per dollar',
    };
  }
  return {
    capital: isHighGasOnly ? 150 : 50,
    label: 'Emerging (Risk-Capped)',
    posture: 'strictly risk-capped principal and minimal token approvals on younger contracts',
  };
}

function computeHoldDays(days: number | null, change7d: number | null): number {
  if (change7d !== null && change7d >= 10) return 60;
  if (days === null) return 45;
  if (days < 180) return 60;
  if (days <= 450) return 45;
  return 30;
}

function fmtUsd(amount: number): string {
  if (amount === 0) return '$0';
  if (amount < 10) return `$${amount.toFixed(2)}`;
  return `$${Math.round(amount)}`;
}

function fitStepLength(step: FarmStepStructured): string {
  const full = `${step.step}. ${step.title}: ${step.action} Cost: ${step.cost}. Timeframe: ${step.timeframe}.`;
  if (full.length <= 580 && full.length >= 20) return full;
  // Compact safeguard in case of unusually long protocol names
  const maxAction = Math.max(40, 560 - step.title.length - step.cost.length - step.timeframe.length - 30);
  const clippedAction = step.action.length > maxAction ? `${step.action.slice(0, maxAction - 1)}…` : step.action;
  return `${step.step}. ${step.title}: ${clippedAction} Cost: ${step.cost}. Timeframe: ${step.timeframe}.`;
}

/**
 * Build a concrete, zero-clipping 6-step farm plan and 5-metric summary strip strictly from
 * snapshot chains, category, TVL, token-less duration, and 7-day momentum.
 */
export function buildFarmPlan(
  p: SnapshotProtocol,
  tokenlessDays: number | null,
): { summary: FarmSummary; steps: FarmStepStructured[]; strings: string[] } {
  const { active, secondary } = selectActiveAndSecondary(p.chains);
  const tier = tvlSizingTier(p.tvl_usd, !active.isLowFee);
  const holdDays = computeHoldDays(tokenlessDays, p.change_7d);
  const weeks = Math.max(4, Math.ceil(holdDays / 7));
  const c = (p.category ?? '').toLowerCase();

  const fundingGas = round4(active.txCostUsd * 1.0);
  const entryGas = round4(active.txCostUsd * 1.8);
  const touchpoints = active.isLowFee ? weeks : Math.max(1, Math.floor(weeks / 4));
  const recurringPerTx = round4(active.txCostUsd * 1.1);
  let recurringGasTotal = round4(recurringPerTx * touchpoints);
  const exitGas = round4(active.txCostUsd * 1.6);

  let secGas = secondary ? round4(secondary.txCostUsd * 1.5) : round4(active.txCostUsd * 1.2);
  let primaryAction: string;
  let secondaryTitle = secondary ? `Multi-chain leg on ${secondary.chain}` : 'Secondary multiplier track';
  let secondaryAction: string;
  let secondaryCost: string;
  let secondaryTime = secondary ? '10 minutes' : '5-10 minutes';
  let recurringAction: string;
  let recurringCost: string;
  let recurringTime: string;
  let exitAction: string;
  let exitTime: string;
  let weeklyMinutes = active.isLowFee ? 10 : 8;

  if (c.includes('curator')) {
    primaryAction = `Deposit $${tier.capital} USDC or ETH into ${p.name}'s deepest curated vault on ${active.chain} after checking curator fee and utilization.`;
    if (secondary) {
      secondaryAction = `Mirror a $30 vault deposit in ${p.name} on ${secondary.chain} to register multi-chain vault share ownership.`;
      secondaryCost = `~${fmtUsd(secGas)} gas (${secondary.gasToken}) + $30 side deposit`;
    } else {
      secondaryTitle = 'Clean wallet attribution lock';
      secondaryAction = `Retain ${p.name} vault receipt shares directly in the depositing wallet without splitting balances so curator points track cleanly.`;
      secondaryCost = '$0 extra gas (pure attribution hold)';
      secGas = 0;
      secondaryTime = '5 minutes';
    }
    recurringAction = active.isLowFee
      ? `Check ${p.name} vault APY, utilization cap, and epoch points weekly; add one $15 top-up every 2 weeks instead of vault-hopping.`
      : `Monitor ${p.name} vault APY and utilization off-chain weekly; batch one off-peak monthly top-up on ${active.chain}.`;
    exitAction = `Verify claims only on ${p.name}'s official app (no paid claim relays), redeem shares below 90% utilization, and revoke ERC-20 allowances.`;
    exitTime = '15 minutes (or short liquidity queue)';
  } else if (c.includes('allocator')) {
    primaryAction = `Mint $${tier.capital} of ${p.name} core receipt shares on ${active.chain} and confirm on-chain share accrual.`;
    if (secondary) {
      secondaryAction = `Deploy $30 of ${p.name} receipt shares on ${secondary.chain} to log multi-chain allocator activity.`;
      secondaryCost = `~${fmtUsd(secGas)} gas (${secondary.gasToken}) + $30 allocation`;
    } else {
      secondaryAction = `Supply 25% of ${p.name} receipt shares into an officially whitelisted partner market only if boosted epoch multipliers apply.`;
      secondaryCost = `~${fmtUsd(secGas)} gas (optional boost leg)`;
    }
    recurringAction = active.isLowFee
      ? `Audit ${p.name} share exchange rate and epoch points weekly; execute one $15 qualifying top-up every 14 days.`
      : `Check ${p.name} exchange-rate accrual off-chain weekly and batch one off-peak monthly top-up on ${active.chain}.`;
    exitAction = `Audit points on ${p.name}'s official UI, submit share redemption (allow async withdrawal queue), revoke spender approvals, and log dates.`;
    exitTime = '15 minutes + 1-7 day queue if async';
  } else if (/\bdexs?\b/.test(c) || c.includes('liquidity manager')) {
    const lpAmt = Math.round(tier.capital * 0.7);
    const swapAmt = tier.capital - lpAmt;
    primaryAction = `Seed $${lpAmt} into a deep stable/major pool on ${p.name} (${active.chain}) and run two organic swaps totaling $${swapAmt} across distinct pairs.`;
    if (secondary) {
      secondaryAction = `Run two $25 swaps (~0.10% pool fee) on ${p.name}'s ${secondary.chain} deployment to qualify for multi-chain trader tiers.`;
      secondaryCost = `~${fmtUsd(secGas)} gas (${secondary.gasToken}) + ~$0.05 swap fees`;
    } else {
      secondaryAction = `Harvest accrued fees or tighten your ${p.name} LP range once if price drifts to verify active liquidity provision.`;
      secondaryCost = `~${fmtUsd(secGas)} gas + ~0.05%-0.20% pool fee`;
    }
    recurringAction = active.isLowFee
      ? `Execute one organic $25-$40 swap (~0.10% fee) on ${p.name} weekly to sustain active-trader epoch streaks.`
      : `Run one batched $50 swap monthly off-peak on ${active.chain} while ${p.name} LP fees accrue passively.`;
    exitAction = `Verify rewards on ${p.name}'s official UI, withdraw LP tokens and accrued fees, swap dust to USDC, and revoke router approvals.`;
    exitTime = '15-20 minutes';
  } else if (c.includes('lending') || c.includes('collateral')) {
    const borrowAmt = Math.round(tier.capital * 0.35);
    primaryAction = `Supply $${tier.capital} of USDC or blue-chip collateral on ${p.name} (${active.chain}) and enable collateral mode.`;
    secondaryTitle = 'Conservative correlated borrow leg';
    secondaryAction = `Borrow ~$${borrowAmt} (35% LTV, health factor >1.9) in a correlated asset on ${p.name} to capture both supply and borrow tracks.`;
    secondaryCost = `~${fmtUsd(secGas)} borrow gas + ~3%-6% APR net spread`;
    secondaryTime = '10 minutes';
    recurringAction = active.isLowFee
      ? `Check ${p.name} health factor and borrow APR weekly; repay $5-$10 of interest bi-weekly to record steady on-chain activity.`
      : `Monitor ${p.name} health factor off-chain weekly and submit one off-peak monthly interest repayment on ${active.chain}.`;
    exitAction = `Confirm epoch standing on ${p.name}'s official app, repay the $${borrowAmt} borrow balance in full, withdraw collateral, and revoke approvals.`;
    exitTime = '15-20 minutes';
  } else if (c.includes('cdp') || c.includes('stablecoin')) {
    const mintAmt = Math.round(tier.capital * 0.5);
    primaryAction = `Deposit $${tier.capital} collateral into a ${p.name} vault on ${active.chain} and mint $${mintAmt} of its stablecoin at >=180% collateral ratio.`;
    secondaryTitle = 'Stability-pool secondary yield';
    secondaryAction = `Stake the minted $${mintAmt} in ${p.name}'s stability or paired liquidity pool to earn secondary stability points.`;
    secondaryCost = `~${fmtUsd(secGas)} stake gas + 0%-0.5% mint fee`;
    secondaryTime = '10 minutes';
    recurringAction = active.isLowFee
      ? `Audit ${p.name} collateral ratio and stability rewards weekly; claim or compound rewards every 2 weeks.`
      : `Track ${p.name} collateral ratio off-chain weekly and batch one off-peak monthly reward claim on ${active.chain}.`;
    exitAction = `Verify claims on ${p.name}'s official UI, unstake from stability pool, burn $${mintAmt} debt to close CDP, withdraw collateral, and revoke approvals.`;
    exitTime = '15-20 minutes';
  } else if (
    c.includes('deriv') ||
    c.includes('basis') ||
    c.includes('perp') ||
    c.includes('option')
  ) {
    primaryAction = `Deposit $${tier.capital} USDC margin into ${p.name} (${active.chain}) and open a conservative <=2x maker or delta-neutral basis position.`;
    secondaryTitle = 'Hedged maker volume cycle';
    secondaryAction = `Cycle one delta-neutral maker position on ${p.name} (~0.04% fee) to build verified notional volume and open-interest hours.`;
    secondaryCost = `~${fmtUsd(secGas)} margin gas + ~$0.40-$1.20 trading fees`;
    secondaryTime = '15 minutes';
    recurringAction = active.isLowFee
      ? `Place 1-2 low-leverage maker orders weekly on ${p.name} while keeping net directional delta near zero.`
      : `Hold open basis margin continuously on ${p.name} and rebalance once per month off-peak on ${active.chain}.`;
    exitAction = `Verify points on ${p.name}'s official app, flatten all open contracts, settle funding/PnL, withdraw USDC margin, and log total fee drag.`;
    exitTime = '15-20 minutes';
  } else if (c.includes('prediction')) {
    primaryAction = `Fund $${tier.capital} USDC on ${p.name} (${active.chain}) and place hedged positions across two high-liquidity near-term markets.`;
    secondaryTitle = 'Balanced market-making depth';
    secondaryAction = `Provide maker limit liquidity on a tight spread market in ${p.name} to qualify for both volume and liquidity-provider tracks.`;
    secondaryCost = `~${fmtUsd(secGas)} gas + ~$0.50-$1.50 spread cost`;
    secondaryTime = '10-15 minutes';
    recurringAction = active.isLowFee
      ? `Resolve settled markets and rotate into 1-2 liquid markets weekly on ${p.name} while capping single-event risk.`
      : `Rotate settled positions once every 2-3 weeks off-peak on ${active.chain} to log continuous market participation.`;
    exitAction = `Audit rewards on ${p.name}'s official UI, claim settled market payouts in USDC, withdraw balance, and revoke contract approvals.`;
    exitTime = '15 minutes';
  } else if (/\brwa\b/.test(c)) {
    primaryAction = `Complete wallet eligibility on ${p.name} (${active.chain}) and mint or acquire $${tier.capital} of its yield-bearing RWA token with USDC.`;
    if (secondary) {
      secondaryAction = `Check if ${p.name} rewards multi-chain holdings on ${secondary.chain}; bridge a $25 tranche only when explicitly incentivized.`;
      secondaryCost = `~${fmtUsd(secGas)} gas (${secondary.gasToken}) if bridged, else $0`;
    } else {
      secondaryTitle = 'Unbroken snapshot custody';
      secondaryAction = `Hold the ${p.name} RWA token continuously in the minting wallet without transfers so daily snapshot balances stay uninterrupted.`;
      secondaryCost = '$0 extra gas (pure custody leg)';
      secGas = 0;
      secondaryTime = '5 minutes';
    }
    recurringAction = `Review ${p.name} yield accrual, reserve proofs, and official epoch dashboard weekly without triggering early redemption fees.`;
    recurringGasTotal = 0;
    weeklyMinutes = 5;
    exitAction = `Verify official points on ${p.name}, submit RWA redemption to USDC (plan T+1/T+2 settlement), revoke approvals, and archive gas log.`;
    exitTime = '15 minutes + T+1/T+2 settlement';
  } else if (c.includes('restak') || c.includes('stak') || c.includes('btc')) {
    primaryAction = `Stake or restake $${tier.capital} of the native asset or LST via ${p.name} on ${active.chain} and delegate to a high-uptime operator.`;
    secondaryTitle = 'Operator & custody check';
    secondaryAction = `Audit operator uptime and commission on ${p.name}; keep receipt tokens in one wallet rather than fragmenting balances.`;
    secondaryCost = '$0 extra gas (off-chain operator audit)';
    secGas = 0;
    secondaryTime = '5 minutes';
    recurringAction = active.isLowFee
      ? `Monitor ${p.name} operator performance and staking points weekly; claim or restake epoch rewards every 14 days.`
      : `Check ${p.name} operator uptime off-chain weekly and batch a single reward claim at exit to minimize ${active.chain} gas.`;
    exitAction = `Verify points on ${p.name}'s official UI, initiate unstaking (budget 7-21 day unbonding queue), claim principal, and revoke approvals.`;
    exitTime = '15 minutes + 7-21 day unbonding';
  } else if (c.includes('yield') || c.includes('farm') || c.includes('cedefi') || c.includes('index')) {
    primaryAction = `Deposit $${tier.capital} USDC or paired base asset into ${p.name}'s highest-TVL audited vault on ${active.chain}.`;
    if (secondary) {
      secondaryAction = `Open a $25 companion vault on ${p.name} via ${secondary.chain} to log multi-chain depositor eligibility.`;
      secondaryCost = `~${fmtUsd(secGas)} gas (${secondary.gasToken}) + $25 side vault`;
    } else {
      secondaryTitle = 'Fee & auto-compound check';
      secondaryAction = `Verify ${p.name} deposit/performance fees (typically 0%-0.5% entry) and let vault shares auto-compound untouched.`;
      secondaryCost = '$0 extra gas (fee audit only)';
      secGas = 0;
      secondaryTime = '5 minutes';
    }
    recurringAction = active.isLowFee
      ? `Compound or verify vault yield every 14 days on ${p.name} and confirm epoch attribution stays active.`
      : `Let ${p.name} shares auto-compound untouched and verify epoch points off-chain weekly to keep ${active.chain} gas minimal.`;
    exitAction = `Check points strictly on ${p.name}'s official UI, withdraw principal plus yield with no early-exit penalty, and revoke spender approvals.`;
    exitTime = '15 minutes';
  } else if (c.includes('chain') || c.includes('payment') || c.includes('card')) {
    primaryAction = `Bridge $${tier.capital} onto ${p.name} (${active.chain}) through its canonical ramp and execute two native settlement transfers.`;
    secondaryTitle = 'Ecosystem contract diversity';
    secondaryAction = `Interact with two distinct audited apps or payment rails on ${p.name} so the wallet builds organic contract diversity.`;
    secondaryCost = `~${fmtUsd(secGas)} execution gas (${active.gasToken})`;
    secondaryTime = '10-15 minutes';
    recurringAction = active.isLowFee
      ? `Execute 2 organic transactions per week across distinct days on ${p.name} to maintain active-week history.`
      : `Submit one batched settlement transfer every 3-4 weeks on ${p.name} to sustain active-month streaks.`;
    exitAction = `Audit ecosystem points on ${p.name}'s official portal, bridge principal out via canonical exit, revoke approvals, and save tx history.`;
    exitTime = '15-20 minutes (bridge exit window)';
  } else {
    primaryAction = `Commit $${tier.capital} USDC into ${p.name}'s core audited contract on ${active.chain} and confirm on-chain position receipt.`;
    secondaryAction = secondary
      ? `Complete a $25 qualifying interaction on ${p.name} via ${secondary.chain} to register multi-chain presence.`
      : `Complete a second distinct market, epoch, or governance action on ${p.name} to establish organic non-sybil usage.`;
    secondaryCost = secondary
      ? `~${fmtUsd(secGas)} gas (${secondary.gasToken}) + $25 side leg`
      : `~${fmtUsd(secGas)} execution gas (${active.gasToken})`;
    recurringAction = active.isLowFee
      ? `Run one qualifying on-chain touchpoint on ${p.name} every 7-14 days to maintain continuous epoch streaks.`
      : `Track ${p.name} epoch snapshots off-chain weekly and submit one batched monthly check-in off-peak on ${active.chain}.`;
    exitAction = `Verify claims strictly on ${p.name}'s official UI (never sign blind permits), unwind position cleanly, revoke approvals, and log gas.`;
    exitTime = '15-20 minutes';
  }

  if (recurringGasTotal === 0) {
    recurringCost = '$0 recurring gas (zero-redemption hold)';
    recurringTime = `${weeklyMinutes} min/week across ${weeks} weeks`;
  } else if (active.isLowFee) {
    recurringCost = `~${fmtUsd(recurringPerTx)}/tx (~${fmtUsd(recurringGasTotal)} across ${touchpoints} weeks)`;
    recurringTime = `${weeklyMinutes} min/week over ${weeks} weeks`;
  } else {
    recurringCost = `~${fmtUsd(recurringPerTx)}/batch (~${fmtUsd(recurringGasTotal)} across ${touchpoints} monthly check-in${touchpoints === 1 ? '' : 's'})`;
    recurringTime = `${weeklyMinutes} min/week off-chain + 10 min/month`;
  }

  const totalGasUsd = round2(fundingGas + entryGas + secGas + recurringGasTotal + exitGas);
  const gasDragPct = round2((totalGasUsd / tier.capital) * 100);

  const drawdownGuard =
    p.change_7d !== null && p.change_7d <= -10
      ? ` Guard: 7d TVL fell ${p.change_7d.toFixed(1)}%, so verify exit liquidity depth before adding size.`
      : ` Posture: ${tier.posture}.`;

  const steps: FarmStepStructured[] = [
    {
      step: 1,
      title: `Isolated wallet & ${active.gasToken} gas buffer`,
      action: `Create a dedicated wallet for ${p.name} on ${active.chain}, fund $${active.bufferUsd} of ${active.gasToken} (${active.note}), and bookmark verified contract URLs.`,
      cost: `~${fmtUsd(fundingGas)} funding gas + $${active.bufferUsd} ${active.gasToken} buffer`,
      timeframe: '10 minutes',
    },
    {
      step: 2,
      title: `Core $${tier.capital} deployment (${p.category ?? 'DeFi'})`,
      action: primaryAction,
      cost: `$${tier.capital} capital + ~${fmtUsd(entryGas)} entry gas (${active.gasToken})`,
      timeframe: '15 minutes',
    },
    {
      step: 3,
      title: secondaryTitle,
      action: secondaryAction,
      cost: secondaryCost,
      timeframe: secondaryTime,
    },
    {
      step: 4,
      title: active.isLowFee ? 'Weekly on-chain cadence' : 'Off-peak batched cadence',
      action: recurringAction,
      cost: recurringCost,
      timeframe: recurringTime,
    },
    {
      step: 5,
      title: `${holdDays}-day qualifying hold & risk guard`,
      action: `Keep principal deployed continuously for ${holdDays} days (${tier.label}) to survive multi-snapshot anti-sybil filters.${drawdownGuard}`,
      cost: `$${tier.capital} locked capital ($0 maintenance fee)`,
      timeframe: `${holdDays} continuous days`,
    },
    {
      step: 6,
      title: 'Official epoch audit, clean unwind & revoke',
      action: exitAction,
      cost: `~${fmtUsd(exitGas)} exit/revoke gas (plan total ~${fmtUsd(totalGasUsd)}, ${gasDragPct.toFixed(2)}% drag)`,
      timeframe: exitTime,
    },
  ];

  const strings = steps.map(fitStepLength);

  const summary: FarmSummary = {
    capital_usd: tier.capital,
    est_gas_usd: totalGasUsd,
    gas_drag_pct: gasDragPct,
    hold_days: holdDays,
    active_chain: active.chain,
    active_gas_token: active.gasToken,
    is_low_fee: active.isLowFee,
    secondary_chain: secondary ? secondary.chain : null,
    weekly_minutes: weeklyMinutes,
    dilution_tier: tier.label,
  };

  return { summary, steps, strings };
}
