// 撰稿人名录：名单同步自 zarazhangrui/follow-builders，本地只管静音与分类

import { api, esc, avatar, ago, toast, STATUS_LABEL } from './lib.js';

const GROUPS = [
  { key: 'influencer', title: '专栏作者', latin: 'Columnists' },
  { key: 'official', title: '通讯社', latin: 'Wire Services' }
];

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'influencer', label: '专栏' },
  { key: 'official', label: '通讯社' },
  { key: 'muted', label: '静音' }
];

const state = { filter: 'all', query: '' };

function statusOf(account) {
  if (account.muted) return 'muted';
  const last = account.days.at(-1);
  if (!last) return 'pending';
  return last.count ? 'ok' : last.status === 'failed' ? 'failed' : 'quiet';
}

function bars(account, days) {
  const byDate = new Map(account.days.map((d) => [d.date, d]));
  return days.map((date) => {
    const day = byDate.get(date);
    if (!day) return `<i class="miss" title="${date} 未收录"></i>`;
    if (!day.count) return `<i class="zero" title="${date} 无稿"></i>`;
    return `<i style="height:${Math.round((Math.min(day.count, 6) / 6) * 20) + 2}px" title="${date} ${day.count} 条"></i>`;
  }).join('');
}

function rowHtml(account, days) {
  const status = statusOf(account);
  const other = account.category === 'influencer' ? 'official' : 'influencer';
  const otherLabel = other === 'influencer' ? '改专栏' : '改通讯社';
  const total = account.days.reduce((n, d) => n + d.count, 0);
  return `
    <div class="row${account.muted ? ' is-muted' : ''}" data-handle="${esc(account.handle)}">
      ${avatar(account)}
      <div class="who">
        <div class="name">${esc(account.name)}</div>
        <a class="handle" href="https://x.com/${esc(account.handle)}" target="_blank" rel="noreferrer">@${esc(account.handle)}</a>
        ${account.bio ? `<div class="note">${esc(account.bio.split('\n')[0].slice(0, 80))}</div>` : ''}
      </div>
      <div class="bars" title="近 ${days.length} 期共 ${total} 条">${bars(account, days)}</div>
      <span class="status ${status}">${STATUS_LABEL[status] || status}</span>
      <span class="when">${account.lastTweetAt ? `末稿 ${ago(account.lastTweetAt)}` : '—'}</span>
      <div class="ops">
        <button type="button" data-op="mute" data-muted="${account.muted ? 'false' : 'true'}">${account.muted ? '恢复' : '静音'}</button>
        <button type="button" data-op="move" data-to="${other}">${otherLabel}</button>
      </div>
    </div>`;
}

function matches(account) {
  const q = state.query.trim().toLowerCase();
  if (q && !`${account.name} ${account.handle} ${account.bio || ''}`.toLowerCase().includes(q)) return false;
  switch (state.filter) {
    case 'influencer':
    case 'official': return account.category === state.filter;
    case 'muted': return account.muted;
    default: return true;
  }
}

export function renderRoster(data) {
  const accounts = data.accounts;
  const count = (fn) => accounts.filter(fn).length;
  const groups = GROUPS.map((group) => {
    const members = accounts
      .filter((a) => a.category === group.key && matches(a))
      .sort((a, b) => (b.lastTweetAt || '').localeCompare(a.lastTweetAt || ''));
    if (!members.length) return '';
    return `
      <section class="roster-group">
        <h2>${group.title}<small>${group.latin}</small></h2>
        ${members.map((a) => rowHtml(a, data.days)).join('')}
      </section>`;
  }).join('');

  const synced = data.syncedAt
    ? `名单同步自 <a href="https://github.com/zarazhangrui/follow-builders" target="_blank" rel="noreferrer">zarazhangrui/follow-builders</a>${data.stale ? '（本次同步失败，沿用上次名单）' : ''}`
    : '名单暂未同步，先用本地内置的一份';

  return `
    <header class="page-head">
      <h1>撰稿人名录</h1>
      <div class="latin">Masthead &amp; Contributors</div>
      <div class="sub">${accounts.length} 位 · 专栏 ${count((a) => a.category === 'influencer')} · 通讯社 ${count((a) => a.category === 'official')} · 静音 ${count((a) => a.muted)}</div>
    </header>
    <p class="roster-note">${synced}。${document.documentElement.hasAttribute('data-static') ? '在线版只读；静音与改栏目请在本机看板操作。' : '名单由她维护，这里可以把不想看的人静音，或调整他在报上的栏目。'}</p>
    <nav class="filters">
      ${FILTERS.map((f) => `<button type="button" data-filter="${f.key}" class="${state.filter === f.key ? 'on' : ''}">${f.label}</button>`).join('')}
      <input class="search" id="search" placeholder="检索姓名、账号或简介" value="${esc(state.query)}">
    </nav>
    ${groups || '<p class="empty-note">没有符合条件的撰稿人。</p>'}`;
}

export function bindRoster(root, rerender) {
  root.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    rerender({ keepData: true });
  }));

  const search = root.querySelector('#search');
  search.addEventListener('input', () => {
    state.query = search.value;
    rerender({ keepData: true, focusSearch: true });
  });

  root.querySelectorAll('.row').forEach((row) => row.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-op]');
    if (!button) return;
    const handle = row.dataset.handle;
    try {
      if (button.dataset.op === 'mute') {
        const muted = button.dataset.muted === 'true';
        await api(`/accounts/${handle}`, { method: 'PATCH', body: { muted } });
        toast(muted ? `@${handle} 已静音，下一期起不再登报` : `@${handle} 已恢复`);
      } else if (button.dataset.op === 'move') {
        await api(`/accounts/${handle}`, { method: 'PATCH', body: { category: button.dataset.to } });
      }
      rerender();
    } catch (err) {
      toast(err.message, { error: true });
    }
  }));
}
