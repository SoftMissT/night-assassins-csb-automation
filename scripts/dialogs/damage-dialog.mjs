/**
 * @fileoverview DialogV2 para rolagem de dano com múltiplas entradas, dano de
 * arma e presets registráveis pelo usuário.
 */

import { ATTRIBUTES, TIPOS_ACAO, TIPOS_DANO } from '../constants.mjs';
import { parseAttributeValue } from '../parsing.mjs';
import { PRESET_GROUPS, groupedPresets } from '../damage-preset-service.mjs';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function buildEntryFormula(dado, fixo, selAttrs, attrValues) {
    const parts = [];
    const cleanDado = (dado || '').trim();
    if (cleanDado) parts.push(cleanDado);

    if (fixo !== 0) {
        if (parts.length === 0) parts.push(String(fixo));
        else parts.push(fixo > 0 ? `+ ${fixo}` : `- ${Math.abs(fixo)}`);
    }

    for (const k of selAttrs) {
        const v = attrValues[k] ?? 0;
        if (v !== 0) {
            if (parts.length === 0) parts.push(String(v));
            else parts.push(v > 0 ? `+ ${v}` : `- ${Math.abs(v)}`);
        }
    }

    return parts.length > 0 ? parts.join(' ') : '0';
}

function makeAcaoOpts(sel) {
    return `<option value="">Nenhuma ação</option>
    ${TIPOS_ACAO.filter((t) => t.damage && t.key !== 'epica')
        .map(
            (t) => `<option value="${t.key}" ${sel === t.key ? 'selected' : ''}>${t.label}</option>`
        )
        .join('')}`;
}

function makeDanoCheckboxes(selTipos, idx) {
    return TIPOS_DANO.map((t) => {
        const chk = selTipos.includes(t.key) ? 'checked' : '';
        return `<label class="na-dano-label" title="${t.desc}">
      <input type="checkbox" class="na-dano-chk" data-idx="${idx}" value="${t.key}" ${chk} />
      <span>${t.label}</span>
    </label>`;
    }).join('');
}

function makeAttrCheckboxes(selAttrs, idx, attrValues) {
    return ATTRIBUTES.map(({ key, label, color }) => {
        const chk = selAttrs.includes(key) ? 'checked' : '';
        return `<label class="na-attr-label">
      <input type="checkbox" class="na-attr-chk" data-idx="${idx}" value="${key}" ${chk} />
      <span class="na-attr-key" style="color:${color};">${label}</span>
      <span class="na-attr-val">${attrValues[key] ?? 0}</span>
    </label>`;
    }).join('');
}

function makeEntradaHtml(e, idx, attrValues) {
    const attackIndex = Number.isInteger(Number(e.attackIndex)) && e.attackIndex !== ''
        ? Number(e.attackIndex)
        : '';
    return `
  <div class="na-entrada" data-idx="${idx}">
    <input type="hidden" class="na-entry-attackidx" data-idx="${idx}" value="${attackIndex}" />
    <div class="na-entry-header">
      <strong class="na-entry-num">Dano ${idx + 1}</strong>
      <button type="button" class="na-remove-btn" data-idx="${idx}" title="Remover entrada">✕</button>
    </div>
    <div class="na-row-grid">
      <div>
        <label class="na-label">Tipo de Ação</label>
        <select class="na-acao-sel" data-idx="${idx}">${makeAcaoOpts(e.tipoAcao)}</select>
      </div>
      <div>
        <label class="na-label">Dado(s) <span class="na-hint">(ex: 3d8)</span></label>
        <input type="text" class="na-dado-inp" data-idx="${idx}" value="${escapeHtml(e.dado ?? '')}" placeholder="sem dado" />
      </div>
      <div>
        <label class="na-label">+ Fixo</label>
        <input type="number" class="na-fixo-inp" data-idx="${idx}" value="${e.fixo ?? 0}" placeholder="0" />
      </div>
    </div>
    <label class="na-label">Atributos no Dano</label>
    <div class="na-attrs">${makeAttrCheckboxes(e.attrs ?? [], idx, attrValues)}</div>
    <label class="na-label">Tipo(s) de Dano</label>
    <div class="na-dano-grid">${makeDanoCheckboxes(e.tiposDano ?? [], idx)}</div>
    <div class="na-linha-preview" data-idx="${idx}"></div>
  </div>`;
}

const BLANK_ENTRY = { tipoAcao: '', dado: '', fixo: 0, attrs: [], tiposDano: [] };

