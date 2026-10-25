import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function sourceFiles(dir) {
    const out = [];
    for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
        const rel = `${dir}${entry.name}`;
        if (entry.isDirectory()) out.push(...(await sourceFiles(`${rel}/`)));
        else if (/\.(mjs|js)$/u.test(entry.name)) out.push(rel);
    }
    return out;
}

/** Corpo do primeiro argumento de cada `toMessage(` / `ChatMessage.create(` (chaves balanceadas). */
function messageDataBlocks(source) {
    const blocks = [];
    const pattern = /(?:\.toMessage|ChatMessage(?:\.implementation)?\.create)\(\s*\{/gu;
    for (const match of source.matchAll(pattern)) {
        let depth = 1;
        let i = match.index + match[0].length;
        const start = i;
        while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            i += 1;
        }
        blocks.push(source.slice(start, i - 1));
    }
    return blocks;
}

describe('rolagens: visibilidade no padrão do v14', () => {
    it('nenhuma mensagem manda rollMode/messageMode dentro dos dados (o core descarta)', async () => {
        const files = [...(await sourceFiles('scripts/')), ...(await sourceFiles('macros/'))];
        const offenders = [];
        for (const file of files) {
            const source = await readFile(new URL(file, root), 'utf8');
            for (const block of messageDataBlocks(source)) {
                // Só o nível da própria chave: ignora objetos aninhados como flavor.
                const topLevel = block.replace(/\{[^{}]*\}/gu, '');
                if (/^\s*(?:rollMode|messageMode)\b/mu.test(topLevel)) offenders.push(file);
            }
        }
        assert.deepEqual([...new Set(offenders)], []);
    });

    it('nenhum arquivo lê a configuração depreciada core.rollMode', async () => {
        const files = [...(await sourceFiles('scripts/')), ...(await sourceFiles('macros/'))];
        for (const file of files) {
            const source = await readFile(new URL(file, root), 'utf8');
            assert.doesNotMatch(source, /['"]core['"],\s*['"]rollMode['"]/u, file);
        }
    });

    it('todo diálogo com seletor de visibilidade usa os modos v14 e abre no modo do chat', async () => {
        for (const file of [
            'scripts/dialogs/hit-dialog.mjs',
            'scripts/dialogs/roll-dialog.mjs',
            'scripts/dialogs/damage-dialog.mjs',
        ]) {
            const source = await readFile(new URL(file, root), 'utf8');
            assert.doesNotMatch(source, /<option value="publicroll"/u, file);
            assert.match(source, /messageModeOptionsHtml|core', 'messageMode'/u, file);
        }
    });

    it('cada serviço que rola com seletor passa options.messageMode', async () => {
        for (const file of [
            'scripts/hit-service.mjs',
            'scripts/roll-service.mjs',
            'scripts/damage-service.mjs',
            'scripts/breath-service.mjs',
            'scripts/dual-soul-awakening-resistance-service.mjs',
            'scripts/dual-soul-ceremony-service.mjs',
        ]) {
            const source = await readFile(new URL(file, root), 'utf8');
            assert.match(source, /\bmessageMode\b/u, file);
        }
    });
});
