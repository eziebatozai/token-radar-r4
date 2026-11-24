// Token Launch Radar (r4) — Entrypoint (Node 22, standard library only, deterministic).
//
// Reads the sealed DefiLlama snapshot, scores all watchlist + clean early pre-token protocols
// via lib/model.ts, validates the board against the gate contract, writes board.json and data.js,
// copies dashboard/ and screenshots/ into the output directory, and emits dossier.json via
// vendor/makefun-board.ts.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BoardRow, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const VALID_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const NET_URL_IN_ATTR_OR_IMPORT = /(?:href|src|action|poster)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|(?:import|require)\s*\(?["']https?:\/\//i;

function readFlag(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit === undefined ? fallback : hit.slice(prefix.length);
}

function resolveInputPath(): string {
  const envInput = process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const raw = readFlag('input', envInput);
  return raw.endsWith('.json') ? raw : join(raw, 'snapshot.json');
}

function copyDirectory(srcDir: string, destDir: string): string[] {
  if (!existsSync(srcDir)) return [];
  mkdirSync(destDir, { recursive: true });
  const names = readdirSync(srcDir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const copied: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const srcPath = join(srcDir, name);
    if (!statSync(srcPath).isFile()) continue;
    copyFileSync(srcPath, join(destDir, name));
    copied.push(name);
  }
  return copied;
}

/** Independently recompute every row's implied_value_usd from its rounded multipliers to guarantee exact audit parity. */
function verifyModelParity(board: readonly BoardRow[]): string | null {
  for (const row of board) {
    const m = row.model;
    const recomputed = Math.max(
      1,
      Math.round(row.tvl_usd * m.peer_mult * m.growth_mult * m.duration_mult * m.scale_mult * m.chain_mult),
    );
    if (recomputed !== row.implied_value_usd) {
      return `${row.slug}: expected ${recomputed} from rounded multipliers, got ${row.implied_value_usd}`;
    }
  }
  return null;
}

/** Verify dashboard files fit within the dossier text cap (no truncation) and contain no forbidden network references. */
function auditDashboard(dashDir: string, files: readonly string[]): { totalBytes: number; error: string | null } {
  let totalBytes = 0;
  for (const name of files) {
    if (!VALID_NAME.test(name)) {
      return { totalBytes, error: `invalid dashboard filename: ${name}` };
    }
    const content = readFileSync(join(dashDir, name), 'utf8');
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (NET_URL_IN_ATTR_OR_IMPORT.test(content)) {
      return { totalBytes, error: `dashboard/${name} contains a forbidden network URL` };
    }
  }
  if (!files.includes('index.html')) return { totalBytes, error: 'dashboard/index.html missing' };
  if (!files.some((f) => f.endsWith('.css'))) return { totalBytes, error: 'dashboard/ missing .css file' };
  if (!files.some((f) => f.endsWith('.js'))) return { totalBytes, error: 'dashboard/ missing .js file' };
  if (totalBytes >= TEXT_MAX_BYTES - 1024) {
    return { totalBytes, error: `dashboard/ text (${totalBytes} bytes) risks truncation at ${TEXT_MAX_BYTES} byte cap` };
  }
  return { totalBytes, error: null };
}

function main(): void {
  const inputPath = resolveInputPath();
  if (!existsSync(inputPath)) {
    process.stderr.write(`token-radar: missing snapshot at ${inputPath}\n`);
    process.exit(2);
  }

  const outDir = readFlag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const snapshot = parseSnapshot(readFileSync(inputPath, 'utf8'));
  const { board, radar } = buildRadar(snapshot);

  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`token-radar: board failed validation: ${issue}\n`);
    process.exit(1);
  }
  const parityErr = verifyModelParity(board);
  if (parityErr !== null) {
    process.stderr.write(`token-radar: model parity check failed: ${parityErr}\n`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'board.json'),
    `${JSON.stringify({ as_of: snapshot.as_of, model_version: radar.config.version, calibration: radar.calibration, rows: board })}\n`,
  );
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));

  const dashOut = join(outDir, 'dashboard');
  const dashFiles = copyDirectory(join(ROOT_DIR, 'dashboard'), dashOut);
  const dashAudit = auditDashboard(dashOut, dashFiles);
  if (dashAudit.error !== null) {
    process.stderr.write(`token-radar: dashboard audit failed: ${dashAudit.error}\n`);
    process.exit(1);
  }

  const shotFiles = copyDirectory(join(ROOT_DIR, 'screenshots'), join(outDir, 'screenshots'));
  if (shotFiles.length < 3 || shotFiles.length > 4) {
    process.stderr.write(`token-radar: screenshots/ must contain 3 to 4 images, found ${shotFiles.length}\n`);
    process.exit(1);
  }
  for (const f of shotFiles) {
    if (!VALID_NAME.test(f)) {
      process.stderr.write(`token-radar: invalid screenshot name: ${f}\n`);
      process.exit(1);
    }
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: DASHBOARD_CAPS,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  process.stdout.write(
    `token-radar (${radar.config.version}): ${board.length} ranked rows (${radar.summary.watchlist_size} watchlist + ${radar.summary.early_size} early), ` +
      `${radar.summary.live_peer_count} live peers calibrated, dashboard ${dashFiles.length} files (${dashAudit.totalBytes} bytes, 0 truncated), ` +
      `${shotFiles.length} screenshots, dossier ${dossier.length} bytes\n`,
  );
}

main();
