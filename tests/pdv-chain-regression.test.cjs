const fs = require('fs');
const assert = require('assert');

const src = JSON.parse(fs.readFileSync('src/templates/actors/oni-template.json', 'utf8'));

function collectLevelFormulas(prefix) {
    const formulas = new Map();
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (typeof node.key === 'string' && new RegExp(`^${prefix}\\d+$`).test(node.key)) {
            formulas.set(Number(node.key.match(/\d+$/)[0]), String(node.value ?? ''));
        }
        for (const value of Object.values(node)) walk(value);
    }
    walk(src.system);
    return formulas;
}

const pdv = collectLevelFormulas('pdv_oni_nvl');
const pdk = collectLevelFormulas('pdk_oni_nvl');
assert.equal(pdv.size, 20, `Esperadas 20 fórmulas PDV; encontradas ${pdv.size}`);
assert.equal(pdk.size, 20, `Esperadas 20 fórmulas PDK; encontradas ${pdk.size}`);

const expectedVitByLevel = [
    null,
    1,
    1,
    3,
    4,
    4,
    6,
    6,
    8,
    8,
    8,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
];
const expectedFdvByLevel = [
    null,
    1,
    1,
    3,
    4,
    4,
    6,
    6,
    8,
    8,
    8,
    11,
    12,
    13,
    13,
    13,
    16,
    16,
    16,
    16,
    16,
];

for (let level = 2; level <= 20; level += 1) {
    const pdvFormula = pdv.get(level);
    const pdkFormula = pdk.get(level);
    assert.ok(pdvFormula, `pdv_oni_nvl${level} ausente`);
    assert.ok(pdkFormula, `pdk_oni_nvl${level} ausente`);

    const pdvRefs = [...pdvFormula.matchAll(/pdv_oni_nvl(\d+)/g)].map((match) => Number(match[1]));
    assert.equal(
        pdvRefs[0],
        level - 1,
        `pdv_oni_nvl${level} deve referenciar pdv_oni_nvl${level - 1}`
    );

    const vitRefs = [...pdvFormula.matchAll(/vit_oni_nvl(\d+)/g)].map((match) => Number(match[1]));
    assert.ok(vitRefs.length > 0, `pdv_oni_nvl${level} deve usar VIT`);
    assert.deepEqual(
        vitRefs,
        [expectedVitByLevel[level]],
        `pdv_oni_nvl${level} deve preservar a VIT definida pelo operador`
    );

    const pdkRefs = [...pdkFormula.matchAll(/pdk_oni_nvl(\d+)/g)].map((match) => Number(match[1]));
    assert.equal(
        pdkRefs[0],
        level - 1,
        `pdk_oni_nvl${level} deve referenciar pdk_oni_nvl${level - 1}`
    );
    const fdvRefs = [...pdkFormula.matchAll(/fdv_oni_nvl(\d+)/g)].map((match) => Number(match[1]));
    assert.deepEqual(
        fdvRefs,
        [expectedFdvByLevel[level]],
        `pdk_oni_nvl${level} deve preservar a FDV definida pelo operador`
    );
}

console.log('PDV/PDK Oni N1-N20: cadeias literais de VIT/FDV do operador preservadas.');
