import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Contrato dos bônus estáticos dos Dons do Sangue no template Slayer.
 *
 * Fonte da regra: `docs/Habilidades Especiais.md` (cópia do projeto, com a anotação do
 * operador no Tsuyoi: "nvl 1 ao 5 = +2 PDV máximo por nível; nvl 6 a 12 = +3").
 * O cálculo vive só nas fórmulas `hidden` do CSB; sem este teste ninguém notaria um
 * nível do dropdown `nvl_pj` caindo no `default` do `switchCase` e zerando o bônus.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(repoRoot, ...parts), 'utf8'));

const official = read('src', 'templates', 'actors', 'slayer-template.json');
const csbImport = read('src', 'imports', 'csb-import-slayer-template.json');

const TEMPLATES = [
    ['src/templates/actors/slayer-template.json', official.system],
    ['src/imports/csb-import-slayer-template.json', csbImport.actors[0].data],
];

// --- avaliador mínimo de fórmulas CSB: switchCase, equalText, ?:, + - * / ---------------------

function tokenize(source) {
    const tokens = [];
    const re = /\s*(?:(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|([A-Za-z_]\w*)|(\?|:|\+|-|\*|\/|\(|\)|,))/gy;
    let m;
    let last = 0;
    while (last < source.length && (m = re.exec(source))) {
        last = re.lastIndex;
        if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) });
        else if (m[2] !== undefined) tokens.push({ t: 'str', v: m[2] });
        else if (m[3] !== undefined) tokens.push({ t: 'id', v: m[3] });
        else tokens.push({ t: 'op', v: m[4] });
    }
    if (source.slice(last).trim() !== '') throw new Error(`token inesperado em: ${source.slice(last, last + 20)}`);
    return tokens;
}

function evaluate(formula, env) {
    const wrapped = /^\$\{([\s\S]*)\}\$$/.exec(String(formula).trim());
    assert.ok(wrapped, `fórmula fora do padrão \${...}$: ${String(formula).slice(0, 60)}`);
    const tokens = tokenize(wrapped[1]);
    let i = 0;
    const peek = () => tokens[i];
    const take = (v) => {
        const tok = tokens[i++];
        if (v !== undefined) assert.equal(tok?.v, v, `esperava "${v}"`);
        return tok;
    };
    const FUNCS = {
        switchCase: ([value, ...rest]) => {
            const fallback = rest.length % 2 === 1 ? rest.at(-1) : 0;
            for (let k = 0; k + 1 < rest.length; k += 2) if (rest[k] === value) return rest[k + 1];
            return fallback;
        },
        equalText: ([a, b]) => String(a) === String(b),
    };
    function ternary() {
        const cond = additive();
        if (peek()?.v === '?') {
            take('?');
            const a = ternary();
            take(':');
            const b = ternary();
            return cond ? a : b;
        }
        return cond;
    }
    function additive() {
        let value = multiplicative();
        while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) {
            const op = take().v;
            const right = multiplicative();
            value = op === '+' ? value + right : value - right;
        }
        return value;
    }
    function multiplicative() {
        let value = factor();
        while (peek()?.t === 'op' && (peek().v === '*' || peek().v === '/')) {
            const op = take().v;
            const right = factor();
            value = op === '*' ? value * right : value / right;
        }
        return value;
    }
    function factor() {
        const tok = take();
        if (tok.t === 'num' || tok.t === 'str') return tok.v;
        if (tok.t === 'op' && tok.v === '(') {
            const value = ternary();
            take(')');
            return value;
        }
        if (tok.t === 'id') {
            if (peek()?.v === '(') {
                take('(');
                const args = [];
                if (peek()?.v !== ')') {
                    do args.push(ternary());
                    while (peek()?.v === ',' && take(','));
                }
                take(')');
                assert.ok(FUNCS[tok.v], `função CSB sem suporte no teste: ${tok.v}`);
                return FUNCS[tok.v](args);
            }
            assert.ok(tok.v in env, `variável sem valor no teste: ${tok.v}`);
            return env[tok.v];
        }
        throw new Error(`token inesperado: ${JSON.stringify(tok)}`);
    }
    const result = ternary();
    assert.equal(i, tokens.length, 'sobrou texto depois da fórmula');
    return typeof result === 'boolean' ? Number(result) : result;
}

function findByKey(node, key) {
    if (!node || typeof node !== 'object') return null;
    if (node.key === key) return node;
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
        const found = findByKey(child, key);
        if (found) return found;
    }
    return null;
}

const GIFTS = {
    sem: 'hab_escolhida_sem',
    tato: 'hab_escolhida_tato',
    visao: 'hab_escolhida_visao',
    tsuyoi: 'hab_escolhida_tsuyoi',
    marechi: 'hab_escolhida_marechi',
    oketsu: 'hab_escolhida_oketsu',
};

