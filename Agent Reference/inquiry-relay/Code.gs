/**
 * Inquiry relay for johnhanacek.com — a Google Apps Script web app.
 *
 * The site's inquiry composer (scripts/inquiry-core.js) POSTs a composed
 * message here; this script emails it to the Gmail account that owns the
 * script, with the visitor's address as Reply-To. Hitting Reply in Gmail
 * answers the visitor.
 *
 * WHY SEND TO THE OWNER'S GMAIL, NOT hi@johnhanacek.com: hi@ is a Namecheap
 * forward into that same Gmail. Gmail recognises a message you sent to
 * yourself through a forward and files it only under Sent, never Inbox.
 * Sending straight to the owner lands it in the Inbox. Override with a
 * Script Property TO if the mailbox ever moves.
 *
 * DEPLOY (John, once): see Agent Reference/inquiry-relay/README.md.
 * No secrets live in this file. It is public in the repo on purpose.
 *
 * Tested offline by Agent Reference/search-tests/relaytest.mjs, which runs
 * this file under node with the Apps Script services stubbed.
 */

var LIMITS = {
  text: 6000,            // their paragraph
  body: 9000,            // the composed message (brief + paragraph)
  field: 200,            // email, subject
  minComposeMs: 3000,    // a human takes longer than this between card and Send
  perEmailPerHour: 3,
  globalPerHour: 30,
};

// Run THIS once from the editor (function dropdown → authorize → Run). It
// uses exactly the permissions a send needs, so Google asks for them, and
// the Execution log proves they took: it prints today's remaining quota and
// the address inquiries will go to.
function authorize() {
  Logger.log('Mail quota left today: ' + MailApp.getRemainingDailyQuota()
    + ' · inquiries go to: ' + recipient_());
}

function doGet() {
  return json_({ ok: true, service: 'johnhanacek.com inquiry relay' });
}

function doPost(e) {
  var p;
  try {
    p = JSON.parse(e && e.postData && e.postData.contents || '');
  } catch (err) {
    return json_({ ok: false, error: 'bad-request' });
  }
  var v = validate_(p, Date.now());
  // A bot that trips the honeypot or the timing check is told "ok" and
  // nothing is sent: a refusal would teach it what to change.
  if (v.drop) return json_({ ok: true });
  if (!v.ok) return json_(v);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return json_({ ok: false, error: 'busy' });
  try {
    var lim = rateLimit_(v.email);
    if (!lim.ok) return json_(lim);
    if (MailApp.getRemainingDailyQuota() < 1) return json_({ ok: false, error: 'quota' });
    MailApp.sendEmail({
      to: recipient_(),
      replyTo: v.email,
      name: 'johnhanacek.com inquiry',
      subject: v.subject,
      body: v.body,
    });
    lim.commit();
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, sent: true });
}

function recipient_() {
  var to = PropertiesService.getScriptProperties().getProperty('TO');
  return to || Session.getEffectiveUser().getEmail();
}

var EMAIL_RE = /^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[A-Za-z]{2,}$/;

function validate_(p, now) {
  if (!p || typeof p !== 'object') return { ok: false, error: 'bad-request' };
  if (p.website) return { drop: true };                        // the hidden honeypot field
  if (typeof p.elapsed !== 'number' || p.elapsed < LIMITS.minComposeMs) return { drop: true };

  var email = String(p.email || '').trim();
  if (email.length > LIMITS.field || !EMAIL_RE.test(email)) return { ok: false, error: 'email' };

  var text = String(p.text || '');
  if (text.replace(/\s+/g, ' ').trim().length < 20) return { ok: false, error: 'short' };
  if (text.length > LIMITS.text) return { ok: false, error: 'long' };

  var body = String(p.body || '');
  if (body.length > LIMITS.body) return { ok: false, error: 'long' };
  // The relay carries messages the page composed: their paragraph must be in
  // the body it was composed into.
  var probe = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (body.replace(/\s+/g, ' ').indexOf(probe) === -1) return { ok: false, error: 'bad-request' };

  // Header safety: MailApp takes the subject as a value, but a newline in it
  // is still never wanted.
  var subject = String(p.subject || 'Inquiry').replace(/[\r\n]+/g, ' ').slice(0, LIMITS.field);
  var page = String(p.page || '').replace(/[^\w.\/-]/g, '').slice(0, 60);

  return {
    ok: true,
    email: email,
    subject: subject,
    body: body + '\n\nRelayed from johnhanacek.com/' + page + ' at ' + new Date(now).toISOString()
      + '. Reply to this email to answer ' + email + '.',
  };
}

// Counts are only committed after a send succeeds, so a failed send never
// eats a visitor's allowance.
function rateLimit_(email) {
  var cache = CacheService.getScriptCache();
  var ek = 'e:' + email.toLowerCase();
  var gk = 'g:all';
  var en = Number(cache.get(ek) || 0);
  var gn = Number(cache.get(gk) || 0);
  if (en >= LIMITS.perEmailPerHour || gn >= LIMITS.globalPerHour) {
    return { ok: false, error: 'rate' };
  }
  return {
    ok: true,
    commit: function () {
      cache.put(ek, String(en + 1), 3600);
      cache.put(gk, String(gn + 1), 3600);
    },
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
