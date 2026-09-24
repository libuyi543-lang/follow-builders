// ============================================================================
// Follow Builders — Roster
// ============================================================================
// The account list is zarazhangrui's default-sources.json (the accounts her
// central feed covers), synced from GitHub on every read. The only local state
// is per-account preferences (muted / category) in ~/.follow-builders/account-prefs.json.
// ============================================================================

import { readFile } from 'fs/promises';
import { join } from 'path';
import { USER_DIR, writeJsonAtomic } from './archive.js';

const SOURCES_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/config/default-sources.json';
const CACHE_PATH = join(USER_DIR, 'sources-cache.json');
const PREFS_PATH = join(USER_DIR, 'account-prefs.json');
const LOCAL_SOURCES = join(decodeURIComponent(new URL('.', import.meta.url).pathname), '..', '..', 'config', 'default-sources.json');

// Her list has no categories; these are the organisations, everyone else is a columnist.
const OFFICIAL = new Set(['claudeai', 'googlelabs', 'openai', 'openaidevs', 'googledeepmind', 'cursor_ai']);

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return null;
  }
}

// Returns { accounts, syncedAt, stale } — falls back to the last good copy, then the bundled one.
async function loadSources() {
  try {
    const res = await fetch(SOURCES_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.x_accounts) || !data.x_accounts.length) throw new Error('empty x_accounts');
    const cache = { syncedAt: new Date().toISOString(), x_accounts: data.x_accounts };
    await writeJsonAtomic(CACHE_PATH, cache).catch(() => {});
    return { accounts: data.x_accounts, syncedAt: cache.syncedAt, stale: false };
  } catch {
    const cache = await readJson(CACHE_PATH);
    if (cache?.x_accounts?.length) return { accounts: cache.x_accounts, syncedAt: cache.syncedAt, stale: true };
    const local = await readJson(LOCAL_SOURCES);
    return { accounts: local?.x_accounts || [], syncedAt: null, stale: true };
  }
}

export async function readPrefs() {
  return (await readJson(PREFS_PATH)) || {};
}

export async function loadRoster() {
  const [{ accounts, syncedAt, stale }, prefs] = await Promise.all([loadSources(), readPrefs()]);
  return {
    syncedAt,
    stale,
    accounts: accounts.map(({ name, handle }) => {
      const key = handle.toLowerCase();
      const pref = prefs[key] || {};
      return {
        name,
        handle,
        category: pref.category || (OFFICIAL.has(key) ? 'official' : 'influencer'),
        muted: Boolean(pref.muted)
      };
    })
  };
}

export async function savePref(handle, patch) {
  const prefs = await readPrefs();
  const key = handle.toLowerCase();
  prefs[key] = { ...prefs[key], ...patch };
  await writeJsonAtomic(PREFS_PATH, prefs);
  return prefs[key];
}
