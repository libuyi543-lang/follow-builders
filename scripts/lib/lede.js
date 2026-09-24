// ============================================================================
// Follow Builders — Front-page lede (DeepSeek)
// ============================================================================
// Asks DeepSeek for the newspaper furniture the dashboard needs: a headline,
// a short lede, a one-line brief per account, and a few editor's picks.
// The tweets themselves are shown verbatim; this only frames them.
// ============================================================================

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';
const TEXT_LIMIT = 500;

function buildPrompt(digest) {
  const accounts = (digest.x || [])
    .filter((account) => account.tweets?.length)
    .map((account) => ({
      handle: account.handle,
      name: account.name,
      category: account.category,
      tweets: account.tweets.map((tweet) => ({
        id: tweet.id,
        text: String(tweet.text || '').slice(0, TEXT_LIMIT),
        quoted: tweet.quoted?.text ? String(tweet.quoted.text).slice(0, 200) : undefined,
        isRetweet: tweet.isRetweet || undefined,
        likes: tweet.likes ?? undefined
      }))
    }));

  return [
    '你是一份中文科技晨报的主编，读者关注 AI 产品、工程、创业和一手行业判断。',
    '下面是过去 24 小时内，读者订阅的 X 账号发布的全部内容。原文会原样刊登，你只负责写“编者的话”。',
    '',
    '请输出一个 JSON 对象，字段如下：',
    '- headline：头版标题，简体中文，不超过 18 个字，像报纸标题一样有判断，不要用“今日”“速览”这类空词。',
    '- lede：导语，简体中文，80 到 150 字，一段话，点出今天最值得注意的 2-3 件事以及它们之间的联系。',
    '- briefs：数组，每个有内容的账号一项，形如 {"handle": "...", "brief": "..."}；brief 用一句中文概括该账号今天说了什么，不超过 36 个字，不要复述账号名。',
    '- picks：数组，最多 3 个最值得读原文的推文 id（字符串）。',
    '',
    '要求：只陈述原文里有的信息，不要编造；纯宣传、互动、情绪类内容在导语里略过；不要使用 Markdown。',
    '',
    JSON.stringify(accounts)
  ].join('\n');
}

export async function writeLede(digest, apiKey) {
  const hasTweets = (digest.x || []).some((account) => account.tweets?.length);
  if (!hasTweets) return null;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not found in ~/.follow-builders/.env');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: buildPrompt(digest) }]
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!res.ok) throw new Error(`DeepSeek API error: HTTP ${res.status} ${await res.text()}`);

  const payload = await res.json();
  const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
  const briefs = {};
  for (const item of Array.isArray(parsed.briefs) ? parsed.briefs : []) {
    if (item?.handle && item?.brief) briefs[String(item.handle).replace(/^@/, '').toLowerCase()] = String(item.brief);
  }
  return {
    headline: String(parsed.headline || '').trim(),
    lede: String(parsed.lede || '').trim(),
    briefs,
    picks: (Array.isArray(parsed.picks) ? parsed.picks : []).map(String).slice(0, 3),
    model: MODEL
  };
}
