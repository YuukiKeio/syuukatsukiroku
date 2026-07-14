/* =========================================================
   就活キロク v2 — app.js
   企業主軸のデータモデル。旧 v1 データを自動移行。
   本ファイル = マイルストーン1（ホーム／企業／選考フロー／作成センター）
   知識モジュール（自己分析・面接対策・面接復盤・統計）は次段階。
   ========================================================= */
'use strict';

/* ============ 定数 ============ */
const KEY = 'syukatsu-kiroku-v2';
const OLD_KEY = 'syuukatsu-kiroku-v1';
const THEME_KEY = 'syukatsu-theme';
const COHORT = '29卒';
const ACTIVITY_TYPES = ['インターン', '本選考', '説明会', 'セミナー', 'オープンカンパニー', 'イベント'];
const SEASONS = ['サマー', 'オータム', 'ウィンター', '通年', '本選考'];
const ACTIVITY_STATUS = ['未着手', '応募中', '結果待ち', '参加済み', '完了'];
const STEP_PRESETS = ['ES', 'セミナー', '説明会', 'Webテスト', '適性検査', '動画選考', 'GD', '集団面接', '面接', '最終面接'];

/* 種類→カード色トーン */
const TYPE_TONE = { 'インターン': 'blue', '本選考': 'purple', '説明会': 'green', 'セミナー': 'green', 'オープンカンパニー': 'green', 'イベント': 'blue' };
/* 活動状態→トーン */
const STATUS_TONE = { '未着手': 'gray', '応募中': 'blue', '結果待ち': 'amber', '参加済み': 'green', '完了': 'green' };

