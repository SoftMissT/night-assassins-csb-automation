import { MODULE_ID } from './constants.mjs';
import { BREATH_TEMPLATE_ID, loadBreathingCatalog } from './breathing-catalog.mjs';

const LEGACY_CAUTERIZE_NAME = 'chamas7estilocauterizar';

function normalizeKey(value) {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-z0-9]/gu, '');
}

function hasLevels(props) {
    return (
        props.tem_nvl1 !== undefined ||
        props.tem_nvl2 !== undefined ||
        props.tem_nvl3 !== undefined ||
        props.tem_nvl4 !== undefined
    );
}

export function buildCanonicalBreathMap(documents) {
    const byName = new Map();
    const byId = new Map();
    for (const document of documents ?? []) {
        if (document?.type !== 'equippableItem') continue;
        const props = document?.system?.props ?? {};
        const nameKey = normalizeKey(document.name);
        const idKey = String(props.forma_id ?? '')
            .trim()
            .toLocaleLowerCase('pt-BR');
        if (nameKey) byName.set(nameKey, document);
        if (idKey) byId.set(idKey, document);
        if (idKey === 'chamas_07' && Number(props.forma_ataque_padrao) === 1)
            byName.set(LEGACY_CAUTERIZE_NAME, document);
    }
    return { byName, byId };
}

function isBreathingLike(props) {
    return Boolean(props.forma_id) || Boolean(props.nome_forma) || Boolean(props.respiracao_nome);
}

/**
 * Remove o spam de descrição no chat: labels cujo valor renderiza a
 * descrição completa da Forma não devem ter rollMessageToChat ligado.
 * Cirúrgico e idempotente só desliga o flag, não altera mais nada.
 */
function stripDescriptionChatFlag(body) {
    if (!body || typeof body !== 'object') return false;
    let changed = false;
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (node.rollMessageToChat === true && String(node.value ?? '').includes('${descricao}$')) {
            node.rollMessageToChat = false;
            changed = true;
        }
        for (const key of Object.keys(node)) walk(node[key]);
    };
    walk(body);
    return changed;
}

// Campos que o catálogo define e que o Item do mundo não deve ter diferentes: tipo, nível mínimo,
// níveis liberados e custo por nível. Descrição e qualquer dado do jogador ficam de fora.
const STRUCTURE_KEYS = Object.freeze([
    'tipo_manobra',
    'nivel_req',
    'forma_ataque_padrao',
    ...[1, 2, 3, 4].flatMap((level) => [`tem_nvl${level}`, `nvl${level}_custo`]),
]);

function replaceLegacyCauterize(item, canonical) {
    const props = item.system?.props ?? {};
    const source = canonical?.system?.props ?? {};
    const itemName = normalizeKey(item.name);
    if (
        source.forma_id !== 'chamas_07' ||
        Number(source.forma_ataque_padrao) !== 1 ||
        (normalizeKey(props.nome_forma) !== 'cauterizar' && itemName !== LEGACY_CAUTERIZE_NAME)
    )
        return null;
    const patch = structuralDrift(props, source);
    for (const key of [
        'inventario_categoria',
        'forma_id',
        'forma_ordem',
        'forma_passiva',
        'respiracao_nome',
        'nome_forma',
        'nome_jp',
        'descricao',
        'tem_requisito',
        'requisito_texto',
        'gatilho_texto',
        'notas_texto',
        'tipo_dano_base',
    ]) {
        if (Object.hasOwn(source, key)) patch[`system.props.${key}`] = source[key];
    }
    for (const level of [1, 2, 3, 4]) {
        const prefix = `nvl${level}_`;
        const formula = String(props[`${prefix}dano`] ?? '').trim();
        for (const field of ['efeito', 'tipos_dano', 'status', 'buff', 'dano']) {
            const key = prefix + field;
            if (
                Object.hasOwn(source, key) &&
                (field !== 'dano' || !formula || formula === `${level}d6`)
            )
                patch[`system.props.${key}`] = source[key];
        }
    }
    if (itemName === LEGACY_CAUTERIZE_NAME || itemName === 'cauterizar') patch.name = canonical.name;
    return patch;
}

/**
 * Patch só dos campos estruturais que divergem do catálogo (comparação como texto).
 * @returns {Record<string, unknown>} vazio quando a estrutura já está em dia.
 */
function structuralDrift(props, canonicalProps) {
    const drift = {};
    for (const key of STRUCTURE_KEYS) {
        if (!(key in canonicalProps)) continue;
        if (String(props[key]) !== String(canonicalProps[key]))
            drift[`system.props.${key}`] = canonicalProps[key];
    }
    return drift;
}

