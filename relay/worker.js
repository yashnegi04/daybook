// Daybook reminder relay — a Cloudflare Worker.
//
// What it stores: for each of your devices, a list of { time, encrypted blob }.
// The blob is encrypted on your phone for your phone, so this Worker cannot
// read your task text. At the due minute it forwards the blob to Apple's push
// service, which delivers it to the app.
//
// Needs: a KV namespace bound as  DB , and a Cron Trigger of  * * * * *
// Optional secret: PASSCODE (the app must then send the same passcode).

const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/];
const MAX_DEVICES = 4;
const MAX_ITEMS = 200;
const LATE_LIMIT = 6 * 3600e3; // never deliver a reminder more than 6h late

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const b64u = (buf) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const utf8 = (s) => new TextEncoder().encode(s);

async function vapid(env, origin) {
  let v = await env.DB.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = {
      jwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
      pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)),
      sub: origin || 'https://example.com',
    };
    await env.DB.put('vapid', JSON.stringify(v));
  }
  return v;
}

async function send(env, v, endpoint, data, ttl = 3600) {
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = (o) => b64u(utf8(JSON.stringify(o)));
  const unsigned =
    part({ typ: 'JWT', alg: 'ES256' }) +
    '.' +
    part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.CONTACT || v.sub });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned));
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${v.pub}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'high',
    },
    body: unb64u(data),
  });
}

function okEndpoint(e) {
  try {
    const u = new URL(e);
    return u.protocol === 'https:' && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

async function runDue(env) {
  const q = await env.DB.get('queue', 'json');
  if (!q || !q.devices) return { sent: 0 };
  const now = Date.now();
  const cursor = Math.max(Number(await env.DB.get('cursor')) || 0, now - LATE_LIMIT);
  const upTo = now + 5000;
  let sent = 0;
  let dirty = false;
  let v;
  for (const [id, d] of Object.entries(q.devices)) {
    for (const it of d.items || []) {
      if (it.at > cursor && it.at <= upTo) {
        v = v || (await vapid(env));
        let r = await send(env, v, d.endpoint, it.data).catch(() => null);
        if (!r || r.status >= 500) r = await send(env, v, d.endpoint, it.data).catch(() => null);
        sent++;
        if (r && (r.status === 404 || r.status === 410)) {
          delete q.devices[id]; // the phone unsubscribed
          dirty = true;
          break;
        }
      }
    }
  }
  if (sent) await env.DB.put('cursor', String(upTo));
  if (dirty) await env.DB.put('queue', JSON.stringify(q));
  return { sent };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.DB) return json({ error: 'KV namespace is not bound. Add a KV binding named DB.' }, 500);

    if (req.method === 'GET' && url.pathname === '/key') {
      const v = await vapid(env, url.origin);
      return json({ key: v.pub, locked: !!env.PASSCODE });
    }
    if (req.method === 'GET') return json({ ok: true, service: 'Daybook reminder relay' });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Bad JSON' }, 400);
    }
    if (env.PASSCODE && body.pass !== env.PASSCODE) return json({ error: 'Wrong passcode' }, 401);
    if (!okEndpoint(body.endpoint)) return json({ error: 'Unknown push endpoint' }, 400);

    if (url.pathname === '/send') {
      if (typeof body.data !== 'string' || body.data.length > 6000) return json({ error: 'Bad data' }, 400);
      const v = await vapid(env, url.origin);
      const r = await send(env, v, body.endpoint, body.data, 300);
      return json({ ok: r.ok, status: r.status, detail: r.ok ? '' : (await r.text()).slice(0, 300) }, r.ok ? 200 : 502);
    }

    if (url.pathname === '/sync') {
      const device = String(body.device || '');
      if (!/^[\w-]{8,64}$/.test(device)) return json({ error: 'Bad device id' }, 400);
      if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS) return json({ error: 'Bad items' }, 400);
      const now = Date.now();
      const items = [];
      for (const it of body.items) {
        if (!it || typeof it.data !== 'string' || it.data.length > 6000 || !Number.isFinite(it.at)) {
          return json({ error: 'Bad item' }, 400);
        }
        if (it.at > now - 60e3) items.push({ id: String(it.id || '').slice(0, 64), at: it.at, data: it.data });
      }
      const q = (await env.DB.get('queue', 'json')) || { devices: {} };
      q.devices[device] = { endpoint: body.endpoint, items, seen: now };
      const ids = Object.keys(q.devices).sort((a, b) => q.devices[b].seen - q.devices[a].seen);
      for (const id of ids.slice(MAX_DEVICES)) delete q.devices[id];
      await env.DB.put('queue', JSON.stringify(q));
      return json({ ok: true, scheduled: items.length });
    }
    return json({ error: 'Not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDue(env));
  },

  runDue, // exposed for tests
};
