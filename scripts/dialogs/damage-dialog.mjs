/**
 * @fileoverview DialogV2 único para rolar dano: múltiplas entradas, presets do
 * usuário e inclusão inline de dano de arma e de Formas de Respiração.
 *
 * Sem diálogos aninhados: seleções e o salvar de preset acontecem em painéis
 * embutidos, evitando o backdrop de modal que travava o diálogo de baixo.
 */

import { ATTRIBUTES, TIPOS_ACAO, TIPOS_DANO } from '../constants.mjs';
import { parseAttributeValue } from '../parsing.mjs';
import { PRESET_GROUPS, groupedPresets, presetGroupLabel } from '../damage-preset-service.mjs';

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
    const attackIndex =
        Number.isInteger(Number(e.attackIndex)) && e.attackIndex !== '' ? Number(e.attackIndex) : '';
    const source = String(e.source ?? '').trim();
    return `
  <div class="na-entrada" data-idx="${idx}">
    <input type="hidden" class="na-entry-attackidx" data-idx="${idx}" value="${attackIndex}" />
    <input type="hidden" class="na-entry-source" data-idx="${idx}" value="${escapeHtml(source)}" />
    <div class="na-entry-bar">
      <span class="na-entry-num" title="Entrada">${idx + 1}</span>
      <select class="na-acao-sel" data-idx="${idx}" title="Tipo de Ação">${makeAcaoOpts(e.tipoAcao)}</select>
      <input type="text" class="na-dado-inp" data-idx="${idx}" value="${escapeHtml(e.dado ?? '')}" placeholder="dados (3d8)" title="Dado(s)" />
      <input type="number" class="na-fixo-inp" data-idx="${idx}" value="${e.fixo ?? 0}" placeholder="+fixo" title="Fixo adicional" />
      <span class="na-entry-source-label" title="${escapeHtml(source)}">${escapeHtml(source)}</span>
      <button type="button" class="na-remove-btn" data-idx="${idx}" title="Remover entrada">✕</button>
    </div>
    <div class="na-entry-tags">
      <div class="na-attrs" title="Atributos no dano">${makeAttrCheckboxes(e.attrs ?? [], idx, attrValues)}</div>
      <div class="na-dano-grid" title="Tipos de dano">${makeDanoCheckboxes(e.tiposDano ?? [], idx)}</div>
    </div>
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
        const source = el.querySelector(`.na-entry-source[data-idx="${idx}"]`)?.value?.trim() || '';
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
        if (source) entry.source = source;
        entries.push(entry);
    });
    return entries;
}

function hasContentEntry(entry) {
    return Boolean(
        entry.dado || entry.fixo !== 0 || entry.attrs.length > 0 || entry.tiposDano.length > 0
    );
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

function presetRowHtml(presets, { presetDraft, onSavePreset }) {
    const hasPresets = Array.isArray(presets) && presets.length > 0;
    if (!hasPresets && !onSavePreset) return '';
    const saveButton = onSavePreset
        ? '<button type="button" id="na-save-preset-btn" class="na-btn na-btn-gold">Salvar como preset</button>'
        : '';
    return `<section class="na-dmg-presets">
      <label class="na-label">Preset de dano</label>
      <div class="na-dmg-presets-row">
        <select id="na-preset-sel">${
            hasPresets ? '<option value="">— aplicar preset —</option>' : ''
        }${presetOptionsHtml(presets, presetDraft?.id ?? '')}</select>
        ${saveButton}
      </div>
    </section>`;
}

function groupListHtml() {
    return PRESET_GROUPS.map(
        (group) => `<option value="${escapeHtml(group.label)}"></option>`
    ).join('');
}

function presetFieldsHtml(draft) {
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
        </div>
      </div>
    </section>`;
}

