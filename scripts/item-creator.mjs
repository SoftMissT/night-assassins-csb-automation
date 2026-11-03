import { MODULE_ID } from './constants.mjs';

const WEAPON_PACK_ID = `${MODULE_ID}.night-assassins-armas-slayer`;
const TEMPLATE_ID = 'NAWeaponTpl00001';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function sourceDocument(document) {
    if (!document) return null;
    if (typeof document.toObject === 'function') return document.toObject();
    return structuredClone(document);
}

export function catalogItemChoices(documents = []) {
    return documents
        .filter((document) => document?.type === 'equippableItem' && document.system?.props?.arma_nome)
        .map((document) => ({
            id: String(document._id ?? document.id ?? document.name),
            name: String(document.name ?? document.system.props.arma_nome),
            category: String(document.system.props.arma_categoria ?? 'basica'),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

export function catalogItemData(document, templateId = '') {
    const source = sourceDocument(document);
    if (!source?.system?.props?.arma_nome) return null;
    const { _id, _key, folder, sort, sorting, _stats, ...data } = source;
    return {
        ...data,
        system: { ...data.system, template: templateId || data.system.template || TEMPLATE_ID },
        flags: {
            ...(data.flags ?? {}),
            [MODULE_ID]: { ...(data.flags?.[MODULE_ID] ?? {}), createdFromCatalog: true },
        },
    };
}

export async function createCatalogItem(actor, document, { templateId = TEMPLATE_ID } = {}) {
    if (!actor?.createEmbeddedDocuments)
        return { ok: false, reason: 'Actor inválido.' };
    if (!actor.isOwner && !globalThis.game?.user?.isGM)
        return { ok: false, reason: 'Você não pode criar Item nesta ficha.' };
    const data = catalogItemData(document, templateId);
    if (!data) return { ok: false, reason: 'Item do catálogo inválido.' };
    const created = await actor.createEmbeddedDocuments('Item', [data], {
        naCsbAutomation: true,
        naCatalogItem: true,
    });
    return { ok: true, item: created?.[0] ?? null };
}

async function resolveActor(actorUuid) {
    const document = actorUuid ? await globalThis.fromUuid?.(actorUuid) : null;
    const controlledActor = globalThis.canvas?.ready
        ? globalThis.canvas.tokens?.controlled?.[0]?.actor
        : null;
    return document?.actor ?? document ?? controlledActor ?? globalThis.game?.user?.character ?? null;
}

async function resolveTemplateId(actor, pack, templateKey = TEMPLATE_ID) {
    const owned = [...(actor.items ?? [])].find(
        (item) => item.type === '_equippableItemTemplate' && item.id === templateKey
    );
    if (owned) return owned.id;
    const world = globalThis.game?.items?.get?.(templateKey) ?? globalThis.game?.items?.find?.((item) => item.id === templateKey);
    if (world) return world.id;
    if (!globalThis.game?.user?.isGM || !pack) return '';
    const imported = await globalThis.game.items.importFromCompendium(pack, templateKey, {}, { keepId: true });
    return imported?.id ?? '';
}

export async function openItemCreator({ actorUuid } = {}) {
    if (!globalThis.game?.user?.isGM) return globalThis.ui?.notifications?.warn?.('O criador de Item é exclusivo do GM.');
    const actor = await resolveActor(actorUuid);
    if (!actor) return globalThis.ui?.notifications?.warn?.('Selecione uma ficha para receber o Item.');
    const pack = globalThis.game?.packs?.get?.(WEAPON_PACK_ID);
    if (!pack) return globalThis.ui?.notifications?.error?.('Compêndio canônico de armas não encontrado.');
    const documents = await pack.getDocuments();
    const choices = catalogItemChoices(documents);
    if (choices.length === 0) return globalThis.ui?.notifications?.warn?.('Nenhum Item canônico disponível.');
    const options = choices
        .map((choice) => `<option value="${escapeHtml(choice.id)}">${escapeHtml(choice.name)} · ${escapeHtml(choice.category)}</option>`)
        .join('');
    const chosen = await foundry.applications.api.DialogV2.wait({
        window: { title: `Adicionar Item — ${actor.name ?? 'Ficha'}` },
        content: `<label>Item canônico</label><select name="catalogItem">${options}</select>`,
        modal: true,
        rejectClose: false,
        buttons: [
            { action: 'add', label: 'Adicionar ao Actor', callback: (_event, button) => button.form.elements.catalogItem.value },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!chosen) return null;
    const document = documents.find((entry) => String(entry._id ?? entry.id) === String(chosen));
    const sourceTemplate = String(document?.system?.template ?? TEMPLATE_ID);
    const templateId = await resolveTemplateId(actor, pack, sourceTemplate);
    if (!templateId) return globalThis.ui?.notifications?.warn?.('Template de arma ausente neste mundo.');
    const result = await createCatalogItem(actor, document, { templateId });
    if (result.ok) globalThis.ui?.notifications?.info?.(`${document.name} adicionado a ${actor.name}.`);
    else globalThis.ui?.notifications?.warn?.(result.reason);
    return result;
}
