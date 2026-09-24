// 今日 / 某一期：头版 + 专栏 + 通讯社 + 本报讯

import { esc, richText, chineseDate, lunarDate, issueNumber, compactNumber, clock, avatar, bilingual, isLong } from './lib.js';

const SECTIONS = [
  { key: 'influencer', title: '专栏', latin: 'Columnists' },
  { key: 'official', title: '通讯社', latin: 'Wire Services' }
];

function weather(issue) {
  const statuses = issue.digest?.accountStatus || [];
  if (!issue.digest || !statuses.length) return '雷暴';
  if (statuses.every((s) => s.status === 'failed')) return '雷暴';
  const rate = statuses.filter((s) => s.status === 'ok').length / statuses.length;
  if (rate >= 0.5) return '晴';
  if (rate >= 0.25) return '多云';
  return '阴';
}

function engagement(account) {
  return account.tweets.reduce((sum, t) => sum + (t.likes || 0) + 3 * (t.retweets || 0), 0);
}

function masthead(issue, statuses) {
  const { full, weekday } = chineseDate(issue.date);
  const spoke = statuses.filter((s) => s.status === 'ok' || s.status === 'central').length;
  const tweets = (issue.digest?.x || []).reduce((n, a) => n + a.tweets.length, 0);
  const voices = (issue.digest?.x || []).filter((a) => a.tweets.length).length;
  return `
    <header class="masthead">
      <div class="ear ear-left"><strong>${esc(issueNumber(issue.number))}</strong>过去二十四小时<br>付印 ${esc(clock(issue.generatedAt))}</div>
      <div class="nameplate">
        <h1>建造者晨报</h1>
        <div class="latin">The Builders’ Morning Post</div>
      </div>
      <div class="ear ear-right"><strong>线路天气</strong><span class="weather">${weather(issue)}</span><br>发声 ${spoke} / ${statuses.length}</div>
    </header>
    <hr class="rule-double">
    <div class="dateline">
      <span><b>${esc(full)}</b><span class="sep">|</span>${weekday}<span class="sep">|</span>农历${esc(lunarDate(issue.date))}</span>
      <span>本期 <b>${tweets}</b> 条<span class="sep">·</span><b>${voices}</b> 位发声</span>
    </div>
    <hr class="rule">`;
}

function tweetHtml(tweet, picked) {
  const long = isLong(tweet);
  const label = tweet.isRetweet
    ? `<div class="tweet-label">转载 · @${esc(tweet.retweetOf?.handle || '')}</div>`
    : '';
  const quoted = tweet.quoted?.text
    ? `<blockquote class="quoted"><span class="who">@${esc(tweet.quoted.handle || '')}</span>${bilingual(richText(tweet.quoted.text), tweet.quoted.zh)}</blockquote>`
    : '';
  const meta = [
    `<span>${esc(clock(tweet.createdAt))}</span>`,
    tweet.likes != null ? `<span>♥ ${compactNumber(tweet.likes)}</span>` : '',
    tweet.retweets ? `<span>⇄ ${compactNumber(tweet.retweets)}</span>` : '',
    tweet.zh ? '<button type="button" class="flip" data-flip title="中英切换">译/原</button>' : '',
    tweet.url ? `<a href="${esc(tweet.url)}" target="_blank" rel="noreferrer">原文 ↗</a>` : ''
  ].join('');
  return `
    <div class="tweet${picked ? ' picked' : ''}" id="t-${esc(tweet.id)}">
      ${picked ? '<span class="seal" title="编辑推荐">荐</span>' : ''}
      ${label}
      <div class="tweet-text${long ? ' clamped' : ''}">${bilingual(richText(tweet.text), tweet.zh) || '<i>（无正文，请看原文）</i>'}</div>
      ${long ? '<button type="button" class="read-on" data-read-on>续读 ↓</button>' : ''}
      ${quoted}
      <div class="tweet-meta">${meta}</div>
    </div>`;
}

