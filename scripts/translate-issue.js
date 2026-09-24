#!/usr/bin/env node

// ============================================================================
// Follow Builders — Translate an archived issue
// ============================================================================
// Backfills Chinese translations into issues printed before translation existed
// (or whose translation failed). Already-translated tweets are left alone.
//
// Usage: node translate-issue.js 2026-09-23 [2026-09-24 ...]
// ============================================================================

import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { USER_DIR, readIssue, writeIssue } from './lib/archive.js';
import { translateDigest } from './lib/translate.js';

loadEnv({ path: join(USER_DIR, '.env'), quiet: true });

for (const date of process.argv.slice(2)) {
  const issue = await readIssue(date);
  if (!issue?.digest) {
    console.log(`${date}: no issue`);
    continue;
  }
  try {
    const count = await translateDigest(issue.digest, process.env.DEEPSEEK_API_KEY);
    issue.translateError = null;
    await writeIssue(issue);
    console.log(`${date}: translated ${count}`);
  } catch (err) {
    console.log(`${date}: failed — ${err.message}`);
  }
}
