/**
 * @fileoverview Lançador universal de Forma de Respiração.
 *
 * A macro "Usar Forma de Respiração" (que os templates chamam por UUID) é só um
 * adaptador: a resolução do Item mora aqui, onde dá para testar e analisar.
 * Ordem: itemUuid → forma_id → nome → única Respiração do ator → seletor.
 */
import { openBreathingManager, useBreathForm } from './breath-service.mjs';
const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
const propsOf = (doc) => doc?.system?.props ?? {};
async function resolveActor(input) {
    if (input.actorUuid) {
        const doc = await fromUuid(input.actorUuid);
        const candidate = doc?.actor ?? doc;
        if (candidate?.system?.props) return candidate;
    }
    return canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;
}
/** Seletor de Forma quando o ator tem mais de uma Respiração. Devolve o UUID ou null. */
async function chooseBreathItem(candidates) {
    const options = candidates
        .toSorted(
            (a, b) => Number(propsOf(a).forma_ordem ?? 999) - Number(propsOf(b).forma_ordem ?? 999)
        )
        .map((item) => {
            const props = propsOf(item);
            const label = `${props.respiracao_nome ?? 'Respiração'} ${props.nome_forma ?? item.name}`;
            return `<option value="${escapeHtml(item.uuid)}">${escapeHtml(label)}</option>`;
        })
        .join('');
    return foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Usar Forma de Respiração',
        },
        content: `<div style="display:grid;gap:8px"><p>Escolha a forma que deseja usar.</p><select id="na-resp-item" style="width:100%">${options}</select></div>`,
        modal: true,
        rejectClose: false,
        buttons: [
            {
                action: 'usar',
                label: 'Usar Forma',
                callback: (_event, _button, dialog) =>
                    String(dialog.element.querySelector('#na-resp-item')?.value ?? ''),
            },
            {
                action: 'cancelar',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });
}
/**
 * Acha o Item da Forma no ator.
 * @param {Actor} actor
 * @param {{itemUuid?: string, formaId?: string, itemName?: string}} input
 * @param {(candidates: object[]) => Promise<string|null>} [choose] escolha entre várias Respirações
 * @returns {Promise<object|null>} o Item da Forma
 */
export async function resolveBreathItem(actor, input, choose = chooseBreathItem) {
    if (input.itemUuid) {
        const item = await fromUuid(input.itemUuid);
        if (item) return item;
    }
    const items = actor?.items;
    const formaId = String(input.formaId ?? '').trim();
    if (formaId && items) {
        const owned = items.find((item) => String(propsOf(item).forma_id ?? '') === formaId);
        if (owned) return owned;
    }
    if (input.itemName && items) {
        const wanted = String(input.itemName).toLowerCase().trim();
        const owned = items.find((item) => item.name.toLowerCase().includes(wanted));
        if (owned) return owned;
    }
    const candidates =
        items?.filter(
            (item) => String(propsOf(item).inventario_categoria ?? '') === 'respiracao'
        ) ?? [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
        const chosenUuid = await choose(candidates);
        return chosenUuid ? fromUuid(chosenUuid) : null;
    }
    return null;
}
/**
 * Usa a Forma indicada (ou abre o hub da Respiração quando o Item é o atalho `hub_*`).
 * @param {{actorUuid?: string, itemUuid?: string, formaId?: string, itemName?: string}} [input]
 * @param {{useBreathForm?: Function, openBreathingManager?: Function, choose?: Function}} [deps]
 * @returns {Promise<boolean>} true quando algo foi aberto ou usado
 */
export async function launchBreathForm(input = {}, deps = {}) {
    const use = deps.useBreathForm ?? useBreathForm;
    const openHub = deps.openBreathingManager ?? openBreathingManager;
    const actor = await resolveActor(input);
    if (!actor) {
        ui.notifications.warn('Selecione um token ou defina um personagem ativo.');
        return false;
    }
    if (!actor.isOwner) {
        ui.notifications.error('Você não pode usar técnicas com este personagem.');
        return false;
    }
    const item = await resolveBreathItem(actor, input, deps.choose);
    if (!item) {
        ui.notifications.warn('Nenhuma Forma de Respiração encontrada neste personagem.');
        return false;
    }
    const props = propsOf(item);
    if (String(props.forma_id ?? '').startsWith('hub_')) {
        await openHub({
            actorUuid: actor.uuid,
            breathingName: String(props.respiracao_nome ?? ''),
        });
        return true;
    }
    await use({
        actorUuid: actor.uuid,
        itemUuid: item.uuid,
    });
    return true;
}
