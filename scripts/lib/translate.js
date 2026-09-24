// ============================================================================
// Follow Builders — Tweet translation (DeepSeek)
// ============================================================================
// Adds `zh` to every tweet (and quoted tweet) in a digest, in place.
// Tweets that are already Chinese, or have no words to translate, are skipped.
// ============================================================================

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';
const BATCH_SIZE = 30;

function needsTranslation(text) {
  const words = String(text || '').replace(/https?:\/\/\S+|@\w+/g, '').trim();
  if (!/[A-Za-z]{2,}/.test(words)) return false;
  const cjk = (words.match(/[一-鿿]/g) || []).length;
  return cjk < words.length * 0.3;
}

function buildPrompt(items) {
  return [
    '把下面这些 X（推特）帖子翻译成自然、地道的简体中文，读者是关注 AI 与创业的中文科技从业者。',
    '要求：',
    '- 意译为主，读起来像中文母语者写的，保留原文的语气（调侃、感叹、口语都要保留）。',
    '- URL、@账号、$股票代码、代码片段原样保留；产品名、模型名、公司名保留英文（如 Claude Code、GPT-6、Opus 5.5）。',
    '- 保留原文的换行和列表结构。',
    '- 不要添加解释、注释或译者按。',
    '输出一个 JSON 对象：{"translations": [{"id": "...", "zh": "..."}]}，每条输入对应一条输出。',
    '',
    JSON.stringify(items)
  ].join('\n');
}

async function translateBatch(items, apiKey) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: buildPrompt(items) }]
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!res.ok) throw new Error(`DeepSeek API error: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const payload = await res.json();
  const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
  const out = new Map();
  for (const item of Array.isArray(parsed.translations) ? parsed.translations : []) {
    if (item?.id && item?.zh) out.set(String(item.id), String(item.zh).trim());
  }
  return out;
}

// Returns the number of texts translated. Throws only if every batch failed.
export async function translateDigest(digest, apiKey) {
  const targets = [];
  for (const account of digest.x || []) {
    for (const tweet of account.tweets || []) {
      if (!tweet.zh && needsTranslation(tweet.text)) targets.push({ id: tweet.id, node: tweet });
      if (tweet.quoted?.text && !tweet.quoted.zh && needsTranslation(tweet.quoted.text)) {
        targets.push({ id: `q-${tweet.id}`, node: tweet.quoted });
      }
    }
  }
  if (!targets.length) return 0;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not found in ~/.follow-builders/.env');

  const batches = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) batches.push(targets.slice(i, i + BATCH_SIZE));
  const results = await Promise.allSettled(batches.map((batch) =>
    translateBatch(batch.map(({ id, node }) => ({ id, text: node.text })), apiKey)
  ));

  let done = 0;
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    for (const { id, node } of batches[index]) {
      const zh = result.value.get(id);
      if (zh) { node.zh = zh; done++; }
    }
  });
  const failed = results.find((r) => r.status === 'rejected');
  if (!done && failed) throw failed.reason;
  return done;
}
