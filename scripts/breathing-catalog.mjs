/**
 * @fileoverview Formas de Respiração fora do Compêndio (2026-10-25).
 *
 * O pack `night-assassins-respiracoes` publica só o template de Forma. As Formas,
 * o hub e as pastas vivem em `catalogs/breathing-items.json`, carregado sob
 * demanda, e servem a dois fluxos: o reparo de Items do mundo e a importação
 * única para a ficha quando o hub é aberto sem nenhuma Forma.
 */

import { MODULE_ID } from './constants.mjs';

export const BREATH_TEMPLATE_ID = 'NABreathTpl00001';
const TEMPLATE_PACK_ID = `${MODULE_ID}.night-assassins-respiracoes`;

let catalogPromise = null;

/**
 * Documentos do catálogo interno (Formas, hub e pastas).
 * @returns {Promise<object[]>}
 */
export function loadBreathingCatalog() {
    catalogPromise ??= import('../catalogs/breathing-items.json', { with: { type: 'json' } })
        .then(({ default: catalog }) =>
            Array.isArray(catalog?.documents) ? catalog.documents : []
        )
        .catch((error) => {
            catalogPromise = null;
            throw error;
        });
    return catalogPromise;
}

function normalizeName(value) {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[̀-ͯ]/gu, '');
}

/**
 * Formas jogáveis de uma Respiração (sem o hub), na ordem do catálogo.
 * @param {object[]} documents
 * @param {string} breathingName
 * @returns {object[]}
 */
export function breathingFormsFromCatalog(documents, breathingName) {
    const wanted = normalizeName(breathingName);
    if (!wanted) return [];
    return (documents ?? [])
        .filter((document) => {
            const props = document?.system?.props ?? {};
            const formaId = String(props.forma_id ?? '');
            return (
                document?.type === 'equippableItem' &&
                normalizeName(props.respiracao_nome) === wanted &&
                Boolean(formaId) &&
                !formaId.startsWith('hub_')
            );
        })
        .sort(
            (left, right) =>
                (Number(left.system.props.forma_ordem) || 0) -
                (Number(right.system.props.forma_ordem) || 0)
        );
}

/**
 * ID do template de Forma válido neste mundo: o que os Items de Respiração do
 * Actor já usam, o template do mundo ou, para o GM, o template importado do pack.
 * @param {Actor} actor
 * @returns {Promise<string>}
 */
export async function resolveBreathTemplateId(actor) {
    const owned = [...(actor?.items ?? [])].find(
        (item) => item?.system?.props?.inventario_categoria === 'respiracao' && item.system?.template
    );
    if (owned) return String(owned.system.template);
    const world = globalThis.game?.items?.find?.(
        (item) => item.type === '_equippableItemTemplate' && item.id === BREATH_TEMPLATE_ID
    );
    if (world) return world.id;
    if (!globalThis.game?.user?.isGM) return '';
    const pack = globalThis.game?.packs?.get?.(TEMPLATE_PACK_ID);
    if (!pack) return '';
    const imported = await globalThis.game.items.importFromCompendium(
        pack,
        BREATH_TEMPLATE_ID,
        {},
        { keepId: true }
    );
    return imported?.id ?? '';
}

/**
 * Copia uma vez as Formas da Respiração para a ficha. Items reais: o uuid
 * sobrevive ao encadeamento de ataque (`attack-follow-up`).
 * @param {Actor} actor
 * @param {string} breathingName
 * @param {{documents?: object[], templateId?: string}} [options] injeção para testes
 * @returns {Promise<{ok: boolean, reason?: string, created?: object[]}>}
 */
export async function importBreathingForms(actor, breathingName, options = {}) {
    if (!actor?.isOwner)
        return { ok: false, reason: 'Só o dono da ficha ou o GM pode importar as Formas.' };
    const documents = options.documents ?? (await loadBreathingCatalog());
    const forms = breathingFormsFromCatalog(documents, breathingName);
    if (forms.length === 0)
        return { ok: false, reason: `Nenhuma Forma da Respiração ${breathingName} no módulo.` };
    const templateId =
        options.templateId !== undefined ? options.templateId : await resolveBreathTemplateId(actor);
    if (!templateId)
        return {
            ok: false,
            reason: 'Template de Forma ausente neste mundo: peça ao GM para abrir o hub uma vez.',
        };
    const data = forms.map(({ _id, _key, folder, _stats, ...document }) => ({
        ...document,
        system: { ...document.system, template: templateId },
        flags: {
            ...(document.flags ?? {}),
            [MODULE_ID]: { ...(document.flags?.[MODULE_ID] ?? {}), breathingImported: true },
        },
    }));
    const created = await actor.createEmbeddedDocuments('Item', data, { naCsbAutomation: true });
    return { ok: true, created };
}
