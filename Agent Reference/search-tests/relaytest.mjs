// The inquiry relay (Agent Reference/inquiry-relay/Code.gs), run under node
// with the Apps Script services stubbed. Proves every refusal in the relay
// README before the script ever touches John's Google account.
//   node "Agent Reference/search-tests/relaytest.mjs"
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '../inquiry-relay/Code.gs'), 'utf8');
const failures = [];
function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name);
}

// A fresh Apps Script world per scenario.
function world({ quota = 100, props = {} } = {}) {
  const sent = [];
  const cache = new Map();
  const ctx = {
    sent,
    MailApp: { sendEmail: (o) => sent.push(o), getRemainingDailyQuota: () => quota },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@gmail.example' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }),
    },
    Date, JSON, String, Number,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const post = (payload) => JSON.parse(ctx.doPost({ postData: { contents: typeof payload === 'string' ? payload : JSON.stringify(payload) } }).body);
  return { ctx, sent, post };
}

const TEXT = "We're a six-person team building a teleoperation interface for warehouse robots. We have a working prototype but operators hate it.";
const good = (over = {}) => Object.assign({
  email: 'dana@example.com', name: 'Dana Reyes',
  subject: '[Inquiry · Design] MVP Design & Handoff · Example Robotics',
  body: 'Track: Design\n\nTheir words:\n> ' + TEXT + '\n\nComposed on johnhanacek.com/services.html',
  text: TEXT, page: 'services.html', elapsed: 42000, website: '',
}, over);

console.log('relay:');
{
  const w = world();
  const r = w.post(good());
  check('a real inquiry is sent', r.ok && r.sent && w.sent.length === 1);
  const m = w.sent[0];
  check('to the script owner, not the forwarded hi@ address', m.to === 'owner@gmail.example', m.to);
  check('Reply-To is the visitor', m.replyTo === 'dana@example.com');
  check('body carries their words and the relay line', m.body.includes('operators hate it') && /Relayed from johnhanacek\.com\/services\.html at /.test(m.body));
  const health = JSON.parse(w.ctx.doGet().body);
  check('GET answers a health check', health.ok === true);
}
{
  const w = world({ props: { TO: 'elsewhere@example.com' } });
  w.post(good());
  check('Script Property TO overrides the recipient', w.sent[0] && w.sent[0].to === 'elsewhere@example.com');
}
{
  const w = world();
  const hp = w.post(good({ website: 'http://spam.example' }));
  const fast = w.post(good({ elapsed: 800 }));
  const noTime = w.post(good({ elapsed: undefined }));
  check('honeypot: told ok, nothing sent', hp.ok && !hp.sent);
  check('too fast: told ok, nothing sent', fast.ok && !fast.sent && noTime.ok && !noTime.sent);
  check('bots got no email through', w.sent.length === 0, String(w.sent.length));
}
{
  const w = world();
  check('missing email refused', w.post(good({ email: '' })).error === 'email');
  check('malformed email refused', w.post(good({ email: 'dana@example' })).error === 'email');
  check('header-ish email refused', w.post(good({ email: 'a@b.com\nBcc: x@y.com' })).error === 'email');
  check('short paragraph refused', w.post(good({ text: 'hi there', body: '> hi there' })).error === 'short');
  check('huge paragraph refused', w.post(good({ text: 'x'.repeat(7000), body: 'x'.repeat(7000) })).error === 'long');
  check('body without their paragraph refused', w.post(good({ body: 'buy cheap watches' })).error === 'bad-request');
  check('garbage JSON refused', w.post('not json').error === 'bad-request');
  check('none of those sent anything', w.sent.length === 0, String(w.sent.length));
}
{
  const w = world();
  w.post(good({ subject: 'Hello\r\nBcc: victim@example.com' }));
  check('newlines stripped from the subject', w.sent[0] && !/[\r\n]/.test(w.sent[0].subject), w.sent[0] && w.sent[0].subject);
}
{
  const w = world();
  const rs = [1, 2, 3, 4].map(() => w.post(good()));
  check('3 per address per hour, the 4th refused', rs.slice(0, 3).every(r => r.sent) && rs[3].error === 'rate', rs.map(r => r.error || 'sent').join(','));
  const other = w.post(good({ email: 'someone@else.com' }));
  check('another address still gets through', other.sent === true);
}
{
  const w = world();
  let last;
  for (let i = 0; i < 31; i++) last = w.post(good({ email: `p${i}@example.com` }));
  check('30 per hour in total, the 31st refused', w.sent.length === 30 && last.error === 'rate', String(w.sent.length));
}
{
  const w = world({ quota: 0 });
  const r = w.post(good());
  check('Gmail quota spent: refused, nothing sent', r.error === 'quota' && w.sent.length === 0);
  const w2 = world({ quota: 0 });
  w2.post(good()); w2.ctx.MailApp.getRemainingDailyQuota = () => 5;
  check('a refused send does not eat the allowance', [1, 2, 3].every(() => w2.post(good()).sent));
}

if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log('\nALL PASS');