export function breathingItemPatch(item, canonical) {
    if (!item) return null;
    const props = item?.system?.props ?? {};
    const chatSpam = stripDescriptionChatFlag(item.system?.body);
    // Ownership NONE herdado de templates antigos impede o dono da ficha de
    // abrir a Forma; Observer é o mínimo para ver e executar os botões.
    const ownershipLevel = Number(item.ownership?.default ?? 0);
    const ownershipFix = ownershipLevel < 2 ? { ...(item.ownership ?? {}), default: 2 } : null;
    // Repair de Respiração só toca em itens relacionados itens comuns (Erva,
    // loot etc.) não recebem ownership nem body por este caminho.
    const related = Boolean(canonical) || isBreathingLike(props) || chatSpam;
    if (!related) return null;
    const runtimeTemplateId = String(item.system?.template ?? '').trim();
    const cauterizePatch = replaceLegacyCauterize(item, canonical);
    if (cauterizePatch)
        return {
            _id: item.id ?? item._id,
            ...cauterizePatch,
            ...(!runtimeTemplateId
                ? { 'system.template': canonical.system?.template ?? BREATH_TEMPLATE_ID }
                : {}),
            ...(chatSpam ? { 'system.body': item.system?.body } : {}),
            ...(ownershipFix ? { ownership: ownershipFix } : {}),
        };
    const alreadyCanonical =
        !chatSpam &&
        !ownershipFix &&
        Boolean(runtimeTemplateId) &&
        props.inventario_categoria === 'respiracao' &&
        Boolean(props.forma_id) &&
        Boolean(props.respiracao_nome) &&
        hasLevels(props);
    if (alreadyCanonical) {
        const drift = canonical ? structuralDrift(props, canonical.system?.props ?? {}) : {};
        return Object.keys(drift).length > 0 ? { _id: item.id ?? item._id, ...drift } : null;
    }

    if (canonical) {
        const canonicalProps = canonical.system?.props ?? {};
        const mergedProps = {};
        for (const [key, value] of Object.entries(canonicalProps)) mergedProps[key] = value;
        for (const [key, value] of Object.entries(props)) {
            if (!(key in mergedProps)) mergedProps[key] = value;
        }
        stripDescriptionChatFlag(canonical.system?.body);
        return {
            _id: item.id ?? item._id,
            name: canonical.name,
            img: canonical.img,
            system: {
                // O CSB remapeia o ID do template quando ele entra no World. Forçar o
                // ID estático do módulo quebra o vínculo de Items já importados.
                template: runtimeTemplateId || canonical.system?.template || BREATH_TEMPLATE_ID,
                props: mergedProps,
                ...(chatSpam ? { body: item.system?.body } : {}),
            },
            ...(ownershipFix ? { ownership: ownershipFix } : {}),
            flags: {
                ...(item.flags ?? {}),
                [MODULE_ID]: {
                    ...(item.flags?.[MODULE_ID] ?? {}),
                    breathRepaired: true,
                },
            },
        };
    }

    if (
        chatSpam ||
        ownershipFix ||
        (isBreathingLike(props) && props.inventario_categoria !== 'respiracao')
    ) {
        const update = { _id: item.id ?? item._id };
        if (chatSpam) update['system.body'] = item.system?.body;
        if (ownershipFix) update.ownership = ownershipFix;
        if (isBreathingLike(props) && props.inventario_categoria !== 'respiracao') {
            update['system.props.inventario_categoria'] = 'respiracao';
        }
        return update;
    }

    return null;
}

/**
 * Corrige as Formas de Respiração existentes nos Actors usando o Compendium canônico.
 * @param {object} [options]
 * @param {object[]} [options.actors] Actors a reparar (padrão: todos os Actors do mundo).
 * @returns {Promise<{actors: number, items: number}>}
 */
export async function repairBreathingItems({
    actors = globalThis.game?.actors?.contents ?? [],
    documents,
} = {}) {
    if (!globalThis.game?.user?.isGM)
        throw new Error('Somente o GM pode corrigir Respirações dos Caçadores.');
    if (actors.length === 0) return { actors: 0, items: 0 };
    // O espelho interno continua sendo a fonte do reparo, mesmo com as Formas no pack.
    const canonicalDocuments = documents ?? (await loadBreathingCatalog());
    const { byName, byId } = buildCanonicalBreathMap(canonicalDocuments);

    const updatesPerActor = actors
        .map((actor) => {
            const itemUpdates = [...(actor?.items ?? [])]
                .map((item) => {
                    const props = item?.system?.props ?? {};
                    const canonical =
                        byId.get(
                            String(props.forma_id ?? '')
                                .trim()
                                .toLocaleLowerCase('pt-BR')
                        ) ?? byName.get(normalizeKey(item?.name));
                    return breathingItemPatch(item, canonical);
                })
                .filter(Boolean);
            if (itemUpdates.length === 0) return null;
            return actor
                .updateEmbeddedDocuments('Item', itemUpdates, { naCsbAutomation: true })
                .then(() => itemUpdates.length);
        })
        .filter(Boolean);

    const results = await Promise.all(updatesPerActor);
    return {
        actors: results.length,
        items: results.reduce((total, count) => total + count, 0),
    };
}
