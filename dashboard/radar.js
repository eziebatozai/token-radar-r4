/* Token Launch Radar (radar-5.0) — Zero-Network Interactive Dashboard Controller */
(function () {
  'use strict';

  const DATA = window.RADAR;
  const CHARTS = window.RADAR_CHARTS;
  if (!DATA || !CHARTS) return;

  const state = {
    tab: 'all', q: '', sector: '', category: '', chain: '', momentum: '', lowGas: false,
    sort: 'rank', dir: 'asc', p: '',
    simGrowth: DATA.config.growth_sensitivity,
    simDuration: DATA.config.duration_span,
    simElasticity: DATA.calibration.scale_elasticity,
  };

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const round4 = (v) => Math.round(v * 1e4) / 1e4;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmtUsd = (n) => CHARTS.compactUsd(n);
  const fmtWholeUsd = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const fmtPct = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
  const fmtAge = (d) => (d === null || d === undefined ? 'Unlisted' : d >= 730 ? `${(d / 365).toFixed(1)}y` : `${d}d`);
  const fmtGas = (u) => (u < 10 ? `$${u.toFixed(2)}` : `$${Math.round(u)}`);

  const ALL_SECTORS = DATA.calibration.sectors.map((s) => s.sector);
  const ALL_CATEGORIES = Array.from(new Set(DATA.rows.map((r) => r.category || 'Uncategorized'))).sort();
  const ALL_CHAINS = (() => {
    const cnt = {};
    DATA.rows.forEach((r) => r.chains.forEach((c) => { cnt[c] = (cnt[c] || 0) + 1; }));
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a < b ? -1 : 1));
  })();
  const ROW_BY_SLUG = Object.fromEntries(DATA.rows.map((r) => [r.slug, r]));

  /** Exact client-side radar-5.0 valuation recomputation matching lib/valuation.ts. */
  function recomputeValuation(row, ov) {
    const cfg = DATA.config;
    const cal = DATA.calibration;
    const gSens = ov && ov.growthSens !== undefined ? ov.growthSens : cfg.growth_sensitivity;
    const dSpan = ov && ov.durSpan !== undefined ? ov.durSpan : cfg.duration_span;
    const elast = ov && ov.elasticity !== undefined ? ov.elasticity : cal.scale_elasticity;

    const catCal = cal.categories[row.category || 'Uncategorized'];
    const peerMult = catCal ? catCal.peer_mult : round4(clamp(cal.global_anchor_mult, cfg.peer_mult_min, cfg.peer_mult_max));
    const scaleMult = round4(clamp(Math.pow(Math.max(row.tvl_usd, 1) / cfg.anchor_tvl_usd, elast), cfg.scale_mult_min, cfg.scale_mult_max));
    const growthMult = row.change_7d === null || !Number.isFinite(row.change_7d)
      ? round4(cfg.growth_null_mult)
      : round4(clamp(Math.exp(gSens * Math.asinh(clamp(row.change_7d, cfg.growth_min_pct, cfg.growth_max_pct) / cfg.growth_asinh_scale)), cfg.growth_mult_min, cfg.growth_mult_max));
    const durMult = row.tokenless_days === null || row.tokenless_days === undefined
      ? round4(cfg.duration_null_mult)
      : round4(cfg.duration_base + dSpan * (row.tokenless_days / (row.tokenless_days + cfg.duration_half_life_days)));
    const chainMult = round4(clamp(1 + cfg.chain_log_step * Math.log(Math.max(row.chains.length, 1)), cfg.chain_mult_min, cfg.chain_mult_max));
    const implied = Math.max(1, Math.round(row.tvl_usd * peerMult * scaleMult * growthMult * durMult * chainMult));
    return { implied, peerMult, scaleMult, growthMult, durMult, chainMult };
  }

  function parseFarmStep(raw, idx) {
    let s = String(raw || '').trim();
    let num = idx + 1;
    const nm = s.match(/^(\d+)\.\s*/);
    if (nm) { num = Number(nm[1]); s = s.slice(nm[0].length); }
    let cost = '', timeframe = '';
    const ti = s.lastIndexOf(' Timeframe: ');
    if (ti >= 0) { timeframe = s.slice(ti + 12).replace(/\.$/, ''); s = s.slice(0, ti); }
    const ci = s.lastIndexOf(' Cost: ');
    if (ci >= 0) { cost = s.slice(ci + 7).replace(/\.$/, ''); s = s.slice(0, ci); }
    const col = s.indexOf(': ');
    return { num, title: col >= 0 ? s.slice(0, col) : `Step ${num}`, action: col >= 0 ? s.slice(col + 2) : s, cost, timeframe };
  }

  function readHash() {
    const h = (window.location.hash || '').replace(/^#/, '');
    Object.assign(state, { tab: 'all', q: '', sector: '', category: '', chain: '', momentum: '', lowGas: false, sort: 'rank', dir: 'asc', p: '' });
    if (!h) return;
    const q = new URLSearchParams(h);
    const t = q.get('tab');
    if (t && ['all', 'watchlist', 'early', 'live', 'model'].includes(t)) state.tab = t;
    state.q = q.get('q') || '';
    state.sector = q.get('sector') || '';
    state.category = q.get('category') || '';
    state.chain = q.get('chain') || '';
    state.momentum = q.get('momentum') || '';
    state.lowGas = q.get('lowGas') === '1';
    if (q.get('sort')) state.sort = q.get('sort');
    if (q.get('dir') === 'asc' || q.get('dir') === 'desc') state.dir = q.get('dir');
    state.p = q.get('p') || '';
  }

  function writeHash() {
    const q = new URLSearchParams();
    if (state.tab !== 'all') q.set('tab', state.tab);
    if (state.q) q.set('q', state.q);
    if (state.sector) q.set('sector', state.sector);
    if (state.category) q.set('category', state.category);
    if (state.chain) q.set('chain', state.chain);
    if (state.momentum) q.set('momentum', state.momentum);
    if (state.lowGas) q.set('lowGas', '1');
    if (state.sort !== 'rank') q.set('sort', state.sort);
    if (state.dir !== 'asc') q.set('dir', state.dir);
    if (state.p) q.set('p', state.p);
    const s = q.toString();
    history.replaceState(null, '', s ? `#${s}` : window.location.pathname + window.location.search);
  }

  const hasActiveFilters = () =>
    Boolean(state.tab === 'watchlist' || state.tab === 'early' || state.q || state.sector || state.category || state.chain || state.momentum || state.lowGas);

  function getFilteredRows() {
    const needle = state.q.trim().toLowerCase();
    const rows = DATA.rows.filter((r) => {
      if (state.tab === 'watchlist' && r.cohort !== 'watchlist') return false;
      if (state.tab === 'early' && r.cohort !== 'early') return false;
      if (state.sector && r.sector !== state.sector) return false;
      if (state.category && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain && !r.chains.includes(state.chain)) return false;
      if (state.lowGas && r.farm_summary.est_gas_usd > 5) return false;
      if (state.momentum === 'pos' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.momentum === 'surge' && !(r.change_7d !== null && r.change_7d >= 10)) return false;
      if (state.momentum === 'neg' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (needle && !`${r.name} ${r.slug} ${r.category || ''} ${r.sector} ${r.chains.join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const d = state.dir === 'asc' ? 1 : -1;
    const keyVal = (r) => {
      if (state.sort === 'tvl') return r.tvl_usd;
      if (state.sort === 'change') return r.change_7d === null ? -9999 : r.change_7d;
      if (state.sort === 'age') return r.tokenless_days === null ? -1 : r.tokenless_days;
      if (state.sort === 'peer') return r.model.peer_mult;
      if (state.sort === 'value') return r.implied_value_usd;
      if (state.sort === 'gas') return r.farm_summary.est_gas_usd;
      return r.rank;
    };
    rows.sort((a, b) => {
      if (state.sort === 'name') {
        const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
        return (an < bn ? -1 : an > bn ? 1 : 0) * d;
      }
      const diff = keyVal(a) - keyVal(b);
      return diff !== 0 ? diff * d : a.rank - b.rank;
    });
    return rows;
  }

  function median(nums) {
    if (!nums.length) return 0;
    const s = nums.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function renderMasthead() {
    const { summary: s, calibration: cal, loocv: loo, config: cfg } = DATA;
    return `<header class="masthead"><div class="masthead-inner">
      <div class="masthead-top">
        <div class="brand-lockup">${CHARTS.brandMarkSvg()}<div>
          <h1 class="brand-title">Token Launch Radar</h1>
          <p class="brand-sub">Empirical comparables valuation, LOOCV-validated peer calibration &amp; 6-step DeFi farm plans</p>
        </div></div>
        <div class="meta-pills">
          <span class="meta-pill copper">Watchlist ${s.watchlist_size}/${s.watchlist_size} Covered</span>
          <span class="meta-pill">Snapshot ${esc(DATA.as_of)}</span>
          <span class="meta-pill accent">Model ${esc(cfg.version)}</span>
          <span class="meta-pill">Offline · Zero Network</span>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Pre-Token Board</div><div class="kpi-value mono">${s.board_size}<span class="kpi-unit">protocols</span></div><div class="kpi-note">${s.watchlist_size} watchlist + ${s.early_size} clean early · ${s.sibling_filtered_count} live siblings excluded</div></div>
        <div class="kpi-card"><div class="kpi-label">Combined Implied Value</div><div class="kpi-value mono">${esc(fmtUsd(s.total_implied_value_usd))}<span class="kpi-unit">${(s.median_implied_tvl_ratio * 100).toFixed(1)}% med</span></div><div class="kpi-note">Across ${esc(fmtUsd(s.total_board_tvl_usd))} TVL · median farm gas ${esc(fmtGas(s.median_farm_gas_usd))}</div></div>
        <div class="kpi-card"><div class="kpi-label">Empirical TVL Elasticity</div><div class="kpi-value mono">${cal.scale_elasticity.toFixed(3)}<span class="kpi-unit">${cal.global_anchor_mult.toFixed(4)}x @ $100M</span></div><div class="kpi-note">Within-sector log-log fit on ${cal.global_peer_count} live peers across 7 sectors</div></div>
        <div class="kpi-card"><div class="kpi-label">Live-Peer LOOCV Accuracy</div><div class="kpi-value mono">${loo.within_2x_pct.toFixed(1)}%<span class="kpi-unit">within 2x</span></div><div class="kpi-note">MAE ${loo.mean_abs_log_error.toFixed(3)} · MedAE ${loo.median_abs_log_error.toFixed(3)} · Spearman &rho; ${loo.spearman_rho.toFixed(3)}</div></div>
      </div>
    </div></header>`;
  }

  function renderOverview() {
    return `<section class="overview-grid" aria-label="Board overview charts">
      <div class="panel-card"><div class="panel-head"><h2 class="panel-title">Top-8 Pre-Token Launch Valuations</h2><span class="panel-sub">Point estimate + Bear–Bull P25–P75 whisker · click bar for detail</span></div><div class="chart-host">${CHARTS.top8ValuationsSvg(DATA.rows)}</div></div>
      <div class="panel-card"><div class="panel-head"><h2 class="panel-title">Empirical Scale Elasticity &amp; Sector Calibration</h2><span class="panel-sub">101 live DeFi peers (log TVL vs log Mcap/TVL)</span></div><div class="chart-host">${CHARTS.elasticityCalibrationSvg(DATA.live, DATA.calibration)}</div></div>
    </section>`;
  }

  const renderOpts = (items, sel, ph) =>
    `<option value="">${esc(ph)}</option>` + items.map((v) => `<option value="${esc(v)}"${sel === v ? ' selected' : ''}>${esc(v)}</option>`).join('');

  function renderToolbar() {
    const s = DATA.summary;
    const tabs = [
      ['all', 'All Pre-Token', s.board_size],
      ['watchlist', 'Watchlist >=$50M', s.watchlist_size],
      ['early', 'Early Radar <$50M', s.early_size],
      ['live', 'Live Peers (Trading)', s.live_peer_count],
      ['model', 'Model & Validation', 'LOOCV'],
    ];
    const showF = ['all', 'watchlist', 'early'].includes(state.tab);
    const tabHtml = tabs.map(([id, lbl, cnt]) => `<button type="button" role="tab" aria-selected="${state.tab === id}" class="tab-btn${state.tab === id ? ' active' : ''}" data-tab="${id}">${esc(lbl)}<span class="tab-count mono">${esc(cnt)}</span></button>`).join('');
    const rstHtml = showF && hasActiveFilters() ? '<button type="button" class="reset-btn" id="btn-reset">Reset Filters</button>' : '';
    const filtHtml = showF
      ? `<div class="filter-row">
          <input type="search" id="f-q" class="filter-input" placeholder="Search protocol, slug, chain..." value="${esc(state.q)}" aria-label="Search">
          <select id="f-sector" class="filter-select" aria-label="Sector">${renderOpts(ALL_SECTORS, state.sector, 'All 7 Sectors')}</select>
          <select id="f-cat" class="filter-select" aria-label="Category">${renderOpts(ALL_CATEGORIES, state.category, 'All Categories')}</select>
          <select id="f-chain" class="filter-select" aria-label="Chain">${renderOpts(ALL_CHAINS, state.chain, 'All Chains')}</select>
          <select id="f-mom" class="filter-select" aria-label="7d Momentum">
            <option value="">Any 7d Momentum</option>
            <option value="pos"${state.momentum === 'pos' ? ' selected' : ''}>Growing (7d &gt; 0%)</option>
            <option value="surge"${state.momentum === 'surge' ? ' selected' : ''}>Surging (7d &gt;= +10%)</option>
            <option value="neg"${state.momentum === 'neg' ? ' selected' : ''}>Pullback (7d &lt; 0%)</option>
          </select>
          <label class="toggle-pill${state.lowGas ? ' active' : ''}"><input type="checkbox" id="f-lowgas"${state.lowGas ? ' checked' : ''}> Low-Gas (&le;$5)</label>
        </div>`
      : '';
    return `<section class="toolbar-card"><div class="tab-row"><div class="tab-group" role="tablist">${tabHtml}</div>${rstHtml}</div>${filtHtml}</section>`;
  }

  function renderSliceBar(rows) {
    const tvl = rows.reduce((a, r) => a + r.tvl_usd, 0);
    const imp = rows.reduce((a, r) => a + r.implied_value_usd, 0);
    const eff = tvl > 0 ? (imp / tvl) * 100 : 0;
    const medGas = median(rows.map((r) => r.farm_summary.est_gas_usd));
    const chips = [
      state.tab === 'watchlist' && 'Watchlist >=$50M',
      state.tab === 'early' && 'Early Radar <$50M',
      state.sector && `Sector: ${state.sector}`,
      state.category && `Category: ${state.category}`,
      state.chain && `Chain: ${state.chain}`,
      state.momentum === 'pos' && '7d > 0%',
      state.momentum === 'surge' && '7d >= +10%',
      state.momentum === 'neg' && '7d < 0%',
      state.lowGas && 'Low-Gas <=$5',
      state.q && `"${state.q}"`,
    ].filter(Boolean);
    return `<div class="slice-bar${chips.length ? ' filtered' : ''}">
      <div class="slice-left"><span class="mono">Showing ${rows.length} / ${DATA.rows.length} pre-token protocols</span>${chips.map((c) => `<span class="slice-chip">${esc(c)}</span>`).join('')}</div>
      <div class="slice-metrics mono">
        <span>Slice TVL: <strong>${esc(fmtUsd(tvl))}</strong></span>
        <span>Implied Value: <strong>${esc(fmtUsd(imp))}</strong></span>
        <span>Eff. Multiple: <strong>${eff.toFixed(1)}%</strong></span>
        <span>Med. Farm Gas: <strong>${esc(fmtGas(medGas))}</strong></span>
      </div>
    </div>`;
  }

  function renderBoardTable(rows) {
    if (!rows.length) return '<div class="table-wrap"><div class="empty-state">No pre-token protocols match the current filters.</div></div>';
    const maxImp = Math.max(1, ...rows.map((r) => r.implied_value_usd));
    const cols = [
      ['rank', '#', false], ['name', 'Protocol / Category / Chains', false], ['tvl', 'TVL', true],
      ['change', '7d TVL', true], ['age', 'No-Token Age', true], ['peer', 'Peer Mult', true],
      ['value', 'Implied Value (Bear–Bull)', true], ['gas', '6-Step Farm Plan', false],
    ];
    const head = cols.map(([id, lbl, num]) => `<th class="sortable${num ? ' num' : ''}${state.sort === id ? ' sorted' : ''}" data-sort="${id}">${esc(lbl)}${state.sort === id ? (state.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('');
    const body = rows.map((r) => {
      const barPct = Math.max(3, Math.round((r.implied_value_usd / maxImp) * 100));
      const momCls = r.change_7d === null ? 'mom-nil' : r.change_7d >= 0 ? 'mom-pos' : 'mom-neg';
      const chs = r.chains.slice(0, 3).map((c) => `<span class="chain-chip">${esc(c)}</span>`).join('') + (r.chains.length > 3 ? `<span class="chain-chip">+${r.chains.length - 3}</span>` : '');
      const fs = r.farm_summary;
      return `<tr class="clickable" data-open="${esc(r.slug)}">
        <td><div class="rank-cell"><span class="rank-num mono">#${r.rank}</span><span class="cohort-tag ${r.cohort}">${r.cohort === 'watchlist' ? 'WL' : 'Early'}</span></div></td>
        <td><div class="proto-name">${esc(r.name)}</div><div class="proto-sub"><span class="cat-label">${esc(r.category || 'Uncategorized')}</span>${chs}</div></td>
        <td class="num mono">${esc(fmtUsd(r.tvl_usd))}</td>
        <td class="num mono ${momCls}">${esc(fmtPct(r.change_7d))}</td>
        <td class="num mono">${esc(fmtAge(r.tokenless_days))}</td>
        <td class="num mono">${r.model.peer_mult.toFixed(4)}x<span class="mult-sub">${esc(r.sector)}</span></td>
        <td class="num val-cell"><div class="val-main mono">${esc(fmtUsd(r.implied_value_usd))}</div><div class="val-bar-track"><div class="val-bar-fill" style="width:${barPct}%"></div></div><div class="val-range-sub mono">${esc(fmtUsd(r.range.bear_usd))}–${esc(fmtUsd(r.range.bull_usd))}</div></td>
        <td><span class="farm-pill mono"><strong>$${fs.capital_usd}</strong> · ${esc(fmtGas(fs.est_gas_usd))} · ${fs.hold_days}d · ${esc(fs.active_chain)} <span class="fp-arrow">6 steps &rarr;</span></span></td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="board-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function renderLivePeersTab() {
    const { summary: s, loocv: loo } = DATA;
    const body = DATA.live.map((p) => `<tr>
      <td><div class="proto-name">${esc(p.name)}${p.symbol ? ` <span class="cat-label mono">(${esc(p.symbol)})</span>` : ''}</div></td>
      <td><div>${esc(p.sector)}</div><div class="cat-label">${esc(p.category || 'Uncategorized')}</div></td>
      <td class="num mono">${esc(fmtUsd(p.tvl_usd))}</td>
      <td class="num mono"><strong>${esc(fmtUsd(p.mcap_usd))}</strong></td>
      <td class="num mono">${p.mcap_tvl_ratio.toFixed(3)}x</td>
      <td class="num mono">${esc(fmtUsd(p.loocv_pred_usd))}</td>
      <td class="num mono">${p.abs_log_error.toFixed(3)}</td>
      <td><span class="ok-badge ${p.within_2x ? 'yes' : 'no'}">${p.within_2x ? 'Within 2x' : 'Outside 2x'}</span></td>
    </tr>`).join('');
    return `<div class="notice-banner"><strong>Pre-Token Separation Audit:</strong> All <strong>${s.live_total_count} already-trading protocols</strong> and <strong>${s.sibling_filtered_count} hyphenated live-token sibling products</strong> (${esc(s.sibling_filtered_slugs.join(', '))}) are excluded from the pre-token board. Below are all <strong>${s.live_peer_count} calibrated live DeFi peers</strong> with Leave-One-Out Cross-Validation (LOOCV) predictions (${loo.within_2x_count}/${loo.peer_count} within 2x, Spearman &rho; = ${loo.spearman_rho.toFixed(3)}).</div>
      <div class="table-wrap"><table class="board-table"><thead><tr><th>Protocol</th><th>Sector / Category</th><th class="num">TVL</th><th class="num">Actual Mcap</th><th class="num">Mcap/TVL</th><th class="num">LOOCV Pred</th><th class="num">|Log Err|</th><th>2x Band</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function renderModelTab() {
    const { calibration: cal, loocv: loo, config: cfg } = DATA;
    const simRows = DATA.rows
      .map((r) => ({ row: r, simVal: recomputeValuation(r, { growthSens: state.simGrowth, durSpan: state.simDuration, elasticity: state.simElasticity }).implied }))
      .sort((a, b) => (b.simVal !== a.simVal ? b.simVal - a.simVal : a.row.slug < b.row.slug ? -1 : 1));
    const secRows = cal.sectors.map((s) => `<tr><td><strong>${esc(s.sector)}</strong></td><td class="num mono">${s.peer_count}</td><td class="num mono">${s.raw_anchor_mult.toFixed(4)}x</td><td class="num mono"><strong>${s.calibrated_mult.toFixed(4)}x</strong></td><td class="num mono">${s.bear_factor.toFixed(2)}x</td><td class="num mono">${s.bull_factor.toFixed(2)}x</td></tr>`).join('');
    const simHtml = simRows.slice(0, 10).map(({ row, simVal }, idx) => {
      const mv = row.rank - (idx + 1);
      const mvHtml = mv > 0 ? `<span class="delta-up">+${mv}</span>` : mv < 0 ? `<span class="delta-dn">${mv}</span>` : '<span class="delta-eq">=</span>';
      const pct = ((simVal - row.implied_value_usd) / row.implied_value_usd) * 100;
      return `<tr><td class="mono"><strong>#${idx + 1}</strong></td><td class="mono">${mvHtml}</td><td><strong>${esc(row.name)}</strong> <span class="cat-label">${esc(row.sector)}</span></td><td class="num mono">${esc(fmtUsd(row.tvl_usd))}</td><td class="num mono">${esc(fmtUsd(row.implied_value_usd))}</td><td class="num mono"><strong>${esc(fmtUsd(simVal))}</strong></td><td class="num mono ${pct >= 0 ? 'mom-pos' : 'mom-neg'}">${esc(fmtPct(pct))}</td></tr>`;
    }).join('');
    return `<div class="model-grid">
      <div class="panel-card">
        <div class="panel-head"><h2 class="panel-title">radar-5.0 Empirical Valuation Formula</h2><span class="panel-sub">Strictly snapshot-derived, 4-decimal rounded</span></div>
        <div class="formula-box mono">implied_value_usd = max(1, round(tvl_usd &times; peer_mult &times; scale_mult &times; growth_mult &times; duration_mult &times; chain_mult))</div>
        <p class="model-prose">Within-sector demeaned log-log regression fits TVL scale elasticity directly from ${cal.global_peer_count} live peers (raw ${cal.raw_elasticity.toFixed(4)} &rarr; shrunk <strong>${cal.scale_elasticity.toFixed(4)}</strong>). Peers are size-normalized to $100M TVL before 15% trimmed-mean log-space Empirical-Bayes shrinkage across 7 sectors. Growth uses an asinh curve, duration uses a 240-day Michaelis-Menten curve, and chains add log credit.</p>
        <div class="loocv-cards">
          <div class="loocv-tile"><div class="lt-lbl">Within 2x</div><div class="lt-val mono">${loo.within_2x_pct.toFixed(1)}%</div></div>
          <div class="loocv-tile"><div class="lt-lbl">Within 3x</div><div class="lt-val mono">${loo.within_3x_pct.toFixed(1)}%</div></div>
          <div class="loocv-tile"><div class="lt-lbl">Mean |Log Err|</div><div class="lt-val mono">${loo.mean_abs_log_error.toFixed(3)}</div></div>
          <div class="loocv-tile"><div class="lt-lbl">Spearman &rho;</div><div class="lt-val mono">${loo.spearman_rho.toFixed(3)}</div></div>
        </div>
      </div>
      <div class="panel-card">
        <div class="panel-head"><h2 class="panel-title">7-Sector Anchor Multiples &amp; IQR Bands</h2><span class="panel-sub">Size-normalized to $100M TVL</span></div>
        <table class="comps-table"><thead><tr><th>Sector</th><th class="num">Peers</th><th class="num">Raw $100M</th><th class="num">Calibrated</th><th class="num">Bear P25</th><th class="num">Bull P75</th></tr></thead><tbody>${secRows}</tbody></table>
      </div>
    </div>
    <div class="panel-card">
      <div class="panel-head"><h2 class="panel-title">Interactive Sensitivity Sandbox (Re-Ranks All ${DATA.rows.length} Protocols Live)</h2><button type="button" class="reset-btn" id="btn-sim-reset">Reset Defaults</button></div>
      <div class="slider-grid">
        <div class="slider-box"><div class="slider-head"><span>7d Growth Sensitivity</span><span class="mono">${state.simGrowth.toFixed(2)} (def ${cfg.growth_sensitivity.toFixed(2)})</span></div><input type="range" id="sl-growth" min="0" max="0.30" step="0.01" value="${state.simGrowth}"></div>
        <div class="slider-box"><div class="slider-head"><span>Duration Span</span><span class="mono">${state.simDuration.toFixed(2)} (def ${cfg.duration_span.toFixed(2)})</span></div><input type="range" id="sl-dur" min="0" max="0.60" step="0.02" value="${state.simDuration}"></div>
        <div class="slider-box"><div class="slider-head"><span>TVL Scale Elasticity</span><span class="mono">${state.simElasticity.toFixed(2)} (def ${cal.scale_elasticity.toFixed(2)})</span></div><input type="range" id="sl-elast" min="-0.45" max="-0.05" step="0.01" value="${state.simElasticity}"></div>
      </div>
      <table class="comps-table"><thead><tr><th>Sim Rank</th><th>Move</th><th>Protocol</th><th class="num">TVL</th><th class="num">Calibrated</th><th class="num">Simulated</th><th class="num">Delta</th></tr></thead><tbody>${simHtml}</tbody></table>
    </div>`;
  }

  function renderDrawer() {
    if (!state.p) return '';
    const row = ROW_BY_SLUG[state.p];
    if (!row) return '';
    const check = recomputeValuation(row);
    const parityOk = check.implied === row.implied_value_usd;
    const pctTvl = row.tvl_usd > 0 ? (row.implied_value_usd / row.tvl_usd) * 100 : 0;
    const m = row.model, fs = row.farm_summary;
    const chainsTxt = row.chains.slice(0, 5).join(', ') + (row.chains.length > 5 ? ` +${row.chains.length - 5} more` : '');
    const wfCells = [
      ['Base TVL', fmtUsd(row.tvl_usd), `Snapshot ${DATA.as_of}`],
      ['1. Peer Multiple', `${m.peer_mult.toFixed(4)}x`, m.peer_source],
      ['2. Scale Elasticity', `${m.scale_mult.toFixed(4)}x`, `(TVL/$100M)^${DATA.calibration.scale_elasticity.toFixed(3)}`],
      ['3. 7d Momentum', `${m.growth_mult.toFixed(4)}x`, row.change_7d === null ? 'Null prior (0.9600x)' : `7d ${fmtPct(row.change_7d)} asinh`],
      ['4. Token-less Age', `${m.duration_mult.toFixed(4)}x`, row.tokenless_days === null ? 'Unlisted prior (0.88x)' : `${row.tokenless_days}d Michaelis-Menten`],
      ['5. Multi-Chain', `${m.chain_mult.toFixed(4)}x`, `${m.chain_count} chain${m.chain_count === 1 ? '' : 's'} (log credit)`],
    ].map(([l, v, n]) => `<div class="wf-cell"><div class="wf-lbl">${esc(l)}</div><div class="wf-val mono">${esc(v)}</div><div class="wf-note" title="${esc(n)}">${esc(n)}</div></div>`).join('');
    const compRows = (row.comps || []).map((c) => `<tr><td><span class="comp-sym mono">${esc(c.symbol || 'LIVE')}</span>${esc(c.name)}</td><td class="cat-label">${esc(c.category || 'Uncategorized')} (${esc(c.match_level)})</td><td class="num mono">${esc(fmtUsd(c.tvl_usd))}</td><td class="num mono"><strong>${esc(fmtUsd(c.mcap_usd))}</strong></td><td class="num mono">${c.mcap_tvl_ratio.toFixed(3)}x</td></tr>`).join('');
    const stepCards = row.farm_steps.map((raw, idx) => {
      const st = parseFarmStep(raw, idx);
      return `<div class="step-card"><div><div class="step-head"><span class="step-num mono">${st.num}</span><span class="step-title">${esc(st.title)}</span></div><p class="step-action">${esc(st.action)}</p></div><div class="step-tags">${st.cost ? `<span class="step-tag cost mono">Cost: ${esc(st.cost)}</span>` : ''}${st.timeframe ? `<span class="step-tag time mono">Time: ${esc(st.timeframe)}</span>` : ''}</div></div>`;
    }).join('');

    return `<div class="drawer-backdrop" id="drawer-backdrop" role="dialog" aria-modal="true" aria-label="${esc(row.name)} detail"><aside class="drawer-panel">
      <div class="drawer-header"><div>
        <div class="drawer-title-row"><span class="drawer-rank mono">#${row.rank}</span><span class="cohort-tag ${row.cohort}">${row.cohort === 'watchlist' ? 'Watchlist >=$50M' : 'Early Radar'}</span><h2 class="drawer-title">${esc(row.name)}</h2></div>
        <div class="drawer-meta">${esc(row.category || 'Uncategorized')} &middot; ${esc(row.sector)} &middot; ${row.chains.length} chain${row.chains.length === 1 ? '' : 's'} (${esc(chainsTxt)})</div>
      </div><button type="button" class="close-btn" id="btn-close-drawer" aria-label="Close">&times;</button></div>
      <div class="drawer-body">
        <section class="drawer-section">
          <div class="sec-head"><h3 class="sec-title">1. Implied Valuation Waterfall &amp; Empirical IQR Band</h3><span class="parity-badge${parityOk ? '' : ' fail'} mono">${parityOk ? `&#10003; Exact Parity: ${esc(fmtWholeUsd(check.implied))} = board.json` : `Mismatch: ${esc(fmtWholeUsd(check.implied))}`}</span></div>
          <div class="val-hero"><div><div class="val-hero-num mono">${esc(fmtUsd(row.implied_value_usd))}</div><div class="val-hero-sub mono">${esc(fmtWholeUsd(row.implied_value_usd))} &middot; ${pctTvl.toFixed(2)}% of TVL</div></div><div>${CHARTS.rangeBandSvg(row.range)}</div></div>
          <div class="wf-grid">${wfCells}</div>
        </section>
        <section class="drawer-section">
          <div class="sec-head"><h3 class="sec-title">2. Nearest Live-Token Comparable Peers</h3><span class="panel-sub">Real trading benchmarks by log-TVL proximity</span></div>
          <table class="comps-table"><thead><tr><th>Peer</th><th>Category</th><th class="num">TVL</th><th class="num">Live Mcap</th><th class="num">Mcap/TVL</th></tr></thead><tbody>${compRows}</tbody></table>
        </section>
        <section class="drawer-section">
          <div class="sec-head"><h3 class="sec-title">3. Tailored 6-Step Farm Plan</h3><span class="panel-sub">${esc(fs.dilution_tier)}</span></div>
          <div class="farm-stats">
            <div class="fstat-box"><div class="fstat-lbl">Target Capital</div><div class="fstat-val mono">$${fs.capital_usd}</div></div>
            <div class="fstat-box"><div class="fstat-lbl">Est. Total Gas</div><div class="fstat-val mono">${esc(fmtGas(fs.est_gas_usd))}</div></div>
            <div class="fstat-box"><div class="fstat-lbl">Gas Drag</div><div class="fstat-val mono">${fs.gas_drag_pct.toFixed(2)}%</div></div>
            <div class="fstat-box"><div class="fstat-lbl">Hold Horizon</div><div class="fstat-val mono">${fs.hold_days} days</div></div>
            <div class="fstat-box"><div class="fstat-lbl">Active Chain</div><div class="fstat-val">${esc(fs.active_chain)} (${esc(fs.active_gas_token)})</div></div>
          </div>
          <div class="steps-grid">${stepCards}</div>
        </section>
      </div>
    </aside></div>`;
  }

  function render() {
    const app = document.getElementById('app');
    if (!app) return;
    const focusId = document.activeElement ? document.activeElement.id : '';
    const caret = focusId === 'f-q' ? document.activeElement.selectionStart : null;
    const showBoard = ['all', 'watchlist', 'early'].includes(state.tab);
    const filtered = showBoard ? getFilteredRows() : [];

    app.innerHTML =
      renderMasthead() +
      '<main id="main-content" class="page-body">' +
      (showBoard && !hasActiveFilters() ? renderOverview() : '') +
      renderToolbar() +
      (showBoard ? renderSliceBar(filtered) + renderBoardTable(filtered) : state.tab === 'live' ? renderLivePeersTab() : renderModelTab()) +
      `<p class="footer-note">DefiLlama sealed snapshot (${esc(DATA.as_of)}) &middot; Pre-token status reflects DefiLlama records (gecko_id, symbol, mcap null), not proof that no token exists &middot; Model ${esc(DATA.config.version)}</p></main>` +
      renderDrawer();

    bindEvents();
    if (focusId === 'f-q') {
      const el = document.getElementById('f-q');
      if (el) { el.focus(); if (caret !== null) el.setSelectionRange(caret, caret); }
    }
  }

  function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => { state.tab = b.dataset.tab || 'all'; writeHash(); render(); }),
    );
    const bind = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    bind('f-q', 'input', (e) => { state.q = e.target.value; writeHash(); render(); });
    bind('f-sector', 'change', (e) => { state.sector = e.target.value; writeHash(); render(); });
    bind('f-cat', 'change', (e) => { state.category = e.target.value; writeHash(); render(); });
    bind('f-chain', 'change', (e) => { state.chain = e.target.value; writeHash(); render(); });
    bind('f-mom', 'change', (e) => { state.momentum = e.target.value; writeHash(); render(); });
    bind('f-lowgas', 'change', (e) => { state.lowGas = e.target.checked; writeHash(); render(); });
    bind('btn-reset', 'click', () => {
      Object.assign(state, { tab: 'all', q: '', sector: '', category: '', chain: '', momentum: '', lowGas: false, sort: 'rank', dir: 'asc' });
      writeHash(); render();
    });
    document.querySelectorAll('[data-sort]').forEach((th) =>
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (state.sort === col) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.sort = col; state.dir = ['rank', 'name', 'gas'].includes(col) ? 'asc' : 'desc'; }
        writeHash(); render();
      }),
    );
    document.querySelectorAll('[data-open], .top8-bar-row').forEach((el) =>
      el.addEventListener('click', () => { state.p = el.dataset.open || el.dataset.slug || ''; writeHash(); render(); }),
    );
    bind('btn-close-drawer', 'click', () => { state.p = ''; writeHash(); render(); });
    bind('drawer-backdrop', 'click', (e) => { if (e.target.id === 'drawer-backdrop') { state.p = ''; writeHash(); render(); } });

    const onSlide = () => {
      const g = document.getElementById('sl-growth'), d = document.getElementById('sl-dur'), e = document.getElementById('sl-elast');
      if (!g || !d || !e) return;
      state.simGrowth = parseFloat(g.value); state.simDuration = parseFloat(d.value); state.simElasticity = parseFloat(e.value);
      render();
    };
    bind('sl-growth', 'input', onSlide);
    bind('sl-dur', 'input', onSlide);
    bind('sl-elast', 'input', onSlide);
    bind('btn-sim-reset', 'click', () => {
      state.simGrowth = DATA.config.growth_sensitivity; state.simDuration = DATA.config.duration_span; state.simElasticity = DATA.calibration.scale_elasticity;
      render();
    });
  }

  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.p) { state.p = ''; writeHash(); render(); } });
  window.addEventListener('hashchange', () => { readHash(); render(); });

  window.RADAR_VERIFY_ALL = () => {
    const mismatches = [];
    DATA.rows.forEach((r) => {
      const res = recomputeValuation(r);
      if (res.implied !== r.implied_value_usd) mismatches.push({ slug: r.slug, expected: r.implied_value_usd, got: res.implied });
    });
    return { total: DATA.rows.length, mismatches };
  };

  readHash();
  render();
})();