function collectEntries(container) {
    const entries = [];
    container.querySelectorAll('.na-entrada').forEach((el) => {
        const idx = el.dataset.idx;
        const dado = el.querySelector(`.na-dado-inp[data-idx="${idx}"]`)?.value?.trim() || '';
        const fixo = Number(el.querySelector(`.na-fixo-inp[data-idx="${idx}"]`)?.value) || 0;
        const tipoAcao = el.querySelector(`.na-acao-sel[data-idx="${idx}"]`)?.value || '';
        const attackIndexRaw = el.querySelector(`.na-entry-attackidx[data-idx="${idx}"]`)?.value;
        const tiposDano = [];
        el.querySelectorAll(`.na-dano-chk[data-idx="${idx}"]:checked`).forEach((cb) =>
            tiposDano.push(cb.value)
        );
        const attrs = [];
        el.querySelectorAll(`.na-attr-chk[data-idx="${idx}"]:checked`).forEach((cb) => {
            if (ATTRIBUTES.some((a) => a.key === cb.value)) attrs.push(cb.value);
        });
        const entry = { tipoAcao, dado, fixo, attrs, tiposDano };
        const attackIndex = Number(attackIndexRaw);
        if (attackIndexRaw !== '' && Number.isInteger(attackIndex) && attackIndex >= 0)
            entry.attackIndex = attackIndex;
        entries.push(entry);
    });
    return entries;
}

function presetOptionsHtml(presets, selected = '') {
    const groups = groupedPresets(presets);
    if (groups.length === 0) return '<option value="">— nenhum preset salvo —</option>';
    return groups
        .map(
            (group) =>
                `<optgroup label="${escapeHtml(group.label)}">${group.presets
                    .map(
                        (preset) =>
                            `<option value="${escapeHtml(preset.id)}" ${preset.id === selected ? 'selected' : ''}>${escapeHtml(preset.name)}${preset.resourceCost ? ` · ${preset.resourceCost} PDR` : ''}</option>`
                    )
                    .join('')}</optgroup>`
        )
        .join('');
}

function presetRowHtml(presets, { presetDraft, onSavePreset, onManagePresets }) {
    const hasPresets = Array.isArray(presets) && presets.length > 0;
    if (!hasPresets && !onSavePreset && !onManagePresets) return '';
    const saveButton = onSavePreset
        ? '<button type="button" id="na-save-preset-btn" class="na-btn na-btn-gold">Salvar como preset</button>'
        : '';
    const manageButton =
        onManagePresets && !presetDraft
            ? '<button type="button" id="na-manage-presets-btn" class="na-btn">⚙ Gerenciar</button>'
            : '';
    return `<section class="na-dmg-presets">
      <label class="na-label">Preset de dano</label>
      <div class="na-dmg-presets-row">
        <select id="na-preset-sel">${
            hasPresets ? '<option value="">— aplicar preset —</option>' : ''
        }${presetOptionsHtml(presets, presetDraft?.id ?? '')}</select>
        ${saveButton}${manageButton}
      </div>
    </section>`;
}

function presetFieldsHtml(draft) {
    const groupList = PRESET_GROUPS.map(
        (group) => `<option value="${escapeHtml(group.label)}"></option>`
    ).join('');
    return `<section class="na-dmg-preset-fields">
      <div class="na-row-grid">
        <div>
          <label class="na-label">Nome do preset</label>
          <input type="text" name="na-preset-name" id="na-preset-name" maxlength="80" value="${escapeHtml(draft.name ?? '')}" placeholder="ex: Rengoku crítico" />
        </div>
        <div>
          <label class="na-label">Respiração <span class="na-hint">(usada)</span></label>
          <input type="text" name="na-preset-breathing" id="na-preset-breathing" maxlength="60" value="${escapeHtml(draft.breathing ?? '')}" placeholder="ex: Chamas" />
        </div>
        <div>
          <label class="na-label">Grupo</label>
          <input type="text" name="na-preset-group" id="na-preset-group" list="na-preset-group-list" maxlength="40" value="${escapeHtml(draft.groupLabel ?? 'Normal')}" />
          <datalist id="na-preset-group-list">${groupList}</datalist>
        </div>
      </div>
    </section>`;
}

function contextChipsHtml({ breathing, weaponLabel, presetDraft }) {
    const chips = [];
    if (breathing) chips.push(`<span class="na-dmg-chip na-dmg-chip-breath">${escapeHtml(breathing)}</span>`);
    if (weaponLabel)
        chips.push(`<span class="na-dmg-chip na-dmg-chip-weapon">${escapeHtml(weaponLabel)}</span>`);
    if (presetDraft) chips.push('<span class="na-dmg-chip na-dmg-chip-preset">Modo preset</span>');
    return chips.length ? `<div class="na-dmg-chips">${chips.join('')}</div>` : '';
}

