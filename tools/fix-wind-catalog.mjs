// Corrige tipo_manobra / nivel_req / custos por nível das 10 formas de Vento
// em catalogs/breathing.json, conforme Respiração do Vento.md + decisões da missão.
import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../catalogs/breathing.json', import.meta.url);
const catalog = JSON.parse(await readFile(path, 'utf8'));

const CORRECOES = {
    vento_01: { manobra: 'Passiva', req: 1, custos: [0, 0, 0, 0] },
    vento_02: {
        manobra: 'Ataque',
        req: 1,
        custos: ['variável', 'variável', 'variável', 'variável'],
    },
    vento_03: { manobra: 'Única', req: 2, custos: ['-', 4, 4, 5] },
    vento_04: { manobra: 'Ataque / Reação', req: 1, custos: [3, 3, 3, 3] },
    vento_05: { manobra: 'Única', req: 1, custos: [4, 4, 5, 5] },
    vento_06: { manobra: 'Única + Ataque', req: 1, custos: [3, 3, 4, 4] },
    vento_07: { manobra: 'Ataque', req: 2, custos: ['-', 5, 5, 5] },
    vento_08: { manobra: 'Especial', req: 1, custos: [4, 4, 5, 5] },
    vento_09: { manobra: 'Completa', req: 3, custos: ['-', '-', 6, 6] },
    vento_10: { manobra: 'Ação Especial + Completa', req: 4, custos: ['-', '-', '-', 8] },
};

let fixed = 0;
for (const document of catalog.documents) {
    if (document.type !== 'equippableItem') continue;
    const props = document.system?.props;
    if (!props || String(props.respiracao_nome) !== 'Vento') continue;
    const correction = CORRECOES[String(props.forma_id)];
    if (!correction) continue;
    if (props.tipo_manobra !== correction.manobra) {
        props.tipo_manobra = correction.manobra;
        fixed += 1;
    }
    if (Number(props.nivel_req) !== correction.req) {
        props.nivel_req = correction.req;
        fixed += 1;
    }
    for (const [index, cost] of correction.custos.entries()) {
        const key = `nvl${index + 1}_custo`;
        if (String(props[key]) !== String(cost)) {
            // blocos indisponíveis usam tem_nvlN = 0; custo só é gravado quando existe
            if (props[`tem_nvl${index + 1}`] === 0) continue;
            props[key] = cost;
            fixed += 1;
        }
    }
}

await writeFile(path, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Correções aplicadas no catálogo do Vento: ${fixed}`);