function articleHtml(account, brief, picks, index) {
  const tweets = [...account.tweets].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return `
    <article class="article" id="a-${esc(account.handle.toLowerCase())}" style="animation-delay:${Math.min(index * 40, 600)}ms">
      <div class="byline">
        ${avatar(account)}
        <div class="names">
          <div class="name">${esc(account.name)}</div>
          <a class="handle" href="https://x.com/${esc(account.handle)}" target="_blank" rel="noreferrer">@${esc(account.handle)}</a>
        </div>
      </div>
      ${brief ? `<p class="brief">${esc(brief)}</p>` : ''}
      ${tweets.map((t) => tweetHtml(t, picks.has(t.id))).join('')}
    </article>`;
}

function frontPage(issue, accounts) {
  const lede = issue.lede;
  const all = accounts.flatMap((a) => a.tweets.map((t) => ({ tweet: t, account: a })));
  let pickIds = lede?.picks?.filter((id) => all.some((x) => x.tweet.id === id)) || [];
  if (!pickIds.length) {
    pickIds = [...all].sort((a, b) => (b.tweet.likes || 0) - (a.tweet.likes || 0)).slice(0, 3).map((x) => x.tweet.id);
  }
  const picks = pickIds.map((id) => all.find((x) => x.tweet.id === id));

  const headline = lede?.headline || '今日原文照登';
  const ledeHtml = lede?.lede
    ? `<p class="lede">${esc(lede.lede)}</p>`
    : `<p class="lede-missing">本期导语暂缺${issue.ledeError ? `（${esc(issue.ledeError.slice(0, 80))}）` : ''}，原文照常刊登如下。</p>`;

  const briefs = lede?.briefs || {};
  const contents = [...accounts]
    .sort((a, b) => engagement(b) - engagement(a))
    .filter((a) => briefs[a.handle.toLowerCase()])
    .slice(0, 6)
    .map((a) => `
      <a class="contents-row" href="#a-${esc(a.handle.toLowerCase())}" data-scroll>
        <span class="contents-name">${esc(a.name)}</span>
        <span class="contents-brief">${esc(briefs[a.handle.toLowerCase()])}</span>
      </a>`).join('');

  return {
    pickIds: new Set(pickIds),
    html: `
      <section class="front">
        <div class="front-main">
          <div class="kicker">头版 · 编者按</div>
          <h2 class="headline">${esc(headline)}</h2>
          ${ledeHtml}
          ${contents ? `<div class="contents"><h3>本期要目</h3>${contents}</div>` : ''}
        </div>
        <aside class="picks">
          <h3>编辑推荐</h3>
          ${picks.map(({ tweet, account }) => `
            <a class="pick" href="#t-${esc(tweet.id)}" data-scroll>
              <div class="who">${esc(account.name)} · @${esc(account.handle)}</div>
              <div class="what">${esc(String(tweet.zh || tweet.text).replace(/https?:\/\/\S+/g, '').trim())}</div>
            </a>`).join('')}
        </aside>
      </section>`
  };
}