function bindDamageDialogInteractions(root, attrValues, options = {}) {
    const container = root?.querySelector?.('#na-entradas-container');
    const addButton = root?.querySelector?.('#na-add-btn');
    const totalPreview = root?.querySelector?.('#na-total-preview');
    if (!container || !addButton) return;

    const renumber = () => {
        container.querySelectorAll('.na-entrada').forEach((entry, index) => {
            const label = entry.querySelector('.na-entry-num');
            if (label) label.textContent = `Dano ${index + 1}`;
        });
    };

    const updatePreview = () => {
        const formulas = [...container.querySelectorAll('.na-entrada')]
            .map((entry) => {
                const idx = entry.dataset.idx;
                const dado =
                    entry.querySelector(`.na-dado-inp[data-idx="${idx}"]`)?.value?.trim() ?? '';
                const fixo =
                    Number(entry.querySelector(`.na-fixo-inp[data-idx="${idx}"]`)?.value) || 0;
                const attrs = [
                    ...entry.querySelectorAll(`.na-attr-chk[data-idx="${idx}"]:checked`),
                ].map((checkbox) => checkbox.value);
                return buildEntryFormula(dado, fixo, attrs, attrValues);
            })
            .filter((formula) => formula !== '0');
        container.querySelectorAll('.na-entrada').forEach((entry) => {
            const idx = entry.dataset.idx;
            const dado =
                entry.querySelector(`.na-dado-inp[data-idx="${idx}"]`)?.value?.trim() ?? '';
            const fixo = Number(entry.querySelector(`.na-fixo-inp[data-idx="${idx}"]`)?.value) || 0;
            const attrs = [
                ...entry.querySelectorAll(`.na-attr-chk[data-idx="${idx}"]:checked`),
            ].map((checkbox) => checkbox.value);
            const preview = entry.querySelector('.na-linha-preview');
            if (preview) preview.textContent = `= ${buildEntryFormula(dado, fixo, attrs, attrValues)}`;
        });
        if (totalPreview) totalPreview.textContent = formulas.length ? formulas.join('  +  ') : '0';
    };

    const renderEntries = (entries) => {
        const list = Array.isArray(entries) && entries.length > 0 ? entries : [BLANK_ENTRY];
        container.innerHTML = list
            .map((entry, index) => makeEntradaHtml(entry, index, attrValues))
            .join('');
        renumber();
        updatePreview();
    };

    addButton.addEventListener('click', () => {
        const indexes = [...container.querySelectorAll('.na-entrada')]
            .map((entry) => Number(entry.dataset.idx))
            .filter(Number.isFinite);
        const nextIndex = indexes.length ? Math.max(...indexes) + 1 : 0;
        container.insertAdjacentHTML(
            'beforeend',
            makeEntradaHtml(BLANK_ENTRY, nextIndex, attrValues)
        );
        renumber();
        updatePreview();
    });

    container.addEventListener('click', (event) => {
        const removeButton = event.target.closest?.('.na-remove-btn');
        if (!removeButton) return;
        removeButton.closest('.na-entrada')?.remove();
        renumber();
        updatePreview();
    });
    container.addEventListener('input', updatePreview);
    container.addEventListener('change', updatePreview);

    const presetSelect = root.querySelector?.('#na-preset-sel');
    if (presetSelect && typeof options.presetsById?.get === 'function') {
        presetSelect.addEventListener('change', () => {
            const preset = options.presetsById.get(presetSelect.value);
            if (!preset) return;
            const nomeInput = root.querySelector('#na-dmg-nome');
            if (nomeInput) nomeInput.value = preset.name ?? '';
            const pdrInput = root.querySelector('#na-dmg-pdr');
            if (pdrInput) pdrInput.value = Number(preset.resourceCost) || 0;
            const breathingInput = root.querySelector('#na-preset-breathing');
            if (breathingInput && preset.breathing) breathingInput.value = preset.breathing;
            const nameInput = root.querySelector('#na-preset-name');
            if (nameInput && preset.name) nameInput.value = preset.name;
            const groupInput = root.querySelector('#na-preset-group');
            if (groupInput && preset.group) groupInput.value = preset.group;
            renderEntries(preset.entries);
        });
    }

    const saveButton = root.querySelector?.('#na-save-preset-btn');
    if (saveButton && typeof options.onSavePreset === 'function') {
        saveButton.addEventListener('click', async () => {
            const nome = root.querySelector('#na-dmg-nome')?.value?.trim() || '';
            const resourceCost = Math.max(
                0,
                Number(root.querySelector('#na-dmg-pdr')?.value) || 0
            );
            const entries = collectEntries(container).filter(
                (entry) =>
                    entry.dado ||
                    entry.fixo !== 0 ||
                    entry.attrs.length > 0 ||
                    entry.tiposDano.length > 0
            );
            if (entries.length === 0)
                return globalThis.ui?.notifications?.warn?.('Adicione ao menos uma entrada de dano.');
            saveButton.disabled = true;
            try {
                await options.onSavePreset({
                    nome,
                    entries,
                    resourceCost,
                    breathing: options.breathing ?? '',
                });
            } finally {
                saveButton.disabled = false;
            }
        });
    }

    const manageButton = root.querySelector?.('#na-manage-presets-btn');
    if (manageButton && typeof options.onManagePresets === 'function')
        manageButton.addEventListener('click', () => options.onManagePresets());

    const weaponButton = root.querySelector?.('#na-weapon-btn');
    if (weaponButton && typeof options.onRequestWeaponEntries === 'function') {
        weaponButton.addEventListener('click', async () => {
            weaponButton.disabled = true;
            try {
                const added = await options.onRequestWeaponEntries();
                if (!Array.isArray(added) || added.length === 0) return;
                const current = collectEntries(container).filter(
                    (entry) =>
                        entry.dado ||
                        entry.fixo !== 0 ||
                        entry.attrs.length > 0 ||
                        entry.tiposDano.length > 0
                );
                renderEntries([...current, ...added]);
            } finally {
                weaponButton.disabled = false;
            }
        });
    }

    renumber();
    updatePreview();
}

