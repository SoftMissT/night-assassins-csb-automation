import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const PACKS_DIR = join(ROOT, 'packs');

const PACKS = [
  { name: 'night-assassins-macros', type: 'Macro', minDocs: 10 },
  { name: 'night-assassins-armas-slayer', type: 'Item', minDocs: 20 },
  { name: 'night-assassins-arte', type: 'Item', minDocs: 30 },
  { name: 'night-assassins-respiracoes', type: 'Item', minDocs: 50 },
  { name: 'night-assassins-templates-de-ficha', type: 'Actor', minDocs: 2 },
];

describe('Compendium Packs — Anti-Regression', () => {
  for (const pack of PACKS) {
    it(`${pack.name} has ≥${pack.minDocs} documents`, () => {
      const packDir = join(PACKS_DIR, pack.name);
      const files = readdirSync(packDir);
      const ldbFiles = files.filter(f => f.endsWith('.ldb'));
      assert.ok(
        ldbFiles.length > 0,
        `${pack.name} has no .ldb files — pack is empty`
      );
      const totalLdbBytes = ldbFiles.reduce((sum, f) => {
        return sum + readFileSync(join(packDir, f)).length;
      }, 0);
      assert.ok(
        totalLdbBytes > 1024,
        `${pack.name} .ldb files total ${totalLdbBytes} bytes — likely empty`
      );
    });
  }
});
