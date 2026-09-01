import {
    weaponDamageTypeKeys,
    weaponProfilesFromProps,
    weaponPropertyMechanics,
} from './weapon-service.mjs';
import { MODULE_ID } from './constants.mjs';

const CANONICAL_WEAPON_PATH = `modules/${MODULE_ID}/catalogs/slayer-weapons.json`;
let canonicalWeaponsPromise = null;

function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function jsonArray(value) {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return JSON.stringify(parsed);
        } catch (_) {
            return JSON.stringify(
                value
                    .split(/[,;/]|\s+ou\s+|\s+e\s+/iu)
                    .map((entry) => entry.trim())
                    .filter(Boolean)
            );
        }
    }
    return '[]';
}

function jsonObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                return JSON.stringify(parsed);
        } catch (_) {
            return '{}';
        }
    }
    return '{}';
}

export function isWeaponItem(item) {
    const props = item?.system?.props ?? {};
    return (
        props.inventario_categoria === 'arma' ||
        props.arma_nome ||
        item?.system?.template === 'NAWeaponTpl00001'
    );
}

function weaponName(item) {
    return String(item?.system?.props?.arma_nome ?? item?.name ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR');
}

export function canonicalWeaponForItem(item, canonicalWeapons = []) {
    const name = weaponName(item);
    return canonicalWeapons.find((candidate) => weaponName(candidate) === name) ?? null;
}

export async function loadCanonicalSlayerWeapons({ fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') return [];
    if (!canonicalWeaponsPromise) {
        canonicalWeaponsPromise = Promise.resolve(fetchImpl(CANONICAL_WEAPON_PATH))
            .then((response) => {
                if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'desconhecido'}`);
                return response.json();
            })
            .then((catalog) =>
                (catalog?.documents ?? []).filter(
                    (document) => document?.type === 'equippableItem' && isWeaponItem(document)
                )
            )
            .catch((error) => {
                canonicalWeaponsPromise = null;
                console.error(`[${MODULE_ID}] Falha ao carregar catálogo canônico de armas.`, error);
                return [];
            });
    }
    return canonicalWeaponsPromise;
}

function profileSummary(profiles) {
    return profiles
        .map((profile) => profile.formula_texto || profile.nome || 'Ataque Base')
        .filter(Boolean)
        .join('\n');
}

function typeSummary(profiles, props) {
    const types = profiles.flatMap((profile) =>
        Array.isArray(profile.tipos_dano) ? profile.tipos_dano : []
    );
    return weaponDamageTypeKeys(
        types.length > 0 ? types : (props.arma_tipos_dano ?? props.arma_tipos_dano_json)
    ).join(', ');
}

function attributeSummary(profiles, props) {
    const attributes = profiles.flatMap((profile) =>
        (Array.isArray(profile.atributos) ? profile.atributos : [])
            .map((rule) => rule?.key)
            .filter(Boolean)
    );
    const fallback = props.arma_dano_atributo ?? props.arma_dano_atributo_json;
    let fallbackAttributes = [];
    try {
        fallbackAttributes = Array.isArray(fallback)
            ? fallback
            : JSON.parse(String(fallback || '[]'));
    } catch (_) {
        fallbackAttributes = [];
    }
    return [...new Set(attributes.length > 0 ? attributes : fallbackAttributes)].join(' ou ');
}

export function weaponRepairChanges(item, canonicalItem = null) {
    if (!isWeaponItem(item)) return null;
    const props = item.system?.props ?? {};
    const canonicalProps = canonicalItem?.system?.props ?? {};
    const changes = {};
    // equalText(item.inventario_categoria, 'arma') lança TypeError quando o
    // campo é undefined, derrubando o ItemContainer.filterItems inteiro (não
    // só o item problemático) corrigir sempre, mesmo sem perfil de ataque.
    if (props.inventario_categoria !== 'arma') {
        changes['system.props.inventario_categoria'] = 'arma';
    }
    // Ownership NONE herdado do template antigo impede o dono da ficha de abrir
    // a ficha do item; Observer é o mínimo para ver/usar os botões.
    const ownershipLevel = Number(item.ownership?.default ?? 0);
    if (ownershipLevel < 2) {
        changes.ownership = { ...(item.ownership ?? {}), default: 2 };
    }
    const canonicalProfiles = weaponProfilesFromProps(canonicalProps);
    const profiles = canonicalProfiles.length > 0 ? canonicalProfiles : weaponProfilesFromProps(props);
    if (profiles.length > 0) {
        const sourceProps = canonicalProfiles.length > 0 ? canonicalProps : props;
        const types = typeSummary(profiles, sourceProps);
        const attributes = attributeSummary(profiles, sourceProps);
        const next = {
            arma_dano_dados: sourceProps.arma_dano_dados ?? '',
            arma_dano_fixo: Number(sourceProps.arma_dano_fixo) || 0,
            arma_dano_atributo_json: jsonArray(
                sourceProps.arma_dano_atributo ??
                    sourceProps.arma_dano_atributo_json ??
                    attributes
            ),
            arma_tipos_dano_json: jsonArray(
                sourceProps.arma_tipos_dano ?? sourceProps.arma_tipos_dano_json ?? types
            ),
            arma_critico: Number(sourceProps.arma_critico ?? profiles[0]?.critico) || 20,
            arma_perfis_ataque_json: JSON.stringify(profiles),
            arma_mecanicas_json: JSON.stringify(weaponPropertyMechanics(sourceProps)),
            arma_formulas_por_rank_json: jsonObject(
                sourceProps.arma_formulas_por_rank ?? sourceProps.arma_formulas_por_rank_json ?? {}
            ),
            arma_municao_capacidade: Number(sourceProps.arma_municao_capacidade) || 0,
            arma_municao_atual:
                Number(sourceProps.arma_municao_atual ?? sourceProps.arma_municao_capacidade) || 0,
            arma_perfis_resumo: profileSummary(profiles),
            arma_tipos_dano_resumo: types,
            arma_atributos_resumo: attributes,
            arma_tipos_dano: types,
            arma_dano_atributo: attributes,
        };
        for (const [key, value] of Object.entries(next)) {
            if (!sameValue(props[key], value)) changes[`system.props.${key}`] = value;
        }
    }
    return Object.keys(changes).length > 0 ? { _id: item.id, ...changes } : null;
}

export async function repairSlayerWeaponItems({
    actors = globalThis.game?.actors?.contents ?? [],
    canonicalWeapons,
} = {}) {
    const sources = canonicalWeapons ?? (await loadCanonicalSlayerWeapons());
    const updates = actors
        .map((actor) => {
            const itemUpdates = [...(actor?.items ?? [])]
                .map((item) =>
                    weaponRepairChanges(item, canonicalWeaponForItem(item, sources))
                )
                .filter(Boolean);
            if (itemUpdates.length === 0) return null;
            return actor
                .updateEmbeddedDocuments('Item', itemUpdates, { naCsbAutomation: true })
                .then(() => itemUpdates.length);
        })
        .filter(Boolean);
    const results = await Promise.all(updates);
    return { actors: results.length, items: results.reduce((total, count) => total + count, 0) };
}

export async function rehydrateSlayerWeaponItem(item, { canonicalWeapons } = {}) {
    if (item?.parent?.documentName !== 'Actor' || !isWeaponItem(item)) return false;
    const sources = canonicalWeapons ?? (await loadCanonicalSlayerWeapons());
    const canonical = canonicalWeaponForItem(item, sources);
    if (!canonical) return false;
    const changes = weaponRepairChanges(item, canonical);
    if (!changes) return false;
    const { _id: _ignored, ...patch } = changes;
    await item.update(patch, { naCsbAutomation: true, naWeaponRehydrate: true });
    return true;
}

export function registerWeaponSynchronizationEngine() {
    const schedule = (item) => {
        setTimeout(() => {
            void rehydrateSlayerWeaponItem(item).catch((error) =>
                console.error(`[${MODULE_ID}] Falha ao sincronizar arma ${item?.name ?? ''}.`, error)
            );
        }, 0);
    };
    Hooks.on('createItem', (item) => {
        if (item?.parent?.documentName !== 'Actor' || !isWeaponItem(item)) return;
        schedule(item);
    });
    Hooks.on('updateItem', (item, _changes, options) => {
        if (options?.naWeaponRehydrate) return;
        if (item?.parent?.documentName !== 'Actor' || !isWeaponItem(item)) return;
        if (weaponProfilesFromProps(item.system?.props ?? {}).length > 0) return;
        schedule(item);
    });
}