/**
 * Abre o diálogo de dano e retorna os dados confirmados ou null.
 * Em modo preset (`presetDraft`) devolve `{ preset }` em vez de rolar.
 * @param {object} options
 * @returns {Promise<object|null>}
 */
export async function openDamageDialog({
    actor,
    nome,
    entradas,
    pdrCusto,
    resourceLabel = 'PDR',
    resourceKey = 'pdr_slayer_gasto_valor',
    critical = false,
    presets = [],
    presetDraft = null,
    breathing = '',
    weaponLabel = '',
    onSavePreset = null,
    onManagePresets = null,
    onRequestWeaponEntries = null,
}) {
    const props = actor?.system?.props ?? {};
    const attrValues = {};
    for (const { key } of ATTRIBUTES) {
        attrValues[key] = parseAttributeValue(props[`${key}_display`]);
    }

    const preEntradas =
        Array.isArray(entradas) && entradas.length > 0
            ? entradas.map((e) => ({
                  tipoAcao: e.tipoAcao ?? '',
                  dado: e.dado ?? '',
                  fixo: Number.isFinite(Number(e.fixo)) ? Number(e.fixo) : 0,
                  attrs: Array.isArray(e.attrs) ? e.attrs : e.attr ? [e.attr] : [],
                  tiposDano: Array.isArray(e.tiposDano)
                      ? e.tiposDano
                      : e.tipoDano
                        ? [e.tipoDano]
                        : [],
                  ...(Number.isInteger(Number(e.attackIndex)) && e.attackIndex !== ''
                      ? { attackIndex: Number(e.attackIndex) }
                      : {}),
              }))
            : [BLANK_ENTRY];

    const presetsById = new Map(
        (Array.isArray(presets) ? presets : []).map((preset) => [String(preset.id), preset])
    );
    const entradasIniciais = preEntradas
        .map((e, i) => makeEntradaHtml(e, i, attrValues))
        .join('');

    const title = presetDraft
        ? presetDraft.name
            ? `Preset — ${escapeHtml(presetDraft.name)}`
            : 'Novo preset de dano'
        : escapeHtml(nome || 'Rolar Dano');

    const content = `
  <div class="na-dmg-dialog">
    <header class="na-dmg-head">
      <div>
        <span class="na-dmg-kicker">Night Assassins · Dano</span>
        <h2 class="na-dmg-title">${title}</h2>
      </div>
      ${contextChipsHtml({ breathing, weaponLabel, presetDraft })}
    </header>

    ${presetDraft ? presetFieldsHtml({ ...presetDraft, breathing: presetDraft.breathing ?? breathing }) : ''}

    ${presetRowHtml(presets, { presetDraft, onSavePreset, onManagePresets })}

    ${
        presetDraft
            ? ''
            : `<section class="na-dmg-field">
      <label class="na-label">Nome do Ataque / Técnica</label>
      <input type="text" id="na-dmg-nome" value="${escapeHtml(nome ?? '')}" placeholder="ex: Corte Celestial" />
    </section>`
    }

    <div class="na-dmg-entries-head">
      <span class="na-dmg-entries-title">Entradas de dano</span>
      <div class="na-dmg-entries-actions">
        <button type="button" id="na-add-btn" class="na-btn">+ Entrada</button>
        <button type="button" id="na-weapon-btn" class="na-btn">+ Dano da arma</button>
      </div>
    </div>
    <div id="na-entradas-container">${entradasIniciais}</div>

    <section class="na-dmg-foot">
      <div class="na-dmg-resource">
        <label class="na-label">${resourceLabel} a gastar</label>
        <input type="number" id="na-dmg-pdr" min="0" value="${Number.isFinite(Number(pdrCusto)) ? Number(pdrCusto) : 0}" placeholder="0" />
        <span class="na-hint">somado a <code>${resourceKey}</code></span>
      </div>
      <div class="na-dmg-total">
        <label class="na-label">Fórmula total</label>
        <div id="na-total-preview">0</div>
      </div>
    </section>

    ${
        presetDraft
            ? ''
            : `<label class="na-critical-toggle">
      <input type="checkbox" id="na-dmg-critical" ${critical ? 'checked' : ''} />
      <span><strong>Foi crítico?</strong><small>Dobra o dano final deste ataque antes da resistência.</small></span>
    </label>`
    }
  </div>`;

    const hookApi = globalThis.Hooks;
    const renderHook = hookApi?.on?.('renderDialogV2', (dialog, element) => {
        const root = element?.querySelector ? element : element?.[0];
        if (!root?.querySelector?.('#na-add-btn')) return;
        bindDamageDialogInteractions(root, attrValues, {
            presetsById,
            breathing,
            onSavePreset,
            onManagePresets,
            onRequestWeaponEntries,
        });
    });

    const buttons = presetDraft
        ? [
              {
                  action: 'save',
                  label: 'Salvar preset',
                  default: true,
                  callback: (event, button) => {
                      const form = button.form;
                      const container = form.querySelector('#na-entradas-container');
                      const entries = collectEntries(container).filter(
                          (entry) =>
                              entry.dado ||
                              entry.fixo !== 0 ||
                              entry.attrs.length > 0 ||
                              entry.tiposDano.length > 0
                      );
                      return {
                          preset: {
                              ...(presetDraft.id ? { id: presetDraft.id } : {}),
                              name: form.querySelector('#na-preset-name')?.value?.trim() ?? '',
                              group: form.querySelector('#na-preset-group')?.value?.trim() ?? '',
                              breathing:
                                  form.querySelector('#na-preset-breathing')?.value?.trim() ?? '',
                              resourceCost: Math.max(
                                  0,
                                  Number(form.querySelector('#na-dmg-pdr')?.value) || 0
                              ),
                              entries,
                          },
                      };
                  },
              },
              { action: 'cancel', label: 'Cancelar', callback: () => null },
          ]
        : [
              {
                  action: 'rolar',
                  label: 'Rolar',
                  callback: (event, button) => {
                      const form = button.form;
                      const container = form.querySelector('#na-entradas-container');
                      const entries = collectEntries(container).map((entry) => ({
                          dado: entry.dado,
                          fixo: entry.fixo,
                          tipoAcao: entry.tipoAcao,
                          selTiposDano: entry.tiposDano,
                          selAttrs: entry.attrs,
                          ...(entry.attackIndex !== undefined
                              ? { attackIndex: entry.attackIndex }
                              : {}),
                      }));
                      return {
                          nome: form.querySelector('#na-dmg-nome')?.value?.trim() || 'Dano',
                          pdrGasto: Math.max(
                              0,
                              Number(form.querySelector('#na-dmg-pdr')?.value) || 0
                          ),
                          critical: Boolean(form.querySelector('#na-dmg-critical')?.checked),
                          entradas: entries,
                      };
                  },
              },
              { action: 'cancel', label: 'Cancelar', callback: () => ({ cancelled: true }) },
          ];

    let result;
    try {
        result = await foundry.applications.api.DialogV2.wait({
            window: {
                title: presetDraft
                    ? 'Preset de Dano — Night Assassins'
                    : 'Rolar Dano — Night Assassins',
                resizable: true,
            },
            position: { width: 760 },
            content,
            modal: true,
            rejectClose: false,
            buttons,
        });
    } finally {
        if (renderHook !== undefined) hookApi?.off?.('renderDialogV2', renderHook);
    }

    if (!result) return null;
    if (presetDraft) return result.preset ? result : null;
    return result.cancelled ? null : result;
}
