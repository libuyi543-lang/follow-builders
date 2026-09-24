#!/usr/bin/env node

// ============================================================================
// Follow Builders — Prepare Digest
// ============================================================================
// Gathers source items for a complete daily digest:
// - Reads zarazhangrui's central feeds (X, podcasts, blogs) from GitHub
// - Keeps every central-feed tweet that hasn't run in an earlier issue, so the
//   feed's 14:00 (Beijing) publish time doesn't clip what a 07:00 run sees
// - Records a per-account status for the dashboard
// - Reads the user's config (language, delivery method)
// - Outputs a single JSON blob to stdout
//
// Usage: node prepare-digest.js
// Output: JSON to stdout
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { USER_DIR, listIssueDates, localDate, readIssue } from './lib/archive.js';
import { loadRoster } from './lib/roster.js';

// -- Constants ---------------------------------------------------------------

const CONFIG_PATH = join(USER_DIR, 'config.json');

const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json';
const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json';

// Hard ceiling on tweet age; dedup against past issues does the real work.
const X_MAX_AGE_HOURS = 48;
const DEDUP_ISSUES = 7;
const FEED_STALE_HOURS = 30;
// At 07:00 the Mac may have just woken up and the proxy may not be ready yet.
const RETRY_DELAYS_MS = [5000, 20000];

// -- Fetch helpers -----------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJSON(url) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  return null;
}

// Tweet ids already printed in earlier issues (today's issue excluded, so a reprint keeps its tweets).
async function publishedTweetIds(today) {
  const dates = (await listIssueDates()).filter((date) => date < today).slice(-DEDUP_ISSUES);
  const ids = new Set();
  for (const issue of await Promise.all(dates.map(readIssue))) {
    for (const account of issue?.digest?.x || []) {
      for (const tweet of account.tweets || []) ids.add(tweet.id);
    }
  }
  return ids;
}

// -- Main --------------------------------------------------------------------

async function main() {
  const errors = [];

  // 1. Read user config
  let config = {
    language: 'en',
    frequency: 'daily',
    delivery: { method: 'stdout' }
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    } catch (err) {
      errors.push(`Could not read config: ${err.message}`);
    }
  }
  const today = localDate(new Date(), config.timezone || 'Asia/Shanghai');

  // 2. Fetch the central feeds and the roster
  const [feedPodcasts, feedBlogs, feedX, roster, published] = await Promise.all([
    fetchJSON(FEED_PODCASTS_URL),
    fetchJSON(FEED_BLOGS_URL),
    fetchJSON(FEED_X_URL),
    loadRoster(),
    publishedTweetIds(today)
  ]);

  if (!feedPodcasts) errors.push('Could not fetch podcast feed');
  if (!feedBlogs) errors.push('Could not fetch blog feed');
  if (!feedX) errors.push('中央 feed 取稿失败（GitHub 连不上）');
  if (roster.stale) errors.push('名单同步失败，沿用上次的名单');
  const feedAgeHours = feedX?.generatedAt ? (Date.now() - Date.parse(feedX.generatedAt)) / 3600000 : null;
  if (feedAgeHours != null && feedAgeHours > FEED_STALE_HOURS) {
    errors.push(`中央 feed 已 ${Math.round(feedAgeHours)} 小时未更新`);
  }
  // Problems the central tweet feed itself reported. Podcast/blog feed errors
  // (upstream surfaces those too) are left out: the digest only prints tweets.
  for (const error of feedX?.errors || []) errors.push(`中央 feed 报告：${error}`);

  // 3. Pick this issue's tweets for every non-muted account
  const active = roster.accounts.filter((account) => !account.muted);
  const feedByHandle = new Map((feedX?.x || []).map((a) => [String(a.handle).toLowerCase(), a]));
  const sinceMs = Date.now() - X_MAX_AGE_HOURS * 3600000;

  const xContent = [];
  const accountStatus = [];
  for (const account of active) {
    const base = { name: account.name, handle: account.handle, category: account.category };
    if (!feedX) {
      accountStatus.push({ handle: account.handle, status: 'failed', tweetCount: 0, error: '中央 feed 取稿失败' });
      continue;
    }
    const entry = feedByHandle.get(account.handle.toLowerCase());
    const tweets = (entry?.tweets || []).filter((t) =>
      !published.has(t.id) && t.createdAt && Date.parse(t.createdAt) >= sinceMs
    );
    if (entry) xContent.push({ source: 'x', bio: entry.bio || '', ...base, tweets });
    accountStatus.push({ handle: account.handle, status: tweets.length ? 'ok' : 'quiet', tweetCount: tweets.length });
  }

  // 4. Build the output for deterministic delivery.
  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),

    // User preferences
    config: {
      language: config.language || 'en',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' }
    },

    // Content to remix
    podcasts: feedPodcasts?.podcasts || [],
    x: xContent,
    followedAccounts: active.map(({ name, handle, category }) => ({ name, handle, category })),
    accountStatus,
    blogs: feedBlogs?.blogs || [],
    feedStatus: {
      podcastsAvailable: Boolean(feedPodcasts),
      blogsAvailable: Boolean(feedBlogs),
      xSource: 'central-feed',
      xGeneratedAt: feedX?.generatedAt || null,
      rosterSyncedAt: roster.syncedAt
    },

    // Content counts for the digest header
    stats: {
      podcastEpisodes: feedPodcasts?.podcasts?.length || 0,
      xBuilders: xContent.filter((a) => a.tweets.length).length,
      totalTweets: xContent.reduce((sum, a) => sum + (a.tweets?.length || 0), 0),
      blogPosts: feedBlogs?.blogs?.length || 0,
      feedGeneratedAt: feedX?.generatedAt || new Date().toISOString()
    },

    // Non-fatal errors
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    status: 'error',
    message: err.message
  }));
  process.exit(1);
});