function wireReport(issue, statuses) {
  const digest = issue.digest || {};
  const feedGeneratedAt = digest.feedStatus?.xGeneratedAt;
  const spoke = statuses.filter((s) => s.status === 'ok' || s.status === 'central');
  const silent = statuses.filter((s) => s.status === 'quiet' || (s.status === 'ok' && !s.tweetCount));
  const failed = statuses.filter((s) => s.status === 'failed' || s.status === 'unsourced');
  const feedErrors = (digest.errors || []).filter((e) => !e.startsWith('@'));

  const lines = [];
  if (issue.error) lines.push(`<li class="alarm">印刷机故障：${esc(issue.error)}</li>`);
  for (const e of feedErrors) lines.push(`<li>${esc(e)}</li>`);
  if (issue.translateError) lines.push(`<li>译文未能付排：${esc(issue.translateError.slice(0, 120))}</li>`);
  if (issue.ledeError) lines.push(`<li>导语未能成稿：${esc(issue.ledeError.slice(0, 120))}</li>`);
  if (feedGeneratedAt) {
    const age = Math.round((Date.parse(issue.generatedAt) - Date.parse(feedGeneratedAt)) / 3600000);
    lines.push(`<li>中央 feed 付印于 ${esc(clock(feedGeneratedAt))}${age > 20 ? `（${age} 小时前）` : ''}</li>`);
  }
  if (failed.length) lines.push(`<li class="alarm"><b>${failed.length}</b> 位撰稿人失联（中央 feed 未取到稿件）</li>`);
  lines.push(`<li>供稿 <b>${spoke.length}</b> / ${statuses.length} 位，其余 ${silent.length} 位无稿</li>`);
  const delivery = issue.delivery;
  if (delivery?.status === 'ok') lines.push(`<li>飞书投递：已于 ${esc(clock(delivery.at))} 送达</li>`);
  else if (delivery?.status === 'error') lines.push(`<li class="alarm">飞书投递失败：${esc(delivery.error)}</li>`);
  else lines.push('<li>本期为加印版，未投递飞书</li>');

  return `
    <section class="wire">
      <div>
        <h3>本报讯</h3>
        <ul>${lines.join('')}</ul>
      </div>
      <div>
        <h3>今日无稿</h3>
        ${silent.length
          ? `<p class="handles">${silent.map((s) => `@${esc(s.handle)}`).join('　')}</p>`
          : '<p class="handles">全员有稿</p>'}
      </div>
    </section>`;
}

function colophon(issue) {
  const source = '中央 feed（zarazhangrui/follow-builders）';
  const prev = issue.prev ? `<a href="#/issue/${issue.prev}">‹ 上一期</a>` : '<span class="off">‹ 上一期</span>';
  const next = issue.next ? `<a href="#/issue/${issue.next}">下一期 ›</a>` : '<span class="off">下一期 ›</span>';
  return `
    <footer class="colophon">
      <span>供稿：${source}｜导语：${esc(issue.lede?.model || 'DeepSeek')}｜原文照登，未经删改</span>
      <nav class="pager">${prev}${next}</nav>
    </footer>`;
}

export function renderIssue(issue) {
  const statuses = issue.digest?.accountStatus || [];
  const accounts = (issue.digest?.x || []).filter((a) => a.tweets?.length);

  if (!accounts.length) {
    const reason = issue.error
      ? '印刷机昨夜出了故障，本期未能付印。'
      : statuses.some((s) => s.status !== 'failed')
        ? '名单上的撰稿人都没有新稿。'
        : '中央 feed 取稿失败，本期无稿可发。详情见下方本报讯。';
    return `${masthead(issue, statuses)}
      <section class="suspended"><div class="stamp">休刊</div><p>${reason}</p></section>
      ${wireReport(issue, statuses)}${colophon(issue)}`;
  }

  const briefs = issue.lede?.briefs || {};
  const front = frontPage(issue, accounts);
  let index = 0;
  const sections = SECTIONS.map((section) => {
    const members = accounts
      .filter((a) => (a.category || 'official') === section.key)
      .sort((a, b) => engagement(b) - engagement(a));
    if (!members.length) return '';
    return `
      <div class="section-head">
        <h2>${section.title}</h2><span class="latin">${section.latin}</span>
        <span class="count">${members.length} 位 · ${members.reduce((n, a) => n + a.tweets.length, 0)} 条</span>
      </div>
      <div class="columns">
        ${members.map((a) => articleHtml(a, briefs[a.handle.toLowerCase()], front.pickIds, index++)).join('')}
      </div>`;
  }).join('');

  return `${masthead(issue, statuses)}${front.html}${sections}${wireReport(issue, statuses)}${colophon(issue)}`;
}