/* ============ ユーティリティ ============ */
const $ = id => document.getElementById(id);
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayYMD = () => ymd(new Date());
const attrKey = s => encodeURIComponent(s).replace(/'/g, '%27');
const fmtJDate = ds => { if (!ds) return ''; const [y, m, d] = ds.split('-'); return `${y}年${Number(m)}月${Number(d)}日`; };
function daysUntil(ds) { if (!ds) return null; return Math.round((new Date(ds + 'T00:00:00') - new Date(todayYMD() + 'T00:00:00')) / 86400000); }
function relLabel(ds) {
  const d = daysUntil(ds);
  if (d == null) return '';
  if (d < 0) return `${-d}日前`;
  if (d === 0) return '今日';
  if (d === 1) return '明日';
  return `あと${d}日`;
}
function seasonOf(type, startDate) {
  if (/夏|サマー/.test(type)) return 'サマー';
  if (/冬|ウィンター/.test(type)) return 'ウィンター';
  if (/本選考/.test(type)) return '本選考';
  if (startDate) { const m = Number(startDate.slice(5, 7)); if (m >= 6 && m <= 9) return 'サマー'; if (m >= 10 && m <= 11) return 'オータム'; if (m === 12 || m <= 2) return 'ウィンター'; }
  return '通年';
}
function normType(t) { // 夏インターン/冬インターン → インターン
  if (/インターン/.test(t)) return 'インターン';
  if (ACTIVITY_TYPES.includes(t)) return t;
  return t;
}
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/* ============ 状態・保存・移行 ============ */
let state = load();
if (state._needsSave) { delete state._needsSave; saveNow(); }

function blankState() { return { companies: [], activities: [], schedules: [], _v: 2, _migrated: false }; }

function load() {
  let v2 = null;
  try { v2 = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  const hasData = v2 && (v2._migrated || (Array.isArray(v2.companies) && v2.companies.length) || (Array.isArray(v2.activities) && v2.activities.length));
  if (hasData) return normalize(v2);
  // v2 が空／無し → 旧 v1 からの移行を試みる（空v2の上書き競合にも強い）
  const migrated = migrateFromV1();
  if (migrated) { migrated._migrated = true; migrated._needsSave = true; return migrated; }
  return blankState();
}

function normalize(s) {
  s.companies = Array.isArray(s.companies) ? s.companies : [];
  s.activities = Array.isArray(s.activities) ? s.activities : [];
  s.schedules = Array.isArray(s.schedules) ? s.schedules : [];
  s.companies.forEach(c => {
    c.links = Array.isArray(c.links) ? c.links : [];
    c.mypage = c.mypage || { url: '', loginId: '', password: '', note: '' };
    c.researchNote ??= ''; c.memo ??= '';
    c.officialName ??= ''; c.industry ??= ''; c.subIndustry ??= '';
    c.headquarters ??= ''; c.founded ??= ''; c.employees ??= ''; c.businessScale ??= ''; c.description ??= '';
  });
  s.activities.forEach(a => {
    a.marks = Array.isArray(a.marks) ? a.marks : [];
    a.steps = Array.isArray(a.steps) ? a.steps : [];
    a.cohort ??= COHORT;
    a.steps.forEach(st => {
      st.esQuestions = Array.isArray(st.esQuestions) ? st.esQuestions : [];
      st.record = st.record || { format: '', participants: '', theme: '', role: '', note: '', feedback: '', questions: [] };
      st.record.questions = Array.isArray(st.record.questions) ? st.record.questions : [];
    });
  });
  return s;
}

/* 旧 v1（フラットな entries[]）→ 企業／活動／選考ステップに変換 */
function migrateFromV1() {
  let old;
  try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) { return null; }
  if (!old || !Array.isArray(old.entries) || !old.entries.length) return null;

  const ns = blankState();
  const oldCompanies = old.companies || {};
  const companyByName = new Map();

  const ensureCompany = name => {
    const key = (name || '無名').trim();
    if (companyByName.has(key)) return companyByName.get(key);
    const cred = oldCompanies[key] || {};
    const c = {
      id: uid(), name: key, officialName: '', industry: '', subIndustry: '',
      headquarters: '', founded: '', employees: '', businessScale: '', description: '',
      links: [], researchNote: '', memo: '',
      mypage: { url: cred.mypageUrl || '', loginId: cred.loginId || '', password: cred.password || '', note: '' },
    };
    ns.companies.push(c); companyByName.set(key, c);
    return c;
  };

  const statusMap = { ongoing: '応募中', upcoming: '未着手', done: '参加済み' };

  old.entries.forEach(e => {
    const company = ensureCompany(e.name);
    const type = normType(e.type || 'イベント');
    const year = (e.startDate || e.createdAt || todayYMD()).slice(0, 4);
    const act = {
      id: e.id || uid(), companyId: company.id,
      title: (e.subtitle && e.subtitle.trim()) || e.type || type,
      type, cohort: COHORT, year, season: seasonOf(e.type || '', e.startDate),
      status: statusMap[e.status] || '応募中',
      marks: Array.isArray(e.marks) ? e.marks.slice() : [],
      startDate: e.startDate || '', endDate: e.endDate || '', time: e.time || '', endTime: e.endTime || '',
      locType: e.locType || '', locValue: e.locValue || '',
      review: e.review || '', feedback: (e.hasFeedback ? e.feedback : '') || '',
      steps: (e.steps || []).map(s => {
        const label = s.kind || 'ステップ';
        const step = {
          id: s.id || uid(), label, status: s.done ? 'passed' : 'pending',
          date: s.date || '', deadline: '', note: s.note || '',
          esQuestions: [], record: { format: '', participants: '', theme: '', role: '', note: '', feedback: '', questions: [] },
        };
        const qs = s.questions || [];
        if (label === 'ES') {
          step.esQuestions = qs.map(q => ({ id: q.id || uid(), question: q.q || '', answer: q.a || '', limit: 400 }));
        } else if (qs.length) {
          step.record.questions = qs.map(q => ({ id: q.id || uid(), question: q.q || '', answer: q.a || '', tag: q.tag || '予測' }));
          step.record.note = s.note || '';
        }
        return step;
      }),
    };
    ns.activities.push(act);
  });

  // 旧キーはバックアップとして残す（削除しない）
  try { localStorage.setItem(OLD_KEY + '-backup', localStorage.getItem(OLD_KEY)); } catch (e) {}
  return ns;
}

let flashTimer = null;
function saveNow() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function save() {
  saveNow();
  const el = $('saveFlash');
  if (el) { el.classList.add('show'); clearTimeout(flashTimer); flashTimer = setTimeout(() => el.classList.remove('show'), 1600); }
}

/* データ参照ヘルパー */
const companyById = id => state.companies.find(c => c.id === id);
const activityById = id => state.activities.find(a => a.id === id);
const activitiesOf = cid => state.activities.filter(a => a.companyId === cid);
const stepProgress = a => { const t = a.steps.length; const p = a.steps.filter(s => s.status === 'passed').length; return { passed: p, total: t, pct: t ? Math.round(p / t * 100) : 0 }; };
function nextActionOf(a) {
  const pend = a.steps.filter(s => s.status === 'pending' && s.date).sort((x, y) => x.date.localeCompare(y.date));
  if (pend[0]) return { label: pend[0].label, date: pend[0].date };
  const anyPend = a.steps.find(s => s.status === 'pending');
  if (anyPend) return { label: anyPend.label, date: anyPend.date || '' };
  if (a.startDate && daysUntil(a.startDate) >= 0) return { label: a.title, date: a.startDate };
  return null;
}

/* ============ ルーター ============ */
let currentView = 'home';
function setView(v) {
  currentView = v;
  document.querySelectorAll('#sideNav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('#bottomNav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  renderContent();
  window.scrollTo(0, 0);
}
function renderContent() {
  const c = $('content');
  if (currentView === 'home') return renderHome(c);
  if (currentView === 'stats') return renderStats(c);
  return renderComing(c, currentView);
}

const COMING = {
  self: ['◎', '自己分析', '原体験・強み・ガクチカなどの素材を整理し、ES・面接に再利用できます。次のアップデートで追加します。'],
  interview: ['◫', '面接対策', '1次・2次・最終・企業別の質問ライブラリと、回答の版本管理。次のアップデートで追加します。'],
  review: ['↺', '面接復盤', '事前の想定と実際の面接を並べて比較し、次の行動を決めます。次のアップデートで追加します。'],
  calendar: ['□', 'カレンダー', '活動・締切・面接を月表示で管理します。次のアップデートで追加します。'],
  settings: ['⋯', '設定', 'バックアップ（エクスポート／インポート）、テーマ、データ管理。次のアップデートで追加します。'],
};
function renderComing(c, view) {
  const [icon, title, desc] = COMING[view] || ['◇', 'この機能', '準備中です。'];
  c.innerHTML = `<div class="coming-panel"><div class="ci">${icon}</div><h2>${title}</h2><p>${esc(desc)}</p></div>`;
}

/* ============ ホーム ============ */
let homeFilter = 'すべて';
const HOME_FILTERS = ['すべて', '進行中', '締切間近', '結果待ち', '完了'];

function isDone(a) { return a.status === '完了' || a.status === '参加済み'; }
function activityUrgent(a) { // 48時間以内の予定/締切
  const dates = [];
  if (a.startDate) dates.push(a.startDate);
  a.steps.forEach(s => { if (s.date) dates.push(s.date); if (s.deadline) dates.push(s.deadline); });
  return dates.some(d => { const n = daysUntil(d); return n !== null && n >= 0 && n <= 2; });
}

function renderHome(c) {
  const now = new Date();
  const wd = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
  const companies = state.companies.slice();

  // メトリクス
  const acts = state.activities;
  const ongoing = new Set(acts.filter(a => !isDone(a)).map(a => a.companyId)).size;
  const weekEnd = ymd(new Date(Date.now() + 7 * 86400000));
  const weekCount = allDatedItems().filter(it => it.date >= todayYMD() && it.date <= weekEnd).length;
  const urgent = acts.filter(a => !isDone(a) && activityUrgent(a)).length;
  const waiting = acts.filter(a => a.status === '結果待ち').length;

  // 今日のアクション
  const today = todayYMD();
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  const actions = allDatedItems().filter(it => it.date === today || it.date === tomorrow)
    .sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))).slice(0, 6);

  // 進捗リング（今週の予定の完了率＝直近ステップの passed 比率）
  const prog = weekProgress();

  // 企業カード
  let visible = companies.map(co => ({ co, act: primaryActivity(co.id) })).filter(x => x.act);
  if (homeFilter === '締切間近') visible = visible.filter(x => activityUrgent(x.act));
  else if (homeFilter === '結果待ち') visible = visible.filter(x => x.act.status === '結果待ち');
  else if (homeFilter === '完了') visible = visible.filter(x => isDone(x.act));
  else visible = visible.filter(x => homeFilter === 'すべて' || homeFilter === '進行中' ? !isDone(x.act) : true);

  c.innerHTML = `
    <section class="welcome-row">
      <div>
        <p class="eyebrow">${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${wd}曜日</p>
        <h1>おはようございます<span>👋</span></h1>
        <p>今日も一つずつ、落ち着いて進めましょう。</p>
      </div>
      <button class="primary-button desktop-add" id="homeAdd"><span>＋</span>新しい記録</button>
    </section>

    <section class="metric-grid" aria-label="就活の概要">
      ${metricCard('進行中', ongoing, '社', 'indigo', `企業 ${state.companies.length}社を記録中`)}
      ${metricCard('今週の予定', weekCount, '件', 'blue', actions[0] ? `次は ${actions[0].time || actions[0].date.slice(5).replace('-', '/')}` : '予定なし')}
      ${metricCard('締切間近', urgent, '件', 'amber', '48時間以内')}
      ${metricCard('結果待ち', waiting, '社', 'green', '結果を待っています')}
    </section>

    <div class="dashboard-grid">
      <section class="panel action-panel">
        <div class="panel-heading"><div><span class="section-kicker">NEXT ACTION</span><h2>直近のアクション</h2></div></div>
        <div class="timeline">
          ${actions.length ? actions.map(renderAction).join('') : `<p style="color:var(--sub);font-size:12px;padding:14px 0">今日・明日の予定はありません。</p>`}
        </div>
      </section>
      <section class="panel progress-panel">
        <div class="panel-heading"><div><span class="section-kicker">THIS WEEK</span><h2>今週のペース</h2></div></div>
        <div class="ring-wrap">
          <div class="progress-ring" style="background:radial-gradient(circle closest-side,var(--surface) 76%,transparent 77%),conic-gradient(var(--primary) ${prog.pct}%,var(--line) 0)"><strong>${prog.pct}%</strong><span>完了</span></div>
          <div class="ring-copy"><strong>${prog.pct >= 60 ? 'いいペースです' : 'ここから積み上げ'}</strong><p>ステップ全${prog.total}件のうち、${prog.passed}件が完了しました。</p></div>
        </div>
      </section>
    </div>

    <section class="company-section">
      <div class="company-heading"><div><span class="section-kicker">SELECTIONS</span><h2>選考中の企業</h2></div></div>
      <div class="filter-row" role="tablist">
        ${HOME_FILTERS.map(f => `<button class="filter-chip ${homeFilter === f ? 'active' : ''}" data-filter="${f}">${f}</button>`).join('')}
      </div>
      <div class="company-grid">
        ${visible.length ? visible.map(x => companyCard(x.co, x.act)).join('')
          : (state.companies.length ? `<div class="empty-state"><span>✓</span><strong>該当する記録はありません</strong><p>フィルターを変更して確認してください。</p></div>`
            : `<div class="empty-companies"><strong>まだ記録がありません</strong><p>右上の「新しい記録」から、企業や活動を追加しましょう。</p><button id="emptyAdd">＋ 最初の記録を追加</button></div>`)}
      </div>
    </section>`;

  $('homeAdd') && ($('homeAdd').onclick = openCreateCenter);
  $('emptyAdd') && ($('emptyAdd').onclick = openCreateCenter);
  c.querySelectorAll('.filter-chip').forEach(b => b.onclick = () => { homeFilter = b.dataset.filter; renderHome(c); });
  c.querySelectorAll('[data-company]').forEach(b => b.onclick = () => openCompany(b.dataset.company));
  c.querySelectorAll('[data-openact]').forEach(b => b.onclick = e => { e.stopPropagation(); const a = activityById(b.dataset.openact); if (a) openCompany(a.companyId, a.id); });
}

