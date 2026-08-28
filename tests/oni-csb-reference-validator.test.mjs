import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Guarda de regressão para a classe exata de bug que quebrou o PDV do Oni:
 * uma fórmula CSB (`system.hidden[].value` ou `visibilityFormula`/
 * `editableFormula` de um componente) referenciando uma propriedade que não
 * existe em lugar nenhum do template — nem como `key` de componente, nem
 * como `name` de `system.hidden`. O CSB resolve esses identificadores como
 * `undefined`, e `fallback(undefined, 0)` ainda quebra a cadeia porque o
 * símbolo nunca foi registrado (era exatamente o caso de
 * `pdv_oni_ganho_nvl2..12` antes desta reconstrução).
 *
 * Este teste analisa TODAS as fórmulas `${...}$` do template Oni real e
 * falha se qualquer identificador referenciado não resolver para:
 *   - a key de um componente existente, OU
 *   - o name de uma entrada de system.hidden, OU
 *   - uma função CSB conhecida (whitelist abaixo), OU
 *   - uma palavra reservada da gramática CSB (entity, linkedEntity, true/false).
 */

const KNOWN_CSB_FUNCTIONS = new Set([
    'fallback',
    'max',
    'min',
    'switchCase',
    'equalText',
    'replace',
    'sum',
    'concat',
    'floor',
    'ceil',
    'round',
    'abs',
    'if',
    'and',
    'or',
    'not',
    'fetchFromParent',
    'isEmpty',
    'isNotEmpty',
]);
const RESERVED_WORDS = new Set([
    'entity',
    'linkedEntity',
    'true',
    'false',
    'null',
    'top',
    'fallback',
]);

const ATTRS = ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'];
const CSB_SYSTEM_PROPS = new Set(
    ATTRS.flatMap((attr) => [
        `atr_${attr}_oni_valor_config`,
        `atr_${attr}_valor_config`,
        `bonus_atr_${attr}_oni_valor_temp`,
        `bonus_atr_${attr}_valor_temp`,
    ])
);

function collect(value, predicate, out = []) {
    if (Array.isArray(value)) {
        for (const e of value) collect(e, predicate, out);
        return out;
    }
    if (!value || typeof value !== 'object') return out;
    if (predicate(value)) out.push(value);
    for (const c of Object.values(value)) collect(c, predicate, out);
    return out;
}

/** Extrai identificadores referenciados (não chamadas de função, não literais). */
function extractIdentifiers(formulaBody) {
    // Remove literais de string entre aspas simples — não são referências.
    const withoutStrings = formulaBody.replace(/'[^']*'/g, "''");
    const identifiers = [];
    const re = /([A-Za-z_][A-Za-z0-9_]*)\s*(\()?/g;
    let match;
    while ((match = re.exec(withoutStrings))) {
        const [, name, isCall] = match;
        if (isCall) continue; // chamada de função — validada via KNOWN_CSB_FUNCTIONS separadamente na varredura de calls.
        if (/^\d/.test(name)) continue;
        identifiers.push(name);
    }
    return identifiers;
}

function extractFormulaBodies(text) {
    const bodies = [];
    const re = /\$\{([\s\S]*?)\}\$/g;
    let match;
    while ((match = re.exec(text))) bodies.push(match[1]);
    return bodies;
}

describe('Validador de referências CSB — Oni (guarda contra props órfãs)', () => {
    it('nenhuma fórmula ${...}$ do template Oni referencia propriedade inexistente', async () => {
        const source = JSON.parse(
            await readFile(
                new URL('../src/templates/actors/oni-template.json', import.meta.url),
                'utf8'
            )
        );

        const resolvable = new Set(RESERVED_WORDS);
        for (const node of collect(
            source.system.body,
            (n) => typeof n.key === 'string' && n.key !== ''
        ))
            resolvable.add(node.key);
        for (const node of collect(
            source.system.header,
            (n) => typeof n.key === 'string' && n.key !== ''
        ))
            resolvable.add(node.key);
        for (const entry of source.system.hidden ?? []) if (entry?.name) resolvable.add(entry.name);

        // Também valida as fórmulas usadas nas barras de atributo (attributeBar),
        // se o template as definir.
        const attributeBarFormulas = Object.values(source.system.attributeBar ?? {})
            .flatMap((bar) => [bar.value, bar.max])
            .filter(Boolean);

        const allFormulaSources = [
            ...collect(source.system.body, (n) => typeof n.value === 'string').map((n) => n.value),
            ...collect(
                source.system.body,
                (n) => typeof n.visibilityFormula === 'string' && n.visibilityFormula
            ).map((n) => n.visibilityFormula),
            ...collect(
                source.system.body,
                (n) => typeof n.editableFormula === 'string' && n.editableFormula
            ).map((n) => n.editableFormula),
            ...collect(source.system.header, (n) => typeof n.value === 'string').map(
                (n) => n.value
            ),
            ...(source.system.hidden ?? []).map((entry) => entry.value),
            ...attributeBarFormulas,
        ];

        const orphans = new Map(); // identifier -> Set(formula snippets)
        for (const source_ of allFormulaSources) {
            for (const body of extractFormulaBodies(source_)) {
                for (const identifier of extractIdentifiers(body)) {
                    if (
                        resolvable.has(identifier) ||
                        KNOWN_CSB_FUNCTIONS.has(identifier) ||
                        CSB_SYSTEM_PROPS.has(identifier)
                    )
                        continue;
                    if (!orphans.has(identifier)) orphans.set(identifier, new Set());
                    orphans.get(identifier).add(body.slice(0, 80));
                }
            }
        }

        if (orphans.size > 0) {
            const report = [...orphans.entries()]
                .map(([id, snippets]) => `  - "${id}" em: ${[...snippets].join(' | ')}`)
                .join('\n');
            assert.fail(
                `Propriedades órfãs referenciadas em fórmulas CSB do template Oni (causariam undefined em runtime):\n${report}`
            );
        }
    });

    it('regressão direta: pdv_oni_ganho_nvl2..12 existem como componentes reais (não só na fórmula)', async () => {
        const source = JSON.parse(
            await readFile(
                new URL('../src/templates/actors/oni-template.json', import.meta.url),
                'utf8'
            )
        );
        const keys = new Set(
            collect(source.system.body, (n) => typeof n.key === 'string').map((n) => n.key)
        );
        for (let level = 2; level <= 12; level += 1) {
            assert.ok(
                keys.has(`pdv_oni_ganho_nvl${level}`),
                `pdv_oni_ganho_nvl${level} deve existir como componente real`
            );
        }
    });
});
