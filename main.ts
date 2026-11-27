// Token Launch Radar (radar-5.0) — Deterministic CLI Entrypoint (Node 22 stdlib only).

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, parseSnapshot, serializeDataScript } from './lib/board-builder.ts';
import { verifyValuationParity } from './lib/valuation.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const DOSSIER_TEXT_HEADROOM = 1_024;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const PLAIN_FILENAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const FORBIDDEN_NET_HTML = /(?:href|src|action|poster|data)\s*=\s*["']https?:\/\/|<style[^>]*>[\s\S]*?https?:\/\//i;
const FORBIDDEN_NET_CSS = /https?:\/\//i;
const FORBIDDEN_NET_JS = /(?:^|[\s;({])(?:import|export)\s+[^;\n]*?["']https?:\/\/|(?:require|import)\s*\(\s*["']https?:\/\//i;

interface DashboardAuditResult {
  totalBytes: number;
  error: string | null;
}

/** Verify dashboard files satisfy zero-network rules, required types, plain filenames, and 64 KB cap. */
function auditDashboardFiles(dashDir: string, files: readonly string[]): DashboardAuditResult {
  let totalBytes = 0;
  for (const name of files) {
    if (!PLAIN_FILENAME.test(name)) {
      return { totalBytes, error: `invalid dashboard filename: ${name}` };
    }
    const content = readFileSync(join(dashDir, name), 'utf8');
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (name.endsWith('.html') && FORBIDDEN_NET_HTML.test(content)) {
      return { totalBytes, error: `dashboard/${name} contains a forbidden network URL` };
    }
    if (name.endsWith('.css') && FORBIDDEN_NET_CSS.test(content)) {
      return { totalBytes, error: `dashboard/${name} contains a forbidden network URL` };
    }
    if ((name.endsWith('.js') || name.endsWith('.mjs')) && FORBIDDEN_NET_JS.test(content)) {
      return { totalBytes, error: `dashboard/${name} contains a forbidden network import` };
    }
  }
  if (!files.includes('index.html')) {
    return { totalBytes, error: 'dashboard/index.html is required' };
  }
  if (!files.some((f) => f.endsWith('.css'))) {
    return { totalBytes, error: 'dashboard/ must contain at least one .css file' };
  }
  if (!files.some((f) => f.endsWith('.js'))) {
    return { totalBytes, error: 'dashboard/ must contain at least one .js file' };
  }
  if (totalBytes >= TEXT_MAX_BYTES - DOSSIER_TEXT_HEADROOM) {
    return {
      totalBytes,
      error: `dashboard/ source (${totalBytes} bytes) risks truncation at ${TEXT_MAX_BYTES} byte dossier cap`,
    };
  }
  return { totalBytes, error: null };
}

function parseFlag(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${flag}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const prefix = `--${flag}=`;
  const eq = process.argv.find((arg) => arg.startsWith(prefix));
  return eq === undefined ? fallback : eq.slice(prefix.length);
}

function resolveSnapshotFile(): string {
  const defaultInput = process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const raw = parseFlag('input', defaultInput);
  return raw.endsWith('.json') ? raw : join(raw, 'snapshot.json');
}

function copySortedFiles(srcDir: string, dstDir: string): string[] {
  if (!existsSync(srcDir)) return [];
  mkdirSync(dstDir, { recursive: true });
  const names = readdirSync(srcDir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const copied: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(srcDir, name);
    if (!statSync(full).isFile()) continue;
    copyFileSync(full, join(dstDir, name));
    copied.push(name);
  }
  return copied;
}

function run(): void {
  const snapshotPath = resolveSnapshotFile();
  if (!existsSync(snapshotPath)) {
    process.stderr.write(`radar-5.0: snapshot not found at ${snapshotPath}\n`);
    process.exit(2);
  }

  const outDir = parseFlag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
  const { board, payload } = buildRadar(snapshot);

  const gateErr = boardIssue(board, snapshot);
  if (gateErr !== null) {
    process.stderr.write(`radar-5.0: board validation failed: ${gateErr}\n`);
    process.exit(1);
  }

  const parityErr = verifyValuationParity(board);
  if (parityErr !== null) {
    process.stderr.write(`radar-5.0: valuation parity failed: ${parityErr}\n`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'board.json'),
    `${JSON.stringify({
      as_of: snapshot.as_of,
      model_version: payload.config.version,
      calibration: payload.calibration,
      loocv: payload.loocv,
      rows: board,
    })}\n`,
  );
  writeFileSync(join(outDir, 'data.js'), serializeDataScript(payload));

  const dashOut = join(outDir, 'dashboard');
  const dashFiles = copySortedFiles(join(ROOT_DIR, 'dashboard'), dashOut);
  const dashAudit = auditDashboardFiles(dashOut, dashFiles);
  if (dashAudit.error !== null) {
    process.stderr.write(`radar-5.0: dashboard audit failed: ${dashAudit.error}\n`);
    process.exit(1);
  }

  const shotFiles = copySortedFiles(join(ROOT_DIR, 'screenshots'), join(outDir, 'screenshots'));

  if (shotFiles.length < 3 || shotFiles.length > 4) {
    process.stderr.write(`radar-5.0: expected 3-4 screenshots, found ${shotFiles.length}\n`);
    process.exit(1);
  }
  for (const f of shotFiles) {
    if (!PLAIN_FILENAME.test(f)) {
      process.stderr.write(`radar-5.0: invalid screenshot filename: ${f}\n`);
      process.exit(1);
    }
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: DASHBOARD_CAPS,
  });
  const parsedDossier = JSON.parse(Buffer.from(dossier).toString('utf8')) as { text: string };
  if (parsedDossier.text.includes('[Cut at ')) {
    process.stderr.write('radar-5.0: dossier text was truncated at 65,536 bytes; shrink dashboard source\n');
    process.exit(1);
  }
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  process.stdout.write(
    `radar-5.0: ${board.length} rows (${payload.summary.watchlist_size} watchlist + ${payload.summary.early_size} early, ` +
      `${payload.summary.sibling_filtered_count} siblings filtered), elasticity=${payload.calibration.scale_elasticity}, ` +
      `LOOCV MAE=${payload.loocv.mean_abs_log_error} within2x=${payload.loocv.within_2x_pct}%, ` +
      `dashboard=${dashFiles.length} files (${dashAudit.totalBytes}B, 0 truncated), ` +
      `screenshots=${shotFiles.length}, dossier=${dossier.length}B\n`,
  );
}

run();
