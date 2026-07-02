/* =========================================================
   就活キロク — app.js
   定数 → ユーティリティ → 状態・保存 → 表示ヘルパー →
   ICS書き出し → 企業情報 → ホーム → 統計 → 新規追加 →
   詳細 → 企業ページ → カレンダー → バックアップ →
   検索・テーマ → イベント登録・初期化
   ========================================================= */
'use strict';

/* ============ 定数 ============ */
const STORAGE_KEY = 'syuukatsu-kiroku-v1';
const THEME_KEY = 'syuukatsu-theme';
const DEFAULT_TYPES = ['セミナー', 'ワークショップ', '説明会', 'オープンカンパニー', '本選考', 'インターン', '夏インターン', '冬インターン', 'OB・OG訪問', 'イベント'];
const MARKS = ['ES通過', '参加決定'];
const STATUS_LABEL = { ongoing: '進行中', upcoming: '予定', done: '振り返り' };
const STEP_KINDS = {
  'ES':                     { questions: true,  qTags: false, note: false },
  '動画視聴':                { questions: false, qTags: false, note: true  },
  '説明会':                  { questions: false, qTags: false, note: true  },
  '面接':                    { questions: true,  qTags: true,  note: true  },
  'グループディスカッション': { questions: false, qTags: false, note: true  },
  '動画選考':                { questions: true,  qTags: false, note: true  },
  'インターン':              { questions: false, qTags: false, note: true  },
};