function inlineSavePanelHtml() {
    return `<section class="na-inline-panel" id="na-save-preset-panel" hidden>
      <div class="na-row-grid">
        <div>
          <label class="na-label">Nome do preset</label>
          <input type="text" name="na-save-name" id="na-save-name" maxlength="80" placeholder="ex: Rengoku crítico" />
        </div>
        <div>
          <label class="na-label">Respiração usada</label>
          <input type="text" name="na-save-breathing" id="na-save-breathing" maxlength="60" placeholder="ex: Chamas" />
        </div>
        <div>
          <label class="na-label">Grupo</label>
          <input type="text" name="na-save-group" id="na-save-group" list="na-preset-group-list" maxlength="40" value="Normal" />
        </div>
      </div>
      <div class="na-inline-actions">
        <button type="button" id="na-save-confirm" class="na-btn na-btn-gold">Salvar preset</button>
        <button type="button" id="na-save-cancel" class="na-btn">Cancelar</button>
        <span class="na-hint">Custo, ação, calor, crítico e passivas seguem oficiais.</span>
      </div>
    </section>`;
}

function weaponPanelHtml(weaponCatalog) {
    const options = weaponCatalog
        .map(
            (entry, index) => `<option value="${index}">${escapeHtml(entry.label)}</option>`
        )
        .join('');
    return `<section class="na-inline-panel" id="na-weapon-panel" hidden>
      <label class="na-label">Arma / perfil</label>
      <div class="na-inline-actions">
        <select id="na-weapon-select">${options}</select>
        <button type="button" id="na-weapon-add" class="na-btn na-btn-gold">Adicionar</button>
        <button type="button" id="na-weapon-cancel" class="na-btn">Cancelar</button>
      </div>
    </section>`;
}

