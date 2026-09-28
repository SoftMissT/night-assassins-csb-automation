/**
 * @fileoverview Gerenciador de presets de dano do usuário (criar/editar/excluir).
 */

import { openDamageDialog } from './damage-dialog.mjs';
import {
    DAMAGE_PRESETS_KEY,
    PRESET_GROUPS,
    damagePresetsPatch,
    groupedPresets,
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

/**
 * Persiste um preset no Actor. Preset inválido ou limite excedido não grava.
 * @param {Actor} actor
 * @param {{id?:string,name:string,group:string,entries:object[]}} draft
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
 * Pede nome e grupo para salvar um preset fora do editor.
 * @param {{name?:string,group?:string}} defaults
 * @returns {Promise<{name:string,group:string}|null>}
 */
export async function promptDamagePresetFields({ name = '', group = 'normal' } = {}) {
    const groupList = PRESET_GROUPS.map(
        (entry) => `<option value="${escapeHtml(entry.label)}"></option>`
    ).join('');
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Salvar preset de dano' },
        modal: true,
        rejectClose: false,
        content: `<div style="display:grid;gap:6px;">
      <label class="na-label">Nome do preset</label>
      <input type="text" name="name" maxlength="80" value="${escapeHtml(name)}" />
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
                    group: button.form.querySelector('[name="group"]')?.value?.trim() ?? '',
                }),
            },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!result?.name) return null;
    return { name: result.name, group: result.group || 'normal' };
}

/**
 * Abre o gerenciador de presets de dano do Actor.
 * @param {{actorUuid?:string,group?:string}} options
 * @returns {Promise<void>}
 */
export async function openDamagePresetManager({ actorUuid, group } = {}) {
    const actor = await resolveActor(actorUuid);
    if (!actor) return ui.notifications?.warn?.('Nenhum personagem ativo.');
    if (!canEdit(actor))
        return ui.notifications?.error?.('Você não pode editar presets deste personagem.');

    const defaultGroup = presetGroupKey(group);
    const store = parseDamagePresets(actor.system?.props?.[DAMAGE_PRESETS_KEY]);
    const groups = groupedPresets(store.presets);
    const options = groups.length
        ? groups
              .map(
                  (entry) =>
                      `<optgroup label="${escapeHtml(entry.label)}">${entry.presets
                          .map(
                              (preset) =>
                                  `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`
                          )
                          .join('')}</optgroup>`
              )
              .join('')
        : '<option value="">Nenhum preset salvo</option>';

    const action = await foundry.applications.api.DialogV2.wait({
        window: { title: `Presets de dano — ${actor.name ?? 'Personagem'}` },
        modal: true,
        rejectClose: false,
        content: `<p>Presets ficam salvos neste Actor. Custos, ações, calor, crítico e passivas continuam oficiais.</p>
      <select name="preset-id" style="width:100%">${options}</select>`,
        buttons: [
            { action: 'new', label: 'Novo', callback: () => ({ action: 'new' }) },
            {
                action: 'edit',
                label: 'Editar',
                callback: (_event, button) => ({
                    action: 'edit',
                    id: button.form.elements['preset-id']?.value,
                }),
            },
            {
                action: 'delete',
                label: 'Excluir',
                callback: (_event, button) => ({
                    action: 'delete',
                    id: button.form.elements['preset-id']?.value,
                }),
            },
            { action: 'cancel', label: 'Fechar', callback: () => null },
        ],
    });
    if (!action?.action) return null;

    const selected =
        store.presets.find((preset) => String(preset.id) === String(action.id ?? '')) ?? null;

    if (action.action === 'delete') {
        if (!selected) return openDamagePresetManager({ actorUuid: actor.uuid, group });
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Excluir preset' },
            content: `<p>Excluir o preset <strong>${escapeHtml(selected.name)}</strong>?</p>`,
            modal: true,
        });
        if (!confirmed) return openDamagePresetManager({ actorUuid: actor.uuid, group });
        await actor.update(damagePresetsPatch(removeDamagePreset(store.presets, selected.id)), {
            naCsbAutomation: true,
            naDamagePresets: true,
        });
        return openDamagePresetManager({ actorUuid: actor.uuid, group });
    }

    if (action.action === 'new' || (action.action === 'edit' && selected)) {
        const draft = action.action === 'edit' ? selected : null;
        const editor = await openDamageDialog({
            actor,
            nome: draft?.name ?? '',
            entradas: draft?.entries ?? [],
            presets: store.presets,
            presetDraft: {
                id: draft?.id,
                name: draft?.name ?? '',
                groupLabel: presetGroupLabel(draft?.group ?? defaultGroup),
            },
        });
        if (!editor?.preset) return openDamagePresetManager({ actorUuid: actor.uuid, group });
        const result = await saveDamagePreset(actor, editor.preset);
        if (!result.ok) ui.notifications?.warn?.(result.reason);
        else ui.notifications?.info?.(`Preset "${result.preset?.name ?? ''}" salvo.`);
        return openDamagePresetManager({ actorUuid: actor.uuid, group });
    }

    return null;
}