/* ============ ユーティリティ ============ */
const $ = id => document.getElementById(id);
const esc = s => (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad2 = n => String(n).padStart(2, '0');

/* ローカル時間ベースの日付文字列（toISOStringはUTCのため深夜0〜9時にズレる） */
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayYMD = () => ymd(new Date());
const fmtDate = ds => ds.replace(/-/g, '/');          // 2026-06-13 → 2026/06/13
const fmtMD = ds => ds.slice(5).replace('-', '/');    // 2026-06-13 → 06/13

/* inline onclick に名前を安全に埋め込む（'も%27にする） */
const attrKey = s => encodeURIComponent(s).replace(/'/g, '%27');

/* 種類ごとの色分け */
function typeClass(t) {
  t = t || '';
  if (/OB|OG/i.test(t)) return 't-red';
  if (/インターン|ワークショップ|イベント/.test(t)) return 't-blue';
  if (/説明会|セミナー|オープンカンパニー/.test(t)) return 't-green';
  if (/本選考/.test(t)) return 't-purple';
  return 't-gray';
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============ 状態・保存 ============ */
let state = load();

function load() {
  let s = { entries: [], customTypes: [], companies: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) s = JSON.parse(raw);
  } catch (e) { /* 壊れたデータは初期値で継続 */ }
  return normalize(s);
}

/* 旧バージョンのデータに足りないフィールドを補う */
function normalize(s) {
  s.entries = Array.isArray(s.entries) ? s.entries : [];
  s.customTypes = Array.isArray(s.customTypes) ? s.customTypes : [];
  s.companies = (s.companies && typeof s.companies === 'object') ? s.companies : {};
  s.entries.forEach(e => {
    e.subtitle ??= ''; e.startDate ??= ''; e.endDate ??= ''; e.time ??= ''; e.endTime ??= '';
    e.locType ??= ''; e.locValue ??= ''; e.marks ??= [];
    e.review ??= ''; e.hasFeedback ??= false; e.feedback ??= '';
    e.steps = Array.isArray(e.steps) ? e.steps : [];
  });
  return s;
}

/* 即時保存：遅延なしでlocalStorageへ書き込む（モバイルで閉じてもデータが残る） */
let indicatorTimer = null;
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const el = $('saveStatus');
    const t = new Date();
    el.textContent = `✓ 保存済み ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
    el.classList.add('show');
    clearTimeout(indicatorTimer);
    indicatorTimer = setTimeout(() => el.classList.remove('show'), 2500);
  } catch (err) {
    alert('保存に失敗しました。プライベートブラウズモードでは保存できません。');
  }
}

/* ============ 表示ヘルパー ============ */
function nextDateOf(entry) {
  const today = todayYMD();
  const dates = entry.steps.filter(s => s.date && s.date >= today).map(s => s.date);
  if (entry.startDate && (entry.endDate || entry.startDate) >= today) {
    dates.push(entry.startDate >= today ? entry.startDate : today);
  }
  return dates.sort()[0] || null;
}

function entryDateLabel(e) {
  if (!e.startDate) return '';
  if (e.endDate) return `${fmtMD(e.startDate)}〜${fmtMD(e.endDate)}`;
  let t = e.time ? ' ' + e.time : '';
  if (e.time && e.endTime) t += '〜' + e.endTime;
  return fmtMD(e.startDate) + t;
}

function locLabel(e) {
  if (!e.locType) return '';
  return e.locType === 'online' ? '🔗 オンライン' : '📍 対面';
}

function urgencyLabel(e) {
  if (e.status === 'done') return '';
  const next = nextDateOf(e);
  if (!next) return '';
  const diff = Math.round((new Date(next + 'T00:00:00') - new Date(todayYMD() + 'T00:00:00')) / 86400000);
  if (diff > 3) return '';
  return diff <= 0 ? '⏰ 今日' : diff === 1 ? '⏰ 明日' : `⏰ あと${diff}日`;
}

const stepDateLabel = s => s.date ? fmtDate(s.date) + (s.time ? ' ' + s.time : '') : '日時未定';

/* ============ iOSカレンダー（.ics）書き出し ============ */
const icsEscape = s => (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function nextDayCompact(ds) {
  const d = new Date(ds + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return ymd(d).replace(/-/g, '');
}

function addOneHour(t) {
  const [h, m] = t.split(':').map(Number);
  return `${pad2((h + 1) % 24)}:${pad2(m)}`;
}

function buildVEvent({ uid, date, endDate, time, endTime, summary, location, description }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VEVENT', 'UID:' + uid + '@syukatsukiroku', 'DTSTAMP:' + stamp];
  const multiDay = endDate && endDate > date;
  if (time && !multiDay) {
    const d = date.replace(/-/g, '');
    const et = endTime || addOneHour(time);
    lines.push('DTSTART:' + d + 'T' + time.replace(':', '') + '00');
    lines.push('DTEND:' + d + 'T' + et.replace(':', '') + '00');
  } else {
    lines.push('DTSTART;VALUE=DATE:' + date.replace(/-/g, ''));
    lines.push('DTEND;VALUE=DATE:' + nextDayCompact(multiDay ? endDate : date));
  }
  lines.push('SUMMARY:' + icsEscape(summary));
  if (location) lines.push('LOCATION:' + icsEscape(location));
  if (description) lines.push('DESCRIPTION:' + icsEscape(description));
  lines.push('END:VEVENT');
  return lines;
}

function entryToICS(e) {
  let events = [];
  const label = e.type + (e.subtitle ? '・' + e.subtitle : '');
  if (e.startDate) {
    events = events.concat(buildVEvent({
      uid: e.id, date: e.startDate, endDate: e.endDate, time: e.time, endTime: e.endTime,
      summary: `${e.name}（${label}）`,
      location: e.locType === 'online' ? 'オンライン' : (e.locValue || ''),
      description: (e.locType === 'online' && e.locValue ? 'URL: ' + e.locValue : '') + (e.review ? '\n' + e.review : ''),
    }));
  }
  e.steps.forEach(s => {
    if (s.date) events = events.concat(buildVEvent({
      uid: s.id, date: s.date, time: s.time,
      summary: `${e.name} - ${s.kind}`, location: '', description: s.note || '',
    }));
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//syukatsukiroku//JP', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
}

function exportEntryToCalendar(id) {
  const e = state.entries.find(x => x.id === id); if (!e) return;
  if (!e.startDate && !e.steps.some(s => s.date)) { alert('日程が登録されていません'); return; }
  downloadFile(`${e.name}.ics`, entryToICS(e), 'text/calendar;charset=utf-8');
}

/* ============ 企業情報（マイページ・ID・パスワード） ============ */
function companyInfoHTML(name) {
  const c = state.companies[name] || {};
  const url = c.mypageUrl || '';
  return `<div style="margin-top:18px; padding:14px; border:1px solid var(--line); border-radius:10px">
    <span class="mini-label">🔐 マイページ情報</span>
    <div style="margin-bottom:8px">
      <input type="text" class="cinfo" data-cfield="mypageUrl" placeholder="マイページURL" value="${esc(url)}">
      ${/^https?:\/\//.test(url) ? `<a class="loc-link" href="${esc(url)}" target="_blank" rel="noopener">🔗 マイページを開く</a>` : ''}
    </div>
    <input type="text" class="cinfo" data-cfield="loginId" placeholder="ログインID・登録メール" value="${esc(c.loginId || '')}" style="margin-bottom:8px">
    <div style="display:flex; gap:8px">
      <input type="password" class="cinfo" id="cinfoPw" data-cfield="password" placeholder="パスワード" value="${esc(c.password || '')}">
      <button class="btn btn-outline" style="white-space:nowrap" onclick="togglePw()">👁 表示</button>
    </div>
    <div style="font-size:11px; color:var(--sub); margin-top:8px">※この端末のブラウザにのみ保存されます。共用PCでは入力しないでください。</div>
  </div>`;
}

function bindCompanyInfo(name) {
  document.querySelectorAll('#detailModal .cinfo').forEach(el => {
    el.addEventListener('input', () => {
      state.companies[name] = state.companies[name] || {};
      state.companies[name][el.dataset.cfield] = el.value;
      save();
    });
  });
}

function togglePw() {
  const pw = $('cinfoPw');
  if (pw) pw.type = pw.type === 'password' ? 'text' : 'password';
}

/* ============ ホーム描画 ============ */
let searchQuery = '';

function singleCardHTML(e) {
  const next = nextDateOf(e);
  const doneSteps = e.steps.filter(s => s.done).length;
  return `<div class="entry-card" onclick="openDetail('${e.id}')">
    <div class="top">
      <span class="entry-name">${esc(e.name)}</span>
      <span style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
        ${urgencyLabel(e) ? `<span class="urgent-badge">${urgencyLabel(e)}</span>` : ''}
        ${(e.marks || []).map(m => `<span class="result-badge">✓ ${esc(m)}</span>`).join('')}
        <span class="type-badge ${typeClass(e.type)}">${esc(e.type)}</span>
      </span>
    </div>
    ${e.subtitle ? `<div class="entry-sub">${esc(e.subtitle)}</div>` : ''}
    <div class="entry-meta">
      ${entryDateLabel(e) ? `<span>📅 ${entryDateLabel(e)}</span>` : ''}
      ${locLabel(e) ? `<span>${locLabel(e)}</span>` : ''}
      <span>📋 ステップ ${doneSteps}/${e.steps.length}件</span>
      ${e.hasFeedback ? '<span>💬 FBあり</span>' : ''}
      ${next ? `<span>⏰ 次回 ${fmtDate(next)}</span>` : ''}
    </div>
  </div>`;
}

function mergedCardHTML(name, es) {
  const withNext = es.map(e => ({ u: urgencyLabel(e), d: nextDateOf(e) })).filter(x => x.d).sort((a, b) => a.d.localeCompare(b.d));
  const next = withNext[0] ? withNext[0].d : null;
  const urgent = withNext.find(x => x.u);
  const marks = [...new Set(es.flatMap(e => e.marks || []))];
  const total = es.reduce((n, e) => n + e.steps.length, 0);
  const done = es.reduce((n, e) => n + e.steps.filter(s => s.done).length, 0);
  return `<div class="entry-card" onclick="openCompany('${attrKey(name)}')">
    <div class="top">
      <span class="entry-name">${esc(name)}</span>
      <span style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
        ${urgent ? `<span class="urgent-badge">${urgent.u}</span>` : ''}
        ${marks.map(m => `<span class="result-badge">✓ ${esc(m)}</span>`).join('')}
        <span class="multi-badge">📁 ${es.length}件</span>
      </span>
    </div>
    <div class="entry-meta" style="margin-top:8px">
      ${es.map(e => `<span class="type-badge ${typeClass(e.type)}">${esc(e.type)}</span>`).join('')}
    </div>
    <div class="entry-meta">
      <span>📋 ステップ ${done}/${total}件</span>
      ${next ? `<span>⏰ 次回 ${fmtDate(next)}</span>` : ''}
    </div>
  </div>`;
}

function renderHome() {
  const q = searchQuery.toLowerCase();
  const visible = q ? state.entries.filter(e => (e.name + ' ' + e.type + ' ' + (e.subtitle || '')).toLowerCase().includes(q)) : state.entries;
  const groups = { ongoing: [], upcoming: [], done: [] };
  visible.forEach(e => (groups[e.status] || groups.ongoing).push(e));

  // 直近の予定が近い順（日程なしは後ろ）。振り返りは新しい日付順
  const byNext = (a, b) => {
    const da = nextDateOf(a), db = nextDateOf(b);
    if (da && db) return da.localeCompare(db);
    return da ? -1 : db ? 1 : 0;
  };
  groups.ongoing.sort(byNext);
  groups.upcoming.sort(byNext);
  groups.done.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  const render = (listId, countId, arr, emptyMsg) => {
    $(countId).textContent = arr.length;
    const list = $(listId);
    if (!arr.length) {
      list.innerHTML = `<div class="empty-hint">${q ? '該当する記録がありません' : emptyMsg}</div>`;
      return;
    }
    // 同名の企業は1枚のカードにまとめる
    const byName = new Map();
    arr.forEach(e => {
      const k = e.name.trim();
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(e);
    });
    list.innerHTML = [...byName.entries()].map(([name, es]) =>
      es.length === 1 ? singleCardHTML(es[0]) : mergedCardHTML(name, es)).join('');
  };

  render('listOngoing', 'countOngoing', groups.ongoing, 'まだありません。右上の＋から追加しましょう');
  render('listUpcoming', 'countUpcoming', groups.upcoming, '予定はありません');
  render('listDone', 'countDone', groups.done, 'まだありません');
  renderBanner();
  renderStats();
  renderCalendar();
}

/* ============ 今日・明日バナー ============ */
function renderBanner() {
  const banner = $('todayBanner');
  const today = todayYMD();
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  const target = allEvents().filter(ev => ev.date === today || ev.date === tomorrow);
  if (!target.length) { banner.innerHTML = ''; return; }

  banner.innerHTML = `<div class="today-banner">
    <h4>🔔 直近の予定</h4>
    ${target.map(ev => {
      const isToday = ev.date === today;
      return `<div class="banner-item" onclick="openDetail('${ev.entryId}')">
        <span class="banner-when ${isToday ? 'today' : 'tomorrow'}">${isToday ? '今日' : '明日'}</span>
        <div>
          <div class="banner-name">${esc(ev.name)}</div>
          <div class="banner-kind">${esc(ev.kind)}${ev.sub ? '・' + esc(ev.sub) : ''}</div>
        </div>
        <span class="banner-time">${ev.isRange ? '期間中' : (ev.time || '')}</span>
      </div>`;
    }).join('')}
  </div>`;
}

/* ============ 統計 ============ */
function renderStats() {
  const area = $('statsArea');
  const entries = state.entries;
  if (!entries.length) {
    area.innerHTML = '<div class="empty-hint">記録が増えると、ここに統計が表示されます</div>';
    return;
  }

  const byType = {};
  const stepStats = {};
  let esPass = 0, kettei = 0, stepsTotal = 0, stepsDone = 0;
  entries.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if ((e.marks || []).includes('ES通過')) esPass++;
    if ((e.marks || []).includes('参加決定')) kettei++;
    e.steps.forEach(s => {
      stepsTotal++;
      if (s.done) stepsDone++;
      stepStats[s.kind] = stepStats[s.kind] || { total: 0, done: 0 };
      stepStats[s.kind].total++;
      if (s.done) stepStats[s.kind].done++;
    });
  });
  const progress = stepsTotal ? Math.round(stepsDone / stepsTotal * 100) : 0;

  const cards = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-num">${entries.length}</div><div class="stat-label">全エントリー</div></div>
      <div class="stat-card"><div class="stat-num green">${esPass}</div><div class="stat-label">ES通過</div></div>
      <div class="stat-card"><div class="stat-num green">${kettei}</div><div class="stat-label">参加決定</div></div>
      <div class="stat-card"><div class="stat-num orange">${progress}%</div><div class="stat-label">ステップ完了率<br>（${stepsDone}/${stepsTotal}）</div></div>
    </div>`;

  const typeRows = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const typeMax = typeRows[0][1];
  const typePanel = `
    <div class="stats-panel">
      <h3>種類別の内訳</h3>
      ${typeRows.map(([t, n]) => `
        <div class="bar-row">
          <span class="bar-label">${esc(t)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${n / typeMax * 100}%"></div></div>
          <span class="bar-count">${n}件</span>
        </div>`).join('')}
    </div>`;

  const stepRows = Object.entries(stepStats).sort((a, b) => b[1].total - a[1].total);
  let stepPanel = '';
  if (stepRows.length) {
    const stepMax = stepRows[0][1].total;
    stepPanel = `
      <div class="stats-panel">
        <h3>ステップ別の件数 <span style="font-weight:400">（<span style="color:var(--green)">■</span> 完了分）</span></h3>
        ${stepRows.map(([k, st]) => `
          <div class="bar-row">
            <span class="bar-label">${esc(k)}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${st.total / stepMax * 100}%"></div>
              <div class="bar-fill done-part" style="width:${st.done / stepMax * 100}%"></div>
            </div>
            <span class="bar-count">${st.done}/${st.total}件</span>
          </div>`).join('')}
      </div>`;
  }

  area.innerHTML = cards + typePanel + stepPanel;
}

/* ============ 新規追加 ============ */
let selectedType = null;
let selectedLoc = '';

function renderTypeOptions() {
  const wrap = $('typeOptions');
  const types = [...DEFAULT_TYPES, ...state.customTypes];
  wrap.innerHTML = types.map(t =>
    `<button class="type-chip ${selectedType === t ? 'selected' : ''}" data-type="${esc(t)}"><span class="chip-dot ${typeClass(t)}"></span>${esc(t)}</button>`
  ).join('') + `<button class="type-chip ${selectedType === '__custom__' ? 'selected' : ''}" data-type="__custom__">＋ 自分で追加</button>`;
  wrap.querySelectorAll('.type-chip').forEach(btn => {
    btn.onclick = () => {
      selectedType = btn.dataset.type;
      $('customTypeField').style.display = selectedType === '__custom__' ? '' : 'none';
      renderTypeOptions();
    };
  });
}

function updateLocUI() {
  document.querySelectorAll('#locOptions .type-chip').forEach(b =>
    b.classList.toggle('selected', b.dataset.loc === selectedLoc));
  $('locValueWrap').style.display = selectedLoc ? '' : 'none';
  $('addLocValue').placeholder =
    selectedLoc === 'online' ? 'URLを貼り付け（Zoom・Teamsなど）' : '住所・会場名を貼り付け';
}

function openAddModal() {
  selectedType = null;
  selectedLoc = '';
  $('addName').value = '';
  $('addSubtitle').value = '';
  $('customTypeInput').value = '';
  $('addStatus').value = 'ongoing';
  $('customTypeField').style.display = 'none';
  const today = todayYMD();
  $('addStartDate').value = today;
  $('addEndDate').value = today;
  $('addTime').value = '';
  $('addEndTime').value = '';
  $('addLocValue').value = '';
  updateLocUI();
  renderTypeOptions();
  $('nameSuggest').style.display = 'none';
  $('addOverlay').classList.add('open');
  $('addName').focus();
}

function renderNameSuggest() {
  const box = $('nameSuggest');
  const v = $('addName').value.trim();
  if (v.length < 2) { box.style.display = 'none'; return; }
  const names = [...new Set(state.entries.map(e => e.name.trim()))]
    .filter(n => n !== v && n.toLowerCase().includes(v.toLowerCase()))
    .slice(0, 5);
  if (!names.length) { box.style.display = 'none'; return; }
  box.innerHTML = names.map(n => {
    const cnt = state.entries.filter(e => e.name.trim() === n).length;
    return `<div class="suggest-item" data-name="${esc(n)}"><span>${esc(n)}</span><span class="cnt">${cnt}件の記録あり</span></div>`;
  }).join('');
  box.style.display = '';
  box.querySelectorAll('.suggest-item').forEach(it => {
    it.addEventListener('mousedown', ev => {
      ev.preventDefault();
      $('addName').value = it.dataset.name;
      box.style.display = 'none';
    });
  });
}

function saveNewEntry() {
  const name = $('addName').value.trim();
  if (!name) { alert('会社名・タイトルを入力してください'); return; }
  let type = selectedType;
  if (!type) { alert('種類を選んでください'); return; }
  if (type === '__custom__') {
    type = $('customTypeInput').value.trim();
    if (!type) { alert('カスタム種類名を入力してください'); return; }
    if (!state.customTypes.includes(type) && !DEFAULT_TYPES.includes(type)) state.customTypes.push(type);
  }
  const startDate = $('addStartDate').value;
  let endDate = $('addEndDate').value;
  if (!startDate || (endDate && endDate <= startDate)) endDate = '';
  const entry = {
    id: uid(), name, type,
    subtitle: $('addSubtitle').value.trim(),
    status: $('addStatus').value,
    startDate, endDate,
    time: startDate ? $('addTime').value : '',
    endTime: startDate ? $('addEndTime').value : '',
    locType: selectedLoc,
    locValue: selectedLoc ? $('addLocValue').value.trim() : '',
    marks: [], review: '', hasFeedback: false, feedback: '',
    createdAt: new Date().toISOString(),
    steps: [],
  };
  state.entries.unshift(entry);
  save();
  $('addOverlay').classList.remove('open');
  renderHome();
  if (entry.startDate && confirm('iOSカレンダーに追加しますか？\n（ダウンロードした .ics ファイルを開くとカレンダーに登録できます）')) {
    downloadFile(`${entry.name}.ics`, entryToICS(entry), 'text/calendar;charset=utf-8');
  }
  openDetail(entry.id);
}

/* ============ 詳細 ============ */
let currentId = null;
let metaEditOpen = false;
const openSteps = new Set();

function getEntry() { return state.entries.find(e => e.id === currentId); }

function openDetail(id) {
  currentId = id;
  metaEditOpen = false;
  openSteps.clear();
  renderDetail();
  $('detailOverlay').classList.add('open');
}

function closeDetail() {
  currentId = null;
  if (companyFrom && state.entries.some(e => e.name.trim() === companyFrom)) {
    renderCompany(companyFrom);
    renderHome();
    return;
  }
  companyFrom = null;
  $('detailOverlay').classList.remove('open');
  renderHome();
}

function renderDetail() {
  const e = getEntry();
  if (!e) return;

  const statusBtn = (val, cls) =>
    `<button class="status-tab ${e.status === val ? 'active-' + cls : ''}" onclick="setStatus('${val}')">${STATUS_LABEL[val]}</button>`;

  const stepsHtml = e.steps.map(s => renderStep(s)).join('');
  const addBtns = Object.keys(STEP_KINDS).map(k =>
    `<button class="type-chip" onclick="addStep('${k}')">＋ ${k}</button>`).join('');

  $('detailModal').innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title">${esc(e.name)}</div>
        ${e.subtitle ? `<div class="entry-sub" style="margin-bottom:4px">${esc(e.subtitle)}</div>` : ''}
        <span class="type-badge ${typeClass(e.type)}">${esc(e.type)}</span>
        <button class="q-del" style="font-size:13px" onclick="toggleMetaEdit()" title="名前・活動名・種類を編集">✏️ 編集</button>
      </div>
      <button class="close-x" onclick="closeDetail()">✕</button>
    </div>
    ${metaEditOpen ? `
    <div style="margin:14px 0; padding:14px; border:1px dashed var(--line); border-radius:10px">
      <span class="mini-label">名前を変更</span>
      <input type="text" id="editEntryName" value="${esc(e.name)}" style="margin-bottom:12px">
      <span class="mini-label">活動名（例：1day仕事体験）</span>
      <input type="text" data-efield="subtitle" value="${esc(e.subtitle || '')}" style="margin-bottom:12px">
      <span class="mini-label">種類を変更</span>
      <div class="type-options">
        ${[...DEFAULT_TYPES, ...state.customTypes].map(t =>
          `<button class="type-chip ${e.type === t ? 'selected' : ''}" onclick="setEntryType('${attrKey(t)}')"><span class="chip-dot ${typeClass(t)}"></span>${esc(t)}</button>`).join('')}
      </div>
      <div style="display:flex; gap:8px; margin-top:10px">
        <input type="text" id="editCustomType" placeholder="新しい種類名を入力">
        <button class="btn btn-outline" style="white-space:nowrap" onclick="addCustomTypeFromDetail()">追加</button>
      </div>
    </div>` : ''}
    <div class="status-tabs">
      ${statusBtn('ongoing', 'ongoing')}
      ${statusBtn('upcoming', 'upcoming')}
      ${statusBtn('done', 'done')}
    </div>
    <div style="margin-bottom:14px">
      <span class="mini-label">日程</span>
      <div class="dt-row">
        <span class="dt-label">開始</span>
        <input type="date" data-efield="startDate" value="${esc(e.startDate)}">
        <input type="time" data-efield="time" value="${esc(e.time)}">
      </div>
      <div class="dt-row">
        <span class="dt-label">終了</span>
        <input type="date" data-efield="endDate" value="${esc(e.endDate)}">
        <input type="time" data-efield="endTime" value="${esc(e.endTime)}">
      </div>
      <button class="btn btn-outline" style="margin-top:8px; font-size:13px" onclick="exportEntryToCalendar('${e.id}')">📅 iOSカレンダーに登録</button>
    </div>
    <div style="margin-bottom:14px">
      <span class="mini-label">場所</span>
      <div class="type-options" style="margin-bottom:8px">
        <button class="type-chip ${!e.locType ? 'selected' : ''}" onclick="setLocType('')">なし</button>
        <button class="type-chip ${e.locType === 'online' ? 'selected' : ''}" onclick="setLocType('online')">オンライン</button>
        <button class="type-chip ${e.locType === 'offline' ? 'selected' : ''}" onclick="setLocType('offline')">対面</button>
      </div>
      ${e.locType ? `
        <input type="text" data-efield="locValue" value="${esc(e.locValue)}"
          placeholder="${e.locType === 'online' ? 'URLを貼り付け（Zoom・Teamsなど）' : '住所・会場名を貼り付け'}">
        ${e.locType === 'online' && /^https?:\/\//.test(e.locValue || '') ? `<a class="loc-link" href="${esc(e.locValue)}" target="_blank" rel="noopener">🔗 リンクを開く</a>` : ''}
        ${e.locType === 'offline' && e.locValue ? `<a class="loc-link" href="https://www.google.com/maps/search/${encodeURIComponent(e.locValue)}" target="_blank" rel="noopener">📍 地図で見る</a>` : ''}
      ` : ''}
    </div>
    <div style="margin-bottom:18px">
      <span class="mini-label">結果</span>
      <div class="type-options">
        ${MARKS.map(m => `<button class="type-chip ${(e.marks || []).includes(m) ? 'mark-on' : ''}" onclick="toggleMark('${m}')">${(e.marks || []).includes(m) ? '✓ ' : ''}${m}</button>`).join('')}
      </div>
    </div>
    <div id="stepsArea">${stepsHtml || '<div class="empty-hint">下のボタンから選考ステップを追加しましょう</div>'}</div>
    <div class="add-step-row">${addBtns}</div>
    <div style="margin-top:22px">
      <span class="mini-label">📝 振り返り</span>
      <textarea data-efield="review" placeholder="全体の感想・学び・反省点など…">${esc(e.review)}</textarea>
    </div>
    <div style="margin-top:14px">
      <span class="mini-label">💬 フィードバック</span>
      <div class="type-options" style="margin-bottom:8px">
        <button class="type-chip ${!e.hasFeedback ? 'selected' : ''}" onclick="setFeedback(false)">なし</button>
        <button class="type-chip ${e.hasFeedback ? 'selected' : ''}" onclick="setFeedback(true)">あり</button>
      </div>
      ${e.hasFeedback ? `<textarea data-efield="feedback" placeholder="もらったフィードバックを記録…">${esc(e.feedback)}</textarea>` : ''}
    </div>
    ${companyInfoHTML(e.name.trim())}
    <div class="detail-footer">
      <button class="btn btn-danger-ghost" onclick="deleteEntry()">削除</button>
      <button class="btn btn-primary" onclick="closeDetail()">閉じる</button>
    </div>`;

  bindDetailInputs();
  bindCompanyInfo(e.name.trim());
}

function renderStep(s) {
  const cfg = STEP_KINDS[s.kind] || { note: true };
  const isOpen = openSteps.has(s.id);

  let inner = `
    <div class="step-datetime">
      <input type="date" data-sid="${s.id}" data-field="date" value="${esc(s.date)}">
      <input type="time" data-sid="${s.id}" data-field="time" value="${esc(s.time)}">
    </div>`;

  if (cfg.questions) {
    const qLabel = s.kind === 'ES' ? '設問' : '質問';
    inner += (s.questions || []).map((q, i) => `
      <div class="q-item">
        <div class="q-item-head">
          <span class="q-num">${qLabel} ${i + 1}</span>
          ${cfg.qTags ? `
            <select class="q-tag-select ${q.tag === '本番' ? 'tag-honban' : 'tag-yosoku'}" data-sid="${s.id}" data-qid="${q.id}" data-field="tag">
              <option value="予測" ${q.tag !== '本番' ? 'selected' : ''}>予測</option>
              <option value="本番" ${q.tag === '本番' ? 'selected' : ''}>本番</option>
            </select>` : ''}
          <button class="q-del" onclick="deleteQuestion('${s.id}','${q.id}')">🗑</button>
        </div>
        <span class="mini-label">${qLabel}</span>
        <textarea class="q-question" data-sid="${s.id}" data-qid="${q.id}" data-field="q" placeholder="${qLabel}内容を入力…">${esc(q.q)}</textarea>
        <span class="mini-label">${s.kind === 'ES' ? '回答・メモ' : '自分の回答・メモ'}</span>
        <textarea data-sid="${s.id}" data-qid="${q.id}" data-field="a" placeholder="回答やメモを入力…">${esc(q.a)}</textarea>
        <div class="char-count">${(q.a || '').length}文字</div>
      </div>`).join('');
    inner += `<button class="add-mini-btn" onclick="addQuestion('${s.id}')">＋ ${qLabel}を追加</button>`;
  }

  if (cfg.note) {
    inner += `
      <div style="margin-top:12px">
        <span class="mini-label">ノート</span>
        <textarea data-sid="${s.id}" data-field="note" placeholder="メモ・感想・反省点など…">${esc(s.note)}</textarea>
      </div>`;
  }

  return `
    <div class="step-card ${isOpen ? 'open' : ''} ${s.done ? 'done' : ''}" id="step-${s.id}">
      <div class="step-head" onclick="toggleStep('${s.id}')">
        <div class="left">
          <span class="chev">▶</span>
          <button class="done-btn ${s.done ? 'on' : ''}" title="完了にする" onclick="event.stopPropagation(); toggleStepDone('${s.id}')">✓</button>
          <span class="step-kind">${esc(s.kind)}</span>
          <span class="step-date-label">${stepDateLabel(s)}</span>
        </div>
        <button class="q-del" onclick="event.stopPropagation(); deleteStep('${s.id}')">🗑</button>
      </div>
      <div class="step-body">${inner}</div>
    </div>`;
}

/* 詳細モーダル内の入力を自動保存にひも付ける */
function bindDetailInputs() {
  // 名前（タイトルにも即時反映。マイページ情報も新しい名前へ引き継ぐ）
  const nameEl = $('editEntryName');
  if (nameEl) {
    let prevKey = (getEntry()?.name || '').trim();
    nameEl.addEventListener('input', () => {
      const e = getEntry(); if (!e) return;
      e.name = nameEl.value;
      const newKey = nameEl.value.trim();
      const othersUseOld = state.entries.some(x => x.id !== e.id && x.name.trim() === prevKey);
      if (newKey && newKey !== prevKey && !othersUseOld && state.companies[prevKey] && !state.companies[newKey]) {
        state.companies[newKey] = state.companies[prevKey];
        delete state.companies[prevKey];
      }
      if (newKey) prevKey = newKey;
      const title = document.querySelector('#detailModal .detail-title');
      if (title) title.textContent = nameEl.value;
      save();
    });
  }
  // エントリー自体のフィールド
  document.querySelectorAll('#detailModal [data-efield]').forEach(el => {
    el.addEventListener('input', () => {
      const e = getEntry(); if (!e) return;
      e[el.dataset.efield] = el.value;
      if (e.endDate && (!e.startDate || e.endDate <= e.startDate)) e.endDate = '';
      save();
      renderCalendar();
    });
  });
  // ステップ・設問のフィールド
  document.querySelectorAll('#detailModal [data-sid]').forEach(el => {
    el.addEventListener('input', () => {
      const e = getEntry(); if (!e) return;
      const s = e.steps.find(x => x.id === el.dataset.sid); if (!s) return;
      const f = el.dataset.field;
      if (el.dataset.qid) {
        const q = (s.questions || []).find(x => x.id === el.dataset.qid); if (!q) return;
        q[f] = el.value;
        if (f === 'a' && el.nextElementSibling && el.nextElementSibling.classList.contains('char-count')) {
          el.nextElementSibling.textContent = `${el.value.length}文字`;
        }
        if (f === 'tag') {
          el.classList.toggle('tag-honban', el.value === '本番');
          el.classList.toggle('tag-yosoku', el.value !== '本番');
        }
      } else {
        s[f] = el.value;
        if (f === 'date' || f === 'time') {
          const label = document.querySelector(`#step-${s.id} .step-date-label`);
          if (label) label.textContent = stepDateLabel(s);
          renderCalendar();
        }
      }
      save();
    });
  });
}

