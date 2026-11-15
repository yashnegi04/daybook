// Daybook UI. Plain DOM rendering: each screen is a function that returns HTML.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DEMO = !!window.DAYBOOK_DEMO;

const ic = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  today: ic('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5.5"/>'),
  track: ic('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
  journal: ic('<path d="M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2z"/><path d="M6 17h13M10 8h5"/>'),
  boards: ic('<rect x="3" y="3" width="8" height="10" rx="2"/><rect x="13" y="3" width="8" height="6" rx="2"/><rect x="13" y="12" width="8" height="9" rx="2"/><rect x="3" y="16" width="8" height="5" rx="2"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 0 0-2.2 1.3l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.4a7 7 0 0 0 2.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  check: ic('<path d="m5 12.5 4.5 4.5L19 7"/>', 'stroke-width="3"'),
  bell: ic('<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/>'),
  left: ic('<path d="m14 6-6 6 6 6"/>'),
  right: ic('<path d="m10 6 6 6-6 6"/>'),
  flame: ic('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>'),
  photo: ic('<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4 4 3 3-2 4 3"/>'),
  pen: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  share: ic('<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>'),
};

const MOODS = [
  ['joyful', 'Joyful', '#E3A008'],
  ['calm', 'Calm', '#3E9B55'],
  ['okay', 'Okay', '#2E86E8'],
  ['drained', 'Drained', '#8F4BD8'],
  ['anxious', 'Anxious', '#E0569B'],
  ['low', 'Low', '#7A7F8A'],
];
const moodOf = (k) => MOODS.find((m) => m[0] === k);
const HABIT_ICONS = ['🚭', '🥗', '🏋️', '🏃', '💧', '📖', '🧘', '😴', '💊', '🍺', '☕', '📵', '🎸', '✍️', '🧹', '💰'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ui = { tab: 'today', day: todayYmd(), sheet: null, board: null, jday: todayYmd(), quote: null };

const fmtDay = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => fromYmd(s).toLocaleDateString([], o);
const mondayOf = (s) => addDays(s, -((fromYmd(s).getDay() + 6) % 7));

/* ---------- toast ---------- */
let _toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------- trackers ---------- */
const logOf = (h, d) => {
  const v = (S.logs[h.id] || {})[d];
  return v === undefined ? null : v;
};
function setLog(h, d, v) {
  S.logs[h.id] = S.logs[h.id] || {};
  if (v === null) delete S.logs[h.id][d];
  else S.logs[h.id][d] = v;
  save();
}
function statusOf(h, d) {
  const v = logOf(h, d);
  if (v === null) return null;
  if (h.mode === 'atMost') return v <= h.target ? 'ok' : 'miss';
  if (h.kind === 'check') return v >= 1 ? 'ok' : null;
  return v >= h.target ? 'ok' : v > 0 ? 'part' : 'miss';
}
function stats(h) {
  const t = todayYmd();
  const days = Object.keys(S.logs[h.id] || {}).sort();
  let cur = 0;
  let d = statusOf(h, t) === 'ok' ? t : addDays(t, -1);
  while (statusOf(h, d) === 'ok') {
    cur++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let good = 0;
  if (days.length) {
    for (let x = days[0]; x <= t; x = addDays(x, 1)) {
      if (statusOf(h, x) === 'ok') {
        run++;
        good++;
        best = Math.max(best, run);
      } else run = 0;
    }
  }
  let ok30 = 0;
  for (let i = 0; i < 30; i++) if (statusOf(h, addDays(t, -i)) === 'ok') ok30++;
  let week = 0;
  let prev = 0;
  for (let i = 0; i < 7; i++) {
    week += logOf(h, addDays(t, -i)) || 0;
    prev += logOf(h, addDays(t, -7 - i)) || 0;
  }
  return { cur, best, good, rate: Math.round((ok30 / 30) * 100), week, prev };
}
const goalText = (h) =>
  h.kind === 'check' ? 'Every day' : h.mode === 'atMost' ? (h.target === 0 ? `No ${h.unit || 'slips'}` : `At most ${h.target} ${h.unit}`) : `${h.target} ${h.unit} a day`;

function habitControl(h, d) {
  const v = logOf(h, d);
  if (d > todayYmd()) return '';
  if (h.kind === 'check') {
    return `<button class="htick ${v ? 'on' : ''}" data-a="hcheck" data-id="${h.id}" data-d="${d}" aria-label="Mark ${esc(h.name)} done" aria-pressed="${!!v}">${I.check}</button>`;
  }
  const none = h.mode === 'atMost' ? `<button class="pill ${v === 0 ? 'on' : ''}" data-a="hnone" data-id="${h.id}" data-d="${d}" aria-pressed="${v === 0}">None</button>` : '';
  return `${none}<span class="step"><button data-a="hinc" data-id="${h.id}" data-d="${d}" data-n="-1" aria-label="One less">−</button><b>${v === null ? '·' : v}</b><button data-a="hinc" data-id="${h.id}" data-d="${d}" data-n="1" aria-label="One more">+</button></span>`;
}

function heat(h, weeks = 17) {
  const t = todayYmd();
  const start = addDays(mondayOf(t), -(weeks - 1) * 7);
  let out = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const st = d > t ? 'fut' : statusOf(h, d) || '';
    out += `<i class="${st}${d === t ? ' now' : ''}"></i>`;
  }
  return `<div class="heat" role="img" aria-label="Last ${weeks} weeks">${out}</div>`;
}

/* ---------- views ---------- */
function reminderChip() {
  const n = Push.plan().filter((p) => !p.id.startsWith('nudge-')).length;
  if (Push.status === 'on') return `<button class="chip mint" data-a="settings">${I.bell}${n} ${n === 1 ? 'reminder' : 'reminders'} set</button>`;
  if (Push.status === 'error') return `<button class="chip hot" data-a="settings">${I.bell}Reminders failed</button>`;
  return `<button class="chip ghost" data-a="settings">${I.bell}Reminders off</button>`;
}

function taskRow(t, showDate) {
  const soon = !t.done && t.time && atMs(t.date, t.time) > Date.now() && atMs(t.date, t.time) - Date.now() < 3600e3;
  const late = !t.done && t.time && atMs(t.date, t.time) < Date.now();
  return `<div class="task ${t.done ? 'done' : ''}">
    <button class="tick ${t.done ? 'on' : ''}" data-a="tick" data-id="${t.id}" aria-label="Mark done" aria-pressed="${t.done}">${I.check}</button>
    <button class="ttl" data-a="task" data-id="${t.id}">${esc(t.title)}</button>
    ${showDate ? `<span class="cap">${fmtDay(t.date, { day: 'numeric', month: 'short' })}</span>` : ''}
    ${t.time ? `<span class="chip ${soon ? 'hot' : ''}" ${late ? 'style="color:var(--accent)"' : ''}>${fmtTime(t.time)}</span>` : ''}
  </div>`;
}

function vToday() {
  const t = todayYmd();
  const d = ui.day;
  const hr = new Date().getHours();
  const hello = hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const tasks = S.tasks.filter((x) => x.date === d).sort((a, b) => (a.time || '99') .localeCompare(b.time || '99') || a.created - b.created);
  const timed = tasks.filter((x) => x.time);
  const any = tasks.filter((x) => !x.time);
  const done = tasks.filter((x) => x.done).length;
  const left = d === t ? S.tasks.filter((x) => !x.done && x.date < t).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const mon = mondayOf(d);
  const week = DOW.map((n, i) => {
    const x = addDays(mon, i);
    const has = S.tasks.some((k) => k.date === x && !k.done);
    return `<button class="day ${x === d ? 'sel' : ''} ${x === t ? 'today' : ''} ${has ? 'has' : ''}" data-a="day" data-d="${x}" aria-label="${fmtDay(x)}"><span class="dow">${n}</span><span class="num">${fromYmd(x).getDate()}</span><span class="dot"></span></button>`;
  }).join('');

  const all = QUOTES.concat(S.quotes.map((q) => [q.text, q.by || 'Me']));
  if (ui.quote == null) ui.quote = Math.floor(fromYmd(t).getTime() / 864e5) % all.length;
  const q = all[ui.quote % all.length];

  const habits = S.habits
    .map((h) => {
      const st = stats(h);
      return `<div class="hrow" style="--hc:${h.color}"><button class="hico" data-a="habit" data-id="${h.id}" aria-label="Open ${esc(h.name)}">${h.icon}</button>
      <button class="grow" data-a="habit" data-id="${h.id}"><div>${esc(h.name)}</div><div class="cap">${st.cur ? `${st.cur}-day streak` : goalText(h)}</div></button>
      ${habitControl(h, d)}</div>`;
    })
    .join('');

  const pieces = S.boards.flatMap((b) => b.items.map((it) => ({ b, it })));
  let remember = '';
  if (pieces.length) {
    const p = pieces[(Math.floor(fromYmd(t).getTime() / 864e5) * 7 + ui.quote) % pieces.length];
    remember = `<button class="card" data-a="board" data-id="${p.b.id}"><div class="row between"><span class="cap">From “${esc(p.b.title)}”</span><span class="cap">Open board</span></div>
      ${p.it.type === 'image' ? `<div class="item"><img src="${IMGS[p.it.img] || ''}" alt="${esc(p.it.text || 'Moodboard photo')}"></div>` : `<div class="item note" style="background:${p.it.tint}">${esc(p.it.text)}</div>`}</button>`;
  }

  const install = !DEMO && Push.isIOS() && !Push.isStandalone()
    ? `<div class="banner">${I.share}<div><b>Install Daybook</b><br>Tap Share in Safari, then “Add to Home Screen”. Reminders only work from the Home Screen app.</div></div>` : '';

  return `
  <header class="top"><div class="stack" style="gap:6px"><span class="cap">${fmtDay(t, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</span>
    <h1 class="h1">${hello}${S.settings.name ? ', ' + esc(S.settings.name) : ''}</h1></div>
    <button class="iconbtn" data-a="settings" aria-label="Settings">${I.gear}</button></header>
  ${install}
  ${DEMO ? `<div class="banner warn">${I.pen}<div>Preview with sample data. Everything is tappable; reminders start working once the app is installed on your iPhone.</div></div>` : ''}
  <button class="quote" data-a="quote" aria-label="Next quote"><p>${esc(q[0])}</p><span class="cap">${esc(q[1]).toUpperCase()} · TAP FOR ANOTHER</span></button>
  <section class="card">
    <div class="weeknav"><button data-a="week" data-n="-1" aria-label="Previous week">${I.left}</button><span class="cap">${fmtDay(mon, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(mon, 6), { day: 'numeric', month: 'short' })}</span><button data-a="week" data-n="1" aria-label="Next week">${I.right}</button></div>
    <div class="week">${week}</div>
  </section>
  <section class="card">
    <div class="row between"><span class="cap">${d === t ? 'TODAY' : fmtDay(d).toUpperCase()}</span>${reminderChip()}</div>
    <div class="row between" style="align-items:flex-end"><span class="big">${done}<span class="mute" style="font-weight:400">/${tasks.length}</span></span><span class="cap">${tasks.length ? Math.round((done / tasks.length) * 100) + '% DONE' : 'NOTHING PLANNED'}</span></div>
    <div class="bar"><i style="width:${tasks.length ? (done / tasks.length) * 100 : 0}%"></i></div>
    ${tasks.length ? '' : `<p class="empty">Tap + and type your day, one thing per line. Anything with a time gets a reminder.</p>`}
    ${timed.length ? `<div><div class="sub">At a set time</div><div class="tasks">${timed.map((x) => taskRow(x)).join('')}</div></div>` : ''}
    ${any.length ? `<div><div class="sub">Anytime</div><div class="tasks">${any.map((x) => taskRow(x)).join('')}</div></div>` : ''}
    ${left.length ? `<div><div class="row between"><div class="sub">Left over</div><button class="cap" data-a="carry" style="padding-top:6px;text-decoration:underline">MOVE ALL TO TODAY</button></div><div class="tasks">${left.map((x) => taskRow(x, true)).join('')}</div></div>` : ''}
  </section>
  ${S.habits.length ? `<section class="card"><div class="row between"><span class="cap">CHECK-INS</span><span class="cap">${d === t ? 'TODAY' : fmtDay(d).toUpperCase()}</span></div><div>${habits}</div></section>` : ''}
  ${remember}
  <button class="fab" data-a="plan" aria-label="Plan tasks">${I.plus}</button>`;
}

function vTrack() {
  const t = todayYmd();
  const cards = S.habits
    .map((h) => {
      const st = stats(h);
      return `<section class="hcard" style="--hc:${h.color}">
      <div class="row"><button class="hico" data-a="habit" data-id="${h.id}" aria-label="Open ${esc(h.name)}">${h.icon}</button>
        <button class="grow" data-a="habit" data-id="${h.id}"><div class="h2">${esc(h.name)}</div><div class="cap">${goalText(h).toUpperCase()}</div></button>
        ${habitControl(h, t)}</div>
      <button data-a="habit" data-id="${h.id}" aria-label="Open ${esc(h.name)} details">${heat(h)}</button>
      <div class="row between"><span class="chip">${I.flame}${st.cur} day streak</span><span class="cap">BEST ${st.best} · ${st.rate}% OF 30 DAYS</span></div>
    </section>`;
    })
    .join('');
  return `
  <header class="top"><div class="stack" style="gap:6px"><span class="cap">DAY BY DAY</span><h1 class="h1">Progress</h1></div>
    <button class="iconbtn" data-a="hnew" aria-label="New tracker">${I.plus}</button></header>
  ${cards || `<section class="card"><p class="empty">No trackers yet. Add one for anything you want to see day by day.</p></section>`}
  <button class="btn line" data-a="hnew">${I.plus}New tracker</button>`;
}

function vJournal() {
  const t = todayYmd();
  const d = ui.jday;
  const e = S.journal[d] || {};
  const dots = Array.from({ length: 14 }, (_, i) => {
    const x = addDays(t, i - 13);
    const m = moodOf((S.journal[x] || {}).mood);
    const has = S.journal[x] && (m || S.journal[x].text);
    return `<button class="${has ? 'has' : ''} ${x === d ? 'sel' : ''}" style="--mc:${m ? m[2] : 'var(--mute)'}" data-a="jday" data-d="${x}" aria-label="${fmtDay(x)}">${fromYmd(x).getDate()}</button>`;
  }).join('');
  const past = Object.keys(S.journal)
    .filter((k) => S.journal[k].text || S.journal[k].mood)
    .sort()
    .reverse()
    .slice(0, 60)
    .map((k) => {
      const j = S.journal[k];
      const m = moodOf(j.mood);
      return `<button class="entry" data-a="jday" data-d="${k}"><span class="row"><span class="mdot" style="--mc:${m ? m[2] : 'var(--line)'}"></span><span class="cap">${fmtDay(k).toUpperCase()}${m ? ' · ' + m[1].toUpperCase() : ''}</span></span>${j.text ? `<p>${esc(j.text)}</p>` : ''}</button>`;
    })
    .join('');
  return `
  <header class="top"><div class="stack" style="gap:6px"><span class="cap">${d === t ? 'TODAY' : fmtDay(d).toUpperCase()}</span>
    <h1 class="hand" style="font-size:36px">How do you really feel ${d === t ? 'today' : 'that day'}?</h1></div>
    ${d !== t ? `<button class="chip" data-a="jday" data-d="${t}">Back to today</button>` : ''}</header>
  <div class="moods" role="group" aria-label="Mood">${MOODS.map((m) => `<button class="mood ${e.mood === m[0] ? 'on' : ''}" style="--mc:${m[2]}" data-a="mood" data-k="${m[0]}" aria-pressed="${e.mood === m[0]}">${m[1]}</button>`).join('')}</div>
  <textarea id="jText" class="area" data-i="jtext" placeholder="Write about your day. What went well, what didn't, what you want to remember." aria-label="Journal entry">${esc(e.text || '')}</textarea>
  <section class="card"><div class="row between"><span class="cap">LAST 14 DAYS</span><span class="cap">TAP A DAY TO OPEN IT</span></div><div class="dots">${dots}</div></section>
  <section class="card"><span class="cap">ENTRIES</span><div>${past || '<p class="empty">Your entries will collect here.</p>'}</div></section>`;
}

function vBoards() {
  if (ui.board) {
    const b = S.boards.find((x) => x.id === ui.board);
    if (b) return vBoard(b);
    ui.board = null;
  }
  const cards = S.boards
    .map((b) => {
      const top = b.items.slice(0, 3).reverse();
      const layers = top.length
        ? top.map((it) => (it.type === 'image' ? `<div style="background-image:url('${IMGS[it.img] || ''}')"></div>` : `<div style="background:${it.tint}"><span class="hand">${esc(it.text.slice(0, 60))}</span></div>`)).join('')
        : `<div><span class="cap">EMPTY · TAP TO ADD PHOTOS AND WORDS</span></div>`;
      return `<button class="card bcard" data-a="board" data-id="${b.id}"><div class="bstack">${layers}</div><div class="row between"><span class="h2">${esc(b.title)}</span><span class="cap">${b.items.length} ${b.items.length === 1 ? 'PIECE' : 'PIECES'}</span></div></button>`;
    })
    .join('');
  return `
  <header class="top"><div class="stack" style="gap:6px"><span class="cap">THE PERSON I WANT TO BE</span><h1 class="h1">Moodboards</h1></div>
    <button class="iconbtn" data-a="bnew" aria-label="New board">${I.plus}</button></header>
  ${cards}
  <button class="btn line" data-a="bnew">${I.plus}New board</button>`;
}

function vBoard(b) {
  const items = b.items
    .map((it) =>
      it.type === 'image'
        ? `<button class="item" data-a="item" data-id="${it.id}"><img src="${IMGS[it.img] || ''}" alt="${esc(it.text || 'Moodboard photo')}" loading="lazy">${it.text ? `<div class="capt">${esc(it.text)}</div>` : ''}</button>`
        : `<button class="item note" style="background:${it.tint}" data-a="item" data-id="${it.id}">${esc(it.text)}</button>`
    )
    .join('');
  return `
  <header class="top"><button class="iconbtn" data-a="bback" aria-label="All boards">${I.left}</button><button class="iconbtn" data-a="bmenu" aria-label="Board options">${I.gear}</button></header>
  <div class="stack" style="gap:4px"><span class="cap">MOODBOARD · ${b.items.length} ${b.items.length === 1 ? 'PIECE' : 'PIECES'}</span>
    <input id="bTitle" class="titlein" data-i="btitle" value="${esc(b.title)}" aria-label="Board name" maxlength="60"></div>
  <div class="two"><button class="btn soft" data-a="bphoto">${I.photo}Photos</button><button class="btn soft" data-a="bwords">${I.pen}Words</button></div>
  ${items ? `<div class="masonry">${items}</div>` : `<section class="card"><p class="hand">Who are you becoming?</p><p class="empty">Add photos of the life you want and a few lines about how that person lives, trains, eats, speaks. Look at it daily.</p></section>`}`;
}

const VIEWS = { today: vToday, track: vTrack, journal: vJournal, boards: vBoards };
const TABS = [
  ['today', 'Today', I.today],
  ['track', 'Progress', I.track],
  ['journal', 'Journal', I.journal],
  ['boards', 'Boards', I.boards],
];
function render() {
  $('#app').innerHTML = VIEWS[ui.tab]();
  $('#nav').innerHTML = TABS.map((t) => `<button class="${ui.tab === t[0] ? 'on' : ''}" data-a="tab" data-t="${t[0]}" aria-current="${ui.tab === t[0] ? 'page' : 'false'}">${t[2]}<span>${t[1]}</span></button>`).join('');
}

/* ---------- sheets ---------- */
function openSheet(name, data = {}) {
  ui.sheet = { name, ...data };
  renderSheet(true);
}
function closeSheet() {
  ui.sheet = null;
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
}
function renderSheet(fresh) {
  const el = $('#sheet');
  if (!ui.sheet) return closeSheet();
  const old = $('.panel', el);
  const top = old && !fresh ? old.scrollTop : 0;
  el.innerHTML = `<div class="panel" role="dialog" aria-modal="true" ${fresh ? '' : 'style="animation:none"'}>${SHEETS[ui.sheet.name](ui.sheet)}</div>`;
  el.hidden = false;
  $('.panel', el).scrollTop = top;
}
const sheetHead = (title, hand) => `<div class="row between"><h2 class="${hand ? 'hand' : 'h2'}">${title}</h2><button class="chip" data-a="close">Close</button></div>`;
const leadOptions = (v) =>
  [['', 'Use my default'], [0, 'At the time'], [5, '5 min before'], [10, '10 min before'], [15, '15 min before'], [30, '30 min before'], [60, '1 hour before']]
    .map(([k, l]) => `<option value="${k}" ${String(v == null ? '' : v) === String(k) ? 'selected' : ''}>${l}</option>`)
    .join('');

function planPreview(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return `<p class="note">Try: <i>meet at 3 pm</i> · <i>call the bank 11:30</i> · <i>gym tomorrow 7am</i> · <i>buy groceries</i></p>`;
  return lines
    .map((l) => {
      const p = parseLine(l, ui.day);
      const other = p.date !== ui.day ? `<span class="cap">${fmtDay(p.date, { weekday: 'short', day: 'numeric' })}</span>` : '';
      return `<div class="task"><span class="tick"></span><span class="ttl">${esc(p.title)}</span>${other}${p.time ? `<span class="chip mint">${I.bell}${fmtTime(p.time)}</span>` : `<span class="chip ghost">Anytime</span>`}</div>`;
    })
    .join('');
}

const SHEETS = {
  plan: () => `
    ${sheetHead(ui.day === todayYmd() ? 'Plan your day' : 'Plan ' + fmtDay(ui.day), true)}
    <div class="field"><label class="cap" for="planText">ONE THING PER LINE · ADD A TIME TO GET A REMINDER</label>
      <textarea id="planText" class="in" data-i="plan" placeholder="Meet at 3 pm&#10;Call the bank 11:30&#10;Buy groceries" autocapitalize="sentences"></textarea></div>
    <div id="planPrev" class="preview">${planPreview('')}</div>
    <button class="btn" data-a="planSave">Save and set reminders</button>`,

  task: ({ id }) => {
    const t = S.tasks.find((x) => x.id === id);
    if (!t) return '';
    return `
    ${sheetHead('Edit task')}
    <div class="field"><label class="cap" for="tTitle">WHAT</label><input id="tTitle" class="in" value="${esc(t.title)}" maxlength="200"></div>
    <div class="two"><div class="field"><label class="cap" for="tDate">DAY</label><input id="tDate" class="in" type="date" value="${t.date}"></div>
      <div class="field"><label class="cap" for="tTime">TIME</label><input id="tTime" class="in" type="time" value="${t.time || ''}"></div></div>
    <div class="row"><div class="field grow"><label class="cap" for="tLead">REMIND ME</label><select id="tLead" class="in">${leadOptions(t.lead)}</select></div>
      <button class="btn line sm" data-a="noTime" style="align-self:flex-end;min-height:50px">No time</button></div>
    <button class="btn" data-a="taskSave" data-id="${t.id}">Save</button>
    <button class="btn danger" data-a="taskDel" data-id="${t.id}">Delete task</button>`;
  },

  habit: (sh) => {
    const h = S.habits.find((x) => x.id === sh.id);
    if (!h) return '';
    const t = todayYmd();
    const st = stats(h);
    const sel = sh.d || t;
    const month = sh.m || t.slice(0, 7);
    const first = month + '-01';
    const offset = (fromYmd(first).getDay() + 6) % 7;
    const [yy, mm] = month.split('-').map(Number);
    const count = new Date(yy, mm, 0).getDate();
    let cal = DOW.map((n) => `<span class="cap dh">${n[0]}</span>`).join('') + '<span></span>'.repeat(offset);
    for (let i = 1; i <= count; i++) {
      const d = `${month}-${pad(i)}`;
      cal += `<button class="${statusOf(h, d) || ''} ${d === sel ? 'sel' : ''}" data-a="hday" data-d="${d}" ${d > t ? 'disabled' : ''}>${i}</button>`;
    }
    let bars = '';
    if (h.kind === 'count') {
      const vals = Array.from({ length: 7 }, (_, i) => logOf(h, addDays(t, i - 6)));
      const max = Math.max(1, h.target, ...vals.map((v) => v || 0));
      bars = `<section class="card"><div class="row between"><span class="cap">LAST 7 DAYS</span><span class="cap">${h.mode === 'atMost' ? 'LIMIT' : 'GOAL'} · ${h.target}</span></div>
        <div class="row between" style="align-items:flex-end"><span class="big">${st.week}<small style="font:400 14px var(--f-display);color:var(--mute);margin-left:6px">${esc(h.unit)}</small></span><span class="cap">WEEK BEFORE · ${st.prev}</span></div>
        <div class="bars">${vals.map((v, i) => `<div class="b ${i === 6 ? 'now' : ''} ${v === null ? 'none' : ''}" style="height:${v === null ? 6 : Math.max(5, (v / max) * 100)}%" title="${v === null ? 'Not logged' : v}"></div>`).join('')}</div>
        <div class="barlab">${vals.map((_, i) => `<span class="cap ${i === 6 ? 'now' : ''}">${DOW[(fromYmd(addDays(t, i - 6)).getDay() + 6) % 7]}</span>`).join('')}</div></section>`;
    }
    return `<div style="--hc:${h.color};display:contents">
    <div class="row between"><div class="row"><span class="hico">${h.icon}</span><div><h2 class="h2">${esc(h.name)}</h2><span class="cap">${goalText(h).toUpperCase()}</span></div></div><button class="chip" data-a="close">Close</button></div>
    <div class="tiles">
      <div class="tile"><span class="cap">CURRENT STREAK</span><span class="big">${st.cur}<small>${st.cur === 1 ? 'day' : 'days'}</small></span></div>
      <div class="tile"><span class="cap">BEST STREAK</span><span class="big">${st.best}<small>${st.best === 1 ? 'day' : 'days'}</small></span></div>
      <div class="tile"><span class="cap">GOOD DAYS</span><span class="big">${st.good}<small>total</small></span></div>
      <div class="tile"><span class="cap">LAST 30 DAYS</span><span class="big">${st.rate}<small>%</small></span></div>
    </div>
    ${bars}
    <section class="card">
      <div class="weeknav"><button data-a="hmonth" data-n="-1" aria-label="Previous month">${I.left}</button><span class="cap">${fromYmd(first).toLocaleDateString([], { month: 'long', year: 'numeric' }).toUpperCase()}</span><button data-a="hmonth" data-n="1" aria-label="Next month">${I.right}</button></div>
      <div class="cal">${cal}</div>
      <div class="row between"><span>${fmtDay(sel)}</span><span class="row">${habitControl(h, sel)}</span></div>
      <div class="legend cap"><span><i style="background:var(--hc)"></i>ON TRACK</span><span><i style="background:color-mix(in srgb, var(--ink) 24%, var(--card))"></i>${h.mode === 'atMost' ? 'OVER' : 'MISSED'}</span><span><i style="background:var(--inset)"></i>NOT LOGGED</span></div>
    </section>
    <button class="btn line" data-a="hedit" data-id="${h.id}">Edit tracker</button></div>`;
  },

  hform: (sh) => {
    const h = sh.draft;
    const type = h.kind === 'check' ? 'check' : h.mode;
    return `
    ${sheetHead(sh.isNew ? 'New tracker' : 'Edit tracker')}
    <div class="field"><label class="cap" for="hName">NAME</label><input id="hName" class="in" value="${esc(h.name)}" placeholder="Workout, Smoking, Water…" maxlength="40" data-i="hname"></div>
    <div class="field"><span class="cap">HOW DO YOU TRACK IT?</span>
      <div class="seg"><button class="${type === 'check' ? 'on' : ''}" data-a="htype" data-k="check">Did it / didn't</button><button class="${type === 'atLeast' ? 'on' : ''}" data-a="htype" data-k="atLeast">Reach a number</button><button class="${type === 'atMost' ? 'on' : ''}" data-a="htype" data-k="atMost">Stay under</button></div></div>
    ${type === 'check' ? '' : `<div class="two"><div class="field"><label class="cap" for="hTarget">${type === 'atMost' ? 'DAILY LIMIT' : 'DAILY GOAL'}</label><input id="hTarget" class="in" type="number" inputmode="numeric" min="0" value="${h.target}" data-i="htarget"></div>
      <div class="field"><label class="cap" for="hUnit">COUNTED IN</label><input id="hUnit" class="in" value="${esc(h.unit)}" placeholder="cigarettes, glasses…" maxlength="20" data-i="hunit"></div></div>`}
    <div class="field"><span class="cap">ICON</span><div class="swatches">${HABIT_ICONS.map((e) => `<button class="sw ${h.icon === e ? 'on' : ''}" data-a="hicon" data-k="${e}" aria-label="Icon ${e}">${e}</button>`).join('')}</div></div>
    <div class="field"><span class="cap">COLOUR</span><div class="swatches">${HABIT_COLORS.map((c) => `<button class="sw ${h.color === c ? 'on' : ''}" style="--c:${c}" data-a="hcolor" data-k="${c}" aria-label="Colour ${c}"></button>`).join('')}</div></div>
    <button class="btn" data-a="hsave">Save tracker</button>
    ${sh.isNew ? '' : `<button class="btn danger" data-a="hdel" data-id="${h.id}">${sh.sure ? 'Tap again to delete it and its history' : 'Delete tracker'}</button>`}`;
  },

  words: (sh) => `
    ${sheetHead(sh.id ? 'Edit words' : 'Add words', true)}
    <textarea id="wText" class="in" placeholder="I am someone who trains before work.&#10;I keep my word to myself." maxlength="400">${esc(sh.text || '')}</textarea>
    <div class="swatches">${TINTS.map((c) => `<button class="sw ${sh.tint === c ? 'on' : ''}" style="--c:${c}" data-a="wtint" data-k="${c}" aria-label="Card colour"></button>`).join('')}</div>
    <button class="btn" data-a="wsave">Save</button>
    ${sh.id ? `<button class="btn danger" data-a="itemDel" data-id="${sh.id}">Remove from board</button>` : ''}`,

  photo: (sh) => {
    const b = S.boards.find((x) => x.id === ui.board);
    const it = b && b.items.find((x) => x.id === sh.id);
    if (!it) return '';
    return `
    ${sheetHead('Photo')}
    <div class="item"><img src="${IMGS[it.img] || ''}" alt=""></div>
    <div class="field"><label class="cap" for="pCap">CAPTION</label><input id="pCap" class="in" value="${esc(it.text || '')}" placeholder="What this means to you" maxlength="120"></div>
    <button class="btn" data-a="psave" data-id="${it.id}">Save</button>
    <button class="btn danger" data-a="itemDel" data-id="${it.id}">Remove from board</button>`;
  },

  bmenu: (sh) => `
    ${sheetHead('Board options')}
    <p class="note">Rename the board by tapping its title.</p>
    <button class="btn danger" data-a="bdel">${sh.sure ? 'Tap again to delete this board' : 'Delete this board'}</button>`,

  settings: (sh) => {
    const s = S.settings;
    const st = Push.status;
    let rem;
    if (st === 'needs-install') rem = `<div class="banner">${I.share}<div>Open this page in Safari, tap Share, then “Add to Home Screen”. Open Daybook from the Home Screen and come back here.</div></div>`;
    else if (st === 'unsupported') rem = `<div class="banner warn">${I.bell}<div>This browser can't show notifications. On iPhone, install Daybook to the Home Screen (iOS 16.4 or later).</div></div>`;
    else if (st === 'blocked') rem = `<div class="banner warn">${I.bell}<div>Notifications are blocked. Allow them in iPhone Settings → Notifications → Daybook.</div></div>`;
    else {
      rem = `
      <div class="field"><label class="cap" for="sRelay">REMINDER RELAY ADDRESS</label><input id="sRelay" class="in" data-i="relay" value="${esc(s.relay || window.DAYBOOK_RELAY || '')}" placeholder="https://daybook-relay.you.workers.dev" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      <div class="field"><label class="cap" for="sPass">RELAY PASSCODE (ONLY IF YOU SET ONE)</label><input id="sPass" class="in" data-i="pass" value="${esc(s.pass || '')}" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      ${st === 'on' || st === 'error'
        ? `<div class="banner ${st === 'error' ? 'warn' : ''}">${I.bell}<div>${st === 'error' ? 'Last sync failed: ' + esc(Push.detail) : 'Reminders are on for this phone.'}</div></div>
           <div class="two"><button class="btn soft" data-a="testPush">Send a test</button><button class="btn line" data-a="disablePush">Turn off</button></div>`
        : `<button class="btn" data-a="enablePush">${I.bell}Turn on reminders</button>`}`;
    }
    return `
    ${sheetHead('Settings')}
    <div class="field"><label class="cap" for="sName">YOUR NAME</label><input id="sName" class="in" data-i="name" value="${esc(s.name)}" placeholder="Shown in the greeting" maxlength="30"></div>
    <hr class="hr"><span class="h2">Reminders</span>
    ${rem}
    <div class="field"><label class="cap" for="sLead">REMIND ME</label><select id="sLead" class="in" data-i="lead">${leadOptions(s.lead).replace(/<option value=""[^>]*>[^<]*<\/option>/, '')}</select></div>
    <div class="row between"><div><div>Evening check-in</div><div class="cap">OPEN TASKS, TRACKERS AND JOURNAL</div></div><button class="switch ${s.nudge ? 'on' : ''}" data-a="nudge" role="switch" aria-checked="${!!s.nudge}" aria-label="Evening check-in"></button></div>
    ${s.nudge ? `<div class="field"><label class="cap" for="sNudge">CHECK-IN TIME</label><input id="sNudge" class="in" type="time" data-i="nudgeTime" value="${s.nudgeTime}"></div>` : ''}
    <hr class="hr"><span class="h2">Look</span>
    <div class="seg">${['auto', 'light', 'dark'].map((k) => `<button class="${s.theme === k ? 'on' : ''}" data-a="theme" data-k="${k}">${k === 'auto' ? 'Match iPhone' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <hr class="hr"><span class="h2">My quotes</span>
    <div class="row"><input id="qText" class="in grow" placeholder="Add a line that moves you" maxlength="240"><button class="btn sm" data-a="qadd">Add</button></div>
    ${S.quotes.map((q) => `<div class="row between"><span class="grow">${esc(q.text)}</span><button class="chip" data-a="qdel" data-id="${q.id}">Remove</button></div>`).join('')}
    <hr class="hr"><span class="h2">Backup</span>
    <p class="note">Everything is stored only on this phone. Save a backup now and then; deleting the app from the Home Screen deletes its data.</p>
    <div class="two"><button class="btn soft" data-a="export">Save backup</button><button class="btn line" data-a="import">Restore</button></div>
    <button class="btn danger" data-a="wipe">${sh.sure ? 'Tap again to erase everything' : 'Erase all data'}</button>`;
  },
};

/* ---------- actions ---------- */
function afterTasks() {
  save();
  render();
  queueSync();
}
function fileToImage(file, max = 1400) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => rej(new Error('That file is not a photo I can read.'));
    img.src = url;
  });
}
const curBoard = () => S.boards.find((x) => x.id === ui.board);

const A = {
  tab(el) {
    if (ui.tab === el.dataset.t && ui.tab === 'boards') ui.board = null;
    ui.tab = el.dataset.t;
    render();
    window.scrollTo(0, 0);
  },
  close: closeSheet,
  day(el) {
    ui.day = el.dataset.d;
    render();
  },
  week(el) {
    ui.day = addDays(ui.day, 7 * Number(el.dataset.n));
    render();
  },
  quote() {
    ui.quote = (ui.quote || 0) + 1;
    render();
  },

  plan() {
    openSheet('plan');
    setTimeout(() => $('#planText') && $('#planText').focus(), 60);
  },
  async planSave() {
    const lines = $('#planText').value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return toast('Type at least one thing first.');
    let timed = 0;
    for (const l of lines) {
      const p = parseLine(l, ui.day);
      if (p.time) timed++;
      S.tasks.push({ id: uid(), title: p.title, date: p.date, time: p.time, lead: null, done: false, created: Date.now() });
    }
    closeSheet();
    save();
    render();
    const saved = `${lines.length} ${lines.length === 1 ? 'task' : 'tasks'} saved`;
    if (!timed) return toast(saved + '.');
    try {
      const n = await Push.sync();
      toast(n == null ? `${saved}. Turn on reminders in Settings to be notified.` : `${saved}. ${timed} ${timed === 1 ? 'reminder' : 'reminders'} set.`);
    } catch (e) {
      toast(`${saved}, but reminders could not be set: ${e.message}`);
    }
    render();
  },
  tick(el) {
    const t = S.tasks.find((x) => x.id === el.dataset.id);
    t.done = !t.done;
    afterTasks();
  },
  task(el) {
    openSheet('task', { id: el.dataset.id });
  },
  noTime() {
    $('#tTime').value = '';
  },
  taskSave(el) {
    const t = S.tasks.find((x) => x.id === el.dataset.id);
    t.title = $('#tTitle').value.trim() || t.title;
    t.date = $('#tDate').value || t.date;
    t.time = $('#tTime').value || null;
    t.lead = $('#tLead').value === '' ? null : Number($('#tLead').value);
    closeSheet();
    afterTasks();
  },
  taskDel(el) {
    S.tasks = S.tasks.filter((x) => x.id !== el.dataset.id);
    closeSheet();
    afterTasks();
  },
  carry() {
    const t = todayYmd();
    for (const x of S.tasks) if (!x.done && x.date < t) Object.assign(x, { date: t, time: null });
    afterTasks();
  },

  hcheck(el) {
    const h = S.habits.find((x) => x.id === el.dataset.id);
    setLog(h, el.dataset.d, logOf(h, el.dataset.d) ? null : 1);
    render();
    if (ui.sheet) renderSheet();
  },
  hinc(el) {
    const h = S.habits.find((x) => x.id === el.dataset.id);
    const v = logOf(h, el.dataset.d);
    const n = Number(el.dataset.n);
    let next = v === null ? (n > 0 ? 1 : null) : v + n;
    if (next !== null && next < (h.mode === 'atMost' ? 0 : 1)) next = null;
    setLog(h, el.dataset.d, next);
    render();
    if (ui.sheet) renderSheet();
  },
  hnone(el) {
    const h = S.habits.find((x) => x.id === el.dataset.id);
    setLog(h, el.dataset.d, logOf(h, el.dataset.d) === 0 ? null : 0);
    render();
    if (ui.sheet) renderSheet();
  },
  habit(el) {
    openSheet('habit', { id: el.dataset.id });
  },
  hday(el) {
    ui.sheet.d = el.dataset.d;
    renderSheet();
  },
  hmonth(el) {
    const [y, m] = (ui.sheet.m || todayYmd().slice(0, 7)).split('-').map(Number);
    const d = new Date(y, m - 1 + Number(el.dataset.n), 1);
    ui.sheet.m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    renderSheet();
  },
  hnew() {
    openSheet('hform', { isNew: true, draft: { id: uid(), name: '', icon: '🏃', color: HABIT_COLORS[S.habits.length % HABIT_COLORS.length], kind: 'check', mode: 'atLeast', target: 1, unit: '', created: todayYmd() } });
  },
  hedit(el) {
    openSheet('hform', { draft: { ...S.habits.find((x) => x.id === el.dataset.id) } });
  },
  htype(el) {
    const d = ui.sheet.draft;
    const k = el.dataset.k;
    d.kind = k === 'check' ? 'check' : 'count';
    d.mode = k === 'atMost' ? 'atMost' : 'atLeast';
    if (k === 'check') d.target = 1;
    if (k === 'atMost' && d.target === 1) d.target = 0;
    if (k === 'atLeast' && d.target < 1) d.target = 1;
    renderSheet();
  },
  hicon(el) {
    ui.sheet.draft.icon = el.dataset.k;
    renderSheet();
  },
  hcolor(el) {
    ui.sheet.draft.color = el.dataset.k;
    renderSheet();
  },
  hsave() {
    const d = ui.sheet.draft;
    d.name = d.name.trim();
    if (!d.name) return toast('Give the tracker a name.');
    d.target = Math.max(0, Number(d.target) || 0);
    const i = S.habits.findIndex((x) => x.id === d.id);
    if (i >= 0) S.habits[i] = d;
    else S.habits.push(d);
    save();
    closeSheet();
    render();
  },
  hdel(el) {
    if (!ui.sheet.sure) {
      ui.sheet.sure = true;
      return renderSheet();
    }
    S.habits = S.habits.filter((x) => x.id !== el.dataset.id);
    delete S.logs[el.dataset.id];
    save();
    closeSheet();
    render();
  },

  mood(el) {
    const e = (S.journal[ui.jday] = S.journal[ui.jday] || {});
    e.mood = e.mood === el.dataset.k ? null : el.dataset.k;
    e.text = $('#jText').value;
    if (!e.mood && !e.text) delete S.journal[ui.jday];
    save();
    render();
  },
  jday(el) {
    ui.jday = el.dataset.d;
    render();
    window.scrollTo(0, 0);
  },

  bnew() {
    const b = { id: uid(), title: 'New board', items: [] };
    S.boards.push(b);
    save();
    ui.board = b.id;
    render();
    window.scrollTo(0, 0);
    const t = $('#bTitle');
    if (t) {
      t.focus();
      t.select();
    }
  },
  board(el) {
    ui.tab = 'boards';
    ui.board = el.dataset.id;
    render();
    window.scrollTo(0, 0);
  },
  bback() {
    ui.board = null;
    render();
  },
  bmenu() {
    openSheet('bmenu');
  },
  bdel() {
    if (!ui.sheet.sure) {
      ui.sheet.sure = true;
      return renderSheet();
    }
    const b = curBoard();
    for (const it of b.items) if (it.img) delImage(it.img);
    S.boards = S.boards.filter((x) => x.id !== b.id);
    ui.board = null;
    save();
    closeSheet();
    render();
  },
  bphoto() {
    $('#filePhoto').click();
  },
  bwords() {
    openSheet('words', { tint: TINTS[curBoard().items.length % TINTS.length], text: '' });
  },
  wtint(el) {
    ui.sheet.text = $('#wText').value;
    ui.sheet.tint = el.dataset.k;
    renderSheet();
  },
  wsave() {
    const text = $('#wText').value.trim();
    if (!text) return toast('Write something first.');
    const b = curBoard();
    const it = b.items.find((x) => x.id === ui.sheet.id);
    if (it) Object.assign(it, { text, tint: ui.sheet.tint });
    else b.items.unshift({ id: uid(), type: 'text', text, tint: ui.sheet.tint });
    save();
    closeSheet();
    render();
  },
  item(el) {
    const it = curBoard().items.find((x) => x.id === el.dataset.id);
    if (it.type === 'image') openSheet('photo', { id: it.id });
    else openSheet('words', { id: it.id, text: it.text, tint: it.tint });
  },
  psave(el) {
    curBoard().items.find((x) => x.id === el.dataset.id).text = $('#pCap').value.trim();
    save();
    closeSheet();
    render();
  },
  itemDel(el) {
    const b = curBoard();
    const it = b.items.find((x) => x.id === el.dataset.id);
    if (it && it.img) delImage(it.img);
    b.items = b.items.filter((x) => x.id !== el.dataset.id);
    save();
    closeSheet();
    render();
  },

  async settings() {
    await Push.refresh();
    openSheet('settings');
  },
  async enablePush(el) {
    el.disabled = true;
    try {
      await Push.enable();
      toast('Reminders are on.');
    } catch (e) {
      toast(e.message);
      await Push.refresh();
    }
    renderSheet();
    render();
  },
  async disablePush() {
    await Push.disable().catch(() => {});
    await Push.refresh();
    renderSheet();
    render();
  },
  async testPush() {
    try {
      await Push.test();
      toast('Sent. It should arrive in a few seconds.');
    } catch (e) {
      toast('Test failed: ' + e.message);
    }
  },
  nudge() {
    S.settings.nudge = !S.settings.nudge;
    save();
    renderSheet();
    queueSync();
  },
  theme(el) {
    S.settings.theme = el.dataset.k;
    save();
    applyTheme();
    renderSheet();
  },
  qadd() {
    const text = $('#qText').value.trim();
    if (!text) return;
    S.quotes.push({ id: uid(), text, by: S.settings.name || 'Me' });
    save();
    renderSheet();
  },
  qdel(el) {
    S.quotes = S.quotes.filter((q) => q.id !== el.dataset.id);
    save();
    renderSheet();
  },
  async export() {
    if (DEMO) return toast('Backups work in the installed app.');
    flush();
    const name = `daybook-backup-${todayYmd()}.json`;
    const blob = new Blob([JSON.stringify({ app: 'daybook', v: 1, exported: new Date().toISOString(), state: S, images: IMGS })], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  },
  import() {
    $('#fileImport').click();
  },
  async wipe() {
    if (!ui.sheet.sure) {
      ui.sheet.sure = true;
      return renderSheet();
    }
    await Push.disable().catch(() => {});
    await dbClear('images').catch(() => {});
    IMGS = {};
    S = freshState();
    flush();
    closeSheet();
    render();
    toast('Everything was erased.');
  },
};

// Typing handlers: update state without redrawing, so the keyboard stays up.
const INPUTS = {
  plan: (el) => ($('#planPrev').innerHTML = planPreview(el.value)),
  jtext(el) {
    const e = (S.journal[ui.jday] = S.journal[ui.jday] || {});
    e.text = el.value;
    e.updated = Date.now();
    if (!e.text && !e.mood) delete S.journal[ui.jday];
    save();
  },
  btitle(el) {
    const b = curBoard();
    if (b) b.title = el.value || 'Untitled';
    save();
  },
  hname: (el) => (ui.sheet.draft.name = el.value),
  htarget: (el) => (ui.sheet.draft.target = Number(el.value) || 0),
  hunit: (el) => (ui.sheet.draft.unit = el.value),
  name(el) {
    S.settings.name = el.value.trim();
    save();
    render();
  },
  relay(el) {
    S.settings.relay = el.value.trim();
    S.push.lastHash = '';
    save();
  },
  pass(el) {
    S.settings.pass = el.value.trim();
    S.push.lastHash = '';
    save();
  },
  lead(el) {
    S.settings.lead = Number(el.value);
    save();
    queueSync();
  },
  nudgeTime(el) {
    if (el.value) S.settings.nudgeTime = el.value;
    save();
    queueSync();
  },
};

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else if (!DEMO) delete document.documentElement.dataset.theme;
}

/* ---------- sample data for the preview ---------- */
function seedDemo() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const t = todayYmd();
  S.settings.name = '';
  const mk = (title, time, done, date = t) => S.tasks.push({ id: uid(), title, date, time, lead: null, done, created: Date.now() + S.tasks.length });
  mk('Morning walk', '07:30', true);
  mk('Call the bank', '11:30', true);
  mk('Meet', '15:00', false);
  mk('Gym', '19:00', false);
  mk('Buy groceries', null, false);
  mk('Reply to landlord', null, true);
  mk('Book dentist', null, false, addDays(t, -1));
  mk('Team review', '10:00', false, addDays(t, 1));
  for (let i = 120; i >= 0; i--) {
    const d = addDays(t, -i);
    const p = 1 - i / 170; // gets better over time
    if (i > 0 || true) {
      const smokes = rnd() < p * 0.8 ? 0 : Math.ceil(rnd() * (i > 60 ? 6 : 3));
      if (rnd() < 0.93 && i > 0) (S.logs.smoke = S.logs.smoke || {})[d] = smokes;
      if (rnd() < 0.35 + p * 0.45 && i > 0) (S.logs.diet = S.logs.diet || {})[d] = 1;
      if (rnd() < 0.3 + p * 0.4 && i > 0) (S.logs.workout = S.logs.workout || {})[d] = 1;
    }
  }
  for (let i = 1; i <= 4; i++) {
    S.logs.smoke[addDays(t, -i)] = 0;
    S.logs.diet[addDays(t, -i)] = 1;
  }
  S.logs.workout[addDays(t, -1)] = 1;
  S.logs.diet[t] = 1;
  const notes = [
    ['calm', 'Four days without a cigarette. The craving after lunch was the hard one; walked around the block instead.'],
    ['drained', 'Long day, skipped the gym. Ate well though. Tomorrow I go before work so there is no excuse.'],
    ['joyful', 'Hit a deadlift PR. Slept eight hours. The plan is working when I follow it.'],
    ['anxious', 'Presentation nerves. Wrote the outline twice. It went fine.'],
  ];
  notes.forEach((n, i) => (S.journal[addDays(t, -(i * 2 + 1))] = { mood: n[0], text: n[1], updated: Date.now() }));
  ['okay', 'calm', 'joyful'].forEach((m, i) => (S.journal[addDays(t, -(i * 2 + 2))] = { mood: m, text: '' }));
  const art = (a, b, h) => {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 480, h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    x.fillStyle = g;
    x.fillRect(0, 0, 480, h);
    x.fillStyle = 'rgba(255,255,255,.22)';
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.arc(rnd() * 480, rnd() * h, 40 + rnd() * 120, 0, 7);
      x.fill();
    }
    return c.toDataURL('image/jpeg', 0.8);
  };
  const b = S.boards[0];
  const img = (a, c, h, text) => {
    const id = uid();
    putImage(id, art(a, c, h)).catch(() => {});
    b.items.push({ id: uid(), type: 'image', img: id, text });
  };
  b.items.push({ id: uid(), type: 'text', text: 'I am someone who trains before work.', tint: TINTS[2] });
  img('#5A1A10', '#D9603B', 560, 'Sample image · add your own photos');
  b.items.push({ id: uid(), type: 'text', text: 'Calm. Lean. On time. Smoke-free.', tint: TINTS[1] });
  img('#1F4E3D', '#9CCFB0', 380, '');
  b.items.push({ id: uid(), type: 'text', text: 'I keep the promises I make to myself.', tint: TINTS[3] });
  img('#2B3A67', '#C9B6E4', 460, '');
  S.boards.push({ id: uid(), title: 'Home & money', items: [{ id: uid(), type: 'text', text: 'Six months of savings. A desk by a window.', tint: TINTS[0] }] });
}

/* ---------- boot ---------- */
document.addEventListener('click', (ev) => {
  if (ev.target.id === 'sheet') return closeSheet();
  const el = ev.target.closest('[data-a]');
  if (el && A[el.dataset.a]) A[el.dataset.a](el, ev);
});
const onInput = (ev) => {
  const k = ev.target.dataset && ev.target.dataset.i;
  if (k && INPUTS[k]) INPUTS[k](ev.target);
};
document.addEventListener('input', onInput);
document.addEventListener('change', (ev) => {
  if (ev.target.tagName === 'SELECT' || ev.target.type === 'time') onInput(ev);
});

$('#filePhoto').addEventListener('change', async (ev) => {
  const b = curBoard();
  const files = [...ev.target.files];
  ev.target.value = '';
  if (!b || !files.length) return;
  let added = 0;
  for (const f of files) {
    try {
      const id = uid();
      await putImage(id, await fileToImage(f));
      b.items.unshift({ id: uid(), type: 'image', img: id, text: '' });
      added++;
    } catch (e) {
      toast(e.message || 'Could not save that photo. Storage may be full.');
    }
  }
  if (added) {
    save();
    render();
  }
});
$('#fileImport').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== 'daybook' || !j.state) throw new Error();
    const device = S.push.device;
    await dbClear('images');
    IMGS = {};
    for (const [k, v] of Object.entries(j.images || {})) await putImage(k, v);
    S = { ...freshState(), ...j.state };
    S.push = { device, lastHash: '' };
    flush();
    applyTheme();
    closeSheet();
    render();
    queueSync();
    toast('Backup restored.');
  } catch {
    toast('That file is not a Daybook backup.');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return flush();
  // Coming back: the day may have changed, and reminders may need a refresh.
  if (ui.day < todayYmd() && !ui.sheet) ui.day = ui.jday = todayYmd();
  if (!ui.sheet && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') render();
  queueSync();
});
window.addEventListener('pagehide', flush);

(async function boot() {
  const first = await loadState();
  if (first && DEMO) {
    seedDemo();
    save();
  }
  applyTheme();
  render();
  if ('serviceWorker' in navigator && !DEMO) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch {}
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await Push.refresh().catch(() => {});
  render();
  Push.sync().then(render).catch(render);
})();
