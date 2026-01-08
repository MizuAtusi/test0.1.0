import { existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseDir = resolve(process.cwd(), 'node_modules', 'bcdice-js', 'lib');
const src = resolve(baseDir, 'BCDice.js');
const dst = resolve(baseDir, 'bcdice.js');
const srcMap = resolve(baseDir, 'BCDice.js.map');
const dstMap = resolve(baseDir, 'bcdice.js.map');

try {
  if (existsSync(src) && !existsSync(dst)) {
    copyFileSync(src, dst);
  }
  if (existsSync(srcMap) && !existsSync(dstMap)) {
    copyFileSync(srcMap, dstMap);
  }
} catch {
  // Ignore errors to avoid breaking install.
}
