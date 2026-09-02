import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractWeaponRankFormulas } from '../scripts/weapon-service.mjs';
import { normalizeNormalWeaponProps } from '../scripts/weapon-catalog-normalization.mjs';
import {
    collectCsbFieldSchema,
    sanitizeSpecialWeaponProps,
} from '../scripts/special-weapon-schema.mjs';
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
const specialWeaponFieldSchema = collectCsbFieldSchema(specialWeaponTemplate);
const PUBLISHED_WEAPONS = new Set([
    'Katana',
    'Double Blade',
    'Manoplas / Soqueiras',
    'Cutelos Gêmeos',
]);
const BASIC_FOLDER_ID = '02e48b1127bca24a';
const SPECIAL_FOLDER_ID = '1d69316b98fed3ee';
const SPECIAL_SOURCE_DIRECTORY = path.join(
    root,
    'data',
    'catalog-source',
    'weapons',
    'especiais'
);
const PUBLISHED_SPECIAL_WEAPONS = new Set([
    'Boosted Gear Manoplas do Imperador Dragão Vermelho',
    'Cérbero',
    'Correntes de Jade Ceifadoras de Chi',
    'Êxtase Tesoura da Névoa Sagrada',
    'Gáe Bolg Espinho do Destino Selado',
    'Gilgamesh Yoroi do Sol',
    'Gumbai Leque do Pilar Quebrado',
    "Imperator's Edge Estandarte das Cem Legiões",
    'Impurity Arms Punhos Gêmeos de Kegare',
    'Moonfang Runkah',
    'Orochimaru Jakkojin',
    'Playful Cloud Sansetsukon da Nuvem Irônica',
    'Rebellion',
    'Red Queen Motor Carmesim',
    'Woldo Lua do Exílio',
    "Yamato The Rift-Walker's Legacy",
]);
const SPECIAL_WEAPON_ICON_BY_NAME = Object.freeze({
    'Boosted Gear Manoplas do Imperador Dragão Vermelho': 'Boosted_Gear_Red_Dragon_Gauntlets_icon.webp',
    Cérbero: 'Cerberus_icon.webp',
    'Correntes de Jade Ceifadoras de Chi': 'Jade_Chains_Chi_Reapers_icon.webp',
    'Êxtase Tesoura da Névoa Sagrada': 'Ecstasy_Sacred_Mist_Scissors_icon.webp',
    'Gáe Bolg Espinho do Destino Selado': 'katana_icon.webp',
    'Gilgamesh Yoroi do Sol': 'katana_icon.webp',
    'Gumbai Leque do Pilar Quebrado': 'Gumbai_Broken_Pillar_War_Fan_icon.webp',
    "Imperator's Edge Estandarte das Cem Legiões": 'Imperators_Edge_Banner_icon.webp',
    'Impurity Arms Punhos Gêmeos de Kegare': 'Impurity_Arms_Twin_Fists_icon.webp',
    'Moonfang Runkah': 'katana_icon.webp',
    'Orochimaru Jakkojin': 'Orochimaru_Jakkojin_icon.webp',
    'Playful Cloud Sansetsukon da Nuvem Irônica': 'Playful_Cloud_Ironical_Sansetsukon_icon.webp',
    Rebellion: 'Rebellion_icon.webp',
    'Red Queen Motor Carmesim': 'Red_Queen_Crimson_Engine_icon.webp',
    'Woldo Lua do Exílio': 'katana_icon.webp',
    "Yamato The Rift-Walker's Legacy": 'Yamato_Rift_Walkers_Legacy_icon.webp',
});

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

