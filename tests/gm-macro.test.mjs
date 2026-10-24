import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('launcher GM não depende do Canvas para abrir o painel documental', async () => {
    const source = await readFile(new URL('../macros/na-gm-control.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /canvas\.ready/u);
    assert.match(source, /game\.user\?\.isGM/u);
    assert.match(source, /api\?\.openGmDashboard/u);
});
