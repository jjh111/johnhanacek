// The suites were written for the cut's scenes in one order, the one below (the cut as of
// 2026-10-02). The shot list lets John put them in any order, and the saved script is his, so a
// suite puts a copy of it back in this order before it starts (ReelScript.moveScene: the same
// scenes, each with all its lines). What he changes inside a scene still reaches the suites; where
// he puts it does not. A scene of a kind not named here, or a second of a kind, is left after the
// ones that are. Order itself is tested on its own terms: ordertest.mjs plays the scenes in five
// other orders, and samefilmtest.mjs compares the film John saved, in his order.
//   import { inOrder } from './inorder.mjs';   inOrder(text) → text
import { createRequire } from 'node:module';

const RS = createRequire(import.meta.url)('../../scripts/reel-script.js');
export const ORDER = ['open', 'title', 'answer', 'art', 'command', 'results', 'feature', 'logos', 'quotes', 'offer', 'end'];

export function inOrder(src) {
  let k = 0;
  for (const type of ORDER) {
    const types = RS.parse(src).edit.scenes.map(s => s.type);
    const j = types.indexOf(type, k);
    if (j < 0) continue;
    if (j !== k) src = RS.moveScene(src, j, k);
    k++;
  }
  return src;
}
