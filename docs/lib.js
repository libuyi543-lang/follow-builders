// Shared helpers: API, escaping, Chinese dates, formatting.

// Local mode talks to dashboard/server.js; the GitHub Pages export has no
// server, so it reads the JSON baked by export-static.js instead. The local
// server 404s on api/status.json, which is how the two are told apart.
let staticMode = null;

export async function isStatic() {
  if (staticMode == null) {
    staticMode = await fetch('api/status.json', { cache: 'no-store' }).then((res) => res.ok, () => false);
  }
  return staticMode;
}

function staticFile(path) {
  if (path === '/issues') return 'api/issues.json';
  if (path === '/accounts') return 'api/accounts.json';
  if (path.startsWith('/issues/')) return `api/issue-${path.slice('/issues/'.length)}.json`;
  return null;
}

export async function api(path, options = {}) {
  if (await isStatic()) {
    const file = options.method && options.method !== 'GET' ? null : staticFile(path);
    if (!file) throw new Error('在线版只读，加印、静音等操作请在本机看板进行');
    const res = await fetch(file, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? '这一天没有出刊' : `HTTP ${res.status}`);
    return res.json();
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Tweet text → safe HTML with links, @mentions and line breaks.
export function richText(text) {
  const pattern = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(@[A-Za-z0-9_]{1,15})/g;
  let html = '';
  let last = 0;
  for (const match of String(text || '').matchAll(pattern)) {
    html += esc(text.slice(last, match.index));
    if (match[1]) {
      const url = match[1];
      const shown = url.replace(/^https?:\/\/(www\.)?/, '');
      html += `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(shown.length > 38 ? `${shown.slice(0, 36)}…` : shown)}</a>`;
    } else {
      const handle = match[2].slice(1);
      html += `<a href="https://x.com/${esc(handle)}" target="_blank" rel="noreferrer">${esc(match[2])}</a>`;
    }
    last = match.index + match[0].length;
  }
  html += esc(String(text || '').slice(last));
  return html.replace(/\n/g, '<br>');
}

const DIGITS = '〇一二三四五六七八九';

function smallNumber(n) {
  if (n <= 10) return n === 10 ? '十' : DIGITS[n];
  if (n < 20) return `十${DIGITS[n - 10]}`;
  return `${DIGITS[Math.floor(n / 10)]}十${n % 10 ? DIGITS[n % 10] : ''}`;
}

export function chineseDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const year = String(y).split('').map((c) => DIGITS[c]).join('');
  const weekday = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
  return { full: `${year}年${smallNumber(m)}月${smallNumber(d)}日`, weekday: `星期${weekday}` };
}

const LUNAR_DAYS = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

export function lunarDate(dateString) {
  try {
    const [y, m, d] = dateString.split('-').map(Number);
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' })
      .formatToParts(new Date(y, m - 1, d, 12));
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const yearName = get('yearName') || get('year').replace(/^\d+/, '').replace(/年$/, '');
    return `${yearName}年${get('month')}${LUNAR_DAYS[Number(get('day')) - 1] || get('day')}`;
  } catch {
    return '';
  }
}

export function issueNumber(n) {
  return n === 1 ? '创刊号' : `第 ${n} 期`;
}

export function compactNumber(n) {
  if (n == null) return '';
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  return String(n);
}

export function clock(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ago(iso) {
  if (!iso) return '—';
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

export function avatar(account, size = '') {
  const initial = esc(Array.from(account.name || account.handle || '?')[0].toUpperCase());
  const img = account.avatar
    ? `<img src="${esc(account.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<span class="avatar ${size}"><span class="mono">${initial}</span>${img}</span>`;
}

// Account status → label shown in 名录 and 本报讯.
// central / unsourced only appear in issues printed before the switch to the central feed.
export const STATUS_LABEL = {
  ok: '供稿',
  quiet: '无稿',
  central: '供稿',
  failed: '失联',
  unsourced: '未接通',
  muted: '静音',
  pending: '未供稿'
};

// -- 中英对照 ----------------------------------------------------------------

const MODES = ['zh', 'both', 'en'];
export const MODE_LABEL = { zh: '中', both: '对照', en: '原文' };

export function getLang() {
  const forced = new URLSearchParams(location.search).get('lang');
  if (MODES.includes(forced)) return forced;
  const stored = localStorage.getItem('fb-lang');
  return MODES.includes(stored) ? stored : 'zh';
}

export function setLang(mode) {
  document.documentElement.dataset.lang = mode;
  document.body.dataset.lang = mode;
  document.querySelectorAll('[data-lang-switch] button').forEach((button) => {
    button.classList.toggle('on', button.dataset.mode === mode);
  });
}

export function toggleLang() {
  const next = MODES[(MODES.indexOf(getLang()) + 1) % MODES.length];
  localStorage.setItem('fb-lang', next);
  setLang(next);
  return next;
}

// The Chinese text is nested inside the original so either can be shown.
export function bilingual(originalHtml, zh) {
  const en = `<span class="tt-en">${originalHtml}</span>`;
  if (!zh) return en;
  return `<span class="tt-zh">${richText(zh)}</span>${en}`;
}

export function isLong(tweet) {
  const shown = tweet.zh || tweet.text || '';
  return String(shown).length > 480;
}

let toastTimer;
export function toast(message, { error = false, ms = 3200 } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