function breathingPanelHtml(breathingCatalog) {
    const breathingOptions = breathingCatalog
        .map(
            (group) =>
                `<option value="${escapeHtml(group.breathing)}">${escapeHtml(group.breathing)}</option>`
        )
        .join('');
    return `<section class="na-inline-panel" id="na-breath-panel" hidden>
      <div class="na-row-grid">
        <div><label class="na-label">Respiração</label><select id="na-breath-breathing">${breathingOptions}</select></div>
        <div><label class="na-label">Forma</label><select id="na-breath-form"></select></div>
        <div><label class="na-label">Nível</label><select id="na-breath-level"></select></div>
      </div>
      <div class="na-inline-actions">
        <button type="button" id="na-breath-add" class="na-btn na-btn-gold">Adicionar</button>
        <button type="button" id="na-breath-cancel" class="na-btn">Cancelar</button>
        <span class="na-hint" id="na-breath-hint"></span>
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
            if (label) label.textContent = String(index + 1);
        });
    };

    const updatePreview = () => {
        const formulas = [];
        container.querySelectorAll('.na-entrada').forEach((entry) => {
            const idx = entry.dataset.idx;
            const dado = entry.querySelector(`.na-dado-inp[data-idx="${idx}"]`)?.value?.trim() ?? '';
            const fixo = Number(entry.querySelector(`.na-fixo-inp[data-idx="${idx}"]`)?.value) || 0;
            const attrs = [
                ...entry.querySelectorAll(`.na-attr-chk[data-idx="${idx}"]:checked`),
            ].map((checkbox) => checkbox.value);
            const formula = buildEntryFormula(dado, fixo, attrs, attrValues);
            const preview = entry.querySelector('.na-linha-preview');
            if (preview) preview.textContent = `= ${formula}`;
            if (formula !== '0') formulas.push(formula);
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

    const currentEntries = () =>
        collectEntries(container).filter((entry) => hasContentEntry(entry));

    const appendEntries = (added, label) => {
        if (!Array.isArray(added) || added.length === 0) return;
        renderEntries([...currentEntries(), ...added]);
        if (label) {
            const nameInput = root.querySelector('#na-dmg-nome');
            if (nameInput && !nameInput.value.trim()) nameInput.value = label;
        }
    };

    const setPanel = (selector, visible) => {
        const panel = root.querySelector?.(selector);
        if (panel) panel.hidden = !visible;
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
        const hasAny = container.querySelector('.na-entrada');
        if (!hasAny) renderEntries([]);
        else {
            renumber();
            updatePreview();
        }
    });
    container.addEventListener('input', updatePreview);
    container.addEventListener('change', updatePreview);

    // Aplicar preset --------------------------------------------------------
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

    // Salvar preset (inline) ------------------------------------------------
    const saveToggle = root.querySelector?.('#na-save-preset-btn');
    if (saveToggle && typeof options.onSavePreset === 'function') {
        saveToggle.addEventListener('click', () => {
            const panel = root.querySelector('#na-save-preset-panel');
            const willShow = panel?.hidden !== false;
            if (willShow) {
                const nameInput = root.querySelector('#na-save-name');
                if (nameInput && !nameInput.value.trim())
                    nameInput.value = root.querySelector('#na-dmg-nome')?.value?.trim() ?? '';
                const breathingInput = root.querySelector('#na-save-breathing');
                if (breathingInput && !breathingInput.value.trim() && options.breathing)
                    breathingInput.value = options.breathing;
                const groupInput = root.querySelector('#na-save-group');
                if (groupInput && options.breathing && groupInput.value === 'Normal')
                    groupInput.value = presetGroupLabel(options.breathing);
            }
            setPanel('#na-save-preset-panel', willShow);
        });

        root.querySelector('#na-save-cancel')?.addEventListener('click', () =>
            setPanel('#na-save-preset-panel', false)
        );

        root.querySelector('#na-save-confirm')?.addEventListener('click', async () => {
            const entries = currentEntries();
            if (entries.length === 0)
                return globalThis.ui?.notifications?.warn?.(
                    'Adicione ao menos uma entrada de dano.'
                );
            const draft = {
                name: root.querySelector('#na-save-name')?.value?.trim() ?? '',
                breathing: root.querySelector('#na-save-breathing')?.value?.trim() ?? '',
                group: root.querySelector('#na-save-group')?.value?.trim() ?? '',
                resourceCost: Math.max(0, Number(root.querySelector('#na-dmg-pdr')?.value) || 0),
                entries,
            };
            if (!draft.name)
                return globalThis.ui?.notifications?.warn?.('Dê um nome ao preset.');
            const confirm = root.querySelector('#na-save-confirm');
            if (confirm) confirm.disabled = true;
            try {
                await options.onSavePreset(draft);
                setPanel('#na-save-preset-panel', false);
            } finally {
                if (confirm) confirm.disabled = false;
            }
        });
    }

    // Dano da arma (inline) -------------------------------------------------
    const weaponButton = root.querySelector?.('#na-weapon-btn');
    if (weaponButton) {
        weaponButton.addEventListener('click', () => {
            const catalog = options.weaponCatalog ?? [];
            if (catalog.length === 0)
                return globalThis.ui?.notifications?.warn?.(
                    'Nenhuma arma encontrada neste personagem.'
                );
            if (catalog.length === 1) return appendEntries(catalog[0].entries, catalog[0].label);
            setPanel('#na-weapon-panel', root.querySelector('#na-weapon-panel')?.hidden !== false);
        });
        root.querySelector('#na-weapon-cancel')?.addEventListener('click', () =>
            setPanel('#na-weapon-panel', false)
        );
        root.querySelector('#na-weapon-add')?.addEventListener('click', () => {
            const catalog = options.weaponCatalog ?? [];
            const chosen = Number(root.querySelector('#na-weapon-select')?.value);
            const entry = Number.isInteger(chosen) ? catalog[chosen] : null;
            if (entry) appendEntries(entry.entries, entry.label);
            setPanel('#na-weapon-panel', false);
        });
    }

    // Respiração (inline) ---------------------------------------------------
    const breathButton = root.querySelector?.('#na-breath-btn');
    if (breathButton) {
        const catalog = options.breathingCatalog ?? [];
        const breathingSelect = root.querySelector('#na-breath-breathing');
        const formSelect = root.querySelector('#na-breath-form');
        const levelSelect = root.querySelector('#na-breath-level');
        const hint = root.querySelector('#na-breath-hint');

        const currentGroup = () =>
            catalog.find((group) => group.breathing === breathingSelect?.value) ?? catalog[0];

        const updateHint = () => {
            const group = currentGroup();
            const form = group?.forms.find((entry) => entry.key === formSelect?.value);
            const entries = form?.levels?.[Number(levelSelect?.value)] ?? [];
            if (hint)
                hint.textContent = entries.length
                    ? entries.map((entry) => entry.dado || 'dano').join(' + ')
                    : '—';
        };
        const fillLevels = () => {
            const group = currentGroup();
            const form =
                group?.forms.find((entry) => entry.key === formSelect?.value) ?? group?.forms[0];
            const levels = form
                ? Object.keys(form.levels)
                      .map(Number)
                      .sort((left, right) => left - right)
                : [];
            if (levelSelect)
                levelSelect.innerHTML = levels
                    .map((level) => `<option value="${level}">Nível ${level}</option>`)
                    .join('');
            updateHint();
        };
        const fillForms = () => {
            const group = currentGroup();
            if (formSelect)
                formSelect.innerHTML = (group?.forms ?? [])
                    .map(
                        (form) =>
                            `<option value="${escapeHtml(form.key)}">${escapeHtml(form.formName)}</option>`
                    )
                    .join('');
            fillLevels();
        };

        breathingSelect?.addEventListener('change', fillForms);
        formSelect?.addEventListener('change', fillLevels);
        levelSelect?.addEventListener('change', updateHint);

        breathButton.addEventListener('click', () => {
            if (catalog.length === 0)
                return globalThis.ui?.notifications?.warn?.(
                    'Nenhuma Forma de Respiração encontrada neste personagem.'
                );
            const panel = root.querySelector('#na-breath-panel');
            const willShow = panel?.hidden !== false;
            if (willShow && panel && !panel.dataset.ready) {
                fillForms();
                panel.dataset.ready = '1';
            }
            setPanel('#na-breath-panel', willShow);
        });
        root.querySelector('#na-breath-cancel')?.addEventListener('click', () =>
            setPanel('#na-breath-panel', false)
        );
        root.querySelector('#na-breath-add')?.addEventListener('click', () => {
            const group = currentGroup();
            const form =
                group?.forms.find((entry) => entry.key === formSelect?.value) ?? group?.forms[0];
            const entries = form?.levels?.[Number(levelSelect?.value)] ?? [];
            if (entries.length === 0)
                return globalThis.ui?.notifications?.warn?.('Nível sem dano nesta Forma.');
            appendEntries(entries, `${group?.breathing ?? ''} ${form?.formName ?? ''}`.trim());
            setPanel('#na-breath-panel', false);
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
    weaponCatalog = [],
    breathingCatalog = [],
    onSavePreset = null,
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
                  ...(e.source ? { source: String(e.source) } : {}),
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

    ${presetRowHtml(presets, { presetDraft, onSavePreset })}
    ${!presetDraft && onSavePreset ? inlineSavePanelHtml() : ''}

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
        <button type="button" id="na-breath-btn" class="na-btn">+ Respiração</button>
      </div>
    </div>
    ${weaponCatalog.length ? weaponPanelHtml(weaponCatalog) : ''}
    ${breathingCatalog.length ? breathingPanelHtml(breathingCatalog) : ''}
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
    <datalist id="na-preset-group-list">${groupListHtml()}</datalist>
  </div>`;

    const hookApi = globalThis.Hooks;
    const renderHook = hookApi?.on?.('renderDialogV2', (dialog, element) => {
        const root = element?.querySelector ? element : element?.[0];
        if (!root?.querySelector?.('#na-add-btn')) return;
        bindDamageDialogInteractions(root, attrValues, {
            presetsById,
            breathing,
            weaponCatalog,
            breathingCatalog,
            onSavePreset,
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
                      const entries = collectEntries(container).filter(hasContentEntry);
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
            position: { width: 720 },
            content,
            // Modal: overlay padrão; não reflui nem compete com a HUD atrás.
            // Sem diálogos aninhados (salvar/arma/Respiração são painéis inline).
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
