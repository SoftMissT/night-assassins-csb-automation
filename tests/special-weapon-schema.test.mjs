import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    collectCsbFieldSchema,
    sanitizeSpecialWeaponProps,
    validateSpecialWeaponProps,
} from '../scripts/special-weapon-schema.mjs';
import { normalizeNormalWeaponProps } from '../scripts/weapon-catalog-normalization.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(root, 'src', 'templates', 'items', 'special-slayer-weapon-template.json');
const sourceDirectory = path.join(root, 'data', 'catalog-source', 'weapons', 'especiais');

async function loadTemplate() {
    return JSON.parse(await readFile(templatePath, 'utf8'));
}

async function loadSpecialSources() {
    const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.json')).sort();
    const documents = await Promise.all(
        files.map(async (file) => ({
            file,
            document: JSON.parse(await readFile(path.join(sourceDirectory, file), 'utf8')),
        }))
    );
    return documents.filter(
        ({ document }) =>
            document.type === 'equippableItem' &&
            String(document.system?.props?.arma_categoria ?? '').toLocaleLowerCase('pt-BR') ===
                'especial'
    );
}

test('template especial mantém Marcas do Demônio como numberField', async () => {
    const schema = collectCsbFieldSchema(await loadTemplate());
    assert.equal(schema.get('arma_marcas_demonio')?.type, 'numberField');
    assert.match(schema.get('arma_marcas_demonio_tabela_json')?.type ?? '', /^text(Field|Area)$/u);
});

test('todas as fontes especiais passam pelo contrato numérico do CSB', async () => {
    const schema = collectCsbFieldSchema(await loadTemplate());
    const sources = await loadSpecialSources();
    assert.equal(sources.length, 17);

    for (const { file, document } of sources) {
        const sanitized = sanitizeSpecialWeaponProps(
            normalizeNormalWeaponProps(document.system?.props ?? {}),
            schema
        );
        assert.deepEqual(
            validateSpecialWeaponProps(sanitized, schema),
            [],
            `${file} / ${document.name} possui numberField inválido`
        );
        for (const [key, component] of schema) {
            if (component.type !== 'numberField' || !Object.hasOwn(sanitized, key)) continue;
            assert.equal(typeof sanitized[key], 'number', `${document.name}: ${key}`);
            assert.ok(Number.isFinite(sanitized[key]), `${document.name}: ${key}`);
        }
    }
});

test('Yamato separa contador de Marcas da tabela de regras', async () => {
    const schema = collectCsbFieldSchema(await loadTemplate());
    const yamato = (await loadSpecialSources()).find(
        ({ document }) => document.name === "Yamato The Rift-Walker's Legacy"
    )?.document;
    assert.ok(yamato);
    const sanitized = sanitizeSpecialWeaponProps(
        normalizeNormalWeaponProps(yamato.system?.props ?? {}),
        schema
    );
    assert.equal(typeof sanitized.arma_marcas_demonio, 'number');
    assert.ok(Number.isFinite(sanitized.arma_marcas_demonio));
    assert.equal(typeof sanitized.arma_marcas_demonio_tabela_json, 'string');
    assert.ok(Object.keys(JSON.parse(sanitized.arma_marcas_demonio_tabela_json)).length > 0);
});

test('builder usa o sanitizer de armas especiais', async () => {
    const source = await readFile(path.join(root, 'tools', 'build-weapon-sources.mjs'), 'utf8');
    assert.match(source, /sanitizeSpecialWeaponProps/u);
    assert.match(source, /collectCsbFieldSchema/u);
});
