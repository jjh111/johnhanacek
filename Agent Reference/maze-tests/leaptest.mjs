import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:1337/design.html', { waitUntil:'load', timeout:30000 });
await p.waitForFunction(() => window.designFish, null, { timeout: 15000 });
await p.waitForTimeout(600);

const res = await p.evaluate(async (TRIALS) => {
  const g = window.designFish;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const H = window.innerHeight, W = window.innerWidth;
  const out = [];
  for (let t = 0; t < TRIALS; t++) {
    g.clearFish(); g.setObstacles([]); await sleep(80);
    const wallX = Math.round(W * 0.52), fishX = wallX - 70, foodX = wallX + 150, y = Math.round(H * 0.5);
    // A wall from top to bottom: no route around it at any size. This is the
    // case that makes a fish slide, press, and finally write the pellet off.
    g.setObstacles([{ id: 1, x: wallX, y: H + 40, width: 34, height: H + 80 }]);
    const pts = [];
    for (let a = 0.6; a <= Math.PI*2 + 1.4; a += 0.18)
      pts.push({ x: fishX + Math.cos(a)*34, y: y + Math.sin(a)*34*0.72 });
    g.processStroke(pts, ['fish']);
    await sleep(80);
    const fish = g.state.fish;
    if (!fish.length) return [{ err: 'no fish spawned' }];
    const f = fish[fish.length - 1];
    f.x = fishX; f.y = y;
    f.heading = t % 2 ? Math.PI/2 : -Math.PI/2;      // pointing ALONG the wall
    f.committedHeading = f.heading; f.targetHeading = f.heading;
    g.addFood(foodX, y);
    await sleep(4000);                                // slide, press, give up
    const gaveUp = !!(f.ignoredFood && Object.values(f.ignoredFood).some(v => v > Date.now()));
    const slid = !!(f.lastWallContact && Date.now() - f.lastWallContact < 1500);
    const fd0 = g.state.food[0];
    const d0 = fd0 ? Math.hypot(fd0.x - f.x, fd0.y - f.y) : 0;
    g.setObstacles([]);                               // ERASE the wall
    await sleep(150);
    const fd = g.state.food[0];
    const toFood = fd ? Math.atan2(fd.y - f.y, fd.x - f.x) : 0;
    const hErr = fd ? Math.abs(Math.atan2(Math.sin(toFood - f.heading), Math.cos(toFood - f.heading))) : 0;
    const vAng = Math.atan2(f.vy, f.vx);
    const vErr = fd ? Math.abs(Math.atan2(Math.sin(toFood - vAng), Math.cos(toFood - vAng))) : 0;
    const leapt = !!(f.navLeapUntil && f.navLeapUntil > Date.now());
    await sleep(2500);
    const fd2 = g.state.food[0];
    const d1 = fd2 ? Math.hypot(fd2.x - f.x, fd2.y - f.y) : 0;
    out.push({ ate: !fd2, d0: Math.round(d0), d1: Math.round(d1), closed: Math.round(d0 - d1),
      gaveUp, slid, leapt,
      hErr: Math.round(hErr*180/Math.PI), vErr: Math.round(vErr*180/Math.PI) });
  }
  return out;
}, 12);

if (res[0] && res[0].err) { console.log('ERR', res[0].err); await b.close(); process.exit(1); }
console.log('trial  ate   slid gaveUp leapt   d0   d1  closed  hErr vErr');
res.forEach((r,i)=>console.log(
  `${String(i).padEnd(6)} ${String(r.ate).padEnd(5)} ${String(r.slid).padEnd(5)} ${String(r.gaveUp).padEnd(6)} ${String(r.leapt).padEnd(6)} ${String(r.d0).padStart(4)} ${String(r.d1).padStart(4)} ${String(r.closed).padStart(6)}  ${String(r.hErr).padStart(4)} ${String(r.vErr).padStart(4)}`));
const ate = res.filter(r=>r.ate).length;
const away = res.filter(r=>r.closed < 0).length;
const gave = res.filter(r=>r.gaveUp).length;
console.log(`\nate: ${ate}/${res.length}   moved AWAY after erase: ${away}/${res.length}   had given up: ${gave}/${res.length}`);
const med = a => a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
console.log(`median closed: ${med(res.map(r=>r.closed))}px   median heading err: ${med(res.map(r=>r.hErr))}°   median velocity err: ${med(res.map(r=>r.vErr))}°`);
await b.close();
