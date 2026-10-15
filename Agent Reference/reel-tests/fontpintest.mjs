// The font pin (scripts/font-pin.mjs) in node, with stand-in routes, no browser:
//   node "Agent Reference/reel-tests/fontpintest.mjs"
//   1. a server that answers the same URL two ways: every page after the first gets the first answer
//   2. requests that arrive together make one fetch
//   3. with a folder, a second pin (another run) answers from it without fetching
//   4. a failed fetch is refused (abort), and the next request asks again
//   5. headers that describe the wire (content-encoding, content-length) are not passed on
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FONT_URLS, fontPin } from '../../scripts/font-pin.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const CSS = 'https://fonts.googleapis.com/css2?family=Raleway:wght@300&display=swap';

// a stand-in for Playwright's Route: route.fetch() answers from `answers` in turn
function server(answers) {
  let n = 0;
  const s = { fetches: 0, fail: false };
  s.route = url => {
    const r = { fulfilled: null, aborted: false };
    r.request = () => ({ url: () => url });
    r.fetch = async () => {
      s.fetches++;
      await new Promise(res => setTimeout(res, 5));
      if (s.fail) throw new Error('offline');
      const body = Buffer.from(answers[n++ % answers.length]);
      return { ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'text/css', 'content-encoding': 'gzip', 'content-length': '999', 'access-control-allow-origin': '*' }), body: async () => body };
    };
    r.fulfill = a => { r.fulfilled = a; };
    r.abort = () => { r.aborted = true; };
    return r;
  };
  return s;
}

ok(FONT_URLS.test(CSS) && FONT_URLS.test('https://fonts.gstatic.com/s/raleway/v37/x.woff2') && !FONT_URLS.test('http://127.0.0.1:4590/Assets/x.css'), 'the pin takes Google Fonts and nothing else');

// 1 and 5
{
  const s = server(['version A', 'version B']), pin = fontPin();
  const r1 = s.route(CSS), r2 = s.route(CSS), r3 = s.route(CSS);
  await pin.route(r1); await pin.route(r2); await pin.route(r3);
  const bodies = [r1, r2, r3].map(r => r.fulfilled && r.fulfilled.body.toString());
  ok(bodies.every(b => b === 'version A'), `three pages, one answer, though the server answers two ways (${bodies.join(' / ')})`);
  ok(s.fetches === 1, `one fetch for three pages (${s.fetches})`);
  const h = r1.fulfilled.headers;
  ok(!('content-encoding' in h) && !('content-length' in h) && h['content-type'] === 'text/css' && h['access-control-allow-origin'] === '*',
    'the wire headers are left out, the rest kept: ' + Object.keys(h).join(', '));
}
// 2
{
  const s = server(['version A', 'version B']), pin = fontPin();
  const rs = [1, 2, 3, 4].map(() => s.route(CSS));
  await Promise.all(rs.map(r => pin.route(r)));
  ok(s.fetches === 1 && rs.every(r => r.fulfilled && r.fulfilled.body.toString() === 'version A'), `four requests at once make one fetch (${s.fetches}) and get one answer`);
}
// 3
{
  const dir = mkdtempSync(join(tmpdir(), 'fontpin-'));
  try {
    const s1 = server(['version A']), first = fontPin({ dir });
    const a = s1.route(CSS); await first.route(a);
    ok(readdirSync(dir).length === 2, `the answer is kept in the folder (${readdirSync(dir).join(', ')})`);
    const s2 = server(['version B']), second = fontPin({ dir });
    const b = s2.route(CSS); await second.route(b);
    ok(s2.fetches === 0 && b.fulfilled && b.fulfilled.body.toString() === 'version A', `a later run answers from the folder without fetching (${s2.fetches} fetches, "${b.fulfilled && b.fulfilled.body}")`);
    ok(second.count().urls === 1 && second.count().fetched === 0, `and counts it as kept, not fetched (${JSON.stringify(second.count())})`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
// 4
{
  const s = server(['version A']), pin = fontPin();
  s.fail = true;
  const r1 = s.route(CSS); await pin.route(r1);
  ok(r1.aborted && !r1.fulfilled, 'a fetch that fails is refused, not answered with nothing');
  s.fail = false;
  const r2 = s.route(CSS); await pin.route(r2);
  ok(r2.fulfilled && r2.fulfilled.body.toString() === 'version A' && s.fetches === 2, `and the next request asks again (${s.fetches} fetches)`);
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
