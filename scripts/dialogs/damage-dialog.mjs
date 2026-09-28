/**
 * @fileoverview DialogV2 para rolagem de dano com múltiplas entradas e presets.
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
    return `<option value="">Nenhuma -</option>
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
      <span style="color:${color};font-weight:700;font-size:11px;">${label}</span>
      <span style="color:#9C9284;font-size:10px;">${attrValues[key] ?? 0}</span>
    </label>`;
    }).join('');
}

function makeEntradaHtml(e, idx, attrValues) {
    return `
  <div class="na-entrada" data-idx="${idx}">
    <div class="na-entry-header">
      <strong class="na-entry-num"></strong>
      <button type="button" class="na-remove-btn" data-idx="${idx}">✕</button>
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
    </div>
    <div class="na-row-grid" style="margin-top:4px;">
      <div>
        <label class="na-label">+ Fixo Adicional</label>
        <input type="number" class="na-fixo-inp" data-idx="${idx}" value="${e.fixo ?? 0}" placeholder="0" />
      </div>
      <div>
        <label class="na-label">Atributos no Dano</label>
        <div class="na-attrs">${makeAttrCheckboxes(e.attrs ?? [], idx, attrValues)}</div>
      </div>
    </div>
    <label class="na-label" style="margin-top:6px;">Tipo(s) de Dano</label>
    <div class="na-dano-grid">${makeDanoCheckboxes(e.tiposDano ?? [], idx)}</div>
    <div class="na-dano-tip" data-idx="${idx}"></div>
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
        const tiposDano = [];
        el.querySelectorAll(`.na-dano-chk[data-idx="${idx}"]:checked`).forEach((cb) =>
            tiposDano.push(cb.value)
        );
        const attrs = [];
        el.querySelectorAll(`.na-attr-chk[data-idx="${idx}"]:checked`).forEach((cb) => {
            if (ATTRIBUTES.some((a) => a.key === cb.value)) attrs.push(cb.value);
        });
        entries.push({ tipoAcao, dado, fixo, attrs, tiposDano });
    });
    return entries;
}

function presetOptionsHtml(presets, selected = '') {
    const groups = groupedPresets(presets);
    if (groups.length === 0) return '<option value="">Nenhum preset salvo</option>';
    return groups
        .map(
            (group) =>
                `<optgroup label="${escapeHtml(group.label)}">${group.presets
                    .map(
                        (preset) =>
                            `<option value="${escapeHtml(preset.id)}" ${preset.id === selected ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
                    )
                    .join('')}</optgroup>`
        )
        .join('');
}

function presetRowHtml(presets, { presetDraft, onSavePreset, onManagePresets }) {
    const hasPresets = Array.isArray(presets) && presets.length > 0;
    if (!hasPresets && !onSavePreset && !onManagePresets) return '';
    const saveButton = onSavePreset
        ? '<button type="button" id="na-save-preset-btn">Salvar como preset</button>'
        : '';
    const manageButton =
        onManagePresets && !presetDraft
            ? '<button type="button" id="na-manage-presets-btn">Gerenciar</button>'
            : '';
    return `<div class="na-preset-row" style="margin-bottom:8px;">
      <label class="na-label">Preset de dano</label>
      <div style="display:flex;gap:6px;align-items:center;">
        <select id="na-preset-sel" style="flex:1;">${
            hasPresets ? '<option value="">— nenhum —</option>' : ''
        }${presetOptionsHtml(presets, presetDraft?.id ?? '')}</select>
        ${saveButton}${manageButton}
      </div>
    </div>`;
}

function presetFieldsHtml(draft) {
    const groupList = PRESET_GROUPS.map(
        (group) => `<option value="${escapeHtml(group.label)}"></option>`
    ).join('');
    return `<div class="na-preset-fields" style="margin-bottom:8px;">
      <label class="na-label">Nome do preset</label>
      <input type="text" name="na-preset-name" id="na-preset-name" maxlength="80" value="${escapeHtml(draft.name ?? '')}" />
      <label class="na-label">Grupo <span class="na-hint">(Normal, Chamas, Água… ou um grupo próprio)</span></label>
      <input type="text" name="na-preset-group" id="na-preset-group" list="na-preset-group-list" maxlength="40" value="${escapeHtml(draft.groupLabel ?? 'Normal')}" />
      <datalist id="na-preset-group-list">${groupList}</datalist>
    </div>`;
}

function bindDamageDialogInteractions(root, attrValues, options = {}) {
    const container = root?.querySelector?.('#na-entradas-container');
    const addButton = root?.querySelector?.('#na-add-btn');
    const totalPreview = root?.querySelector?.('#na-total-preview');
    if (!container || !addButton) return;

    const renumber = () => {
        container.querySelectorAll('.na-entrada').forEach((entry, index) => {
            const label = entry.querySelector('.na-entry-num');
            if (label) label.textContent = `DANO ${index + 1}`;
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
        if (totalPreview) totalPreview.textContent = formulas.length ? formulas.join(' + ') : '0';
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
            renderEntries(preset.entries);
        });
    }

    const saveButton = root.querySelector?.('#na-save-preset-btn');
    if (saveButton && typeof options.onSavePreset === 'function') {
        saveButton.addEventListener('click', async () => {
            const nome = root.querySelector('#na-dmg-nome')?.value?.trim() || '';
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
                await options.onSavePreset({ nome, entries });
            } finally {
                saveButton.disabled = false;
            }
        });
    }

    const manageButton = root.querySelector?.('#na-manage-presets-btn');
    if (manageButton && typeof options.onManagePresets === 'function')
        manageButton.addEventListener('click', () => options.onManagePresets());

    renumber();
    updatePreview();
}

/**
 * Abre o diálogo de dano e retorna os dados confirmados ou null.
 * Em modo preset (`presetDraft`) devolve `{ preset }` em vez de rolar.
 * @param {object} options
 * @param {Actor} options.actor
 * @param {string} [options.nome]
 * @param {Array} [options.entradas]
 * @param {number} [options.pdrCusto]
 * @param {string} [options.resourceLabel]
 * @param {string} [options.resourceKey]
 * @param {boolean} [options.critical]
 * @param {Array} [options.presets]
 * @param {object|null} [options.presetDraft]
 * @param {Function|null} [options.onSavePreset]
 * @param {Function|null} [options.onManagePresets]
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
    onSavePreset = null,
    onManagePresets = null,
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
              }))
            : [BLANK_ENTRY];

    const presetsById = new Map(
        (Array.isArray(presets) ? presets : []).map((preset) => [String(preset.id), preset])
    );
    const entradasIniciais = preEntradas
        .map((e, i) => makeEntradaHtml(e, i, attrValues))
        .join('');

    const draftFields = presetDraft
        ? presetFieldsHtml({
              name: presetDraft.name ?? nome ?? '',
              groupLabel: presetDraft.groupLabel ?? 'Normal',
          })
        : '';
    const content = `
  <div class="na-dmg-dialog">
    ${draftFields}
    ${presetRowHtml(presets, { presetDraft, onSavePreset, onManagePresets })}
    <div style="margin-bottom:8px;">
      <label class="na-label">Nome do Ataque / Técnica</label>
      <input type="text" id="na-dmg-nome" value="${escapeHtml(nome ?? '')}" placeholder="ex: Corte Celestial" />
    </div>
    <div id="na-entradas-container">${entradasIniciais}</div>
    <button type="button" id="na-add-btn">+ Adicionar Entrada de Dano</button>
    ${
        presetDraft
            ? ''
            : `<div style="margin-bottom:8px;">
      <label class="na-label">${resourceLabel} a Gastar <span class="na-hint">(total)</span></label>
      <input type="number" id="na-dmg-pdr" min="0" value="${Number.isFinite(Number(pdrCusto)) ? Number(pdrCusto) : 0}" placeholder="0" />
      <div class="na-hint" style="margin-top:2px;">Somado à chave <code>${resourceKey}</code>.</div>
    </div>
    <label class="na-label">Fórmula Total</label>
    <div id="na-total-preview">-</div>
    <label class="na-critical-toggle">
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
            onSavePreset,
            onManagePresets,
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
            window: { title: presetDraft ? 'Preset de Dano Night Assassins' : 'Rolar Dano Night Assassins' },
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