/* 詳細モーダルの操作（inline onclickから呼ばれる） */
function setStatus(val) { const e = getEntry(); if (e) { e.status = val; save(); renderDetail(); } }
function toggleMetaEdit() { metaEditOpen = !metaEditOpen; renderDetail(); }
function setEntryType(k) {
  const e = getEntry(); if (!e) return;
  e.type = decodeURIComponent(k);
  save(); renderDetail();
}
function addCustomTypeFromDetail() {
  const v = $('editCustomType').value.trim();
  if (!v) return;
  if (!DEFAULT_TYPES.includes(v) && !state.customTypes.includes(v)) state.customTypes.push(v);
  const e = getEntry(); if (!e) return;
  e.type = v;
  save(); renderDetail();
}
function setFeedback(on) {
  const e = getEntry(); if (!e) return;
  e.hasFeedback = on;
  save(); renderDetail();
}
function setLocType(val) {
  const e = getEntry(); if (!e) return;
  if (e.locType !== val) e.locValue = '';
  e.locType = val;
  save(); renderDetail();
}
function toggleMark(m) {
  const e = getEntry(); if (!e) return;
  e.marks = e.marks || [];
  e.marks.includes(m) ? e.marks = e.marks.filter(x => x !== m) : e.marks.push(m);
  save(); renderDetail();
}
function toggleStepDone(sid) {
  const e = getEntry(); if (!e) return;
  const s = e.steps.find(x => x.id === sid); if (!s) return;
  s.done = !s.done;
  save();
  const card = $('step-' + sid);
  card.classList.toggle('done', s.done);
  card.querySelector('.done-btn').classList.toggle('on', s.done);
}
function toggleStep(sid) {
  openSteps.has(sid) ? openSteps.delete(sid) : openSteps.add(sid);
  $('step-' + sid).classList.toggle('open');
}
function addStep(kind) {
  const e = getEntry(); if (!e) return;
  const s = { id: uid(), kind, date: todayYMD(), time: '', note: '', questions: [] };
  e.steps.push(s);
  openSteps.add(s.id);
  save();
  renderDetail();
}
function deleteStep(sid) {
  if (!confirm('このステップを削除しますか？')) return;
  const e = getEntry(); if (!e) return;
  e.steps = e.steps.filter(s => s.id !== sid);
  save(); renderDetail();
}
function addQuestion(sid) {
  const e = getEntry(); if (!e) return;
  const s = e.steps.find(x => x.id === sid); if (!s) return;
  (s.questions = s.questions || []).push({ id: uid(), q: '', a: '', tag: '予測' });
  save(); renderDetail();
}
function deleteQuestion(sid, qid) {
  const e = getEntry(); if (!e) return;
  const s = e.steps.find(x => x.id === sid); if (!s) return;
  s.questions = (s.questions || []).filter(q => q.id !== qid);
  save(); renderDetail();
}
function deleteEntry() {
  const e = getEntry(); if (!e) return;
  if (!confirm(`「${e.name}」を削除しますか？この操作は取り消せません。`)) return;
  state.entries = state.entries.filter(x => x.id !== currentId);
  save(); closeDetail();
}

