#!/usr/bin/env node

// ============================================================================
// Follow Builders — Daily run
// ============================================================================
// prepare → translate + lede (DeepSeek) → render → archive → deliver
//
// Usage:
//   node run-daily.js                      # full run, delivers to Feishu etc.
//   node run-daily.js --no-deliver         # everything except delivery
//   node run-daily.js --out-dir DIR        # also write latest-digest.* into DIR
//
// Delivery sends the full rendered text (render-digest.js), with tweets in
// Chinese where a translation exists; the lede only feeds the dashboard.
// ============================================================================

import { spawn } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { config as loadEnv } from 'dotenv';
import { USER_DIR, localDate, readIssue, writeIssue } from './lib/archive.js';
import { writeLede } from './lib/lede.js';
import { translateDigest } from './lib/translate.js';

loadEnv({ path: join(USER_DIR, '.env'), quiet: true });

const SCRIPT_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname);

function runNode(script, args = [], input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(SCRIPT_DIR, script), ...args], { cwd: SCRIPT_DIR });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${script} exited ${code}: ${(stderr || stdout).trim().slice(0, 500)}`));
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const deliver = !args.includes('--no-deliver');
  const outDir = argValue(args, '--out-dir');

  let timeZone = 'Asia/Shanghai';
  const configPath = join(USER_DIR, 'config.json');
  if (existsSync(configPath)) {
    try { timeZone = JSON.parse(await readFile(configPath, 'utf-8')).timezone || timeZone; } catch {}
  }

  let digestJson;
  let digest;
  try {
    digestJson = await runNode('prepare-digest.js');
    digest = JSON.parse(digestJson);
  } catch (err) {
    // Still leave a trace in the archive so the dashboard shows the day as broken, not missing
    // (but never clobber a good issue from an earlier run the same day).
    const now = new Date();
    const date = localDate(now, timeZone);
    if (!(await readIssue(date))) {
      await writeIssue({ version: 1, date, generatedAt: now.toISOString(), digest: null, error: err.message });
    }
    throw err;
  }

  // A failure leaves the originals in place.
  let lede = null;
  let ledeError = null;
  let translateError = null;
  const [ledeResult, translateResult] = await Promise.allSettled([
    writeLede(digest, process.env.DEEPSEEK_API_KEY),
    translateDigest(digest, process.env.DEEPSEEK_API_KEY)
  ]);
  if (ledeResult.status === 'fulfilled') lede = ledeResult.value;
  else ledeError = ledeResult.reason.message;
  if (translateResult.status === 'rejected') translateError = translateResult.reason.message;

  // Rendered after translation so the delivered text carries the Chinese.
  digestJson = JSON.stringify(digest, null, 2);
  const text = await runNode('render-digest.js', [], digestJson);

  const date = localDate(new Date(digest.generatedAt), timeZone);
  // A reprint shouldn't forget that this morning's issue already went out.
  const previousDelivery = deliver ? null : (await readIssue(date))?.delivery;
  const issue = {
    version: 1,
    date,
    generatedAt: digest.generatedAt,
    digest,
    lede,
    ledeError,
    translateError,
    delivery: previousDelivery?.status === 'ok' ? previousDelivery : { status: 'skipped' }
  };
  await writeIssue(issue);

  const textDir = outDir || tmpdir();
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'latest-digest.json'), digestJson);
    await writeFile(join(outDir, 'latest-digest-raw.txt'), text);
  }
  const textPath = join(textDir, outDir ? 'latest-digest.txt' : `follow-builders-${issue.date}.txt`);
  await writeFile(textPath, text);

  if (deliver) {
    try {
      const result = JSON.parse((await runNode('deliver.js', ['--file', textPath])).trim().split('\n').pop());
      issue.delivery = { status: result.status, method: result.method || null, at: new Date().toISOString() };
    } catch (err) {
      issue.delivery = { status: 'error', error: err.message, at: new Date().toISOString() };
    }
    await writeIssue(issue);
  }

  console.log(JSON.stringify({
    status: 'ok',
    date: issue.date,
    tweets: digest.stats?.totalTweets || 0,
    lede: lede ? 'ok' : (ledeError || 'none'),
    delivery: issue.delivery.status
  }));
  if (issue.delivery.status === 'error') process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
