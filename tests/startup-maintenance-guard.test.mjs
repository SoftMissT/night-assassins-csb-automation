import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
const oniEngineSource = await readFile(
    new URL('../scripts/oni/progression-engine.mjs', import.meta.url),
    'utf8'
);

test('ready não executa reparos mundiais e mantém somente a sincronização de macros', () => {
    const readyBody = mainSource.slice(
        mainSource.indexOf("Hooks.once('ready'"),
        mainSource.indexOf('/**\n * Diagnostica um Actor')
    );

    assert.doesNotMatch(readyBody, /await\s+repairOniActors\s*\(/);
    assert.doesNotMatch(readyBody, /void\s+repairSlayerWeaponItems\s*\(/);
    assert.doesNotMatch(readyBody, /void\s+repairBreathingItems\s*\(/);
    assert.match(readyBody, /void\s+syncCanonicalMacros\s*\(/);
});

test('engine Oni não registra catch-up no ready', () => {
    const registrationBody = oniEngineSource.slice(
        oniEngineSource.indexOf('export function registerOniProgressionEngine'),
        oniEngineSource.indexOf('}', oniEngineSource.indexOf('export function registerOniProgressionEngine')) + 1
    );

    assert.doesNotMatch(registrationBody, /Hooks\.once\s*\(\s*['"]ready['"]/);
    assert.match(registrationBody, /Hooks\.on\s*\(\s*['"]updateActor['"]/);
    assert.match(registrationBody, /Hooks\.on\s*\(\s*['"]createActor['"]/);
});
