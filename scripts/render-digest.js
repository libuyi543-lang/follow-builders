#!/usr/bin/env node

// ============================================================================
// Follow Builders — Render Digest
// ============================================================================
// Converts the JSON blob from prepare-digest.js into readable plain text.
//
// Usage:
//   node prepare-digest.js | node render-digest.js
//   node render-digest.js --file /path/to/prepare-output.json
// ============================================================================

import { readFile } from 'fs/promises';

async function getInputText() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return await readFile(args[fileIdx + 1], 'utf-8');
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function trimText(text, limit = 180) {
  if (!text) return '';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit - 1)}…`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function sectionTitle(title) {
  return `\n【${title}】`;
}

function recentItems(items = [], now = Date.now()) {
  const cutoff = now - 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const publishedAt = Date.parse(item.publishedAt || '');
    return Number.isFinite(publishedAt) && publishedAt >= cutoff && publishedAt <= now;
  });
}

function renderPodcasts(items = [], available = true) {
  const lines = [sectionTitle('播客更新')];
  if (!available) {
    lines.push('抓取失败，无法确认是否有更新');
    return lines.join('\n');
  }
  if (!items.length) {
    lines.push('暂无更新');
    return lines.join('\n');
  }
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name || '未知播客'}｜${item.title || '未命名节目'}`);
    if (item.publishedAt) lines.push(`   时间：${formatDate(item.publishedAt)}`);
    if (item.transcript) lines.push(`   要点：${trimText(item.transcript, 160)}`);
    if (item.url) lines.push(`   链接：${item.url}`);
    lines.push('');
  });
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}

function renderTweets(accounts = []) {
  const lines = [sectionTitle('X / Twitter 动态')];
  if (!accounts.length) {
    lines.push('没有抓到可用的账号数据，请查看下方抓取告警。');
    return lines.join('\n');
  }

  const groups = [
    { key: 'influencer', label: '个人账号' },
    { key: 'official', label: '官方账号' }
  ];

  for (const group of groups) {
    const groupAccounts = accounts.filter((item) => (item.category || 'official') === group.key);
    if (!groupAccounts.length) continue;
    lines.push(`\n${group.label}`);
    for (const account of groupAccounts) {
      const tweets = account.tweets || [];
      if (!tweets.length) continue;
      lines.push(`${account.name || account.handle || '未知账号'} (@${account.handle || 'unknown'})`);
      for (const [index, tweet] of tweets.entries()) {
        // Chinese translation when there is one; the link below leads to the original.
        const body = String(tweet.zh || tweet.text || '').trim();
        lines.push(`  ${index + 1}) ${body || '原文为空，请打开链接查看'}`);
        if (tweet.createdAt) {
          lines.push(`     时间：${formatDateTime(tweet.createdAt)}`);
        }
        const metrics = [];
        if (tweet.likes != null) metrics.push(`赞 ${tweet.likes}`);
        if (tweet.retweets != null) metrics.push(`转发 ${tweet.retweets}`);
        if (tweet.replies != null) metrics.push(`回复 ${tweet.replies}`);
        if (metrics.length) lines.push(`     互动：${metrics.join('｜')}`);
        if (tweet.url) lines.push(`     链接：${tweet.url}`);
      }
      lines.push('');
    }
  }

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

function renderBlogs(items = [], available = true) {
  const lines = [sectionTitle('官方博客')];
  if (!available) {
    lines.push('抓取失败，无法确认是否有更新');
    return lines.join('\n');
  }
  if (!items.length) {
    lines.push('暂无更新');
    return lines.join('\n');
  }
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name || '未知来源'}｜${item.title || '未命名文章'}`);
    if (item.publishedAt) lines.push(`   时间：${formatDate(item.publishedAt)}`);
    if (item.content) lines.push(`   要点：${trimText(item.content, 160)}`);
    if (item.url) lines.push(`   链接：${item.url}`);
    lines.push('');
  });
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}

function renderDigest(data) {
  const stats = data.stats || {};
  const allAccounts = data.followedAccounts || [];
  const available = new Set((data.x || []).map((account) => String(account.handle).toLowerCase()));
  const missing = allAccounts.filter((account) => !available.has(String(account.handle).toLowerCase()));
  const quiet = (data.x || []).filter((account) => !(account.tweets || []).length);
  // The central feed leaves out accounts with no new tweets, so once it has been
  // fetched, an account missing from it simply had nothing new.
  const feedFetched = Boolean(data.feedStatus?.xGeneratedAt);
  const noUpdates = feedFetched ? [...quiet, ...missing] : quiet;
  const unavailable = feedFetched ? [] : missing;
  const translated = (data.x || []).some((account) => (account.tweets || []).some((tweet) => tweet.zh));
  const header = [
    `关注账号每日动态｜${formatDate(data.generatedAt)}`,
    `范围：过去 24 小时｜关注 ${allAccounts.length} 个账号｜抓到 ${stats.totalTweets || 0} 条动态`,
    translated
      ? '动态全部列出（英文已由 AI 译成中文），附原文链接；没有经过 AI 挑选。'
      : '动态按原文完整列出，附原链接；没有经过 AI 挑选。'
  ].join('\n');

  const parts = [
    header,
    renderTweets(data.x || []),
    renderPodcasts(recentItems(data.podcasts || []), data.feedStatus?.podcastsAvailable !== false),
    renderBlogs(recentItems(data.blogs || []), data.feedStatus?.blogsAvailable !== false)
  ];

  if (noUpdates.length) parts.push(`本次确认无更新：${noUpdates.map((a) => `@${a.handle}`).join('、')}`);
  if (unavailable.length) parts.push(`未能确认是否更新：${unavailable.map((a) => `@${a.handle}`).join('、')}`);

  if (Array.isArray(data.errors) && data.errors.length) {
    parts.push(sectionTitle('抓取告警'));
    parts.push(data.errors.map((item) => `• ${item}`).join('\n'));
  }

  return `${parts.join('\n\n')}\n`;
}

async function main() {
  const raw = await getInputText();
  if (!raw || !raw.trim()) {
    console.error('No input received');
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON input: ${err.message}`);
    process.exit(1);
  }

  process.stdout.write(renderDigest(data));
}

main();
