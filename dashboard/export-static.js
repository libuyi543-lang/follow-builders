#!/usr/bin/env node

// ============================================================================
// Follow Builders — Static export for GitHub Pages
// ============================================================================
// The dashboard normally talks to dashboard/server.js. GitHub Pages can't run
// that server, so this bakes the same read-side data into JSON files and writes
// the whole thing into an output directory that Pages can host directly.
//
// Usage:
//   node dashboard/export-static.js                 # → ./docs
//   node dashboard/export-static.js --out DIR       # custom output directory
//
// Write actions (加印本期 / 静音 / 改栏目) have no server behind them online;
// the frontend hides them. Use the local dashboard for those.
// ============================================================================

import { mkdir, writeFile, cp, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { listIssues, getIssue, accountsWithStats } from './data.js';

const ROOT = decodeURIComponent(new URL('.', import.meta.url).pathname);
const WEB_DIR = join(ROOT, 'web');

function argValue(args, name) {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : null;
}

const OUT_DIR = resolve(argValue(process.argv.slice(2), '--out') || join(ROOT, '..', 'docs'));

async function writeJson(relativePath, value) {
  const path = join(OUT_DIR, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const issues = await listIssues();
  const dates = issues.map((issue) => issue.date).reverse();   // oldest → newest

  // Rebuild from scratch so a renamed or removed page can't linger.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  await cp(WEB_DIR, OUT_DIR, { recursive: true });

  const detail = (await Promise.all(dates.map((date) => getIssue(date)))).filter(Boolean);

  // Same shapes the local server returns for /api/issues, /api/issues/:date and /api/accounts.
  await writeJson('api/issues.json', issues);
  await writeJson('api/accounts.json', await accountsWithStats());
  for (const issue of detail) await writeJson(`api/issue-${issue.date}.json`, issue);
  if (detail.length) await writeJson('api/issue-latest.json', detail.at(-1));
  // Its presence is what tells the frontend it's running without a server.
  await writeJson('api/status.json', { static: true, exportedAt: new Date().toISOString(), issues: issues.length });
  // Jekyll would otherwise swallow files and directories that start with _ or .
  await writeFile(join(OUT_DIR, '.nojekyll'), '');

  console.log(JSON.stringify({ ok: true, outDir: OUT_DIR, issues: issues.length, latest: issues[0]?.date || null }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
