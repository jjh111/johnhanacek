// One way to serve the repo to a headless browser, and one way to PROVE we are talking to it.
//
// Both render rigs (build-resume.mjs, render-media-kit.mjs) used to spawn
// `python3 -m http.server <hardcoded port>` with stdio ignored, wait 700ms, and start
// rendering. When something else already held that port — an agent worktree leaves servers
// running — the bind failed silently and the browser rendered THAT server's pages instead.
// On 2026-09-10 it printed a 404 page into Assets/JH_Resume_2026_onepage.pdf, which went
// live. Nothing downstream could catch it: an error page renders, paginates and screenshots
// exactly like a document.
//
//   const srv = await serveVerified(ROOT);
//   ... use srv.port ...
//   srv.stop();
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const free = port => new Promise(res => {
  const s = createServer();
  s.once('error', () => res(false));
  s.once('listening', () => s.close(() => res(true)));
  s.listen(port, '127.0.0.1');
});

/** Serve `root` on a port we own, verified by a sentinel only our own server can return. */
export async function serveVerified(root, { from = 4590, to = 4620 } = {}) {
  let port = 0;
  for (let p = from; p < to; p++) if (await free(p)) { port = p; break; }
  if (!port) throw new Error(`no free port in ${from}-${to - 1} — stale servers? \`lsof -nP -iTCP -sTCP:LISTEN | grep python\``);

  // A free port is not proof: something can grab it between the probe and the spawn, and a
  // foreign server would answer just as happily. So round-trip a token through HTTP.
  const token = `serve-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dir = resolve(root, '.local');
  const file = resolve(dir, '.serve-sentinel');
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, token);

  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const stop = () => { server.kill(); rmSync(file, { force: true }); };

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 100));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/.local/.serve-sentinel`);
      if (r.ok && (await r.text()).trim() === token) return { port, stop };
    } catch { /* not up yet */ }
  }
  stop();
  throw new Error(`port ${port} is not serving this repo — another server answered. Kill it and retry.`);
}