function metricCard(label, value, suffix, tone, note) {
  return `<article class="metric-card ${tone}"><div class="metric-top"><span>${label}</span><i></i></div><div class="metric-value">${value}<small>${suffix}</small></div><p>${esc(note)}</p></article>`;
}
function renderAction(it) {
  const tone = it.kind === '締切' ? 'red' : it.tone || 'indigo';
  const badge = it.date === todayYMD() ? '今日' : '明日';
  return `<button class="action-item" data-openact="${it.activityId}"><span class="time-dot ${tone}"></span><time>${it.time || (it.date === todayYMD() ? '今日' : '明日')}</time><div><strong>${esc(it.company)}</strong><small>${esc(it.label)}</small></div><span class="action-badge ${tone}">${badge}</span><b>›</b></button>`;
}
function companyCard(co, a) {
  const p = stepProgress(a);
  const next = nextActionOf(a);
  const statusCls = statusClass(a.status);
  const dots = a.steps.slice(0, 6);
  const passedCount = a.steps.filter(s => s.status === 'passed').length;
  return `<button class="company-card" data-company="${co.id}">
    <div class="company-top"><div><span class="type-tag type-${a.type}">${esc(a.type)}</span><h3>${esc(co.name)}</h3><p>${esc(a.title)}</p></div><span class="status-tag ${statusCls}">${esc(a.status)}</span></div>
    <div class="next-box"><span>次のアクション</span><strong>${next ? esc(next.label) : '記録を進めましょう'}</strong><div><time>${next && next.date ? fmtJDate(next.date) : '日程未定'}</time><em>${next && next.date ? relLabel(next.date) : ''}</em></div></div>
    <div class="card-progress"><div><span>選考の進捗</span><strong>${p.pct}%</strong></div><div class="progress-track"><i style="width:${p.pct}%"></i></div></div>
    ${dots.length ? `<div class="step-dots">${dots.map((s, i) => `<div class="${s.status === 'passed' ? 'done' : (i === passedCount ? 'current' : '')}"><i>${s.status === 'passed' ? '✓' : i + 1}</i><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
  </button>`;
}
function statusClass(st) {
  // reference uses status-締切間近/準備中/結果待ち/完了; map our statuses
  if (st === '結果待ち') return 'status-結果待ち';
  if (st === '完了' || st === '参加済み') return 'status-完了';
  if (st === '応募中' || st === '未着手') return 'status-準備中';
  return 'status-準備中';
}

/* 企業の代表活動（未完了で直近のもの、なければ最新） */
function primaryActivity(cid) {
  const list = activitiesOf(cid);
  if (!list.length) return null;
  const active = list.filter(a => !isDone(a));
  const pool = active.length ? active : list;
  return pool.slice().sort((a, b) => {
    const na = nextActionOf(a), nb = nextActionOf(b);
    const da = na && na.date ? na.date : '9999', db = nb && nb.date ? nb.date : '9999';
    return da.localeCompare(db);
  })[0];
}
/* 日付付きの全アイテム（活動開始・ステップ日・締切・予定） */
function allDatedItems() {
  const items = [];
  state.activities.forEach(a => {
    const co = companyById(a.companyId); const cname = co ? co.name : a.title;
    if (a.startDate) items.push({ date: a.startDate, time: a.time || '', company: cname, label: `${a.type}・${a.title}`, activityId: a.id, kind: '活動', tone: TYPE_TONE[a.type] === 'blue' ? 'indigo' : (TYPE_TONE[a.type] || 'indigo') });
    a.steps.forEach(s => {
      if (s.date) items.push({ date: s.date, time: s.time || '', company: cname, label: s.label, activityId: a.id, kind: 'ステップ', tone: 'indigo' });
      if (s.deadline) items.push({ date: s.deadline.slice(0, 10), time: '', company: cname, label: `${s.label} 締切`, activityId: a.id, kind: '締切', tone: 'red' });
    });
  });
  state.schedules.forEach(s => { const a = activityById(s.activityId); const co = a && companyById(a.companyId); items.push({ date: s.date, time: s.time || '', company: co ? co.name : s.title, label: s.title, activityId: s.activityId || '', kind: '予定', tone: 'indigo' }); });
  return items;
}
function weekProgress() {
  let passed = 0, total = 0;
  state.activities.filter(a => !isDone(a)).forEach(a => { a.steps.forEach(s => { total++; if (s.status === 'passed') passed++; }); });
  return { passed, total, pct: total ? Math.round(passed / total * 100) : 0 };
}

/* ============ 統計（データ駆動） ============ */
function renderStats(c) {
  const acts = state.activities;
  if (!acts.length) return renderComing(c, 'stats');
  const interviews = acts.reduce((n, a) => n + a.steps.filter(s => /面接/.test(s.label) || s.label === 'GD' || s.label === '集団面接').length, 0);
  // 漏斗
  const funnelDefs = [['ES', /ES/], ['Webテスト', /Web|適性/], ['1次面接', /面接/], ['GD', /GD|集団/], ['最終面接', /最終/]];
  const funnel = funnelDefs.map(([label, re]) => {
    const steps = acts.flatMap(a => a.steps).filter(s => re.test(s.label));
    const total = steps.length; const passed = steps.filter(s => s.status === 'passed').length;
    return { label, total, passed };
  }).filter(f => f.total > 0);
  const passedSteps = acts.flatMap(a => a.steps).filter(s => s.status !== 'pending');
  const passRate = passedSteps.length ? Math.round(passedSteps.filter(s => s.status === 'passed').length / passedSteps.length * 100) : 0;
  const kettei = acts.filter(a => (a.marks || []).includes('参加決定') || a.status === '参加済み').length;
  // 結果構成
  const passingCo = new Set(acts.filter(a => a.steps.some(s => s.status === 'passed') && !a.steps.some(s => s.status === 'failed')).map(a => a.companyId)).size;
  const failedCo = new Set(acts.filter(a => a.steps.some(s => s.status === 'failed')).map(a => a.companyId)).size;
  const waitingCo = new Set(acts.filter(a => a.status === '結果待ち').map(a => a.companyId)).size;

  c.innerHTML = `<div class="stats-page">
    <section class="stats-heading"><div><span class="section-kicker">ANALYTICS</span><h1>就活の統計</h1><p>記録した選考を、次の行動につながる形で確認します。</p></div></section>
    <section class="stats-metrics">
      <article><span>登録企業</span><strong>${state.companies.length}<small>社</small></strong><em>活動 ${acts.length}件</em></article>
      <article><span>面接・GD</span><strong>${interviews}<small>回</small></strong><em>記録済み</em></article>
      <article><span>選考通過率</span><strong>${passRate}<small>%</small></strong><em>判明したステップ</em></article>
      <article><span>参加・内定</span><strong>${kettei}<small>件</small></strong><em>参加決定など</em></article>
    </section>
    <div class="stats-grid">
      <section class="stats-card funnel-card"><header><div><span class="section-kicker">SELECTION FUNNEL</span><h2>段階別の通過状況</h2></div></header>
        <div class="funnel-list">${funnel.length ? funnel.map(f => `<div><div><strong>${f.label}</strong><span>${f.passed} / ${f.total}件</span><em>${Math.round(f.passed / f.total * 100)}%</em></div><i><b style="width:${Math.round(f.passed / f.total * 100)}%"></b></i></div>`).join('') : `<p style="color:var(--sub);font-size:11px">ステップを記録すると集計されます。</p>`}</div>
      </section>
      <section class="stats-card outcome-card"><header><div><span class="section-kicker">RESULTS</span><h2>現在の選考結果</h2></div></header>
        <div class="donut"><div><strong>${state.companies.length}</strong><span>企業</span></div></div>
        <ul><li><i class="green"></i><span>通過・進行中</span><strong>${passingCo}社</strong></li><li><i class="red"></i><span>落選</span><strong>${failedCo}社</strong></li><li><i class="gray"></i><span>結果待ち</span><strong>${waitingCo}社</strong></li></ul>
      </section>
    </div>
  </div>`;
}

/* ============ 企業ワークスペース ============ */
let wsCompanyId = null, wsTab = 'selection', wsActivityId = null, wsPwVisible = false;

function openCompany(cid, activityId = null) {
  wsCompanyId = cid; wsTab = 'selection'; wsActivityId = activityId; wsPwVisible = false;
  renderWorkspace();
}
function closeWorkspace() { wsCompanyId = null; wsActivityId = null; $('overlayRoot').innerHTML = ''; renderContent(); }

function renderWorkspace() {
  const co = companyById(wsCompanyId);
  if (!co) return closeWorkspace();
  if (wsActivityId) return renderFlow();
  const acts = activitiesOf(co.id);
  const byYear = {};
  acts.forEach(a => { (byYear[a.year] = byYear[a.year] || []).push(a); });
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
  const logo = (co.name || '？').slice(0, 2);

  $('overlayRoot').innerHTML = `<div class="company-workspace">
    <header class="company-page-header">
      <button class="company-back" id="wsBack"><span>‹</span>企業一覧に戻る</button>
      <div class="company-page-tabs" role="tablist">
        <button class="${wsTab === 'selection' ? 'active' : ''}" data-tab="selection">選考管理</button>
        <button class="${wsTab === 'research' ? 'active' : ''}" data-tab="research">企業研究</button>
      </div>
      <button class="company-save" id="wsAddAct">＋ 活動</button>
    </header>
    <main class="company-page-main">
      <section class="company-hero">
        <div class="company-logo">${esc(logo)}</div>
        <div class="company-identity">
          <div class="company-tags"><span>${COHORT}</span>${co.industry ? `<span>${esc(co.industry)}</span>` : ''}</div>
          <h1>${esc(co.name)}${co.officialName ? `<small>${esc(co.officialName)}</small>` : ''}</h1>
          ${(co.industry || co.subIndustry) ? `<div class="industry-path"><strong>${esc(co.industry || '未分類')}</strong><span>›</span><strong>${esc(co.subIndustry || '—')}</strong></div>` : ''}
          ${co.description ? `<p>${esc(co.description)}</p>` : ''}
        </div>
        <div class="hero-actions">${co.mypage.url ? `<a href="${esc(co.mypage.url)}" target="_blank" rel="noreferrer">マイページ ↗</a>` : ''}<button id="wsEditProfile">企業情報を編集</button></div>
      </section>
      ${wsTab === 'selection' ? selectionTabHTML(co, years, byYear) : researchTabHTML(co)}
    </main>
  </div>`;

  $('wsBack').onclick = closeWorkspace;
  $('overlayRoot').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { wsTab = b.dataset.tab; renderWorkspace(); });
  $('wsAddAct').onclick = () => openActivityAdd(co.id);
  $('wsEditProfile').onclick = () => openProfileEditor(co.id);
  if (wsTab === 'selection') bindSelectionTab(co);
  if (wsTab === 'research') bindResearchTab(co);
}

function selectionTabHTML(co, years, byYear) {
  return `<div class="company-page-grid">
    <div class="company-primary-column">
      <section class="workspace-panel activities-panel">
        <div class="workspace-title"><div><span>ACTIVITIES</span><h2>活動・選考記録</h2></div><button data-act="add">＋ 活動を追加</button></div>
        ${years.length ? years.map(y => `
          <div class="year-group">
            <div class="year-heading"><strong>${esc(y)}年</strong><span>${COHORT}</span></div>
            <div class="activity-list">${byYear[y].map(activityRow).join('')}</div>
          </div>`).join('') : `<div class="empty-record" style="margin-top:16px"><i>＋</i><strong>活動がありません</strong><p>インターン・本選考・説明会などを追加しましょう。</p><button data-act="add">最初の活動を追加</button></div>`}
      </section>
    </div>
    <aside class="company-side-column">
      <section class="workspace-panel mypage-card">
        <div class="workspace-title compact"><div><span>MY PAGE</span><h2>マイページ情報</h2></div><button data-my="edit">編集</button></div>
        <a class="mypage-link" href="${esc(co.mypage.url || '#')}" ${co.mypage.url ? 'target="_blank" rel="noreferrer"' : ''}>企業マイページを開く <span>↗</span></a>
        <label>ログインID<div><code>${esc(co.mypage.loginId || '未登録')}</code><button data-my="copyId">コピー</button></div></label>
        <label>パスワード<div><code class="${wsPwVisible ? '' : 'pw-dots'}">${wsPwVisible ? esc(co.mypage.password || '未登録') : '••••••••••••'}</code><span class="mypage-inline-actions"><button data-my="togglePw">${wsPwVisible ? '隠す' : '表示'}</button><button data-my="copyPw">コピー</button></span></div></label>
        ${co.mypage.note ? `<p class="mypage-note">${esc(co.mypage.note)}</p>` : ''}
        <p class="security-note">この情報は端末内だけに保存されます。共用PCでは保存しないでください。</p>
      </section>
      <section class="workspace-panel quick-memo"><div class="workspace-title compact"><div><span>MEMO</span><h2>企業メモ</h2></div></div><textarea data-memo placeholder="説明会で聞いた内容や、次に確認したいこと。">${esc(co.memo)}</textarea></section>
    </aside>
  </div>`;
}
function activityRow(a) {
  const p = stepProgress(a);
  const tone = STATUS_TONE[a.status] || 'gray';
  const dateLabel = a.startDate ? (a.endDate ? `${fmtJDate(a.startDate)}〜` : fmtJDate(a.startDate)) : '日程未定';
  return `<button class="activity-row" data-openact="${a.id}">
    <span class="activity-date ${tone}">${esc(a.season)}</span>
    <div class="activity-copy"><div><h3>${esc(a.title)}</h3><span>${esc(a.type)}</span></div><p>${dateLabel}</p>
      <div class="activity-progress"><i style="width:${p.pct}%"></i></div>
      ${a.marks && a.marks.length ? `<div class="activity-marks">${a.marks.map(m => `<span>✓ ${esc(m)}</span>`).join('')}</div>` : ''}
    </div>
    <span class="activity-status ${tone}">${esc(a.status)}</span><b>›</b>
  </button>`;
}
function bindSelectionTab(co) {
  const root = $('overlayRoot');
  root.querySelectorAll('[data-openact]').forEach(b => b.onclick = () => { wsActivityId = b.dataset.openact; renderWorkspace(); });
  root.querySelectorAll('[data-act="add"]').forEach(b => b.onclick = () => openActivityAdd(co.id));
  const my = k => root.querySelector(`[data-my="${k}"]`);
  my('edit') && (my('edit').onclick = () => openMypageEditor(co.id));
  my('togglePw') && (my('togglePw').onclick = () => { wsPwVisible = !wsPwVisible; renderWorkspace(); });
  my('copyId') && (my('copyId').onclick = () => copyText(co.mypage.loginId));
  my('copyPw') && (my('copyPw').onclick = () => copyText(co.mypage.password));
  const memo = root.querySelector('[data-memo]');
  memo && memo.addEventListener('input', () => { co.memo = memo.value; save(); });
}
function copyText(t) { if (!t) return; navigator.clipboard && navigator.clipboard.writeText(t).then(() => flash('コピーしました')).catch(() => {}); }

function researchTabHTML(co) {
  return `<div class="research-layout">
    <div class="research-grid">
      <div class="research-main">
        <section class="workspace-panel research-section"><div class="workspace-title"><div><span>OVERVIEW</span><h2>企業概要</h2></div></div>
          <p>${esc(co.description || 'まだ企業概要が入力されていません。「企業情報を編集」から追加できます。')}</p></section>
        <section class="workspace-panel research-section"><div class="workspace-title"><div><span>YOUR NOTE</span><h2>自分の企業研究メモ</h2></div></div>
          <textarea class="research-note" data-research placeholder="事業内容、面接で使いたい切り口、志望動機の素材などを記録。">${esc(co.researchNote)}</textarea></section>
      </div>
      <aside class="research-side">
        <section class="workspace-panel fact-sheet"><div class="workspace-title compact"><div><span>BASIC DATA</span><h2>基本情報</h2></div></div>
          <dl>
            <div><dt>業界</dt><dd>${esc(co.industry || '—')}</dd></div>
            <div><dt>本社</dt><dd>${esc(co.headquarters || '—')}</dd></div>
            <div><dt>創立</dt><dd>${esc(co.founded || '—')}</dd></div>
            <div><dt>従業員数</dt><dd>${esc(co.employees || '—')}</dd></div>
          </dl></section>
      </aside>
    </div>
  </div>`;
}
function bindResearchTab(co) {
  const ta = $('overlayRoot').querySelector('[data-research]');
  ta && ta.addEventListener('input', () => { co.researchNote = ta.value; save(); });
}

/* ============ 選考フローページ ============ */
let flowStepId = null;

function renderFlow() {
  const co = companyById(wsCompanyId); const a = activityById(wsActivityId);
  if (!a) { wsActivityId = null; return renderWorkspace(); }
  if (!flowStepId || !a.steps.some(s => s.id === flowStepId)) flowStepId = a.steps[0] ? a.steps[0].id : null;
  const p = stepProgress(a);
  const failed = a.steps.some(s => s.status === 'failed');
  const selected = a.steps.find(s => s.id === flowStepId);

  $('overlayRoot').innerHTML = `<div class="company-workspace"><main class="company-page-main">
    <button class="flow-back" id="flowBack"><span>‹</span>${esc(co.name)} の活動に戻る</button>
    <section class="flow-event-header workspace-panel">
      <div class="flow-event-icon">${esc(a.season.slice(0, 2))}</div>
      <div><div class="flow-event-tags"><span>${COHORT}</span><span>${esc(a.type)}</span><span>${esc(a.year)}年</span><span class="saved-tag">✓ 自動保存</span></div><h2>${esc(a.title)}</h2><p>${esc(co.name)}</p></div>
      <div class="flow-summary"><span>進捗</span><strong>${p.passed}<small> / ${a.steps.length}</small></strong><em class="${failed ? 'failed' : 'active'}">${failed ? '選考終了' : '選考中'}</em></div>
    </section>

    <section class="workspace-panel flow-map-panel">
      <div class="workspace-title"><div><span>SELECTION FLOW</span><h2>選考プロセス</h2></div><div class="flow-toolbar"><button id="flowEdit">＋ フローを編集</button><div class="flow-legend"><span><i class="passed"></i>通過</span><span><i class="failed"></i>落選</span><span><i class="pending"></i>未定</span></div></div></div>
      <div class="flow-scroll"><div class="flow-nodes">${a.steps.map((s, i) => `<div class="flow-node-wrap"><button class="flow-node ${s.status} ${flowStepId === s.id ? 'selected' : ''}" data-node="${s.id}"><i>${s.status === 'passed' ? '✓' : s.status === 'failed' ? '×' : i + 1}</i><strong>${esc(s.label)}</strong><small>${s.status === 'passed' ? '通過' : s.status === 'failed' ? '落選' : '未定'}</small></button>${i < a.steps.length - 1 ? `<span class="flow-connector ${s.status}"><i>›</i></span>` : ''}</div>`).join('') || '<p style="color:var(--sub);font-size:11px">ステップがありません。「フローを編集」から追加してください。</p>'}</div></div>
      <p class="flow-hint">各ステップをクリックすると、詳細の確認・編集ができます。</p>
    </section>

    ${selected ? stepDetailHTML(a, selected) : ''}
  </main></div>`;

  $('flowBack').onclick = () => { wsActivityId = null; flowStepId = null; renderWorkspace(); };
  $('flowEdit').onclick = () => openFlowEditor(a.id);
  $('overlayRoot').querySelectorAll('[data-node]').forEach(b => b.onclick = () => { flowStepId = b.dataset.node; renderFlow(); });
  if (selected) bindStepDetail(a, selected);
}

function stepDetailHTML(a, s) {
  return `<section class="workspace-panel step-detail-panel">
    <div class="step-detail-head"><div><span>STEP DETAIL</span><h2>${esc(s.label)}</h2><p>${s.date ? fmtJDate(s.date) : '日程未定'}</p></div>
      <div class="status-picker"><span>結果</span><div>
        <button class="passed ${s.status === 'passed' ? 'active' : ''}" data-status="passed">✓ 通過</button>
        <button class="failed ${s.status === 'failed' ? 'active' : ''}" data-status="failed">× 落選</button>
        <button class="pending ${s.status === 'pending' ? 'active' : ''}" data-status="pending">－ 未定</button>
      </div></div>
    </div>
    <div class="step-detail-grid">
      <div class="step-main-detail">${stepBodyHTML(s)}</div>
      <aside class="step-side-detail">
        <div><span>日程</span><strong>${s.date ? fmtJDate(s.date) : '日程未定'}</strong></div>
        ${s.deadline ? `<div class="deadline-box"><span>締切</span><strong>${esc(s.deadline)}</strong><em>${s.status === 'passed' ? '完了' : '要確認'}</em></div>` : ''}
        <div><span>メモ</span><p>${esc(s.note || 'メモは未記入です。')}</p></div>
        <button data-stepedit>このステップを編集</button>
      </aside>
    </div>
  </section>`;
}
function stepBodyHTML(s) {
  const L = s.label;
  if (L === 'ES') return esDetailHTML(s);
  if (L === 'GD' || L === 'グループディスカッション') return gdDetailHTML(s);
  if (/面接/.test(L) || L === '集団面接') return interviewDetailHTML(s);
  return genericDetailHTML(s);
}
function esDetailHTML(s) {
  return `<div class="es-detail"><div class="detail-section-title"><div><span>QUESTIONS</span><h3>ES設問・回答</h3></div><button data-esadd>＋ 設問を追加</button></div>
    ${s.esQuestions.map((q, i) => `<article><div><span>設問 ${pad2(i + 1)}</span><em>${q.limit}字以内</em></div><h4>${esc(q.question || '設問を入力してください')}</h4><p>${esc(q.answer || '回答はまだ入力されていません。')}</p><footer><span class="${q.answer.length > q.limit ? 'over-limit' : ''}">${q.answer.length} / ${q.limit}字</span><span class="es-card-actions"><button data-esedit="${q.id}">回答を編集</button><button data-esdel="${q.id}">削除</button></span></footer></article>`).join('')}
    ${s.esQuestions.length === 0 ? `<div class="empty-record"><i>＋</i><strong>ES設問がありません</strong><p>企業から提示された設問と回答を追加してください。</p><button data-esadd>最初の設問を追加</button></div>` : ''}
  </div>`;
}
function gdDetailHTML(s) {
  const r = s.record;
  return `<div class="stage-record"><div class="detail-section-title"><div><span>GROUP DISCUSSION</span><h3>GD記録</h3></div><span class="auto-save-mini">✓ 自動保存</span></div>
    <div class="record-grid"><label>実施形式<input data-rec="format" value="${esc(r.format)}" placeholder="オンライン／対面"></label><label>参加人数<input data-rec="participants" value="${esc(r.participants)}"></label></div>
    <label>GDテーマ<textarea data-rec="theme" placeholder="提示されたテーマ">${esc(r.theme)}</textarea></label>
    <label>自分の役割<input data-rec="role" value="${esc(r.role)}" placeholder="司会、タイムキーパーなど"></label>
    <label>議論内容・振り返り<textarea data-rec="note">${esc(r.note)}</textarea></label>
    <label>企業からのフィードバック<textarea data-rec="feedback">${esc(r.feedback)}</textarea></label></div>`;
}
function interviewDetailHTML(s) {
  const r = s.record;
  return `<div class="stage-record interview-record"><div class="detail-section-title"><div><span>INTERVIEW</span><h3>${esc(s.label)}記録</h3></div><button data-iqadd>＋ 質問を追加</button></div>
    <div class="record-grid"><label>実施形式<input data-rec="format" value="${esc(r.format)}" placeholder="オンライン／対面"></label><label>面接官・参加人数<input data-rec="participants" value="${esc(r.participants)}"></label></div>
    <div class="interview-questions">${r.questions.map((q, i) => `<article><header><span>質問 ${pad2(i + 1)}</span><select data-iq="${q.id}" data-iqf="tag"><option ${q.tag !== '本番' ? 'selected' : ''}>予測</option><option ${q.tag === '本番' ? 'selected' : ''}>本番</option></select><button data-iqdel="${q.id}">削除</button></header><input data-iq="${q.id}" data-iqf="question" value="${esc(q.question)}" placeholder="質問内容"><textarea data-iq="${q.id}" data-iqf="answer" placeholder="自分の回答・改善点">${esc(q.answer)}</textarea></article>`).join('')}</div>
    ${r.questions.length === 0 ? `<button class="empty-question-add" data-iqadd>＋ 最初の質問を追加</button>` : ''}
    <label>全体メモ<textarea data-rec="note" placeholder="面接官の反応、雰囲気、改善点">${esc(r.note)}</textarea></label>
    <label>フィードバック<textarea data-rec="feedback">${esc(r.feedback)}</textarea></label></div>`;
}
function genericDetailHTML(s) {
  return `<div class="generic-detail"><div class="detail-section-title"><div><span>NOTE</span><h3>${esc(s.label)}のメモ</h3></div></div>
    <label class="mini-label" style="display:block;color:var(--sub);font-size:8px;font-weight:750;margin-top:13px">記録・メモ</label>
    <textarea data-rec="note" style="width:100%;min-height:120px;margin-top:5px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--text);font-size:9px;line-height:1.7;outline:0;resize:vertical" placeholder="日程、内容、感想などを記録できます。">${esc(s.note)}</textarea></div>`;
}
function bindStepDetail(a, s) {
  const root = $('overlayRoot');
  root.querySelectorAll('[data-status]').forEach(b => b.onclick = () => { s.status = b.dataset.status; save(); renderFlow(); });
  root.querySelector('[data-stepedit]') && (root.querySelector('[data-stepedit]').onclick = () => openStepEditor(a.id, s.id));
  // generic/GD/interview record fields (note lives on step for generic)
  root.querySelectorAll('[data-rec]').forEach(el => el.addEventListener('input', () => {
    const f = el.dataset.rec;
    if (s.label !== 'ES' && s.label !== 'GD' && s.label !== 'グループディスカッション' && !/面接/.test(s.label) && s.label !== '集団面接' && f === 'note') { s.note = el.value; }
    else { s.record[f] = el.value; }
    save();
  }));
  // ES
  root.querySelectorAll('[data-esadd]').forEach(b => b.onclick = () => openESEditor(a.id, s.id, null));
  root.querySelectorAll('[data-esedit]').forEach(b => b.onclick = () => openESEditor(a.id, s.id, b.dataset.esedit));
  root.querySelectorAll('[data-esdel]').forEach(b => b.onclick = () => { s.esQuestions = s.esQuestions.filter(q => q.id !== b.dataset.esdel); save(); renderFlow(); });
  // interview questions
  root.querySelectorAll('[data-iqadd]').forEach(b => b.onclick = () => { s.record.questions.push({ id: uid(), question: '', answer: '', tag: '予測' }); save(); renderFlow(); });
  root.querySelectorAll('[data-iqdel]').forEach(b => b.onclick = () => { s.record.questions = s.record.questions.filter(q => q.id !== b.dataset.iqdel); save(); renderFlow(); });
  root.querySelectorAll('[data-iq]').forEach(el => el.addEventListener('input', () => { const q = s.record.questions.find(x => x.id === el.dataset.iq); if (q) { q[el.dataset.iqf] = el.value; save(); } }));
}

/* ============ モーダル基盤 ============ */
function openModal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay center';
  wrap.innerHTML = html;
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
  return wrap;
}
function flash(msg) { const el = $('saveFlash'); if (!el) return; el.textContent = '✓ ' + msg; el.classList.add('show'); clearTimeout(flashTimer); flashTimer = setTimeout(() => { el.classList.remove('show'); el.textContent = '✓ 保存しました'; }, 1600); }

