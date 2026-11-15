// Reminders. The phone encrypts each notification for itself, then hands the
// relay only { time, encrypted blob }. The relay forwards it at the right minute.
const b64u = (buf) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// RFC 8291 (aes128gcm) Web Push message encryption.
async function encryptPush(uaPub, auth, plain) {
  const te = new TextEncoder();
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256);
  const hkdf = async (salt, ikm, info, len) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
  };
  const ikm = await hkdf(auth, secret, cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(plain, new Uint8Array([2]))));
  const head = new Uint8Array(21);
  head.set(salt);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = asPub.length;
  return cat(head, asPub, ct);
}

const Push = {
  status: 'off', // off | on | unsupported | needs-install | blocked | no-relay | error
  detail: '',
  count: 0,

  relay() {
    return String(S.settings.relay || window.DAYBOOK_RELAY || '').trim().replace(/\/+$/, '');
  },
  isStandalone() {
    return window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  },
  isIOS() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },
  supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  async sub() {
    if (!this.supported()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  },

  async refresh() {
    if (!this.supported()) this.status = this.isIOS() && !this.isStandalone() ? 'needs-install' : 'unsupported';
    else if (Notification.permission === 'denied') this.status = 'blocked';
    else if (!this.relay()) this.status = 'no-relay';
    else this.status = (await this.sub().catch(() => null)) ? 'on' : 'off';
    return this.status;
  },

  // Must be called from a tap.
  async enable() {
    if (!this.supported()) throw new Error(this.isIOS() ? 'Add Daybook to your Home Screen first, then open it from there.' : 'This browser does not support notifications.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in iPhone Settings → Notifications → Daybook.');
    const relay = this.relay();
    if (!relay) throw new Error('Add your reminder relay address first.');
    const r = await fetch(relay + '/key').catch(() => null);
    if (!r || !r.ok) throw new Error('Could not reach the reminder relay. Check the address.');
    const { key } = await r.json();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && b64u(sub.options.applicationServerKey || new ArrayBuffer(0)) !== key) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) });
    S.push.lastHash = '';
    this.status = 'on';
    await this.sync(true);
  },

  async disable() {
    const sub = await this.sub();
    if (sub) {
      await this.post('/sync', sub, { items: [] }).catch(() => {});
      await sub.unsubscribe();
    }
    S.push.lastHash = '';
    save();
    this.status = 'off';
  },

  // What should fire, and when.
  plan() {
    const now = Date.now();
    const out = [];
    const lead0 = Number(S.settings.lead) || 0;
    for (const t of S.tasks) {
      if (t.done || !t.time) continue;
      const due = atMs(t.date, t.time);
      if (due <= now) continue;
      const lead = t.lead == null ? lead0 : Number(t.lead);
      let at = due - lead * 60000;
      let body = lead ? `At ${fmtTime(t.time)} · in ${lead} min` : `Now · ${fmtTime(t.time)}`;
      if (at <= now) {
        at = due;
        body = `Now · ${fmtTime(t.time)}`;
      }
      out.push({ id: t.id, at, title: t.title.slice(0, 160), body });
    }
    if (S.settings.nudge && S.settings.nudgeTime) {
      const today = todayYmd();
      for (let i = 0; i < 7; i++) {
        const d = addDays(today, i);
        const at = atMs(d, S.settings.nudgeTime);
        if (at <= now) continue;
        const open = i === 0 ? S.tasks.filter((t) => !t.done && t.date <= d).length : 0;
        const body = open ? `${open} ${open === 1 ? 'task is' : 'tasks are'} still open. Log your trackers and journal.` : 'Log your trackers and write a line about today.';
        out.push({ id: 'nudge-' + d, at, title: 'Evening check-in', body });
      }
    }
    return out.sort((a, b) => a.at - b.at).slice(0, 150);
  },

  async post(path, sub, extra) {
    const r = await fetch(this.relay() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: S.push.device, endpoint: sub.endpoint, pass: S.settings.pass || undefined, ...extra }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || 'The relay answered ' + r.status);
    return j;
  },

  async encrypt(sub, msg) {
    const bytes = new TextEncoder().encode(JSON.stringify(msg));
    return b64u(await encryptPush(new Uint8Array(sub.getKey('p256dh')), new Uint8Array(sub.getKey('auth')), bytes));
  },

  // Push the current plan to the relay. Returns how many reminders are set.
  async sync(force) {
    const plan = this.plan();
    this.count = plan.filter((p) => !p.id.startsWith('nudge-')).length;
    if ((await this.refresh()) !== 'on') return null;
    const sub = await this.sub();
    const hash = sub.endpoint.slice(-24) + JSON.stringify(plan);
    if (!force && hash === S.push.lastHash) return this.count;
    try {
      const items = [];
      for (const p of plan) items.push({ id: p.id, at: p.at, data: await this.encrypt(sub, { title: p.title, body: p.body, tag: p.id }) });
      await this.post('/sync', sub, { items });
      S.push.lastHash = hash;
      save();
      this.detail = '';
      return this.count;
    } catch (e) {
      this.status = 'error';
      this.detail = e.message;
      throw e;
    }
  },

  async test() {
    const sub = await this.sub();
    if (!sub) throw new Error('Turn reminders on first.');
    const data = await this.encrypt(sub, { title: 'Daybook', body: 'Reminders are working.', tag: 'test' });
    await this.post('/send', sub, { data });
  },
};

let _syncTimer = null;
function queueSync() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => Push.sync().catch(() => {}), 1200);
}
