#!/usr/bin/env node

// ============================================================================
// Follow Builders — Summarize Digest with DeepSeek
// ============================================================================
// Converts the prepared JSON feed into a concise Chinese Feishu-friendly digest.
//
// Usage:
//   node prepare-digest.js | node summarize-digest.js
//   node summarize-digest.js --file /path/to/prepare-output.json
// ============================================================================

import { readFile } from 'fs/promises';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';

const ENV_PATH = join(homedir(), '.follow-builders', '.env');
loadEnv({ path: ENV_PATH });

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

function buildPrompt(data) {
  const simplified = {
    generatedAt: data.generatedAt,
    stats: data.stats,
    x: (data.x || []).map((account) => ({
      category: account.category || 'official',
      name: account.name,
      handle: account.handle,
      tweets: (account.tweets || []).slice(0, 3).map((tweet) => ({
        text: tweet.text,
        createdAt: tweet.createdAt,
        url: tweet.url
      }))
    })),
    podcasts: (data.podcasts || []).slice(0, 3).map((item) => ({
      name: item.name,
      title: item.title,
      publishedAt: item.publishedAt,
      url: item.url,
      transcript: item.transcript
    })),
    blogs: (data.blogs || []).slice(0, 5).map((item) => ({
      name: item.name,
      title: item.title,
      publishedAt: item.publishedAt,
      url: item.url,
      content: item.content
    }))
  };

  return [
    '你是一个中文 AI 行业信息编辑。',
    '请把下面的原始 feed 数据整理成一份适合飞书群阅读的中文简报。',
    '要求：',
    '1. 全文用简体中文。',
    '2. 先给一个不超过 4 行的“今日重点”，每一行单独成段。',
    '3. X 动态必须分成两类：Influencer / 创作者账号，Founders / 官方账号。',
    '4. 每个账号只保留 1-2 条最值得看的动态，不要全抄。',
    '5. 每条内容固定写成三行：第一行账号名，第二行一句中文总结，第三行原链接。',
    '6. 播客和博客如果为空，就写“暂无更新”。',
    '7. 不要输出 Markdown 表格，不要输出 JSON。',
    '8. 不要使用 ** 这种 Markdown 粗体符号，也不要使用其他 Markdown 强调符号。',
    '9. 标题和分组之间要空一行；不同账号之间也要空一行；排版宁可松一点，不要挤在一起。',
    '10. 整体控制在飞书易读长度内，宁可精简，不要啰嗦。',
    '11. 如果原文很口语或是转发内容，要提炼成正常中文信息，不要直接照搬英文原句。',
    '12. 输出结构固定如下：今日重点 / Influencer / 创作者账号 / Founders / 官方账号 / 播客 / 博客。',
    '',
    '下面是原始数据：',
    JSON.stringify(simplified)
  ].join('\n');
}

function sanitizeOutput(text) {
  const cleaned = String(text || '')
    .replace(/\*\*/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean);
  const headings = new Set([
    '今日重点',
    'Influencer / 创作者账号',
    'Founders / 官方账号',
    '播客',
    '博客'
  ]);
  const out = [];

  for (const line of lines) {
    if (headings.has(line)) {
      if (out.length) out.push('');
      out.push(line);
      out.push('');
      continue;
    }

    if (line === '暂无更新') {
      out.push(line);
      out.push('');
      continue;
    }

    const itemMatch = line.match(/^([^：]{1,60})：(.*?)(https?:\/\/\S+)$/);
    if (itemMatch) {
      const [, name, summary, url] = itemMatch;
      out.push(name.trim());
      out.push(summary.trim());
      out.push(url.trim());
      out.push('');
      continue;
    }

    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY not found in ~/.follow-builders/.env');
    process.exit(1);
  }

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

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      temperature: 0.4,
      messages: [
        {
          role: 'user',
          content: buildPrompt(data)
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`DeepSeek API error: HTTP ${response.status} ${body}`);
    process.exit(1);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    console.error('DeepSeek returned no content');
    process.exit(1);
  }

  process.stdout.write(`${sanitizeOutput(content)}\n`);
}

main();
