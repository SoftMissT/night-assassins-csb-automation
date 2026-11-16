// Corrige tipo_manobra, nivel_req, custos por nível e níveis bloqueados das Respirações
// Vento, Água, Chamas, Raposa, Eclipse, Som e Sonhos em catalogs/breathing.json,
// conforme data/breathing-truth-pdf-v251.json (PDF oficial V25.1). Idempotente.
import { readFile, writeFile } from 'node:fs/promises';

const catalogPath = new URL('../catalogs/breathing.json', import.meta.url);
const truth = JSON.parse(await readFile(new URL('../data/breathing-truth-pdf-v251.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const documents = catalog.documents ?? catalog;

// Nestas, o runtime lê tipo_manobra do catálogo; nas demais, scripts/*-breathing-data.mjs define a ação.
const TIPO_FROM_CATALOG = new Set(['Som', 'Sonhos', 'Raposa', 'Eclipse']);

const norm = (value) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, ' ')
        .trim();

let changed = 0;
const missing = [];
const set = (props, key, value) => {
    if (String(props[key]) === String(value)) return;
    props[key] = value;
    changed += 1;
};

for (const [breath, forms] of Object.entries(truth.respiracoes)) {
    for (const form of forms) {
        const doc = documents.find((candidate) => {
            const props = candidate.system?.props;
            if (props?.respiracao_nome !== breath) return false;
            const name = norm(props.nome_forma);
            return name === norm(form.name) || name.includes(norm(form.name)) || norm(form.name).includes(name);
        });
        if (!doc) {
            missing.push(`${breath} ${form.name}`);
            continue;
        }
        const props = doc.system.props;
        if (TIPO_FROM_CATALOG.has(breath) && form.tipo) set(props, 'tipo_manobra', form.tipo);
        form.costs.forEach((cost, index) => {
            if (cost === null) return;
            const level = index + 1;
            if (cost === 'X') {
                set(props, `tem_nvl${level}`, 0);
                set(props, `nvl${level}_custo`, 0);
            } else {
                set(props, `tem_nvl${level}`, 1);
                set(props, `nvl${level}_custo`, cost);
            }
        });
        const first = form.costs.findIndex((cost) => cost !== 'X' && cost !== null);
        if (form.costs.includes('X') && first >= 0) set(props, 'nivel_req', first + 1);
    }
}

if (missing.length > 0) throw new Error(`formas do PDF sem item no catálogo: ${missing.join('; ')}`);
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 4)}\n`);
console.log(`Correções aplicadas no catálogo das 7 Respirações: ${changed}`);
