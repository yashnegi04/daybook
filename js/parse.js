// Turns a typed line like "i have a meet at 3 pm" into { title, date, time }.
function parseLine(raw, baseYmd, now = new Date()) {
  let s = ' ' + String(raw).trim() + ' ';
  let date = baseYmd;
  let time = null;
  const isToday = () => date === ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  s = s.replace(/\b(tomorrow|tmrw|tmr)\b/i, () => {
    date = addDays(baseYmd, 1);
    return ' ';
  });
  s = s.replace(/\btoday\b/i, ' ');

  // "in 20 min", "in 2 hours", "in an hour", "in half an hour"
  const rel = s.match(/\bin\s+(\d+(?:\.\d+)?|an?|half\s+an)\s*(minutes?|mins?|hours?|hrs?|h|m)\b/i);
  if (rel) {
    const q = rel[1].toLowerCase();
    const n = /^half/.test(q) ? 0.5 : /^an?$/.test(q) ? 1 : parseFloat(q);
    const mins = /^h/i.test(rel[2]) ? n * 60 : n;
    const at = new Date(now.getTime() + Math.round(mins) * 60000);
    date = ymd(at);
    time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    s = s.replace(rel[0], ' ');
  }

  // No am/pm given: 1-6 means afternoon, 7-11 means morning unless that has
  // already passed today, 12 means noon.
  const guess = (h, m) => {
    if (h === 0 || h > 12) return h;
    if (h === 12) return 12;
    if (h <= 6) return h + 12;
    if (isToday() && h * 60 + m <= nowMin) return h + 12;
    return h;
  };
  const withSuffix = (h, suf) => {
    const pm = /^p/i.test(suf);
    if (h === 12) return pm ? 12 : 0;
    return pm ? h + 12 : h;
  };
  const set = (h, m) => {
    if (h > 23 || m > 59) return false;
    time = `${pad(h)}:${pad(m)}`;
    return true;
  };
  const AP = '(a\\.?m\\.?|p\\.?m\\.?)';
  const PRE = '(?:(?:\\b(?:at|by|around|from)|@)\\s*)?';
  const tryRe = (re, fn) => {
    if (time) return;
    const m = s.match(re);
    if (m && fn(m)) s = s.replace(m[0], ' ');
  };
  // 3:30 pm / 3.30pm / 15:00
  tryRe(new RegExp(PRE + '\\b(\\d{1,2})[:.](\\d{2})\\s*' + AP + '(?![a-z])', 'i'), (m) => +m[1] >= 1 && +m[1] <= 12 && set(withSuffix(+m[1], m[3]), +m[2]));
  tryRe(new RegExp(PRE + '\\b(\\d{1,2}):(\\d{2})\\b', 'i'), (m) => set(guess(+m[1], +m[2]), +m[2]));
  // 3pm / 3 pm
  tryRe(new RegExp(PRE + '\\b(\\d{1,2})\\s*' + AP + '(?![a-z])', 'i'), (m) => +m[1] >= 1 && +m[1] <= 12 && set(withSuffix(+m[1], m[2]), 0));
  // noon / midnight
  tryRe(/(?:\b(?:at|by|around)\s+)?\bnoon\b/i, () => set(12, 0));
  // "at 3", "by 5" (a bare number only counts after "at", "by" or "@")
  tryRe(/(?:\b(?:at|by)|@)\s*(\d{1,2})\b(?!\s*(?:%|st\b|nd\b|rd\b|th\b|\/|-|\.\d))/i, (m) => +m[1] >= 1 && +m[1] <= 23 && set(guess(+m[1], 0), 0));

  let title = s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:and|also|then)\s+/i, '')
    .replace(/^(?:i\s+(?:have|need|want|got|gotta|should|must)(?:\s+to)?|i['’]?ve\s+got(?:\s+to)?|i['’]?ll|remind\s+me(?:\s+to)?|have\s+to|need\s+to|gotta)\s+/i, '')
    .replace(/^(?:an?|the)\s+(?=\S)/i, '')
    .replace(/\s+(?:at|by|around|from|on|@)$/i, '')
    .replace(/^[\s,.;:–-]+|[\s,;:–-]+$/g, '');
  if (!title) title = String(raw).trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title, date, time };
}

function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
const atMs = (date, time) => {
  const [h, m] = time.split(':').map(Number);
  const d = fromYmd(date);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
