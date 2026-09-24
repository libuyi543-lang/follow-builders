// 往期：印版日历 + 目录

import { esc, issueNumber, chineseDate } from './lib.js';

function level(tweets) {
  if (tweets >= 60) return 'lv4';
  if (tweets >= 30) return 'lv3';
  if (tweets >= 10) return 'lv2';
  return 'lv1';
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthGrid(year, month, byDate, today) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: first.getDay() }, () => '<span class="day blank"></span>');
  for (let d = 1; d <= days; d++) {
    const key = dayKey(new Date(year, month, d));
    const issue = byDate.get(key);
    const todayClass = key === today ? ' today' : '';
    if (!issue) {
      cells.push(`<span class="day${todayClass}" title="${key} 未出刊"></span>`);
      continue;
    }
    const cls = issue.state === 'broken' ? 'broken' : issue.state === 'empty' ? 'empty' : level(issue.tweets);
    const title = `${key} · ${issueNumber(issue.number)} · ${issue.state === 'broken' ? '印刷故障' : issue.tweets ? `${issue.tweets} 条` : '休刊'}`;
    cells.push(`<a class="day issue ${cls}${todayClass}" href="#/issue/${key}" title="${esc(title)}"></a>`);
  }
  return `<div class="month"><h4>${year} · ${month + 1} 月</h4><div class="month-grid">${cells.join('')}</div></div>`;
}

export function renderArchive(issues) {
  const today = dayKey(new Date());
  const byDate = new Map(issues.map((i) => [i.date, i]));
  const oldest = issues.at(-1)?.date || today;
  const [oy, om] = oldest.split('-').map(Number);
  const now = new Date();
  // Show at least the last three months so a young archive doesn't look lonely.
  let cursor = new Date(Math.min(new Date(oy, om - 1, 1), new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const months = [];
  while (cursor <= now) {
    months.push(monthGrid(cursor.getFullYear(), cursor.getMonth(), byDate, today));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const total = issues.reduce((n, i) => n + i.tweets, 0);
  const toc = issues.map((issue) => {
    const [, m, d] = issue.date.split('-').map(Number);
    const title = issue.state === 'broken' ? '印刷故障'
      : issue.state === 'empty' ? '休刊'
        : issue.headline || '原文照登';
    const muted = issue.state === 'broken' || issue.state === 'empty' || !issue.headline;
    return `
      <a class="toc-row" href="#/issue/${issue.date}">
        <span class="toc-no">${esc(issueNumber(issue.number))}</span>
        <span class="toc-title${muted ? ' muted' : ''}">${esc(title)}</span>
        <span class="toc-leader"></span>
        <span class="toc-meta">${m} 月 ${d} 日 · ${chineseDate(issue.date).weekday}${issue.tweets ? ` · ${issue.tweets} 条` : ''}${issue.failures ? ` · <span class="alarm">${issue.failures} 路未通</span>` : ''}</span>
      </a>`;
  }).join('');

  return `
    <header class="page-head">
      <h1>往期合订</h1>
      <div class="latin">Bound Volumes</div>
      <div class="sub">共 ${issues.length} 期 · 累计 ${total} 条原文</div>
    </header>
    <hr class="rule-double">
    <section class="almanac">${months.join('')}</section>
    <div class="legend">
      <span><i class="day lv1"></i><i class="day lv2"></i><i class="day lv3"></i><i class="day lv4"></i> 墨越浓稿越多</span>
      <span><i class="day issue empty"></i> 休刊</span>
      <span><i class="day issue broken"></i> 印刷故障</span>
      <span><i class="day"></i> 未出刊</span>
    </div>
    <section class="toc">${toc || '<p class="empty-note">合订本还是空的。<br>每天早上七点付印后，这里会多一期。</p>'}</section>`;
}
