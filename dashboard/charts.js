/* Token Launch Radar (radar-5.0) — Zero-Dependency SVG Chart Builders */
(function () {
  'use strict';

  const SECTOR_COLORS = {
    'Spot DEX & Liquidity': '#0b6e4f',
    'Derivatives & Basis': '#b45309',
    'Lending & Credit': '#2563eb',
    'Asset Mgmt & Yield': '#7c3aed',
    'Staking & Security': '#0891b2',
    'RWA & Credit': '#be185d',
    'Chains & Infra': '#475569',
  };

  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function compactUsd(n) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 100e6 ? 0 : 1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
    return `${sign}$${Math.round(abs)}`;
  }

  /** Geometric radar-sweep brand mark SVG. */
  function brandMarkSvg() {
    return `<svg class="brand-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="16" fill="#0f1f24" stroke="#34d399" stroke-width="1.6"/>
      <circle cx="18" cy="18" r="10.5" stroke="#34d399" stroke-opacity="0.45" stroke-width="1.1"/>
      <circle cx="18" cy="18" r="5" stroke="#34d399" stroke-opacity="0.35" stroke-width="1"/>
      <path d="M18 18 L29.5 9.5 A14 14 0 0 1 32 18 Z" fill="#34d399" fill-opacity="0.28"/>
      <line x1="18" y1="18" x2="29.5" y2="9.5" stroke="#34d399" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="24.5" cy="13.5" r="2.2" fill="#f59e0b"/>
      <circle cx="18" cy="18" r="2.2" fill="#ffffff"/>
    </svg>`;
  }

  /** Clickable Top-8 Pre-Token Launch Valuations bar chart with Bear-Bull P25-P75 whisker. */
  function top8ValuationsSvg(rows) {
    const top = rows.slice(0, 8);
    if (!top.length) return '';
    const w = 680;
    const rowH = 22;
    const h = 10 + top.length * rowH;
    const plotX = 160;
    const plotW = w - plotX - 82;
    const maxScale = Math.max(
      1,
      ...top.map((r) => Math.max(r.implied_value_usd, Math.min(r.range.bull_usd, r.implied_value_usd * 2.1))),
    );

    const body = top
      .map((r, j) => {
        const y = 4 + j * rowH;
        const barW = Math.max(4, (r.implied_value_usd / maxScale) * plotW);
        const bearX = plotX + (r.range.bear_usd / maxScale) * plotW;
        const bullX = plotX + (Math.min(r.range.bull_usd, maxScale) / maxScale) * plotW;
        const label = r.name.length > 20 ? `${r.name.slice(0, 19)}…` : r.name;
        const dot = r.cohort === 'watchlist' ? '#b45309' : '#0b6e4f';
        return `<g class="top8-bar-row" data-slug="${esc(r.slug)}">
          <rect class="top8-bg" x="0" y="${y}" width="${w}" height="${rowH - 2}" rx="4" fill="transparent"/>
          <circle cx="8" cy="${y + 10}" r="3.2" fill="${dot}"/>
          <text x="17" y="${y + 14}" font-size="11.5" font-weight="600" fill="#0f172a">#${r.rank} ${esc(label)}</text>
          <rect x="${plotX}" y="${y + 5}" width="${plotW}" height="10" rx="3" fill="#f0ede4"/>
          <rect class="top8-fill" x="${plotX}" y="${y + 5}" width="${barW.toFixed(1)}" height="10" rx="3" fill="#0b6e4f"/>
          <line x1="${bearX.toFixed(1)}" y1="${y + 10}" x2="${bullX.toFixed(1)}" y2="${y + 10}" stroke="#b45309" stroke-opacity="0.58" stroke-width="1.6"/>
          <circle cx="${bullX.toFixed(1)}" cy="${y + 10}" r="2" fill="#b45309" fill-opacity="0.75"/>
          <text x="${w - 4}" y="${y + 14}" text-anchor="end" font-size="11.5" font-weight="700" font-family="ui-monospace,Menlo,monospace" fill="#0f172a">${esc(compactUsd(r.implied_value_usd))}</text>
        </g>`;
      })
      .join('');
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Top 8 pre-token valuations">${body}</svg>`;
  }

  /** Empirical Log-TVL vs Log-Mcap/TVL scatter plot of all 101 live peers + fitted elasticity slope. */
  function elasticityCalibrationSvg(livePeers, calibration) {
    const w = 620;
    const h = 186;
    const padL = 46;
    const padR = 14;
    const padT = 14;
    const padB = 34;
    const pw = w - padL - padR;
    const ph = h - padT - padB;
    const minX = Math.log10(5e6);
    const maxX = Math.log10(3e10);
    const minY = Math.log10(0.015);
    const maxY = Math.log10(2.5);

    const mapX = (tvl) => padL + Math.max(0, Math.min(1, (Math.log10(Math.max(tvl, 5e6)) - minX) / (maxX - minX))) * pw;
    const mapY = (m) => padT + (1 - (Math.log10(Math.max(0.015, Math.min(2.5, m))) - minY) / (maxY - minY)) * ph;

    const parts = [];
    for (const yv of [0.02, 0.1, 0.5, 2.0]) {
      const yy = mapY(yv).toFixed(1);
      parts.push(`<line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" stroke="#ebe7dc"/>`);
      parts.push(`<text x="${padL - 6}" y="${Number(yy) + 3.5}" text-anchor="end" font-size="9.5" font-family="ui-monospace,Menlo,monospace" fill="#64748b">${yv}x</text>`);
    }
    for (const [v, lbl] of [[1e7, '$10M'], [1e8, '$100M'], [1e9, '$1B'], [1e10, '$10B']]) {
      const xx = mapX(v).toFixed(1);
      const anchor = v === 1e8;
      parts.push(`<line x1="${xx}" y1="${padT}" x2="${xx}" y2="${h - padB}" stroke="${anchor ? '#b45309' : '#ebe7dc'}" stroke-dasharray="${anchor ? '3,3' : 'none'}"/>`);
      parts.push(`<text x="${xx}" y="${h - padB + 12}" text-anchor="middle" font-size="9.5" font-family="ui-monospace,Menlo,monospace" fill="${anchor ? '#b45309' : '#64748b'}" font-weight="${anchor ? '700' : '400'}">${lbl}</text>`);
    }
    for (const peer of livePeers) {
      const col = SECTOR_COLORS[peer.sector] || '#475569';
      parts.push(`<circle cx="${mapX(peer.tvl_usd).toFixed(1)}" cy="${mapY(peer.mcap_tvl_ratio).toFixed(1)}" r="3.1" fill="${col}" fill-opacity="0.72" stroke="#fff" stroke-width="0.6"><title>${esc(peer.name)} (${esc(peer.sector)}): TVL ${esc(compactUsd(peer.tvl_usd))}, Mcap/TVL ${peer.mcap_tvl_ratio.toFixed(2)}x</title></circle>`);
    }

    const slope = calibration.scale_elasticity;
    const am = calibration.global_anchor_mult;
    parts.push(`<line x1="${mapX(6e6).toFixed(1)}" y1="${mapY(am * Math.pow(6e6 / 1e8, slope)).toFixed(1)}" x2="${mapX(2.2e10).toFixed(1)}" y2="${mapY(am * Math.pow(2.2e10 / 1e8, slope)).toFixed(1)}" stroke="#111827" stroke-width="2.2" stroke-linecap="round"/>`);
    parts.push(`<circle cx="${mapX(1e8).toFixed(1)}" cy="${mapY(am).toFixed(1)}" r="4.5" fill="#f59e0b" stroke="#111827" stroke-width="1.5"/>`);
    parts.push(`<text x="${w - padR - 4}" y="${padT + 10}" text-anchor="end" font-size="10" font-weight="700" fill="#111827">Fitted slope: ${slope.toFixed(3)} · $100M anchor ${am.toFixed(3)}x</text>`);

    const leg = [
      ['DEX', 'Spot DEX & Liquidity'], ['Deriv', 'Derivatives & Basis'], ['Lend', 'Lending & Credit'],
      ['Yield', 'Asset Mgmt & Yield'], ['Stake', 'Staking & Security'], ['RWA', 'RWA & Credit'], ['Infra', 'Chains & Infra'],
    ];
    leg.forEach(([short, full], i) => {
      const lx = padL + i * 78;
      parts.push(`<circle cx="${lx + 3}" cy="${h - 8}" r="3" fill="${SECTOR_COLORS[full]}"/>`);
      parts.push(`<text x="${lx + 9}" y="${h - 5}" font-size="9.5" fill="#475569">${short}</text>`);
    });

    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Empirical TVL scale elasticity calibration">${parts.join('')}</svg>`;
  }

  /** Horizontal Bear (P25) / Base / Bull (P75) valuation band SVG for detail drawer. */
  function rangeBandSvg(range) {
    const w = 360;
    const h = 44;
    const pad = 16;
    const span = w - pad * 2;
    const lo = range.bear_usd;
    const mid = range.base_usd;
    const hi = Math.max(range.bull_usd, mid + 1);
    const mx = Math.max(pad + 14, Math.min(w - pad - 14, pad + ((mid - lo) / Math.max(hi - lo, 1)) * span));
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Empirical Bear Base Bull valuation band">
      <text x="${pad}" y="11" font-size="9.5" font-weight="600" fill="#64748b">Bear P25 (${range.bear_factor.toFixed(2)}x)</text>
      <text x="${w - pad}" y="11" text-anchor="end" font-size="9.5" font-weight="600" fill="#64748b">Bull P75 (${range.bull_factor.toFixed(2)}x)</text>
      <rect x="${pad}" y="18" width="${span}" height="8" rx="4" fill="#e6e1d4"/>
      <rect x="${pad}" y="18" width="${(mx - pad).toFixed(1)}" height="8" rx="4" fill="#0b6e4f" fill-opacity="0.32"/>
      <circle cx="${pad}" cy="22" r="3.5" fill="#64748b"/>
      <circle cx="${w - pad}" cy="22" r="3.5" fill="#b45309"/>
      <circle cx="${mx.toFixed(1)}" cy="22" r="5" fill="#0b6e4f" stroke="#fff" stroke-width="1.5"/>
      <text x="${pad}" y="40" font-size="10.5" font-weight="700" font-family="ui-monospace,Menlo,monospace" fill="#334155">${esc(compactUsd(lo))}</text>
      <text x="${mx.toFixed(1)}" y="40" text-anchor="middle" font-size="10.5" font-weight="700" font-family="ui-monospace,Menlo,monospace" fill="#07523a">${esc(compactUsd(mid))}</text>
      <text x="${w - pad}" y="40" text-anchor="end" font-size="10.5" font-weight="700" font-family="ui-monospace,Menlo,monospace" fill="#b45309">${esc(compactUsd(hi))}</text>
    </svg>`;
  }

  window.RADAR_CHARTS = { SECTOR_COLORS, compactUsd, brandMarkSvg, top8ValuationsSvg, elasticityCalibrationSvg, rangeBandSvg };
})();
