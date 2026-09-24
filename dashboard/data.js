// ============================================================================
// Follow Builders — Dashboard data
// ============================================================================
// Read-side views over the archive and roster, shared by the local server
// (server.js) and the static GitHub Pages export (export-static.js).
// ============================================================================

import { listIssueDates, readIssue } from '../scripts/lib/archive.js';
import { loadRoster } from '../scripts/lib/roster.js';

const STATS_DAYS = 14;

// -- Issues ------------------------------------------------------------------

function tweetCount(digest) {
  return (digest?.x || []).reduce((sum, account) => sum + (account.tweets?.length || 0), 0);
}

function issueSummary(issue, number) {
  const statuses = issue.digest?.accountStatus || [];
  const failures = statuses.filter((s) => s.status === 'failed').length;
  const tweets = tweetCount(issue.digest);
  let state = 'ok';
  if (!issue.digest) state = 'broken';
  else if (!tweets) state = 'empty';
  else if (failures) state = 'degraded';
  return {
    date: issue.date,
    number,
    headline: issue.lede?.headline || null,
    tweets,
    voices: (issue.digest?.x || []).filter((a) => a.tweets?.length).length,
    failures,
    state
  };
}

export async function listIssues() {
  const dates = await listIssueDates();
  const issues = await Promise.all(dates.map(readIssue));
  return issues
    .map((issue, index) => (issue ? issueSummary(issue, index + 1) : null))
    .filter(Boolean)
    .reverse();
}

export async function getIssue(date) {
  const dates = await listIssueDates();
  const resolved = date === 'latest' ? dates.at(-1) : date;
  const index = dates.indexOf(resolved);
  if (index === -1) return null;
  const issue = await readIssue(resolved);
  if (!issue) return null;
  return {
    ...issue,
    number: index + 1,
    prev: dates[index - 1] || null,
    next: dates[index + 1] || null
  };
}

// -- Accounts ----------------------------------------------------------------

export async function accountsWithStats() {
  const [roster, dates] = await Promise.all([loadRoster(), listIssueDates()]);
  const recent = (await Promise.all(dates.slice(-STATS_DAYS).map(readIssue))).filter(Boolean);

  const stats = new Map();
  for (const issue of recent) {
    const byHandle = new Map((issue.digest?.x || []).map((a) => [a.handle.toLowerCase(), a]));
    for (const status of issue.digest?.accountStatus || []) {
      const key = status.handle.toLowerCase();
      const content = byHandle.get(key);
      const entry = stats.get(key) || { days: [], lastTweetAt: null, avatar: null, bio: '' };
      entry.days.push({ date: issue.date, count: content?.tweets?.length || 0, status: status.status });
      entry.avatar = content?.avatar || entry.avatar;
      entry.bio = content?.bio || entry.bio;
      for (const tweet of content?.tweets || []) {
        if (!entry.lastTweetAt || tweet.createdAt > entry.lastTweetAt) entry.lastTweetAt = tweet.createdAt;
      }
      stats.set(key, entry);
    }
  }

  return {
    syncedAt: roster.syncedAt,
    stale: roster.stale,
    days: recent.map((issue) => issue.date),
    accounts: roster.accounts.map((account) => {
      const entry = stats.get(account.handle.toLowerCase());
      return {
        ...account,
        avatar: entry?.avatar || null,
        bio: entry?.bio || '',
        lastTweetAt: entry?.lastTweetAt || null,
        days: entry?.days || []
      };
    })
  };
}