/* ============ 企業ページ（同名エントリーのまとめ） ============ */
let companyFrom = null;

function openCompany(key) {
  const name = decodeURIComponent(key);
  companyFrom = name;
  renderCompany(name);
  $('detailOverlay').classList.add('open');
}

function closeCompany() {
  companyFrom = null;
  $('detailOverlay').classList.remove('open');
  renderHome();
}

function renderCompany(name) {
  const list = state.entries.filter(e => e.name.trim() === name);
  const order = { ongoing: 0, upcoming: 1, done: 2 };
  list.sort((a, b) => order[a.status] - order[b.status] || (a.startDate || '9').localeCompare(b.startDate || '9'));
  $('detailModal').innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title">${esc(name)}</div>
        <span class="mini-label">${list.length}件の記録</span>
      </div>
      <button class="close-x" onclick="closeCompany()">✕</button>
    </div>
    <div style="margin-top:14px">
      ${list.map(e => {
        const done = e.steps.filter(s => s.done).length;
        return `<div class="company-row" onclick="openDetail('${e.id}')">
          <span class="type-badge ${typeClass(e.type)}">${esc(e.type)}</span>
          <span class="status-mini s-${e.status}">${STATUS_LABEL[e.status]}</span>
          ${e.subtitle ? `<span style="font-size:12.5px; font-weight:600">${esc(e.subtitle)}</span>` : ''}
          ${entryDateLabel(e) ? `<span style="font-size:12px;color:var(--sub)">📅 ${entryDateLabel(e)}</span>` : ''}
          <span style="margin-left:auto; display:flex; gap:6px; align-items:center">
            ${(e.marks || []).map(mk => `<span class="result-badge">✓ ${esc(mk)}</span>`).join('')}
            <span style="font-size:12px;color:var(--sub)">📋 ${done}/${e.steps.length}</span>
          </span>
        </div>`;
      }).join('')}
    </div>
    ${companyInfoHTML(name)}
    <div class="detail-footer" style="justify-content:flex-end">
      <button class="btn btn-primary" onclick="closeCompany()">閉じる</button>
    </div>`;
  bindCompanyInfo(name);
}

/* ============ カレンダー ============ */
let calYear, calMonth, selectedDay = null;
{
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
}

function allEvents() {
  const evs = [];
  state.entries.forEach(e => {
    if (e.startDate) {
      const end = (e.endDate && e.endDate > e.startDate) ? e.endDate : e.startDate;
      const isRange = end !== e.startDate;
      let d = new Date(e.startDate + 'T00:00:00');
      const endD = new Date(end + 'T00:00:00');
      let guard = 0;
      while (d <= endD && guard++ < 92) {
        const ds = ymd(d);
        evs.push({
          date: ds, time: ds === e.startDate ? ((e.time || '') + (!isRange && e.time && e.endTime ? '〜' + e.endTime : '')) : '',
          name: e.name, kind: e.type, sub: e.subtitle || '', entryId: e.id,
          isEntry: true, isRange,
          rangePos: !isRange ? '' : ds === e.startDate ? 'start' : ds === end ? 'end' : 'mid',
          rangeLabel: isRange ? `${fmtMD(e.startDate)}〜${fmtMD(end)}` : '',
        });
        d.setDate(d.getDate() + 1);
      }
    }
    e.steps.forEach(s => {
      if (s.date) evs.push({ date: s.date, time: s.time || '', name: e.name, kind: s.kind, entryId: e.id });
    });
  });
  evs.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return evs;
}

function renderCalendar() {
  const grid = $('calGrid');
  $('calTitle').textContent = `${calYear}年 ${calMonth + 1}月`;

  const byDate = {};
  allEvents().forEach(ev => (byDate[ev.date] = byDate[ev.date] || []).push(ev));

  const dows = ['日', '月', '火', '水', '木', '金', '土'];
  let html = dows.map((d, i) =>
    `<div class="cal-dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</div>`).join('');

  const first = new Date(calYear, calMonth, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = todayYMD();

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ds = ymd(d);
    const other = d.getMonth() !== calMonth;
    const dayEvs = byDate[ds] || [];
    const shown = dayEvs.slice(0, 2);
    html += `<div class="cal-cell ${other ? 'other-month' : ''} ${ds === today ? 'today' : ''} ${ds === selectedDay ? 'selected' : ''}" data-date="${ds}">
      <span class="day-num">${d.getDate()}</span>
      ${shown.map(ev => `<div class="cal-ev ${ev.isEntry ? 'entry ' + typeClass(ev.kind) : ''} ${ev.rangePos === 'mid' ? 'range-mid' : ''}">${ev.rangePos === 'mid' || ev.rangePos === 'end' ? '┈ ' : ''}${esc(ev.name)}</div>`).join('')}
      ${dayEvs.length > 2 ? `<div class="cal-ev more">他${dayEvs.length - 2}件</div>` : ''}
    </div>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-cell').forEach(c => {
    c.onclick = () => { selectedDay = c.dataset.date; renderCalendar(); };
  });

  const panel = $('dayEvents');
  if (selectedDay) {
    const dayEvs = byDate[selectedDay] || [];
    panel.style.display = '';
    panel.innerHTML = `<h3>${fmtDate(selectedDay)} の予定</h3>` +
      (dayEvs.length
        ? dayEvs.map(ev => `<div class="day-ev-item" onclick="openDetail('${ev.entryId}')">
            <span class="day-ev-time">${ev.isRange ? '期間' : (ev.time || '--:--')}</span>
            <div><div class="day-ev-name">${esc(ev.name)}</div><div class="day-ev-kind">${esc(ev.kind)}${ev.sub ? '・' + esc(ev.sub) : ''}${ev.rangeLabel ? '・' + ev.rangeLabel : ''}</div></div>
          </div>`).join('')
        : '<div class="no-events">この日の予定はありません</div>');
  } else {
    panel.style.display = 'none';
  }
}

/* ============ バックアップ（エクスポート／インポート） ============ */
function exportBackup() {
  downloadFile(`syuukatsu-kiroku-${todayYMD()}.json`, JSON.stringify(state, null, 2), 'application/json');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.entries)) throw new Error('invalid');
      if (!confirm(`バックアップから ${data.entries.length} 件の記録を読み込みます。\n現在のデータは上書きされます。よろしいですか？`)) return;
      state = normalize(data);
      save();
      renderHome();
      $('backupOverlay').classList.remove('open');
      alert('読み込みが完了しました');
    } catch (err) {
      alert('ファイルを読み込めませんでした。エクスポートしたJSONファイルを選んでください。');
    }
  };
  reader.readAsText(file);
}

/* ============ テーマ ============ */
let theme = localStorage.getItem(THEME_KEY)
  || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function applyTheme(t) {
  document.body.classList.toggle('dark', t === 'dark');
  $('themeBtn').textContent = t === 'dark' ? '☀' : '🌙';
}

/* ============ 統計の折りたたみ ============ */
const STATS_KEY = 'syuukatsu-stats-collapsed';
let statsCollapsed = localStorage.getItem(STATS_KEY) === '1';

function applyStatsCollapse() {
  $('statsToggle').classList.toggle('collapsed', statsCollapsed);
  $('statsArea').style.display = statsCollapsed ? 'none' : '';
}

/* ============ グローバル公開（inline onclick用） ============ */
Object.assign(window, {
  openDetail, closeDetail, openCompany, closeCompany,
  setStatus, toggleMetaEdit, setEntryType, addCustomTypeFromDetail,
  setFeedback, setLocType, toggleMark,
  addStep, deleteStep, toggleStep, toggleStepDone,
  addQuestion, deleteQuestion, deleteEntry,
  exportEntryToCalendar, togglePw,
});

/* ============ イベント登録・初期化 ============ */
function initEvents() {
  /* ヘッダー */
  $('openAddBtn').onclick = openAddModal;
  $('themeBtn').onclick = () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    applyTheme(theme);
  };

  /* 新規追加モーダル */
  $('addCancel').onclick = () => $('addOverlay').classList.remove('open');
  $('addSave').onclick = saveNewEntry;
  $('addName').addEventListener('input', renderNameSuggest);
  $('addName').addEventListener('blur', () => setTimeout(() => { $('nameSuggest').style.display = 'none'; }, 150));
  /* 開始日を入れたら終了日の初期値も合わせる（Appleカレンダー風） */
  $('addStartDate').addEventListener('change', ev => {
    const end = $('addEndDate');
    if (ev.target.value && (!end.value || end.value < ev.target.value)) end.value = ev.target.value;
  });
  document.querySelectorAll('#locOptions .type-chip').forEach(b => {
    b.onclick = () => { selectedLoc = b.dataset.loc; updateLocUI(); };
  });
  /* overlay クリックで閉じる（追加モーダルのみ。詳細は誤操作防止のため×ボタンで） */
  $('addOverlay').addEventListener('click', ev => {
    if (ev.target === ev.currentTarget) ev.currentTarget.classList.remove('open');
  });

  /* バックアップモーダル */
  $('openBackupBtn').onclick = () => $('backupOverlay').classList.add('open');
  $('backupClose').onclick = () => $('backupOverlay').classList.remove('open');
  $('backupOverlay').addEventListener('click', ev => {
    if (ev.target === ev.currentTarget) ev.currentTarget.classList.remove('open');
  });
  $('exportBtn').onclick = exportBackup;
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').addEventListener('change', ev => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (file) importBackup(file);
  });

  /* 検索 */
  $('searchInput').addEventListener('input', ev => {
    searchQuery = ev.target.value.trim();
    renderHome();
  });

  /* 統計の折りたたみ */
  $('statsToggle').onclick = () => {
    statsCollapsed = !statsCollapsed;
    try { localStorage.setItem(STATS_KEY, statsCollapsed ? '1' : '0'); } catch (e) {}
    applyStatsCollapse();
  };

  /* カレンダー */
  $('calPrev').onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); };
  $('calNext').onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); };
  $('calToday').onclick = () => {
    const now = new Date();
    calYear = now.getFullYear(); calMonth = now.getMonth();
    selectedDay = todayYMD();
    renderCalendar();
  };

  /* ページを離れる・バックグラウンドに回る瞬間にも念のため保存（iOS Safari対策） */
  const flush = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

initEvents();
applyTheme(theme);
applyStatsCollapse();
renderHome();
