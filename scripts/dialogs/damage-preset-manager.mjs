/**
 * @fileoverview Gerenciador de presets de dano do usuário (criar/editar/excluir)
 * com lista de cards, Respiração, custo de recurso e entradas.
 */

import { openDamageDialog } from './damage-dialog.mjs';
import { actorKind } from '../actor-kind.mjs';
import {
    DAMAGE_PRESETS_KEY,
    PRESET_GROUPS,
    damagePresetsPatch,
    parseDamagePresets,
    presetGroupKey,
    presetGroupLabel,
    removeDamagePreset,
    upsertDamagePreset,
} from '../damage-preset-service.mjs';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

async function resolveActor(actorUuid) {
    const doc = actorUuid ? await fromUuid(actorUuid) : null;
    return doc?.actor ?? doc ?? canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

function canEdit(actor) {
    return Boolean(actor?.isOwner || game.user?.isGM);
}

function resourceLabelFor(actor) {
    return actorKind(actor) === 'oni' ? 'PDK' : 'PDR';
}

function presetCardHtml(preset, selectedId, resourceLabel) {
    const chips = [
        `<span class="na-preset-chip">${escapeHtml(presetGroupLabel(preset.group))}</span>`,
        preset.breathing
            ? `<span class="na-preset-chip na-preset-chip-breath">${escapeHtml(preset.breathing)}</span>`
            : '',
        Number(preset.resourceCost) > 0
            ? `<span class="na-preset-chip na-preset-chip-cost">${Number(preset.resourceCost)} ${resourceLabel}</span>`
            : '',
    ]
        .filter(Boolean)
        .join('');
    const count = Array.isArray(preset.entries) ? preset.entries.length : 0;
    return `<button type="button" class="na-preset-item ${String(preset.id) === String(selectedId) ? 'is-selected' : ''}" data-preset-id="${escapeHtml(preset.id)}">
      <span class="na-preset-item-name">${escapeHtml(preset.name)}</span>
      <span class="na-preset-item-chips">${chips}</span>
      <span class="na-preset-item-meta">${count} entrada${count === 1 ? '' : 's'}</span>
    </button>`;
}

function presetListHtml(presets, selectedId, resourceLabel) {
    if (presets.length === 0)
        return '<p class="na-preset-empty">Nenhum preset salvo. Crie o primeiro com <strong>Novo</strong>.</p>';
    return presets
        .map((preset) => presetCardHtml(preset, selectedId, resourceLabel))
        .join('');
}

function bindManagerInteractions(root) {
    const hidden = root.querySelector('[name="preset-id"]');
    if (!hidden) return;
    root.querySelectorAll('.na-preset-item').forEach((card) => {
        card.addEventListener('click', () => {
            root.querySelectorAll('.na-preset-item').forEach((other) =>
                other.classList.toggle('is-selected', other === card)
            );
            hidden.value = card.dataset.presetId ?? '';
        });
    });
}

/**
 * Persiste um preset no Actor. Preset inválido ou limite excedido não grava.
 * @param {Actor} actor
 * @param {object} draft
 * @returns {Promise<{ok:boolean,presets?:object[],preset?:object,reason?:string}>}
 */
export async function saveDamagePreset(actor, draft = {}) {
    if (!actor) return { ok: false, reason: 'Nenhum personagem ativo.' };
    const store = parseDamagePresets(actor.system?.props?.[DAMAGE_PRESETS_KEY]);
    const result = upsertDamagePreset(store.presets, draft);
    if (!result.ok) return result;
    await actor.update(damagePresetsPatch(result.presets), {
        naCsbAutomation: true,
        naDamagePresets: true,
    });
    const saved =
        result.presets.find((preset) => String(preset.id) === String(draft.id ?? '')) ??
        result.presets[result.presets.length - 1];
    return { ok: true, presets: result.presets, preset: saved };
}

/**
 * Pede nome, Respiração e grupo para salvar um preset fora do editor.
 * @param {{name?:string,group?:string,breathing?:string}} defaults
 * @returns {Promise<{name:string,group:string,breathing:string}|null>}
 */
export async function promptDamagePresetFields({ name = '', group = 'normal', breathing = '' } = {}) {
    const groupList = PRESET_GROUPS.map(
        (entry) => `<option value="${escapeHtml(entry.label)}"></option>`
    ).join('');
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Salvar preset de dano' },
        position: { width: 460 },
        modal: true,
        rejectClose: false,
        content: `<div class="na-preset-manager na-csb-automation">
      <label class="na-label">Nome do preset</label>
      <input type="text" name="name" maxlength="80" value="${escapeHtml(name || '')}" placeholder="ex: Rengoku" />
      <label class="na-label">Respiração usada</label>
      <input type="text" name="breathing" maxlength="60" value="${escapeHtml(breathing)}" placeholder="ex: Chamas" />
      <label class="na-label">Grupo</label>
      <input type="text" name="group" list="na-preset-group-list" maxlength="40" value="${escapeHtml(presetGroupLabel(group))}" />
      <datalist id="na-preset-group-list">${groupList}</datalist>
    </div>`,
        buttons: [
            {
                action: 'save',
                label: 'Salvar',
                default: true,
                callback: (_event, button) => ({
                    name: button.form.querySelector('[name="name"]')?.value?.trim() ?? '',
                    breathing: button.form.querySelector('[name="breathing"]')?.value?.trim() ?? '',
                    group: button.form.querySelector('[name="group"]')?.value?.trim() ?? '',
                }),
            },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!result?.name) return null;
    return { name: result.name, group: result.group || 'normal', breathing: result.breathing };
}

/**
 * Abre o gerenciador de presets de dano do Actor.
 * @param {{actorUuid?:string,group?:string,breathing?:string}} options
 * @returns {Promise<void>}
 */
export async function openDamagePresetManager({ actorUuid, group, breathing } = {}) {
    const actor = await resolveActor(actorUuid);
    if (!actor) return ui.notifications?.warn?.('Nenhum personagem ativo.');
    if (!canEdit(actor))
        return ui.notifications?.error?.('Você não pode editar presets deste personagem.');

    const defaultGroup = presetGroupKey(group);
    const defaultBreathing = String(breathing ?? group ?? '').trim();
    const resourceLabel = resourceLabelFor(actor);
    const store = parseDamagePresets(actor.system?.props?.[DAMAGE_PRESETS_KEY]);
    const selectedId = store.presets[0]?.id ?? '';

    const hookApi = globalThis.Hooks;
    const renderHook = hookApi?.on?.('renderDialogV2', (_dialog, element) => {
        const root = element?.querySelector ? element : element?.[0];
        if (!root?.querySelector?.('.na-preset-list')) return;
        bindManagerInteractions(root);
    });

    let action;
    try {
        action = await foundry.applications.api.DialogV2.wait({
            window: {
                title: `Presets de dano — ${actor.name ?? 'Personagem'}`,
                resizable: true,
            },
            position: { width: 640 },
            modal: true,
            rejectClose: false,
            content: `<div class="na-preset-manager">
        <header class="na-preset-manager-head">
          <span class="na-dmg-kicker">Night Assassins · Presets de dano</span>
          <h2>${escapeHtml(actor.name ?? 'Personagem')}</h2>
          <p>Presets são dados deste Actor. Custo, ação, calor, crítico e passivas continuam oficiais.</p>
        </header>
        <input type="hidden" name="preset-id" value="${escapeHtml(selectedId)}" />
        <div class="na-preset-list">${presetListHtml(store.presets, selectedId, resourceLabel)}</div>
      </div>`,
            buttons: [
                { action: 'new', label: 'Novo', callback: () => ({ action: 'new' }) },
                {
                    action: 'edit',
                    label: 'Editar',
                    callback: (_event, button) => ({
                        action: 'edit',
                        id: button.form.querySelector('[name="preset-id"]')?.value,
                    }),
                },
                {
                    action: 'delete',
                    label: 'Excluir',
                    callback: (_event, button) => ({
                        action: 'delete',
                        id: button.form.querySelector('[name="preset-id"]')?.value,
                    }),
                },
                { action: 'cancel', label: 'Fechar', callback: () => null },
            ],
        });
    } finally {
        if (renderHook !== undefined) hookApi?.off?.('renderDialogV2', renderHook);
    }
    if (!action?.action) return null;

    const selected =
        store.presets.find((preset) => String(preset.id) === String(action.id ?? '')) ?? null;

    if (action.action === 'delete') {
        if (!selected) {
            ui.notifications?.warn?.('Selecione um preset para excluir.');
            return openDamagePresetManager({ actorUuid: actor.uuid, group, breathing });
        }
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Excluir preset' },
            content: `<p>Excluir o preset <strong>${escapeHtml(selected.name)}</strong>?</p>`,
            modal: true,
        });
        if (!confirmed) return openDamagePresetManager({ actorUuid: actor.uuid, group, breathing });
        await actor.update(damagePresetsPatch(removeDamagePreset(store.presets, selected.id)), {
            naCsbAutomation: true,
            naDamagePresets: true,
        });
        return openDamagePresetManager({ actorUuid: actor.uuid, group, breathing });
    }

    if (action.action === 'new' || (action.action === 'edit' && selected)) {
        const draft = action.action === 'edit' ? selected : null;
        const { promptWeaponDamageEntries } = await import('../damage-service.mjs');
        const editor = await openDamageDialog({
            actor,
            nome: draft?.name ?? '',
            entradas: draft?.entries ?? [],
            pdrCusto: draft?.resourceCost ?? 0,
            resourceLabel,
            presets: store.presets,
            breathing: draft?.breathing ?? defaultBreathing,
            presetDraft: {
                id: draft?.id,
                name: draft?.name ?? '',
                groupLabel: presetGroupLabel(draft?.group ?? defaultGroup),
                breathing: draft?.breathing ?? defaultBreathing,
            },
            onRequestWeaponEntries: () => promptWeaponDamageEntries(actor),
        });
        if (!editor?.preset) return openDamagePresetManager({ actorUuid: actor.uuid, group, breathing });
        const result = await saveDamagePreset(actor, editor.preset);
        if (!result.ok) ui.notifications?.warn?.(result.reason);
        else ui.notifications?.info?.(`Preset "${result.preset?.name ?? ''}" salvo.`);
        return openDamagePresetManager({ actorUuid: actor.uuid, group, breathing });
    }

    return null;
}
