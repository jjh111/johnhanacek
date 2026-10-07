// Google Fonts, one answer per URL: every page a run opens sets its words with the same files.
//
//   import { FONT_URLS, fontPin } from './font-pin.mjs';
//   const pin = fontPin({ dir });                 // dir optional: keep the answers for later runs
//   await ctx.route(FONT_URLS, pin.route);        // on every context that should agree
//
// Google does not always answer the same stylesheet URL with the same bytes: the reel's came back
// in two versions (18,372 and 16,893 bytes) within 5 runs of 20 (2026-10-07). Each browser
// context has its own cache and asks on its own, so two pages could set the same words with
// different files: the headline 1037.48 px wide in one and 1037.80 in the other, every glyph's
// edge up to 175 levels apart. That failed applytest's frame check in 9 runs of 20, and it
// reaches anything that compares two pages or two renders: a parallel render opens a context
// per chunk, and a test's references come from an earlier run.
//
// The first request for a URL is fetched (route.fetch(), so it carries the browser's own headers
// and goes where the page's would) and its answer is given to every page after it. With `dir`,
// answers are kept on disk too (one .json and one .bin per URL) and read back first, so separate
// runs agree; the reel's suites keep theirs in .local/reel-tests/fonts/. A URL that cannot be
// fetched and is not kept is refused: a page in fallback fonts is never compared as if it were
// the real thing (the renderer refuses to film one).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const FONT_URLS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

// Headers that describe the bytes as they came over the wire, not the body route.fetch() hands
// back (decoded), so they are not passed on.
const WIRE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive']);

export function fontPin({ dir } = {}) {
  const answers = new Map();                     // url → Promise of { status, headers, body } or null
  const fetched = new Map();                     // url → number of fetches made (one, normally)
  const files = url => { const k = createHash('sha1').update(url).digest('hex').slice(0, 16); return [join(dir, k + '.json'), join(dir, k + '.bin')]; };
  const kept = url => {
    if (!dir) return null;
    const [meta, bin] = files(url);
    if (!existsSync(meta) || !existsSync(bin)) return null;
    const m = JSON.parse(readFileSync(meta, 'utf8'));
    return m.url === url ? { status: m.status, headers: m.headers, body: readFileSync(bin) } : null;
  };
  const keep = (url, a) => {
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    const [meta, bin] = files(url);
    writeFileSync(bin, a.body);
    writeFileSync(meta, JSON.stringify({ url, status: a.status, headers: a.headers, keptAt: new Date().toISOString() }, null, 1));
  };
  const answerFor = (url, route) => {
    if (!answers.has(url)) answers.set(url, (async () => {
      const k = kept(url);
      if (k) return k;
      fetched.set(url, (fetched.get(url) || 0) + 1);
      const got = await route.fetch().catch(() => null);
      if (!got || !got.ok()) { answers.delete(url); return null; }   // the next request asks again
      const headers = Object.fromEntries(Object.entries(got.headers()).filter(([h]) => !WIRE.has(h.toLowerCase())));
      const a = { status: got.status(), headers, body: await got.body() };
      keep(url, a);
      return a;
    })());
    return answers.get(url);
  };
  return {
    route: async route => {
      const a = await answerFor(route.request().url(), route);
      return a ? route.fulfill(a) : route.abort();
    },
    // how many URLs were answered, and how many of them came off the network this run
    count: () => ({ urls: answers.size, fetched: fetched.size }),
  };
}
