// Local storage layer. Everything lives in IndexedDB on this device.
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = fromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const todayYmd = () => ymd(new Date());
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

let _db = null;
let _mem = null; // fallback when IndexedDB is unavailable (private mode, previews)
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('daybook', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('images');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
}
async function tx(store, mode, fn) {
  if (_mem) return fn(null, _mem[store]);
  try {
    _db = _db || (await openDB());
  } catch {
    _mem = { kv: new Map(), images: new Map() };
    return fn(null, _mem[store]);
  }
  return new Promise((res, rej) => {
    const t = _db.transaction(store, mode);
    const out = fn(t.objectStore(store), null);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
const dbGet = (store, key) => tx(store, 'readonly', (os, m) => (m ? m.get(key) : os.get(key)));
const dbPut = (store, key, val) => tx(store, 'readwrite', (os, m) => (m ? void m.set(key, val) : void os.put(val, key)));
const dbDel = (store, key) => tx(store, 'readwrite', (os, m) => (m ? void m.delete(key) : void os.delete(key)));
const dbClear = (store) => tx(store, 'readwrite', (os, m) => (m ? void m.clear() : void os.clear()));
async function dbAll(store) {
  if (_mem) return Object.fromEntries(_mem[store]);
  const out = {};
  try {
    _db = _db || (await openDB());
  } catch {
    _mem = { kv: new Map(), images: new Map() };
    return out;
  }
  return new Promise((res, rej) => {
    const rq = _db.transaction(store, 'readonly').objectStore(store).openCursor();
    rq.onsuccess = () => {
      const c = rq.result;
      if (!c) return res(out);
      out[c.key] = c.value;
      c.continue();
    };
    rq.onerror = () => rej(rq.error);
  });
}

const HABIT_COLORS = ['#E5482A', '#8F4BD8', '#3E9B55', '#2E86E8', '#E3A008', '#E0569B', '#1F9E96'];
const TINTS = ['#F4D9C6', '#D9CFEA', '#BFE3CF', '#F6E3A1', '#F3C6D3', '#C9DDF2'];

function freshState() {
  const t = todayYmd();
  return {
    v: 1,
    tasks: [],
    habits: [
      { id: 'smoke', name: 'Smoking', icon: '🚭', color: HABIT_COLORS[6], kind: 'count', mode: 'atMost', target: 0, unit: 'cigarettes', created: t },
      { id: 'diet', name: 'Ate clean', icon: '🥗', color: HABIT_COLORS[2], kind: 'check', mode: 'atLeast', target: 1, unit: '', created: t },
      { id: 'workout', name: 'Workout', icon: '🏋️', color: HABIT_COLORS[1], kind: 'check', mode: 'atLeast', target: 1, unit: '', created: t },
    ],
    logs: {},
    journal: {},
    boards: [{ id: uid(), title: "Who I'm becoming", items: [] }],
    quotes: [],
    settings: { name: '', lead: 10, nudge: true, nudgeTime: '20:30', relay: '', pass: '', theme: 'auto' },
    push: { device: uid() + uid(), lastHash: '' },
  };
}

let S = null; // app state
let IMGS = {}; // image id -> data URL
let _saveTimer = null;
function save() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(_saveTimer);
  if (S) dbPut('kv', 'state', JSON.parse(JSON.stringify(S))).catch(() => {});
}
async function loadState() {
  let s = null;
  try {
    s = await dbGet('kv', 'state');
    IMGS = await dbAll('images');
  } catch {}
  const base = freshState();
  if (s && s.v) {
    S = { ...base, ...s, settings: { ...base.settings, ...s.settings }, push: { ...base.push, ...s.push } };
    return false;
  }
  S = base;
  return true; // first run
}
async function putImage(id, dataUrl) {
  IMGS[id] = dataUrl;
  await dbPut('images', id, dataUrl);
}
async function delImage(id) {
  delete IMGS[id];
  await dbDel('images', id);
}