/* ---- 作成センター ---- */
const CREATE_KINDS = [
  { id: 'company', icon: '⌂', label: '企業を追加', note: '企業情報から開始' },
  { id: 'activity', icon: '→', label: '活動・選考', note: 'インターン、本選考、説明会' },
  { id: 'schedule', icon: '□', label: '予定・締切', note: '面接日、ES締切、テスト' },
];
function openCreateCenter() {
  let kind = 'activity';
  const w = openModal(`<div class="create-center"><header><div><span>CREATE CENTER</span><h2>何を追加しますか？</h2><p>まず目的を選び、必要な項目だけ入力します。</p></div><button data-x>×</button></header><div class="create-body"><aside id="ccAside"></aside><section class="create-form" id="ccForm"></section></div></div>`);
  w.querySelector('[data-x]').onclick = () => w.remove();
  const aside = w.querySelector('#ccAside'), form = w.querySelector('#ccForm');
  const renderAside = () => { aside.innerHTML = CREATE_KINDS.map(k => `<button class="${kind === k.id ? 'active' : ''}" data-k="${k.id}"><i>${k.icon}</i><span><strong>${k.label}</strong><small>${k.note}</small></span><b>›</b></button>`).join(''); aside.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; renderAside(); renderForm(); }); };
  const companyOptions = () => state.companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const activityOptions = () => state.activities.map(a => { const c = companyById(a.companyId); return `<option value="${a.id}">${esc(c ? c.name : '')} / ${esc(a.title)}</option>`; }).join('');
  const renderForm = () => {
    const sel = CREATE_KINDS.find(k => k.id === kind);
    let body = '';
    if (kind === 'company') body = `<label>企業名<input id="f_name" placeholder="例：〇〇株式会社" autofocus></label><label>マイページURL（任意）<input id="f_url" placeholder="https://..."></label>`;
    else if (kind === 'activity') body = `<label>企業<div style="display:flex;gap:8px"><select id="f_comp"><option value="">＋ 新しい企業</option>${companyOptions()}</select></div></label><label id="f_newcompwrap">新しい企業名<input id="f_newcomp" placeholder="例：〇〇株式会社"></label><label>活動名<input id="f_title" placeholder="例：2027年 サマーインターン"></label><div class="input-grid"><label>種類<select id="f_type">${ACTIVITY_TYPES.map(t => `<option>${t}</option>`).join('')}</select></label><label>開催年<select id="f_year">${['2026', '2027', '2028', '2029'].map(y => `<option ${y === String(new Date().getFullYear()) ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div>`;
    else body = `<label>予定名<input id="f_title" placeholder="例：三菱商事 1次面接" autofocus></label><div class="input-grid"><label>日付<input type="date" id="f_date" value="${todayYMD()}"></label><label>時刻<input type="time" id="f_time"></label></div><label>企業・活動に紐づける（任意）<select id="f_act"><option value="">なし</option>${activityOptions()}</select></label>`;
    form.innerHTML = `<div class="create-form-title"><i>${sel.icon}</i><div><span>NEW RECORD</span><h3>${sel.label}</h3></div></div>${body}<footer><button data-cancel>キャンセル</button><button data-save>${kind === 'schedule' ? '予定を追加' : '追加する'}</button></footer>`;
    form.querySelector('[data-cancel]').onclick = () => w.remove();
    if (kind === 'activity') { const cs = form.querySelector('#f_comp'); const nw = form.querySelector('#f_newcompwrap'); const upd = () => nw.style.display = cs.value ? 'none' : 'block'; cs.onchange = upd; upd(); }
    form.querySelector('[data-save]').onclick = () => doCreate(kind, form, w);
  };
  renderAside(); renderForm();
}
function doCreate(kind, form, w) {
  const val = id => { const el = form.querySelector('#' + id); return el ? el.value.trim() : ''; };
  if (kind === 'company') {
    const name = val('f_name'); if (!name) return alert('企業名を入力してください');
    const c = { id: uid(), name, officialName: '', industry: '', subIndustry: '', headquarters: '', founded: '', employees: '', businessScale: '', description: '', links: [], researchNote: '', memo: '', mypage: { url: val('f_url'), loginId: '', password: '', note: '' } };
    state.companies.push(c); save(); w.remove(); openCompany(c.id);
  } else if (kind === 'activity') {
    let cid = form.querySelector('#f_comp').value;
    if (!cid) { const nm = val('f_newcomp'); if (!nm) return alert('企業名を入力してください'); const c = { id: uid(), name: nm, officialName: '', industry: '', subIndustry: '', headquarters: '', founded: '', employees: '', businessScale: '', description: '', links: [], researchNote: '', memo: '', mypage: { url: '', loginId: '', password: '', note: '' } }; state.companies.push(c); cid = c.id; }
    const type = form.querySelector('#f_type').value; const year = form.querySelector('#f_year').value;
    const title = val('f_title') || `${year}年 ${seasonOf(type, '')}${type}`;
    const a = { id: uid(), companyId: cid, title, type, cohort: COHORT, year, season: seasonOf(type, ''), status: '未着手', marks: [], startDate: '', endDate: '', time: '', endTime: '', locType: '', locValue: '', review: '', feedback: '', steps: [] };
    state.activities.push(a); save(); w.remove(); openCompany(cid, a.id);
  } else {
    const title = val('f_title'); if (!title) return alert('予定名を入力してください');
    state.schedules.push({ id: uid(), title, date: val('f_date') || todayYMD(), time: val('f_time'), activityId: form.querySelector('#f_act').value });
    save(); w.remove(); flash('予定を追加しました'); renderContent();
  }
}

/* ---- 活動追加（企業内） ---- */
function openActivityAdd(cid) {
  const w = openModal(`<div class="activity-add-modal"><div class="flow-editor-head"><div><span>NEW ACTIVITY</span><h2>活動・選考を追加</h2><p>卒業年度とは別に、実際の開催年を記録します。</p></div><button data-x>×</button></div>
    <div class="activity-form"><div class="cohort-notice"><span>対象</span><strong>${COHORT}</strong><p id="ay">開催年：${new Date().getFullYear()}年</p></div>
      <div class="activity-form-grid"><label>開催年<select id="a_year">${['2026', '2027', '2028', '2029'].map(y => `<option ${y === String(new Date().getFullYear()) ? 'selected' : ''}>${y}</option>`).join('')}</select></label><label>シーズン<select id="a_season">${SEASONS.map(s => `<option>${s}</option>`).join('')}</select></label></div>
      <label>活動種類<select id="a_type">${ACTIVITY_TYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>表示名<input id="a_title" placeholder="例：2027年 サマーインターン"></label>
      <label>最初の予定・締切（任意）<input id="a_date" type="date"></label>
      <div class="activity-name-preview"><span>表示プレビュー</span><strong id="a_prev">2027年 サマーインターン</strong><p><i>${COHORT}</i><i id="a_pt">インターン</i><i id="a_py">2027年</i><i id="a_ps">サマー</i></p></div>
    </div>
    <footer class="step-editor-actions"><button data-x>キャンセル</button><button data-save>追加する</button></footer></div>`);
  const q = s => w.querySelector(s);
  const upd = () => { const y = q('#a_year').value, se = q('#a_season').value, ty = q('#a_type').value; q('#ay').textContent = `開催年：${y}年`; q('#a_pt').textContent = ty; q('#a_py').textContent = y + '年'; q('#a_ps').textContent = se; q('#a_prev').textContent = q('#a_title').value.trim() || `${y}年 ${se}${ty}`; };
  w.querySelectorAll('#a_year,#a_season,#a_type,#a_title').forEach(el => el.addEventListener('input', upd)); upd();
  w.querySelectorAll('[data-x]').forEach(b => b.onclick = () => w.remove());
  q('[data-save]').onclick = () => {
    const y = q('#a_year').value, se = q('#a_season').value, ty = q('#a_type').value;
    const title = q('#a_title').value.trim() || `${y}年 ${se}${ty}`;
    const a = { id: uid(), companyId: cid, title, type: ty, cohort: COHORT, year: y, season: se, status: '未着手', marks: [], startDate: q('#a_date').value || '', endDate: '', time: '', endTime: '', locType: '', locValue: '', review: '', feedback: '', steps: [] };
    state.activities.push(a); save(); w.remove(); wsActivityId = a.id; renderWorkspace();
  };
}

/* ---- マイページ編集 ---- */
function openMypageEditor(cid) {
  const co = companyById(cid); const m = { ...co.mypage };
  let vis = false;
  const w = openModal(`<div class="mypage-editor-modal"><div class="flow-editor-head"><div><span>MY PAGE SETTINGS</span><h2>マイページ情報を編集</h2><p>ログインに必要な情報を企業単位でまとめます。</p></div><button data-x>×</button></div>
    <div class="mypage-editor-fields"><div class="mypage-warning"><strong>端末内保存</strong><p>情報はこのブラウザ内に保存されます。共用端末ではパスワードを登録しないでください。</p></div>
      <label>マイページURL<input id="m_url" value="${esc(m.url)}" placeholder="https://..."></label>
      <label>ログインID<input id="m_id" value="${esc(m.loginId)}"></label>
      <label>パスワード<div class="password-input"><input id="m_pw" type="password" value="${esc(m.password)}"><button data-pw>表示</button></div></label>
      <label>ログインメモ<textarea id="m_note" placeholder="登録メール、二段階認証など">${esc(m.note)}</textarea></label></div>
    <footer class="step-editor-actions"><button data-x>キャンセル</button><button data-save>保存する</button></footer></div>`);
  w.querySelectorAll('[data-x]').forEach(b => b.onclick = () => w.remove());
  w.querySelector('[data-pw]').onclick = () => { vis = !vis; const i = w.querySelector('#m_pw'); i.type = vis ? 'text' : 'password'; w.querySelector('[data-pw]').textContent = vis ? '隠す' : '表示'; };
  w.querySelector('[data-save]').onclick = () => { co.mypage = { url: w.querySelector('#m_url').value.trim(), loginId: w.querySelector('#m_id').value.trim(), password: w.querySelector('#m_pw').value, note: w.querySelector('#m_note').value.trim() }; save(); w.remove(); renderWorkspace(); };
}

/* ---- 企業情報編集 ---- */
function openProfileEditor(cid) {
  const co = companyById(cid); const d = { ...co };
  const w = openModal(`<div class="profile-editor-modal"><div class="flow-editor-head"><div><span>COMPANY PROFILE</span><h2>企業基本情報を編集</h2><p>業界や基本情報を記録します。</p></div><button data-x>×</button></div>
    <div class="profile-editor-body">
      <label>企業名<input id="p_name" value="${esc(co.name)}"></label>
      <label>正式企業名<input id="p_official" value="${esc(co.officialName)}"></label>
      <div class="profile-two-col"><label>業界<input id="p_industry" value="${esc(co.industry)}"></label><label>細分業界<input id="p_sub" value="${esc(co.subIndustry)}"></label><label>本社所在地<input id="p_hq" value="${esc(co.headquarters)}"></label><label>創立<input id="p_founded" value="${esc(co.founded)}"></label><label>従業員数<input id="p_emp" value="${esc(co.employees)}"></label><label>事業体制<input id="p_scale" value="${esc(co.businessScale)}"></label></div>
      <label>企業紹介<textarea id="p_desc">${esc(co.description)}</textarea></label>
    </div>
    <footer class="step-editor-actions"><button data-x>キャンセル</button><button data-save>保存する</button></footer></div>`);
  w.querySelectorAll('[data-x]').forEach(b => b.onclick = () => w.remove());
  w.querySelector('[data-save]').onclick = () => {
    const g = id => w.querySelector('#' + id).value.trim();
    Object.assign(co, { name: g('p_name') || co.name, officialName: g('p_official'), industry: g('p_industry'), subIndustry: g('p_sub'), headquarters: g('p_hq'), founded: g('p_founded'), employees: g('p_emp'), businessScale: g('p_scale'), description: g('p_desc') });
    save(); w.remove(); renderWorkspace();
  };
}

/* ---- フロー編集 ---- */
function openFlowEditor(aid) {
  const a = activityById(aid);
  const w = openModal('');
  const render = () => {
    w.innerHTML = `<div class="flow-editor"><div class="flow-editor-head"><div><span>FLOW EDITOR</span><h2>選考フローを編集</h2><p>ステップの追加、並べ替え、日程の編集ができます。</p></div><button data-x>×</button></div>
      <section class="preset-section"><h3>ステップを追加</h3><div class="preset-chips">${STEP_PRESETS.map(l => `<button data-add="${esc(l)}">＋ ${l}</button>`).join('')}</div><div class="custom-step"><input id="fe_custom" placeholder="カスタムステップ名"><button data-addcustom>追加</button></div></section>
      <section class="editor-list-section"><div><h3>現在のフロー</h3><span>${a.steps.length}ステップ</span></div><div class="editor-step-list">${a.steps.map((s, i) => `<div class="editor-step"><i>${i + 1}</i><input value="${esc(s.label)}" data-lbl="${s.id}"><input class="editor-date" value="${esc(s.date)}" data-date="${s.id}" placeholder="日程 (2027-07-20)"><div class="editor-controls"><button data-up="${s.id}" ${i === 0 ? 'disabled' : ''}>↑</button><button data-down="${s.id}" ${i === a.steps.length - 1 ? 'disabled' : ''}>↓</button><button class="delete" data-del="${s.id}" ${a.steps.length === 1 ? 'disabled' : ''}>×</button></div></div>`).join('')}</div></section>
      <footer class="flow-editor-actions"><p>変更はすぐ反映されます。</p><button data-x>完了</button></footer></div>`;
    w.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { w.remove(); renderFlow(); });
    const addStep = label => { const st = { id: uid(), label, status: 'pending', date: '', deadline: '', note: '', esQuestions: [], record: { format: '', participants: '', theme: '', role: '', note: '', feedback: '', questions: [] } }; a.steps.push(st); flowStepId = st.id; save(); render(); };
    w.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addStep(b.dataset.add));
    w.querySelector('[data-addcustom]').onclick = () => { const v = w.querySelector('#fe_custom').value.trim(); if (v) addStep(v); };
    w.querySelectorAll('[data-lbl]').forEach(el => el.addEventListener('input', () => { const s = a.steps.find(x => x.id === el.dataset.lbl); if (s) { s.label = el.value; save(); } }));
    w.querySelectorAll('[data-date]').forEach(el => el.addEventListener('input', () => { const s = a.steps.find(x => x.id === el.dataset.date); if (s) { s.date = el.value; save(); } }));
    w.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = a.steps.findIndex(x => x.id === b.dataset.up); if (i > 0) { [a.steps[i - 1], a.steps[i]] = [a.steps[i], a.steps[i - 1]]; save(); render(); } });
    w.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { const i = a.steps.findIndex(x => x.id === b.dataset.down); if (i < a.steps.length - 1) { [a.steps[i + 1], a.steps[i]] = [a.steps[i], a.steps[i + 1]]; save(); render(); } });
    w.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (a.steps.length === 1) return; a.steps = a.steps.filter(x => x.id !== b.dataset.del); if (flowStepId === b.dataset.del) flowStepId = a.steps[0].id; save(); render(); });
  };
  render();
}

/* ---- ステップ編集 ---- */
function openStepEditor(aid, sid) {
  const a = activityById(aid); const s = a.steps.find(x => x.id === sid);
  const w = openModal(`<div class="step-editor-modal"><div class="flow-editor-head"><div><span>STEP SETTINGS</span><h2>${esc(s.label)}を編集</h2><p>日程、締切、メモを設定します。</p></div><button data-x>×</button></div>
    <div class="step-editor-fields"><label>ステップ名<input id="s_label" value="${esc(s.label)}"></label>
      <div class="step-editor-date-grid"><label>日程<input id="s_date" type="date" value="${esc(s.date)}"></label><label>締切（任意）<input id="s_deadline" value="${esc(s.deadline)}" placeholder="例：2027-07-16 23:59"></label></div>
      <label>メモ<textarea id="s_note">${esc(s.note)}</textarea></label></div>
    <footer class="step-editor-actions"><button data-x>キャンセル</button><button data-save>保存する</button></footer></div>`);
  w.querySelectorAll('[data-x]').forEach(b => b.onclick = () => w.remove());
  w.querySelector('[data-save]').onclick = () => { s.label = w.querySelector('#s_label').value.trim() || s.label; s.date = w.querySelector('#s_date').value; s.deadline = w.querySelector('#s_deadline').value.trim(); s.note = w.querySelector('#s_note').value; save(); w.remove(); renderFlow(); };
}

/* ---- ES設問編集 ---- */
function openESEditor(aid, sid, qid) {
  const a = activityById(aid); const s = a.steps.find(x => x.id === sid);
  const q = qid ? s.esQuestions.find(x => x.id === qid) : { id: uid(), question: '', answer: '', limit: 400 };
  const d = { ...q };
  const w = openModal(`<div class="es-editor-modal"><div class="flow-editor-head"><div><span>ES QUESTION</span><h2>ES設問・回答を編集</h2><p>回答文字数はリアルタイムで計算されます。</p></div><button data-x>×</button></div>
    <div class="es-editor-fields"><label>設問<textarea id="e_q" placeholder="企業から提示された設問">${esc(d.question)}</textarea></label>
      <label class="limit-label">文字数上限<input id="e_limit" type="number" min="1" value="${d.limit}"></label>
      <label>回答<textarea class="answer-field" id="e_a" placeholder="回答を入力">${esc(d.answer)}</textarea></label>
      <div class="live-counter" id="e_counter"></div></div>
    <footer class="step-editor-actions"><button data-x>キャンセル</button><button data-save>保存する</button></footer></div>`);
  const upd = () => { const len = w.querySelector('#e_a').value.length; const lim = Math.max(1, Number(w.querySelector('#e_limit').value) || 1); const rem = lim - len; const box = w.querySelector('#e_counter'); box.className = 'live-counter' + (rem < 0 ? ' over' : ''); box.innerHTML = `<span>${len} / ${lim}字</span><strong>${rem >= 0 ? '残り' + rem + '字' : Math.abs(rem) + '字オーバー'}</strong>`; };
  w.querySelectorAll('#e_a,#e_limit').forEach(el => el.addEventListener('input', upd)); upd();
  w.querySelectorAll('[data-x]').forEach(b => b.onclick = () => w.remove());
  w.querySelector('[data-save]').onclick = () => {
    const nq = { id: d.id, question: w.querySelector('#e_q').value, answer: w.querySelector('#e_a').value, limit: Math.max(1, Number(w.querySelector('#e_limit').value) || 400) };
    if (qid) { const idx = s.esQuestions.findIndex(x => x.id === qid); s.esQuestions[idx] = nq; } else s.esQuestions.push(nq);
    save(); w.remove(); renderFlow();
  };
}

/* ============ テーマ・検索 ============ */
let theme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme() { $('app').classList.toggle('theme-dark', theme === 'dark'); const b = $('themeBtn'); b.innerHTML = theme === 'dark' ? '<span>☀</span>ライトモード' : '<span>☾</span>ダークモード'; }

/* ============ 初期化 ============ */
function init() {
  document.querySelectorAll('#sideNav .nav-item, #bottomNav button[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('bottomAdd').onclick = openCreateCenter;
  $('themeBtn').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(THEME_KEY, theme); } catch (e) {} applyTheme(); };
  $('searchInput').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    if (currentView !== 'home') setView('home');
    // 簡易検索：企業名・活動名で絞り込み → ホームカードは企業ベースなので companies をフィルタ
    homeSearch = q; renderContent();
  });
  const flush = () => saveNow();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  applyTheme();
  setView('home');
}
let homeSearch = '';
// ホーム検索をカード表示に反映（primaryActivity 経由なので companies を絞る）
const _origRenderHome = renderHome;
renderHome = function (c) {
  if (!homeSearch) return _origRenderHome(c);
  const q = homeSearch;
  const saved = state.companies;
  const filteredCompanies = saved.filter(co => co.name.toLowerCase().includes(q) || activitiesOf(co.id).some(a => (a.title + ' ' + a.type).toLowerCase().includes(q)));
  const tmp = Object.create(state);
  // 一時的に companies を差し替えて描画（activities はそのまま、primaryActivity は companyId 参照で安全）
  const origCompanies = state.companies;
  state.companies = filteredCompanies;
  _origRenderHome(c);
  state.companies = origCompanies;
};

init();