function cleanWeaponText(value = '') {
    return String(value ?? '')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/^#{1,6}\s*/gmu, '')
        .replace(/[*_`>]/gu, '')
        .replace(/\s+/gu, ' ')
        .trim();
}

function weaponAbilitySummary(props = {}) {
    const direct = cleanWeaponText(props.arma_regra_completa);
    if (direct) return direct.slice(0, 220);

    const parts = [];
    const special = props.arma_propriedade_especial;
    if (special?.nome) parts.push(String(special.nome));

    const basal = props.arma_habilidades_basais_despertar;
    if (basal && typeof basal === 'object') {
        for (const ability of Object.values(basal)) {
            if (ability?.nome) parts.push(String(ability.nome));
        }
    }

    const ranks = props.arma_efeitos_por_rank;
    if (ranks && typeof ranks === 'object') {
        for (const [rank, effect] of Object.entries(ranks)) {
            if (effect?.nome) parts.push(`${rank}: ${effect.nome}`);
        }
    }

    return [...new Set(parts)].join(' • ').slice(0, 220);
}

const specialSourceDocuments = await Promise.all(
    (await readdir(SPECIAL_SOURCE_DIRECTORY))
        .filter((file) => file.endsWith('.json'))
        .map(async (file) =>
            JSON.parse(await readFile(path.join(SPECIAL_SOURCE_DIRECTORY, file), 'utf8'))
        )
);
const publishedSpecialDocuments = specialSourceDocuments
    .filter(
        (document) =>
            document.type === 'equippableItem' && PUBLISHED_SPECIAL_WEAPONS.has(document.name)
    )
    .map((document) => ({
        ...document,
        img: `modules/night-assassins-csb-automation/assets/icons/weapons/${SPECIAL_WEAPON_ICON_BY_NAME[document.name]}`,
        system: {
            ...document.system,
            template: specialWeaponTemplate._id,
        },
        folder: SPECIAL_FOLDER_ID,
    }));

const sourceDocuments = catalog.documents.filter((document) => {
    if (String(document._key ?? '').startsWith('!folders!')) {
        return [BASIC_FOLDER_ID, SPECIAL_FOLDER_ID].includes(document._id);
    }
    if (document.type === '_equippableItemTemplate') return document._id === weaponTemplate._id;
    if (document.type === 'equippableItem') return PUBLISHED_WEAPONS.has(document.name);
    return false;
});

const documents = [
    ...sourceDocuments,
    specialWeaponTemplate,
    ...publishedSpecialDocuments,
].map((document) => {
    if (document.type === '_equippableItemTemplate' && document._id === weaponTemplate._id)
        return weaponTemplate;
    if (document.type === '_equippableItemTemplate' && document._id === specialWeaponTemplate._id)
        return specialWeaponTemplate;
    if (document.type !== 'equippableItem') return document;
    const rawProps = document.system?.props ?? {};
    const normalizedProps = normalizeNormalWeaponProps(rawProps);
    const specialWeapon =
        String(normalizedProps.arma_categoria ?? '').toLocaleLowerCase('pt-BR') === 'especial';
    const props = specialWeapon
        ? sanitizeSpecialWeaponProps(normalizedProps, specialWeaponFieldSchema)
        : normalizedProps;
    const profiles = Array.isArray(props.arma_perfis_ataque) ? props.arma_perfis_ataque : [];
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
                arma_dano_por_rank_json: JSON.stringify(props.arma_dano_por_rank ?? {}),
                arma_dado_evolutivo_por_rank_json: JSON.stringify(
                    props.arma_dado_evolutivo_por_rank ?? {}
                ),
                arma_habilidade_resumo: weaponAbilitySummary(props),
                ...(specialWeapon
                    ? {
                          arma_especial_habilidades_json: JSON.stringify(
                              props.arma_habilidades_basais_despertar ?? {}
                          ),
                          arma_especial_rank_effects_json: JSON.stringify(
                              props.arma_efeitos_por_rank ?? {}
                          ),
                          arma_especial_integracao_json: JSON.stringify(
                              props.arma_integracao ?? {}
                          ),
                          dupla_alma_vinculo_json: JSON.stringify({
                              entidade: props.arma_entidade ?? '',
                              demonio: props.arma_demonio ?? '',
                              intensidade: props.arma_vinculo_intensidade ?? '',
                              valor: Number(props.arma_vinculo_valor) || 0,
                              teste_2: props.arma_testes?.teste_2_intensidade_vinculo ?? {},
                          }),
                          dupla_alma_cerimonia_json: JSON.stringify(props.arma_testes ?? {}),
                          dupla_alma_despertar_json:
                              typeof props.dupla_alma_despertar_json === 'string' &&
                              props.dupla_alma_despertar_json.trim()
                                  ? props.dupla_alma_despertar_json
                                  : JSON.stringify(props.arma_despertar ?? {}),
                          arma_marcas_demonio_tabela_json: JSON.stringify({
                              bonus: props.arma_dano_bonus_orochi ?? {},
                              consequencias: props.arma_marcas_demonio_tabela ?? {},
                          }),
                      }
                    : {}),
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
