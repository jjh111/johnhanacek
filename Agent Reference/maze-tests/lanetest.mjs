// Does build-resume.mjs refuse to publish the wrong person?
//
// A lane rewrites the summary and filters which highlights survive, and --apply writes the
// PUBLIC surfaces — the served PDF, Assets/john-hanacek-resume.md, the career chunks the site
// search answers from, john-hanacek.json, the about.html blocks, the nanome2/openprose figures.
// None of them carry the lane in their filename, so a lane build applied by muscle memory
// republished John as someone else with no trace. Two holes, both closed, both tested here:
//   - an unknown lane used to fall back to designEngineer silently
//   - --apply used to accept any lane
//
//   node "Agent Reference/maze-tests/lanetest.mjs"     → exits non-zero on any failure
//
// The guard decides at module top level, long before a browser launches, so "was it blocked?"
// is answered by whether the process dies in the first few seconds with a guard message on
// stderr. Accepted runs are killed as soon as we know they got past it — this suite never
// lets a real --apply reach the repo.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GUARD = /refusing to --apply|unknown lane/;

const run = (args) => new Promise((done) => {
  const p = spawn('node', ['scripts/build-resume.mjs', ...args], { cwd: ROOT });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  p.stdout.on('data', () => {});                       // a build that gets going is fine, we kill it
  const timer = setTimeout(() => { p.kill('SIGKILL'); done({ blocked: false, err, code: null }); }, 4000);
  p.on('exit', (code) => { clearTimeout(timer); done({ blocked: code === 1 && GUARD.test(err), err, code }); });
});

const CASES = [
  // [args,                                    mustBlock, why]
  [['--lane=xr', '--apply'],                   true,  'a non-default lane must not reach the public surfaces'],
  [['--lane=productDesigner', '--apply'],      true,  'every non-default lane, not just xr'],
  [['--lane=foundingDesigner', '--apply'],     true,  'every non-default lane, not just xr'],
  [['--lane=xrr'],                             true,  'a typo must be an error, never a silent designEngineer build'],
  [['--lane=DesignEngineer'],                  true,  'lane names are case-sensitive; near-misses must not pass'],
  [['--lane='],                                true,  'an empty lane must not pass'],
  [['--lane=$comment'],                        true,  'a JSON comment key is not a lane'],
  [['--lane=xr'],                              false, 'a valid lane WITHOUT --apply is the normal application build'],
  [['--lane=designEngineer', '--apply'],       false, 'the default lane is exactly what --apply is for'],
  [['--apply'],                                false, 'no --lane at all means the default lane'],
  [['--lane=xr', '--apply', '--force-lane'],   false, '--force-lane is the deliberate escape hatch'],
];

let failed = 0;
for (const [args, mustBlock, why] of CASES) {
  const r = await run(args);
  const ok = r.blocked === mustBlock;
  if (!ok) failed++;
  const verdict = r.blocked ? 'BLOCKED' : 'allowed';
  console.log(`${ok ? '  ✓' : '  ✗'} ${verdict.padEnd(8)} build-resume.mjs ${args.join(' ') || '(no args)'}`);
  if (!ok) console.log(`      expected ${mustBlock ? 'BLOCKED' : 'allowed'} — ${why}${r.err ? `\n      stderr: ${r.err.trim().split('\n')[0]}` : ''}`);
}
console.log(failed ? `\n${failed} of ${CASES.length} FAILED` : `\nall ${CASES.length} pass`);
process.exit(failed ? 1 : 0);
