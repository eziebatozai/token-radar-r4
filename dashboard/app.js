// Token Launch Radar (r4) — Static Dashboard (Zero Network)
// Transparently recomputes every row's implied value from snapshot figures, runs an interactive
// sensitivity sandbox, separates live-token peers, and generates concrete 7-step farm plans.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var root = document.getElementById('app');
  var cfg = DATA.config;

  var state = {
    tab: 'all', q: '', category: 'all', chain: 'all', momentum: 'all',
    sort: 'implied', dir: -1, selected: null,
    sandbox: { growthScale: 1.0, durationSpan: cfg.duration_span, scaleExp: cfg.scale_exponent }
  };

  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtExactUsd(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var dec = Math.abs(n) > 0 && Math.abs(n) < 0.1 ? 2 : 1;
    return (n > 0 ? '+' : '') + n.toFixed(dec) + '%';
  }
  function fmtDays(d) { return (d === null || d === undefined) ? 'unlisted' : d >= 365 ? (d / 365).toFixed(1) + 'y (' + d + 'd)' : d + 'd'; }
  function fmtGas(usd) { return usd < 10 ? '$' + usd.toFixed(2) : '$' + Math.round(usd); }

  // Exact valuation recomputation from snapshot figures; default sandbox matches board.json to $1.
  function recomputeImplied(row, overrides) {
    var gScale = overrides ? overrides.growthScale : 1.0;
    var dSpan = overrides ? overrides.durationSpan : cfg.duration_span;
    var sExp = overrides ? overrides.scaleExp : cfg.scale_exponent;
    var peerMult = row.model.peer_mult;

    var growthMult;
    if (row.change_7d === null || row.change_7d === undefined || !isFinite(row.change_7d)) {
      growthMult = round4(cfg.growth_null_mult);
    } else {
      var g = round4(clamp(row.change_7d, cfg.growth_floor, cfg.growth_cap));
      if (g >= 0) {
        var boost = g <= cfg.growth_knee
          ? g * cfg.growth_pos_slope_low
          : cfg.growth_knee * cfg.growth_pos_slope_low + (g - cfg.growth_knee) * cfg.growth_pos_slope_high;
        growthMult = round4(1 + boost * gScale);
      } else {
        growthMult = round4(1 + g * cfg.growth_neg_slope * gScale);
      }
    }

    var durationMult;
    if (row.tokenless_days === null || row.tokenless_days === undefined) {
      durationMult = round4(cfg.duration_null_mult);
    } else {
      var capped = Math.min(row.tokenless_days, cfg.duration_cap_days);
      var norm = Math.log1p(capped / cfg.duration_scale_days) / Math.log1p(cfg.duration_cap_days / cfg.duration_scale_days);
      durationMult = round4(cfg.duration_base + dSpan * norm);
    }

    var scaleMult = round4(clamp(Math.pow(Math.max(row.tvl_usd, 1) / cfg.scale_anchor_usd, sExp), cfg.scale_min, cfg.scale_max));
    var extraChains = Math.min(Math.max((row.chains ? row.chains.length : 0) - 1, 0), cfg.chain_extra_cap);
    var chainMult = round4(1 + cfg.chain_step * extraChains);
    var implied = Math.max(1, Math.round(row.tvl_usd * peerMult * growthMult * durationMult * scaleMult * chainMult));
    return { implied: implied, peerMult: peerMult, growthMult: growthMult, durationMult: durationMult, scaleMult: scaleMult, chainMult: chainMult };
  }

  function isSandboxModified() {
    return Math.abs(state.sandbox.growthScale - 1.0) > 1e-6 ||
      Math.abs(state.sandbox.durationSpan - cfg.duration_span) > 1e-6 ||
      Math.abs(state.sandbox.scaleExp - cfg.scale_exponent) > 1e-6;
  }

  // Parses each structured farm_step string emitted into board.json & data.js by lib/model.ts
  // ("N. Title: Action. Cost: X. Timeframe: Y.") so the detail view matches board.json verbatim.
  function parseFarmStep(line, idx) {
    var title = 'Step ' + (idx + 1);
    var body = line;
    var colon = line.indexOf(': ');
    if (colon > 0 && colon < 48) {
      title = line.slice(0, colon);
      body = line.slice(colon + 2);
    }
    var cost = '';
    var timeframe = '';
    var tfAt = body.lastIndexOf(' Timeframe: ');
    if (tfAt >= 0) {
      timeframe = body.slice(tfAt + 12).replace(/\.$/, '');
      body = body.slice(0, tfAt);
    }
    var costAt = body.lastIndexOf(' Cost: ');
    if (costAt >= 0) {
      cost = body.slice(costAt + 7).replace(/\.$/, '');
      body = body.slice(0, costAt);
    }
    return { title: title, action: body.trim(), cost: cost, timeframe: timeframe };
  }

  function buildFarmPlan(row) {
    var raw = Array.isArray(row.farm_steps) ? row.farm_steps : [];
    return {
      summary: row.farm_summary,
      steps: raw.map(parseFarmStep)
    };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') node.setAttribute('style', v);
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function svgRadarIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', '#14b8a6'); svg.setAttribute('stroke-width', '2');
    [['circle', { cx: '12', cy: '12', r: '9', opacity: '0.45' }], ['circle', { cx: '12', cy: '12', r: '5', opacity: '0.75' }],
     ['line', { x1: '12', y1: '12', x2: '18.5', y2: '5.5' }], ['circle', { cx: '12', cy: '12', r: '1.6', fill: '#5eead4', stroke: 'none' }]]
      .forEach(function (spec) {
        var n = document.createElementNS(ns, spec[0]);
        Object.keys(spec[1]).forEach(function (k) { n.setAttribute(k, spec[1][k]); });
        svg.appendChild(n);
      });
    return svg;
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    ['tab', 'q', 'category', 'chain', 'momentum', 'sort'].forEach(function (k) { if (p.get(k)) state[k] = p.get(k); });
    if (p.get('dir')) state.dir = p.get('dir') === 'asc' ? 1 : -1;
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.tab !== 'all') p.set('tab', state.tab);
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.momentum !== 'all') p.set('momentum', state.momentum);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.dir !== -1) p.set('dir', 'asc');
    if (state.selected) p.set('p', state.selected);
    var next = p.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function enrichedRows() {
    var mod = isSandboxModified();
    var list = DATA.rows.map(function (r) {
      return { row: r, implied: mod ? recomputeImplied(r, state.sandbox).implied : r.implied_value_usd, simRank: r.rank };
    });
    if (mod) {
      list.sort(function (a, b) { return b.implied - a.implied || (a.row.slug < b.row.slug ? -1 : 1); });
      list.forEach(function (it, i) { it.simRank = i + 1; });
    }
    return list;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return enrichedRows().filter(function (it) {
      var r = it.row;
      if (state.tab === 'watchlist' && r.cohort !== 'watchlist') return false;
      if (state.tab === 'early' && r.cohort !== 'early') return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.momentum === 'pos' && (r.change_7d === null || r.change_7d <= 0)) return false;
      if (state.momentum === 'surge' && (r.change_7d === null || r.change_7d < 5)) return false;
      if (state.momentum === 'neg' && (r.change_7d === null || r.change_7d >= 0)) return false;
      if (state.momentum === 'null' && r.change_7d !== null) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', r.sector || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  function sortItems(list) {
    var k = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (k === 'name') { av = a.row.name.toLowerCase(); bv = b.row.name.toLowerCase(); }
      else if (k === 'tvl') { av = a.row.tvl_usd; bv = b.row.tvl_usd; }
      else if (k === 'growth') { av = a.row.change_7d === null ? -99999 : a.row.change_7d; bv = b.row.change_7d === null ? -99999 : b.row.change_7d; }
      else if (k === 'duration') { av = a.row.tokenless_days === null ? -1 : a.row.tokenless_days; bv = b.row.tokenless_days === null ? -1 : b.row.tokenless_days; }
      else if (k === 'peer') { av = a.row.model.peer_mult; bv = b.row.model.peer_mult; }
      else if (k === 'gas') { av = a.row.farm_summary.est_gas_usd; bv = b.row.farm_summary.est_gas_usd; }
      else if (k === 'rank') { return (a.simRank - b.simRank) * (dir < 0 ? 1 : -1); }
      else { av = a.implied; bv = b.implied; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0;
    });
  }

  function hasActiveFilters() {
    return state.q.trim() !== '' || state.category !== 'all' || state.chain !== 'all' || state.momentum !== 'all' || state.tab === 'watchlist' || state.tab === 'early';
  }
  function resetFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.momentum = 'all';
    if (state.tab === 'watchlist' || state.tab === 'early') state.tab = 'all';
    writeHash(); render();
  }

  function renderMasthead() {
    var s = DATA.summary;
    return el('header', { class: 'masthead' },
      el('div', { class: 'masthead-inner' },
        el('div', { class: 'top-bar' },
          el('div', { class: 'brand' },
            el('div', { class: 'brand-icon' }, svgRadarIcon()),
            el('div', null,
              el('h1', { class: 'brand-title', text: 'Token Launch Radar' }),
              el('p', { class: 'brand-sub', text: 'Pre-token DeFi implied valuations calibrated from live-token peers, plus chain-tailored farm plans' })
            )
          ),
          el('div', { class: 'meta-pills' },
            el('span', { class: 'meta-pill accent', text: 'Watchlist ' + s.watchlist_size + '/' + s.watchlist_size + ' Covered' }),
            el('span', { class: 'meta-pill', text: 'Snapshot ' + DATA.as_of }),
            el('span', { class: 'meta-pill', text: 'Model ' + cfg.version }),
            el('span', { class: 'meta-pill', text: 'Offline / Zero Network' })
          )
        ),
        el('div', { class: 'kpi-grid' },
          el('div', { class: 'kpi-card' }, el('div', { class: 'kpi-label', text: 'Pre-Token Board' }), el('div', { class: 'kpi-value', text: String(s.board_size) }), el('div', { class: 'kpi-note', text: s.watchlist_size + ' watchlist (>=$50M) + ' + s.early_size + ' early radar' })),
          el('div', { class: 'kpi-card' }, el('div', { class: 'kpi-label', text: 'Combined Implied Value' }), el('div', { class: 'kpi-value', text: fmtUsd(s.total_implied_value_usd) }), el('div', { class: 'kpi-note', text: 'Across ' + fmtUsd(s.total_board_tvl_usd) + ' pre-token TVL' })),
          el('div', { class: 'kpi-card' }, el('div', { class: 'kpi-label', text: 'Live Peer Calibration' }), el('div', { class: 'kpi-value', text: DATA.calibration.global_trimmed_median.toFixed(3) + 'x' }), el('div', { class: 'kpi-note', text: s.live_peer_count + ' live DeFi peers (15% trimmed median)' })),
          el('div', { class: 'kpi-card' }, el('div', { class: 'kpi-label', text: 'Median Implied / TVL' }), el('div', { class: 'kpi-value', text: (s.median_implied_tvl_ratio * 100).toFixed(1) + '%' }), el('div', { class: 'kpi-note', text: DATA.live.length + ' already-trading protocols kept separate' }))
        )
      )
    );
  }

  function renderOverview() {
    var top8 = DATA.rows.slice(0, 8);
    var maxVal = top8.length ? top8[0].implied_value_usd : 1;
    var sectors = DATA.calibration.sectors.slice().sort(function (a, b) { return b.calibrated_mult - a.calibrated_mult; });
    var maxSec = sectors.length ? sectors[0].calibrated_mult : 1;

    return el('section', { class: 'overview-grid' },
      el('div', { class: 'card card-pad' },
        el('div', { class: 'card-head' }, el('h2', { class: 'card-title', text: 'Top 8 Pre-Token Launch Valuations' }), el('span', { class: 'card-sub', text: 'Click any bar for waterfall & farm plan' })),
        el('div', { class: 'chart-rows' }, top8.map(function (r) {
          var pct = Math.max(4, Math.round((r.implied_value_usd / maxVal) * 100));
          return el('div', { class: 'chart-row clickable', onclick: function () { openDetail(r.slug); } },
            el('span', { class: 'chart-label', text: '#' + r.rank + ' ' + r.name }),
            el('div', { class: 'chart-track' }, el('div', { class: 'chart-fill', style: 'width:' + pct + '%' })),
            el('span', { class: 'chart-val', text: fmtUsd(r.implied_value_usd) })
          );
        }))
      ),
      el('div', { class: 'card card-pad' },
        el('div', { class: 'card-head' }, el('h2', { class: 'card-title', text: 'Live-Token Sector Multiples (Mcap / TVL)' }), el('span', { class: 'card-sub', text: 'Shrunk 15% trimmed medians (n=' + DATA.calibration.global_peer_count + ')' })),
        el('div', { class: 'chart-rows' }, sectors.map(function (sec) {
          var pct = Math.max(8, Math.round((sec.calibrated_mult / maxSec) * 100));
          return el('div', { class: 'chart-row' },
            el('span', { class: 'chart-label', text: sec.sector + ' (n=' + sec.peer_count + ')' }),
            el('div', { class: 'chart-track' }, el('div', { class: 'chart-fill sector', style: 'width:' + pct + '%' })),
            el('span', { class: 'chart-val', text: sec.calibrated_mult.toFixed(3) + 'x' })
          );
        })),
        el('p', { class: 'card-sub', style: 'margin-top:10px', text: 'Thin categories (n<=1 live peer) inherit their economic sector prior rather than single-peer noise; n=2 shrinks (k=' + cfg.peer_thin_prior_k + '); n>=3 shrinks (k=' + cfg.peer_cat_prior_k + ').' })
      )
    );
  }

  function renderToolbar(shownCount) {
    var catCounts = {}, chainCounts = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      catCounts[c] = (catCounts[c] || 0) + 1;
      (r.chains || []).forEach(function (ch) { chainCounts[ch] = (chainCounts[ch] || 0) + 1; });
    });
    var cats = Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a] || (a < b ? -1 : 1); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a] || (a < b ? -1 : 1); });

    function tabBtn(id, label, count) {
      return el('button', { type: 'button', class: 'tab-btn', 'aria-pressed': state.tab === id ? 'true' : 'false', onclick: function () { state.tab = id; writeHash(); render(); } },
        label, count !== null ? el('span', { class: 'tab-count', text: String(count) }) : null);
    }

    var searchInput = el('input', { type: 'search', id: 'q-search', placeholder: 'Search protocol, category, sector, or chain...', value: state.q, 'aria-label': 'Search protocols' });
    searchInput.addEventListener('input', function () {
      state.q = searchInput.value; writeHash(); render();
      var fresh = document.getElementById('q-search');
      if (fresh) { fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
    });
    var catSel = el('select', { id: 'f-cat', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories (' + DATA.rows.length + ')' }),
      cats.map(function (c) { return el('option', { value: c, text: c + ' (' + catCounts[c] + ')', selected: state.category === c ? 'selected' : null }); }));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });

    var chainSel = el('select', { id: 'f-chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains (' + chains.length + ')' }),
      chains.map(function (ch) { return el('option', { value: ch, text: ch + ' (' + chainCounts[ch] + ')', selected: state.chain === ch ? 'selected' : null }); }));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });

    var momSel = el('select', { id: 'f-mom', 'aria-label': 'Filter by 7d momentum' },
      [['all', 'All 7d momentum'], ['pos', 'Growing (7d > 0%)'], ['surge', 'Surging (7d >= +5%)'], ['neg', 'Outflow (7d < 0%)'], ['null', 'Unreported 7d (null)']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: state.momentum === o[0] ? 'selected' : null });
      }));
    momSel.addEventListener('change', function () { state.momentum = momSel.value; writeHash(); render(); });

    var showPre = state.tab === 'all' || state.tab === 'watchlist' || state.tab === 'early';
    return el('section', { class: 'toolbar' },
      el('div', { class: 'toolbar-top' },
        el('div', { class: 'tab-group', role: 'tablist' },
          tabBtn('all', 'All Pre-Token', DATA.summary.board_size),
          tabBtn('watchlist', 'Watchlist >=$50M', DATA.summary.watchlist_size),
          tabBtn('early', 'Early Radar <$50M', DATA.summary.early_size),
          tabBtn('live', 'Live Peers (Trading)', DATA.live.length),
          tabBtn('model', 'Model & Sandbox', null)
        ),
        el('span', { class: 'card-sub num', text: showPre ? ('Showing ' + shownCount + ' of ' + DATA.rows.length + ' pre-token protocols') : (state.tab === 'live' ? DATA.live.length + ' live-token protocols' : 'Interactive calibration & formula') })
      ),
      showPre ? el('div', { class: 'filter-row' },
        el('div', { class: 'field grow' }, el('label', { for: 'q-search', text: 'Search' }), searchInput),
        el('div', { class: 'field' }, el('label', { for: 'f-cat', text: 'Category' }), catSel),
        el('div', { class: 'field' }, el('label', { for: 'f-chain', text: 'Chain' }), chainSel),
        el('div', { class: 'field' }, el('label', { for: 'f-mom', text: '7d Momentum' }), momSel),
        hasActiveFilters() ? el('button', { type: 'button', class: 'btn', text: 'Reset', onclick: resetFilters }) : null
      ) : null
    );
  }

  function renderFilterBanner(items) {
    if (!hasActiveFilters()) return null;
    var totalTvl = items.reduce(function (s, it) { return s + it.row.tvl_usd; }, 0);
    var totalImp = items.reduce(function (s, it) { return s + it.implied; }, 0);
    var chips = [];
    if (state.tab === 'watchlist') chips.push('Cohort: Watchlist >=$50M');
    if (state.tab === 'early') chips.push('Cohort: Early Radar <$50M');
    if (state.category !== 'all') chips.push('Category: ' + state.category);
    if (state.chain !== 'all') chips.push('Chain: ' + state.chain);
    var momLabels = { pos: 'Growing (7d > 0%)', surge: 'Surging (7d >= +5%)', neg: 'Outflow (7d < 0%)', 'null': 'Unreported 7d' };
    if (state.momentum !== 'all') chips.push('Momentum: ' + (momLabels[state.momentum] || state.momentum));
    if (state.q.trim()) chips.push('Query: "' + state.q.trim() + '"');
    return el('div', { class: 'filter-banner' },
      el('div', { class: 'filter-chips' }, el('strong', { text: 'Active slice:' }), chips.map(function (t) { return el('span', { class: 'chip', text: t }); })),
      el('div', { class: 'filter-stats' },
        el('span', { text: items.length + ' matched' }),
        el('span', { text: 'TVL ' + fmtUsd(totalTvl) }),
        el('span', { text: 'Implied ' + fmtUsd(totalImp) }),
        el('span', { text: 'Eff. Mult ' + (totalTvl > 0 ? ((totalImp / totalTvl) * 100).toFixed(1) : '0.0') + '%' })
      )
    );
  }

  function sortTh(key, label, right) {
    var active = state.sort === key;
    return el('th', { scope: 'col', class: right ? 'right' : null },
      el('button', {
        type: 'button', class: active ? 'active-sort' : null,
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = (key === 'name' || key === 'rank' || key === 'gas') ? 1 : -1; }
          writeHash(); render();
        }
      }, label + (active ? (state.dir < 0 ? ' ▼' : ' ▲') : ''))
    );
  }

  function renderBoardTable(items) {
    var sorted = sortItems(items);
    if (sorted.length === 0) {
      return el('section', { class: 'card empty' },
        el('h2', { text: 'No pre-token protocols match these filters' }),
        el('p', { text: 'Widen your category, chain, or momentum filter to explore all ' + DATA.rows.length + ' pre-token protocols.' }),
        el('button', { type: 'button', class: 'btn primary', text: 'Reset all filters', onclick: resetFilters })
      );
    }
    var maxImp = sorted.reduce(function (m, it) { return Math.max(m, it.implied); }, 1);
    var tbody = el('tbody');
    sorted.forEach(function (it) {
      var r = it.row, ch = r.chains || [];
      var chTxt = ch.length === 0 ? 'Unspecified' : ch.slice(0, 2).join(', ') + (ch.length > 2 ? ' +' + (ch.length - 2) : '');
      var dCls = r.change_7d === null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg';
      var barPct = Math.max(4, Math.round((it.implied / maxImp) * 100));
      tbody.appendChild(el('tr', {
        class: 'data-row', tabindex: '0', 'data-selected': state.selected === r.slug ? 'true' : 'false',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('div', { class: 'rank-cell' }, el('span', { class: 'rank-num', text: '#' + it.simRank }), el('span', { class: 'badge ' + (r.cohort === 'watchlist' ? 'wl' : 'early'), text: r.cohort === 'watchlist' ? 'WL' : 'EARLY' }))),
        el('td', null, el('div', { class: 'proto-name', text: r.name }), el('div', { class: 'proto-meta', text: (r.category || 'Uncategorized') + ' · ' + chTxt })),
        el('td', { class: 'num right', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'right' }, el('span', { class: 'delta ' + dCls, text: fmtPct(r.change_7d) })),
        el('td', { class: 'num right', text: fmtDays(r.tokenless_days) }),
        el('td', { class: 'num right' }, el('div', { text: r.model.peer_mult.toFixed(3) + 'x' }), el('div', { class: 'val-sub', text: r.sector.split(' ')[0] })),
        el('td', { class: 'right' }, el('div', { class: 'val-cell' },
          el('div', { class: 'val-top' }, el('div', { class: 'val-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + barPct + '%' })), el('span', { class: 'num val-main', text: fmtUsd(it.implied) })),
          el('span', { class: 'val-sub', text: ((it.implied / Math.max(r.tvl_usd, 1)) * 100).toFixed(1) + '% TVL' }))),
        el('td', null, el('div', { class: 'farm-preview' }, el('b', { text: '$' + r.farm_summary.capital_usd + ' · ~' + fmtGas(r.farm_summary.est_gas_usd) + ' gas · ' + r.farm_summary.hold_days + 'd' }), el('span', { text: r.farm_summary.active_chain + ' · 7 steps' })))
      ));
    });
    return el('section', { class: 'card table-panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('thead', null, el('tr', null,
        sortTh('rank', 'Rank', false), sortTh('name', 'Protocol / Category / Chains', false), sortTh('tvl', 'TVL', true),
        sortTh('growth', '7d TVL', true), sortTh('duration', 'No-Token Age', true), sortTh('peer', 'Peer ×', true),
        sortTh('implied', 'Implied Value', true), sortTh('gas', 'Farm Plan (Cap / Gas / Hold)', false)
      )), tbody)));
  }

  function renderLiveView() {
    var tbody = el('tbody');
    DATA.live.forEach(function (p) {
      var ch = p.chains || [], chTxt = ch.slice(0, 2).join(', ') + (ch.length > 2 ? ' +' + (ch.length - 2) : '');
      var dCls = p.change_7d === null ? 'muted' : p.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge live', text: p.symbol || 'LIVE' })),
        el('td', null, el('div', { class: 'proto-name', text: p.name }), el('div', { class: 'proto-meta', text: (p.category || 'Uncategorized') + ' · ' + chTxt })),
        el('td', { class: 'num right', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num right', text: fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num right', text: p.mcap_tvl_ratio !== null ? p.mcap_tvl_ratio.toFixed(3) + 'x' : 'n/a' }),
        el('td', { class: 'right' }, el('span', { class: 'delta ' + dCls, text: fmtPct(p.change_7d) })),
        el('td', null, el('span', { class: 'badge ' + (p.in_calibration ? 'ok' : 'live'), text: p.in_calibration ? 'Peer Pool' : 'Excluded' }))
      ));
    });
    return el('div', { style: 'display:grid;gap:12px' },
      el('div', { class: 'notice-bar' },
        el('span', { text: 'Strict Separation: Already-trading protocols are never ranked on the pre-token board; eligible non-bridge peers calibrate sector & category Mcap/TVL multiples.' }),
        el('span', { class: 'num', text: DATA.calibration.global_peer_count + ' calibrated peers' })
      ),
      el('section', { class: 'card table-panel' }, el('div', { class: 'table-wrap' }, el('table', null,
        el('thead', null, el('tr', null, el('th', { text: 'Token' }), el('th', { text: 'Protocol / Category' }), el('th', { class: 'right', text: 'TVL' }), el('th', { class: 'right', text: 'Market Cap' }), el('th', { class: 'right', text: 'Mcap / TVL' }), el('th', { class: 'right', text: '7d TVL' }), el('th', { text: 'Calibration' }))), tbody)))
    );
  }

  function renderModelSection(compact) {
    var gSlider = el('input', { type: 'range', min: '0', max: '1.5', step: '0.1', value: String(state.sandbox.growthScale) });
    gSlider.addEventListener('input', function () { state.sandbox.growthScale = Number(gSlider.value); render(); });
    var dSlider = el('input', { type: 'range', min: '0', max: '0.6', step: '0.02', value: String(state.sandbox.durationSpan) });
    dSlider.addEventListener('input', function () { state.sandbox.durationSpan = Number(dSlider.value); render(); });
    var sSlider = el('input', { type: 'range', min: '-0.12', max: '0', step: '0.01', value: String(state.sandbox.scaleExp) });
    sSlider.addEventListener('input', function () { state.sandbox.scaleExp = Number(sSlider.value); render(); });

    return el('section', { class: 'card card-pad', style: 'display:grid;gap:12px' },
      el('div', { class: 'card-head', style: 'margin-bottom:0' },
        el('div', null, el('h2', { class: 'card-title', text: 'Transparent Comparables Model (' + cfg.version + ')' }), el('p', { class: 'card-sub', text: 'Every multiplier is derived solely from snapshot figures, rounded to 4 decimals, and recomputable per row.' })),
        isSandboxModified() ? el('button', { type: 'button', class: 'btn primary', text: 'Reset Sandbox', onclick: function () { state.sandbox = { growthScale: 1.0, durationSpan: cfg.duration_span, scaleExp: cfg.scale_exponent }; render(); } }) : null
      ),
      el('div', { class: 'formula-box' },
        'implied_value_usd = round( tvl_usd × peer_mult × growth_mult × duration_mult × scale_mult × chain_mult )\n' +
        '• peer_mult     : Hierarchical ' + Math.round(cfg.peer_trim_frac * 100) + '% trimmed median Mcap/TVL of live peers (clipped ' + cfg.peer_clip_min.toFixed(2) + '–' + cfg.peer_clip_max.toFixed(2) + '; n>=3 k=' + cfg.peer_cat_prior_k + '; n=2 k=' + cfg.peer_thin_prior_k + '; n<=1 sector prior; bounded ' + cfg.peer_mult_min.toFixed(2) + '–' + cfg.peer_mult_max.toFixed(2) + ')\n' +
        '• growth_mult   : Responsive 7d momentum — clamp(' + cfg.growth_floor + '%, +' + cfg.growth_cap + '%); pos +' + (cfg.growth_pos_slope_low * 100).toFixed(2) + '%/pt to +' + cfg.growth_knee + '% then +' + (cfg.growth_pos_slope_high * 100).toFixed(2) + '%/pt; neg -' + (cfg.growth_neg_slope * 100).toFixed(2) + '%/pt; null -> ' + cfg.growth_null_mult.toFixed(4) + 'x\n' +
        '• duration_mult : Token-less duration (as_of − listed_at) — ' + cfg.duration_base.toFixed(2) + ' + ' + cfg.duration_span.toFixed(2) + ' × ln(1 + min(days,' + cfg.duration_cap_days + ')/' + cfg.duration_scale_days + ') / ln(1 + ' + cfg.duration_cap_days + '/' + cfg.duration_scale_days + '); null -> ' + cfg.duration_null_mult.toFixed(4) + 'x\n' +
        '• scale_mult    : TVL scale elasticity — clamp((tvl_usd / $' + Math.round(cfg.scale_anchor_usd / 1e6) + 'M)^' + cfg.scale_exponent + ', ' + cfg.scale_min.toFixed(2) + ', ' + cfg.scale_max.toFixed(2) + ')\n' +
        '• chain_mult    : Multi-chain footprint — 1 + ' + cfg.chain_step + ' × min(max(chains − 1, 0), ' + cfg.chain_extra_cap + ') (1.00–' + (1 + cfg.chain_step * cfg.chain_extra_cap).toFixed(2) + 'x)'
      ),
      !compact ? el('div', null,
        el('h3', { class: 'card-title', style: 'margin-bottom:4px', text: 'Interactive Model Sensitivity Sandbox' }),
        el('div', { class: 'sandbox-grid' },
          el('div', { class: 'slider-card' }, el('div', { class: 'slider-head' }, el('span', { text: '7d Growth Sensitivity' }), el('span', { class: 'num', text: state.sandbox.growthScale.toFixed(1) + 'x' })), gSlider),
          el('div', { class: 'slider-card' }, el('div', { class: 'slider-head' }, el('span', { text: 'Token-less Duration Span' }), el('span', { class: 'num', text: '+' + state.sandbox.durationSpan.toFixed(2) })), dSlider),
          el('div', { class: 'slider-card' }, el('div', { class: 'slider-head' }, el('span', { text: 'TVL Scale Elasticity' }), el('span', { class: 'num', text: state.sandbox.scaleExp.toFixed(2) })), sSlider)
        )
      ) : null,
      !compact ? el('div', null,
        el('h3', { class: 'card-title', style: 'margin-bottom:8px', text: 'Live-Peer Sector Calibration Table' }),
        el('div', { class: 'table-wrap' }, el('table', null,
          el('thead', null, el('tr', null, el('th', { text: 'Sector Family' }), el('th', { class: 'right', text: 'Live Peers' }), el('th', { class: 'right', text: '15% Trimmed Median' }), el('th', { class: 'right', text: 'Calibrated Prior (k=' + cfg.peer_sector_prior_k + ')' }))),
          el('tbody', null, DATA.calibration.sectors.map(function (s) {
            return el('tr', null, el('td', { text: s.sector }), el('td', { class: 'num right', text: String(s.peer_count) }), el('td', { class: 'num right', text: s.raw_trimmed_median.toFixed(4) + 'x' }), el('td', { class: 'num right', text: s.calibrated_mult.toFixed(4) + 'x' }));
          }))
        ))
      ) : null
    );
  }

  var drawer = el('dialog', { class: 'drawer', id: 'detail-drawer', 'aria-labelledby': 'drawer-title' });
  drawer.addEventListener('close', function () {
    state.selected = null; writeHash();
    var prev = document.querySelector('tr.data-row[data-selected="true"]');
    if (prev) prev.setAttribute('data-selected', 'false');
  });

  function multCls(v) { return v > 1.005 ? 'boost' : v < 0.90 ? 'drag' : ''; }

  function openDetail(slug) {
    var row = DATA.rows.find(function (r) { return r.slug === slug; });
    if (!row) return;
    state.selected = slug; writeHash();
    document.querySelectorAll('tr.data-row').forEach(function (tr) { tr.setAttribute('data-selected', 'false'); });

    var check = recomputeImplied(row, null);
    var parityOk = check.implied === row.implied_value_usd;
    var plan = buildFarmPlan(row);
    var m = row.model;

    drawer.textContent = '';
    drawer.appendChild(el('div', { class: 'drawer-head' },
      el('div', null,
        el('div', { class: 'drawer-badges' }, el('span', { class: 'drawer-rank', text: 'RANK #' + row.rank + ' OF ' + DATA.summary.board_size }), el('span', { class: 'badge ' + (row.cohort === 'watchlist' ? 'wl' : 'early'), text: row.cohort === 'watchlist' ? 'WATCHLIST >=$50M' : 'EARLY RADAR <$50M' })),
        el('h2', { class: 'drawer-title', id: 'drawer-title', text: row.name }),
        el('p', { class: 'drawer-sub', text: (row.category || 'Uncategorized') + ' · ' + row.sector + ' · Chains: ' + (row.chains.length ? row.chains.join(', ') : 'Unspecified') })
      ),
      el('button', { type: 'button', class: 'drawer-close', text: 'Close', onclick: function () { drawer.close(); } })
    ));

    var eqRows = [
      ['Base TVL (Snapshot)', 'Reported on ' + DATA.as_of + ' · records no token on DefiLlama', fmtUsd(row.tvl_usd), ''],
      ['× Peer Multiple', m.peer_source, m.peer_mult.toFixed(4) + 'x', ''],
      ['× 7d Growth Momentum', row.change_7d === null ? 'change_7d unreported (null) -> conservative 0.9500x prior' : '7d TVL change ' + fmtPct(row.change_7d) + ' (clamped ' + fmtPct(m.growth_pct) + ')', m.growth_mult.toFixed(4) + 'x', multCls(m.growth_mult)],
      ['× Token-less Duration', row.listed_at === null ? 'listed_at unreported (null) -> conservative 0.8500x prior' : 'Listed ' + row.listed_at + ' -> ' + m.tokenless_days + ' days without token (' + DATA.as_of + ' − listed_at)', m.duration_mult.toFixed(4) + 'x', multCls(m.duration_mult)],
      ['× TVL Scale Elasticity', '(TVL / $' + Math.round(cfg.scale_anchor_usd / 1e6) + 'M)^' + cfg.scale_exponent + ' bounded [' + cfg.scale_min.toFixed(2) + ', ' + cfg.scale_max.toFixed(2) + ']', m.scale_mult.toFixed(4) + 'x', multCls(m.scale_mult)],
      ['× Multi-Chain Footprint', m.chain_count + ' chain' + (m.chain_count === 1 ? '' : 's') + ' (+2.5% per extra chain up to +15%)', m.chain_mult.toFixed(4) + 'x', multCls(m.chain_mult)]
    ];

    drawer.appendChild(el('div', { class: 'drawer-body' },
      el('section', { class: 'drawer-section' },
        el('h3', { text: 'Implied Valuation Waterfall' }),
        el('div', { class: 'eq-table' },
          eqRows.map(function (er) {
            return el('div', { class: 'eq-row' }, el('div', null, el('div', { class: 'eq-name', text: er[0] }), el('div', { class: 'eq-detail', text: er[1] })), el('div', { class: 'eq-val ' + er[3], text: er[2] }));
          }),
          el('div', { class: 'eq-row total' },
            el('div', null, el('div', { class: 'eq-name', text: 'Implied Launch Value' }), el('div', { class: 'eq-detail', text: ((row.implied_value_usd / Math.max(row.tvl_usd, 1)) * 100).toFixed(2) + '% of TVL · model estimate, not a launch guarantee' })),
            el('div', { class: 'eq-val', text: fmtUsd(row.implied_value_usd) })
          )
        ),
        el('div', { class: 'parity-bar', text: parityOk ? ('Parity verified: app.js recomputed ' + fmtExactUsd(check.implied) + ' = board.json exactly') : ('Mismatch: ' + fmtExactUsd(check.implied) + ' vs ' + fmtExactUsd(row.implied_value_usd)) })
      ),
      el('section', { class: 'drawer-section' },
        el('h3', { text: 'Tailored 7-Step Farm Plan (' + plan.summary.dilution_tier + ')' }),
        el('div', { class: 'farm-strip' },
          el('div', { class: 'farm-stat' }, el('span', { text: 'Target Capital' }), el('b', { text: '$' + plan.summary.capital_usd })),
          el('div', { class: 'farm-stat' }, el('span', { text: 'Est. Total Gas' }), el('b', { text: '~' + fmtGas(plan.summary.est_gas_usd) })),
          el('div', { class: 'farm-stat' }, el('span', { text: 'Hold Horizon' }), el('b', { text: plan.summary.hold_days + ' days' })),
          el('div', { class: 'farm-stat' }, el('span', { text: 'Active Chain' }), el('b', { text: plan.summary.active_chain }))
        ),
        el('ol', { class: 'step-list' }, plan.steps.map(function (st) {
          return el('li', { class: 'step-item' },
            el('div', { class: 'step-head', text: st.title }),
            el('p', { class: 'step-desc', text: st.action }),
            el('div', { class: 'step-meta' }, el('span', { class: 'step-tag cost', text: 'Cost: ' + st.cost }), el('span', { class: 'step-tag time', text: 'Time: ' + st.timeframe }))
          );
        }))
      )
    ));

    if (typeof drawer.showModal === 'function') { if (!drawer.open) drawer.showModal(); }
    else drawer.setAttribute('open', '');
  }

  function render() {
    root.textContent = '';
    root.appendChild(renderMasthead());
    var items = filteredRows();
    var shell = el('div', { class: 'shell' });
    if (state.tab === 'all' && !hasActiveFilters()) shell.appendChild(renderOverview());
    shell.appendChild(renderToolbar(items.length));
    if (state.tab === 'live') shell.appendChild(renderLiveView());
    else if (state.tab === 'model') shell.appendChild(renderModelSection(false));
    else {
      var banner = renderFilterBanner(items);
      if (banner) shell.appendChild(banner);
      shell.appendChild(renderBoardTable(items));
      shell.appendChild(renderModelSection(true));
    }
    shell.appendChild(el('footer', { class: 'footer-note' },
      el('span', { text: 'Source: ' + DATA.source + ' · "Records no token" reflects DefiLlama metadata, never proof no token exists.' }),
      el('span', { text: 'Implied valuations are a transparent comparables model, not investment advice.' })
    ));
    root.appendChild(shell);
    if (!drawer.isConnected) root.appendChild(drawer);
    root.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.open) drawer.close(); });
})();
