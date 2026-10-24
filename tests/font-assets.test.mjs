import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PACKAGE_ASSET_DIRS, PACKAGE_BUILD_ONLY } from '../tools/prepare-package-tree.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'styles', 'na-csb-automation.css'), 'utf8');
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

function fontFaces() {
    return [...cssNoComments.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => {
        const body = match[1];
        return {
            family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
            weight: Number(/font-weight:\s*(\d+)/.exec(body)?.[1]),
            display: /font-display:\s*(\w+)/.exec(body)?.[1],
            url: /url\('([^']+)'\)/.exec(body)?.[1],
        };
    });
}

function walk(dir) {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

test('CSS não depende de rede externa para fontes', () => {
    assert.doesNotMatch(cssNoComments, /@import/u, 'o @import bloqueia a primeira pintura e quebra offline');
    assert.doesNotMatch(cssNoComments, /url\(\s*['"]?https?:/iu);
});

test('cada @font-face aponta para um woff2 real empacotado, com font-display: swap', () => {
    const faces = fontFaces();
    assert.ok(faces.length >= 7, 'Orbitron (3 pesos) + Rajdhani (4 pesos)');
    for (const face of faces) {
        assert.equal(face.display, 'swap', `${face.family} ${face.weight}`);
        const file = path.resolve(root, 'styles', face.url);
        assert.ok(file.startsWith(path.join(root, 'assets', 'fonts')), `${face.url} fora de assets/fonts`);
        assert.ok(existsSync(file), `${face.url} não existe`);
        assert.equal(readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2', `${face.url} não é woff2`);
        assert.ok(statSync(file).size > 1000, `${face.url} suspeitosamente pequeno`);
    }
    const byFamily = (family) => faces.filter((face) => face.family === family).map((face) => face.weight).sort();
    assert.deepEqual(byFamily('Orbitron'), [600, 700, 800]);
    assert.deepEqual(byFamily('Rajdhani'), [400, 500, 600, 700]);
});

test('a licença OFL acompanha as fontes redistribuídas', () => {
    for (const license of ['OFL-Orbitron.txt', 'OFL-Rajdhani.txt']) {
        const text = readFileSync(path.join(root, 'assets', 'fonts', license), 'utf8');
        assert.match(text, /SIL OPEN FONT LICENSE Version 1\.1/u, license);
    }
});

test('o pacote leva as fontes e deixa de fora o catálogo que só o build lê', () => {
    assert.ok(PACKAGE_ASSET_DIRS.includes('fonts'));
    assert.ok(PACKAGE_ASSET_DIRS.includes('icons'));
    assert.ok(PACKAGE_BUILD_ONLY.includes('catalogs/breathing.json'));
    const workflow = readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.match(workflow, /assets\/fonts \\/u, 'o zip lista as pastas explicitamente');
    assert.match(workflow, /! unzip -Z1 module\.zip \| grep -qx "catalogs\/breathing\.json"/u);
});

test('nenhum arquivo de runtime depende de um arquivo excluído do pacote', () => {
    const runtimeFiles = ['scripts', 'macros'].flatMap((dir) => walk(path.join(root, dir)));
    for (const excluded of PACKAGE_BUILD_ONLY) {
        const name = path.basename(excluded);
        for (const file of runtimeFiles) {
            assert.ok(
                !readFileSync(file, 'utf8').includes(name),
                `${path.relative(root, file)} referencia ${name}, que não vai no pacote`
            );
        }
    }
});
