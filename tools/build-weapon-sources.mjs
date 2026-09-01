import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractWeaponRankFormulas } from '../scripts/weapon-service.mjs';
import { markdownToFoundryHtml } from './compendium-catalog-utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'catalogs', 'slayer-weapons.json');
const outputDirectory = path.join(root, 'build', 'compendium', 'armas-slayer');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (catalog.format !== 1 || !Array.isArray(catalog.documents))
    throw new Error('Catálogo mecânico de armas Slayer inválido.');

const templatePath = path.join(root, 'src', 'templates', 'items', 'slayer-weapon-template.json');
const weaponTemplate = JSON.parse(await readFile(templatePath, 'utf8'));
weaponTemplate._key = `!items!${weaponTemplate._id}`;
const specialTemplatePath = path.join(
    root,
    'src',
    'templates',
    'items',
    'special-slayer-weapon-template.json'
);
const specialWeaponTemplate = JSON.parse(await readFile(specialTemplatePath, 'utf8'));
specialWeaponTemplate._key = `!items!${specialWeaponTemplate._id}`;
const PUBLISHED_WEAPONS = new Set([
    'Katana',
    'Double Blade',
    'Manoplas / Soqueiras',
    'Cutelos Gêmeos',
]);
const BASIC_FOLDER_ID = '02e48b1127bca24a';

export const RANK_DICE = Object.freeze({
    D: '1d6',
    C: '1d8',
    B: '1d10',
    A: '1d12',
    S: '2d6',
    SS: '2d8',
});

export function injectRankDice(formula = '', dice = '') {
    const raw = String(formula ?? '').trim();
    if (!raw || !dice) return raw;

    const [damagePart, ...typeParts] = raw.split(/\s*\/\s*/u);
    const typePart = typeParts.join(' / ').trim();

    if (/\b\d+d\d+\b/iu.test(damagePart)) {
        return typePart ? `${damagePart} / ${typePart}` : damagePart;
    }

    const evolvedDamage = damagePart
        .replace(/\s*\+\s*dado\s+evolutivo\s*/giu, ' ')
        .replace(/\bdado\s+evolutivo\b/giu, dice)
        .trim();
    const normalized = evolvedDamage.includes(dice) ? evolvedDamage : `${evolvedDamage} + ${dice}`;

    return typePart ? `${normalized} / ${typePart}` : normalized;
}

function generatedRankFormulasFromProfiles(profiles = []) {
    return Object.fromEntries(
        Object.entries(RANK_DICE).map(([rank, dice]) => [
            rank,
            profiles.map((profile) =>
                injectRankDice(profile.formula_texto ?? profile.nome ?? '', dice)
            ),
        ])
    );
}

export function normalizeRankFormulas(extracted = {}, profiles = []) {
    const generated = generatedRankFormulasFromProfiles(profiles);
    const profileCount = profiles.length;

    return Object.fromEntries(
        Object.keys(RANK_DICE).map((rank) => {
            const values = Array.isArray(extracted[rank]) ? extracted[rank].filter(Boolean) : [];

            if (values.length >= profileCount) {
                return [rank, values];
            }

            return [rank, generated[rank]];
        })
    );
}

const sourceDocuments = catalog.documents.filter((document) => {
    if (String(document._key ?? '').startsWith('!folders!'))
        return document._id === BASIC_FOLDER_ID;
    if (document.type === '_equippableItemTemplate') return document._id === weaponTemplate._id;
    if (document.type === 'equippableItem') return PUBLISHED_WEAPONS.has(document.name);
    return false;
});

const documents = [...sourceDocuments, specialWeaponTemplate].map((document) => {
    if (document.type === '_equippableItemTemplate' && document._id === weaponTemplate._id)
        return weaponTemplate;
    if (document.type === '_equippableItemTemplate' && document._id === specialWeaponTemplate._id)
        return specialWeaponTemplate;
    if (document.type !== 'equippableItem') return document;
    const props = document.system?.props ?? {};
    const profiles = Array.isArray(props.arma_perfis_ataque) ? props.arma_perfis_ataque : [];
    const specialWeapon =
        String(props.arma_categoria ?? '').toLocaleLowerCase('pt-BR') === 'especial';
    const extractedFormulas = specialWeapon
        ? extractWeaponRankFormulas(props.arma_regra_completa)
        : {};
    const formulas = specialWeapon ? normalizeRankFormulas(extractedFormulas, profiles) : {};
    return {
        ...document,
        system: {
            ...document.system,
            props: {
                ...props,
                descricao: markdownToFoundryHtml(props.descricao ?? ''),
                arma_regra_completa: markdownToFoundryHtml(props.arma_regra_completa ?? ''),
                arma_formulas_por_rank: formulas,
                arma_formulas_por_rank_json: JSON.stringify(formulas),
                arma_perfis_ataque_json: JSON.stringify(profiles),
                arma_mecanicas_json: JSON.stringify(props.arma_mecanicas ?? []),
                arma_dano_atributo_json: JSON.stringify(props.arma_dano_atributo ?? []),
                arma_tipos_dano_json: JSON.stringify(props.arma_tipos_dano ?? []),
                arma_atributo_acerto_json: JSON.stringify(props.arma_atributo_acerto ?? []),
                // O CSB 6 espera texto nos textFields. Arrays aqui viravam
                // "[object Object]" durante o prepareData e quebravam o Actor.
                arma_dano_atributo: (Array.isArray(props.arma_dano_atributo)
                    ? props.arma_dano_atributo
                    : []
                ).join(' ou '),
                arma_tipos_dano: (Array.isArray(props.arma_tipos_dano)
                    ? props.arma_tipos_dano
                    : []
                ).join(', '),
                arma_perfis_resumo: profiles
                    .map((profile) => profile.formula_texto || profile.nome)
                    .filter(Boolean)
                    .join('\n'),
                arma_tipos_dano_resumo: (Array.isArray(props.arma_tipos_dano)
                    ? props.arma_tipos_dano
                    : []
                ).join(', '),
                arma_atributos_resumo: (Array.isArray(props.arma_dano_atributo)
                    ? props.arma_dano_atributo
                    : []
                ).join(' ou '),
                arma_rank_d_formula: formulas.D?.join(' | ') ?? '',
                arma_rank_c_formula: formulas.C?.join(' | ') ?? '',
                arma_rank_b_formula: formulas.B?.join(' | ') ?? '',
                arma_rank_a_formula: formulas.A?.join(' | ') ?? '',
                arma_rank_s_formula: formulas.S?.join(' | ') ?? '',
                arma_rank_ss_formula: formulas.SS?.join(' | ') ?? '',
            },
        },
    };
});

await mkdir(outputDirectory, { recursive: true });
const outputFiles = documents.map((document, index) => {
    const id = document._id ?? `document-${index}`;
    return `${String(index).padStart(3, '0')}-${id}.json`;
});
await Promise.all(
    documents.map((document, index) =>
        writeFile(
            path.join(outputDirectory, outputFiles[index]),
            `${JSON.stringify(document, null, 2)}\n`
        )
    )
);
const expectedFiles = new Set(outputFiles);
await Promise.all(
    (await readdir(outputDirectory))
        .filter((file) => file.endsWith('.json') && !expectedFiles.has(file))
        .map((file) => rm(path.join(outputDirectory, file), { force: true }))
);

const itemCount = documents.filter(
    (document) => document._key?.startsWith('!items!') && !String(document.type).startsWith('_')
).length;
console.info(`Preparados ${itemCount} Items de armas Slayer.`);