for (const [label, system] of TEMPLATES) {
    const hidden = new Map(system.hidden.map((entry) => [entry.name, entry.value]));
    const levels = findByKey(system, 'nvl_pj').options.map((option) => option.key ?? option.value);
    const compute = (name, gift, level) =>
        evaluate(hidden.get(name), { hab_escolhida: gift, nvl_pj: level });
    const playable = levels.filter((level) => level !== 'nvl_0');

    test(`[${label}] o dropdown de nível vai de nvl_0 a nvl_14 (o teste cobre todas as opções)`, () => {
        assert.deepEqual(levels, Array.from({ length: 15 }, (_, n) => `nvl_${n}`));
    });

    test(`[${label}] Tsuyoi: +2 PDV/nível do 1 ao 5 e +3 do 6 em diante, sem buraco em nenhum nível`, () => {
        for (const level of playable) {
            const n = Number(level.replace('nvl_', ''));
            const expected = n <= 5 ? 2 : 3; // 6–12: doc do projeto; 13–14: segue o último patamar
            assert.equal(compute('hab_slayer_pdv_bonus', GIFTS.tsuyoi, level), expected, `${level}`);
        }
        assert.equal(compute('hab_slayer_pdv_bonus', GIFTS.tsuyoi, 'nvl_0'), 0);
    });

    test(`[${label}] Tsuyoi: VIT +1 e FOR +1 permanentes; outros Dons não ganham PDV`, () => {
        for (const name of ['hab_tsuyoi_vit_bonus', 'hab_tsuyoi_for_bonus']) {
            assert.equal(compute(name, GIFTS.tsuyoi, 'nvl_1'), 1, name);
            assert.equal(compute(name, GIFTS.marechi, 'nvl_1'), 0, name);
        }
        for (const gift of Object.values(GIFTS).filter((key) => key !== GIFTS.tsuyoi)) {
            for (const level of levels) assert.equal(compute('hab_slayer_pdv_bonus', gift, level), 0, `${gift} ${level}`);
        }
    });

    test(`[${label}] Tato Sensitivo: Bloqueio +2/+3 e Esquiva +1/+2 (nível 6), sem buraco até o 14`, () => {
        for (const level of playable) {
            const n = Number(level.replace('nvl_', ''));
            assert.equal(compute('hab_bloqueio_bonus', GIFTS.tato, level), n <= 5 ? 2 : 3, `bloqueio ${level}`);
            assert.equal(compute('hab_esquiva_bonus', GIFTS.tato, level), n <= 5 ? 1 : 2, `esquiva ${level}`);
            assert.equal(compute('hab_bloqueio_bonus', GIFTS.sem, level), 0, `bloqueio sem dom ${level}`);
        }
    });

    test(`[${label}] Visão Aguçada: +1 Acerto e +1 Esquiva do nível 1 ao 14`, () => {
        for (const level of playable) {
            assert.equal(compute('hab_acerto_bonus', GIFTS.visao, level), 1, `acerto ${level}`);
            assert.equal(compute('hab_esquiva_bonus', GIFTS.visao, level), 1, `esquiva ${level}`);
        }
    });

    test(`[${label}] Marechi +1 PDR/nível e Ōketsu +2 PDR/nível; os dois campos de PDR concordam`, () => {
        for (const level of playable) {
            for (const name of ['hab_slayer_pdr_por_nivel', 'hab_slayer_pdr_bonus']) {
                assert.equal(compute(name, GIFTS.marechi, level), 1, `${name} marechi ${level}`);
                assert.equal(compute(name, GIFTS.oketsu, level), 2, `${name} oketsu ${level}`);
                assert.equal(compute(name, GIFTS.tsuyoi, level), 0, `${name} tsuyoi ${level}`);
            }
        }
    });
}

test('as duas cópias do template têm exatamente as mesmas fórmulas de Dons', () => {
    const names = [
        'hab_slayer_pdv_bonus', 'hab_slayer_pdr_por_nivel', 'hab_slayer_pdr_bonus', 'hab_acerto_bonus',
        'hab_bloqueio_bonus', 'hab_esquiva_bonus', 'hab_tsuyoi_vit_bonus', 'hab_tsuyoi_for_bonus',
    ];
    const [[, a], [, b]] = TEMPLATES;
    const value = (system, name) => system.hidden.find((entry) => entry.name === name)?.value;
    for (const name of names) {
        assert.ok(value(a, name), `${name} ausente em slayer-template.json`);
        assert.equal(value(a, name), value(b, name), `${name} divergiu entre template e pacote de importação`);
    }
});

test('avaliador de fórmulas do teste: controle negativo (default do switchCase vale 0)', () => {
    assert.equal(evaluate("${switchCase(x, 'a', 5, 0)}$", { x: 'a' }), 5);
    assert.equal(evaluate("${switchCase(x, 'a', 5, 0)}$", { x: 'z' }), 0);
    assert.equal(evaluate("${equalText(x, 'a') ? 1 : 0}$", { x: 'a' }), 1);
    assert.equal(evaluate("${switchCase(x, 'a', 1, 0) * switchCase(y, 'k', 3, 0)}$", { x: 'a', y: 'k' }), 3);
});
