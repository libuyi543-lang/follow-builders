#!/usr/bin/env node

// ============================================================================
// Follow Builders — Dashboard server
// ============================================================================
// Local-only (127.0.0.1) server for the "建造者晨报" dashboard.
// No dependencies beyond the scripts/ package.
//
// Usage: node dashboard/server.js   →  http://127.0.0.1:4600
// ============================================================================

import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, normalize } from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { USER_DIR } from '../scripts/lib/archive.js';
import { loadRoster, savePref } from '../scripts/lib/roster.js';
import { listIssues, getIssue, accountsWithStats } from './data.js';

const PORT = Number(process.env.PORT || 4600);
const ROOT = decodeURIComponent(new URL('.', import.meta.url).pathname);
const WEB_DIR = join(ROOT, 'web');
const SCRIPTS_DIR = join(ROOT, '..', 'scripts');

// dotenv is installed under scripts/, so resolve it from there.
const { parse: parseEnv } = createRequire(join(SCRIPTS_DIR, 'package.json'))('dotenv');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Re-read on every call so a key added to .env takes effect without a restart.
async function readEnv() {
  try {
    return parseEnv(await readFile(join(USER_DIR, '.env'), 'utf-8'));
  } catch {
    return {};
  }
}

// -- Accounts ----------------------------------------------------------------

async function updateAccount(handle, body) {
  const { accounts } = await loadRoster();
  const account = accounts.find((a) => a.handle.toLowerCase() === handle.toLowerCase());
  if (!account) throw httpError(404, `名录中没有 @${handle}`);
  const patch = {};
  if ('muted' in body) patch.muted = Boolean(body.muted);
  if ('category' in body) {
    if (!['influencer', 'official'].includes(body.category)) throw httpError(400, '分类只能是 influencer 或 official');
    patch.category = body.category;
  }
  return { ...account, ...(await savePref(account.handle, patch)) };
}

// -- Reprint (run the pipeline without delivering) ---------------------------

let runInFlight = null;

function reprint() {
  runInFlight ||= new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(SCRIPTS_DIR, 'run-daily.js'), '--no-deliver'], { cwd: SCRIPTS_DIR });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      const last = (code === 0 ? stdout : stderr).trim().split('\n').pop();
      try {
        const result = JSON.parse(last);
        if (code === 0) resolve(result);
        else reject(httpError(500, result.message || last));
      } catch {
        reject(httpError(500, last || `run-daily exited ${code}`));
      }
    });
  }).finally(() => { runInFlight = null; });
  return runInFlight;
}

// -- HTTP plumbing -----------------------------------------------------------

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, '请求体不是合法 JSON');
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function serveStatic(res, pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(WEB_DIR, relative === '/' ? 'index.html' : relative);
  if (!file.startsWith(WEB_DIR) || !existsSync(file) || (await stat(file)).isDirectory()) {
    file = join(WEB_DIR, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(await readFile(file));
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const method = req.method;
  let match;

  if (method === 'GET' && pathname === '/api/issues') return sendJson(res, 200, await listIssues());
  if (method === 'GET' && (match = pathname.match(/^\/api\/issues\/(latest|\d{4}-\d{2}-\d{2})$/))) {
    const issue = await getIssue(match[1]);
    return issue ? sendJson(res, 200, issue) : sendJson(res, 404, { error: '这一天没有出刊' });
  }
  if (method === 'GET' && pathname === '/api/accounts') return sendJson(res, 200, await accountsWithStats());
  if (method === 'PATCH' && (match = pathname.match(/^\/api\/accounts\/([A-Za-z0-9_]{1,15})$/))) {
    return sendJson(res, 200, await updateAccount(match[1], await readBody(req)));
  }
  if (method === 'POST' && pathname === '/api/reprint') return sendJson(res, 200, await reprint());
  if (method === 'GET' && pathname === '/api/status') {
    const env = await readEnv();
    return sendJson(res, 200, { hasDeepseek: Boolean(env.DEEPSEEK_API_KEY), reprinting: Boolean(runInFlight) });
  }
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
  if (method === 'GET') return serveStatic(res, pathname);
  return sendJson(res, 405, { error: 'Method not allowed' });
}

createServer((req, res) => {
  route(req, res).catch((err) => {
    if (!err.status) console.error(err);
    sendJson(res, err.status || 500, { error: err.message });
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`建造者晨报 → http://127.0.0.1:${PORT}`);
});
