// Router + page shell.

import { api, isStatic, esc, toast, getLang, setLang, toggleLang, MODE_LABEL } from './lib.js';
import { renderIssue } from './issue.js';
import { renderArchive } from './archive.js';
import { renderRoster, bindRoster } from './roster.js';

const app = document.getElementById('app');
let current = null;      // the issue on screen, for ←/→
let rosterData = null;

function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

function paint(html) {
  app.classList.remove('leaving');
  app.style.animation = 'none';
  void app.offsetWidth;   // restart the ink-in animation
  app.style.animation = '';
  app.innerHTML = html;
  setLang(getLang());
  window.scrollTo({ top: 0 });
}

async function showIssue(date) {
  setNav(date === 'latest' ? 'issue' : 'archive');
  try {
    current = await api(`/issues/${date}`);
    paint(renderIssue(current));
    document.title = `建造者晨报 · ${current.date}`;
  } catch {
    current = null;
    paint(`
      <header class="page-head"><h1>尚未出刊</h1><div class="latin">No Issue Yet</div></header>
      <hr class="rule-double">
      <p class="empty-note">${date === 'latest' ? '合订本里还没有任何一期。' : `${esc(date)} 这一天没有出刊。`}<br>
      ${document.documentElement.hasAttribute('data-static') ? '在线版只收录已发布的期数。' : '点右上角「加印本期」，立刻印一份。'}</p>`);
  }
}

async function showArchive() {
  setNav('archive');
  current = null;
  paint(renderArchive(await api('/issues')));
  document.title = '建造者晨报 · 往期合订';
}

async function showRoster({ keepData = false, focusSearch = false } = {}) {
  setNav('roster');
  current = null;
  if (!keepData || !rosterData) rosterData = await api('/accounts');
  const scroll = window.scrollY;
  app.innerHTML = renderRoster(rosterData);
  setLang(getLang());
  bindRoster(app, (opts) => showRoster(opts));
  if (keepData) window.scrollTo({ top: scroll });
  if (focusSearch) {
    const search = app.querySelector('#search');
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
  document.title = '建造者晨报 · 撰稿人名录';
}

async function route() {
  const hash = location.hash || '#/';
  if (!hash.startsWith('#/')) return;
  const [, page, arg] = hash.slice(1).split('/');
  try {
    if (!page) await showIssue('latest');
    else if (page === 'issue' && arg) await showIssue(arg);
    else if (page === 'archive') await showArchive();
    else if (page === 'roster') { rosterData = null; await showRoster(); }
    else location.hash = '#/';
  } catch (err) {
    paint(`<p class="empty-note">排版出错：${esc(err.message)}</p>`);
  }
}

// In-page anchors (编辑推荐 → 正文) scroll instead of routing.
app.addEventListener('click', (event) => {
  const flip = event.target.closest('[data-flip]');
  if (flip) {
    const text = flip.closest('.tweet').querySelector('.tweet-text');
    text.classList.toggle('show-en');
    text.classList.remove('clamped');
    flip.closest('.tweet').querySelector('.read-on')?.remove();
    return;
  }
  const readOn = event.target.closest('[data-read-on]');
  if (readOn) {
    readOn.previousElementSibling.classList.remove('clamped');
    readOn.remove();
    return;
  }
  const link = event.target.closest('a[data-scroll]');
  if (!link) return;
  event.preventDefault();
  const target = document.querySelector(link.getAttribute('href'));
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.animate([{ background: 'rgba(178,58,38,.14)' }, { background: 'transparent' }], { duration: 1600 });
});

document.addEventListener('keydown', (event) => {
  if (event.target.closest('input, textarea') || event.metaKey || event.ctrlKey) return;
  if (event.key === 't' || event.key === 'T') {
    toast(`译文模式：${MODE_LABEL[toggleLang()]}`);
    return;
  }
  if (!current) return;
  if (event.key === 'ArrowLeft' && current.prev) location.hash = `#/issue/${current.prev}`;
  if (event.key === 'ArrowRight' && current.next) location.hash = `#/issue/${current.next}`;
});

document.querySelectorAll('[data-lang-switch] button').forEach((button) => button.addEventListener('click', () => {
  localStorage.setItem('fb-lang', button.dataset.mode);
  setLang(button.dataset.mode);
}));
setLang(getLang());

const reprintButton = document.getElementById('reprint');
reprintButton.addEventListener('click', async () => {
  reprintButton.disabled = true;
  reprintButton.classList.add('printing');
  reprintButton.textContent = '印刷中';
  toast('正在取稿、排版、写导语，约需一分钟…', { ms: 0 });
  try {
    const result = await api('/reprint', { method: 'POST' });
    toast(`已加印 ${result.date}：${result.tweets} 条原文`);
    location.hash = '#/';
    await route();
  } catch (err) {
    toast(`加印失败：${err.message}`, { error: true, ms: 8000 });
  } finally {
    reprintButton.disabled = false;
    reprintButton.classList.remove('printing');
    reprintButton.textContent = '加印本期';
  }
});

async function refreshStripNote() {
  try {
    const latest = await api('/issues/latest');
    const at = latest.digest?.feedStatus?.xGeneratedAt;
    document.getElementById('strip-note').textContent = at ? `中央 feed 付印于 ${new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : '';
  } catch {}
}

window.addEventListener('hashchange', route);
// Online (GitHub Pages) copy is read-only: CSS hides the write controls.
if (await isStatic()) document.documentElement.setAttribute('data-static', '');
route();
refreshStripNote();
