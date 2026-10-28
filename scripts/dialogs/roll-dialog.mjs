/**
 * @fileoverview DialogV2 para rolagem geral de teste.
 */

import { ATTRIBUTES } from '../constants.mjs';
import { parseAttributeValue } from '../parsing.mjs';
import { messageModeOptionsHtml } from '../damage-formula.mjs';

const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

const signed = (value) => (value >= 0 ? `+ ${value}` : `- ${Math.abs(value)}`);

/**
 * Prévia da fórmula: o mesmo desenho que o serviço rola, com os bônus automáticos
 * somados num número só (o chat detalha cada um).
 */
export function previewFormula({ value, secVal = 0, autoModifier = 0, bonusRaw = '' }) {
    let formula = `1d20 + ${value}`;
    if (secVal) formula += ` + ${secVal}`;
    if (autoModifier) formula += ` ${signed(autoModifier)}`;
    const manual = String(bonusRaw ?? '').trim().replace(/^\+/, '');
    return manual ? `${formula} + ${manual}` : formula;
}

/** Bloco "Bônus automáticos": o que a ficha já soma sozinha, com a origem de cada parcela. */
export function autoBonusMarkup(bonuses = [], notes = []) {
    const rows = bonuses.length
        ? bonuses.map((label) => `<li>${escapeHtml(label)}</li>`).join('')
        : '<li class="na-rm-auto-empty">Nenhum bônus automático neste teste.</li>';
    const hints = notes.map((note) => `<li class="na-rm-auto-note">${escapeHtml(note)}</li>`).join('');
    return `<div class="na-rm-auto" style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Bônus automáticos</label>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.5;">${rows}${hints}</ul>
      </div>`;
}

/**
 * Abre o dialog de teste geral e retorna os parâmetros escolhidos.
 * @param {object} options
 * @param {Actor} options.actor
 * @param {string} options.test
 * @param {string} options.attr
 * @param {number} options.value valor final do atributo primário
 * @param {string} [options.color]
 * @param {string[]} [options.bonuses] rótulos dos bônus automáticos (já com sinal e valor)
 * @param {string[]} [options.notes] avisos que não entram como número (Vantagem, bônus condicional)
 * @param {number} [options.autoModifier] soma dos bônus automáticos, só para a prévia
 * @returns {Promise<{mode:string,rollMode:string,secVal:number,secKey:string,bonusRaw:string,cdVal:number}|null>}
 */
export async function openRollDialog({
    actor,
    test,
    attr,
    value,
    color,
    bonuses = [],
    notes = [],
    autoModifier = 0,
}) {
    const props = actor?.system?.props ?? {};
    const primaryKey = attr ? attr.toLowerCase() : '';
    const secondaryOptions = [{ key: '', label: 'Nenhum', val: 0 }];
    for (const { key, label } of ATTRIBUTES) {
        if (key !== primaryKey)
            secondaryOptions.push({ key, label, val: parseAttributeValue(props[`${key}_display`]) });
    }

    const secOptionsHtml = secondaryOptions
        .map(
            (o) =>
                `<option value="${o.val}" data-key="${o.key}">${o.label}${o.val ? ` = ${o.val}` : ''}</option>`
        )
        .join('');

    const content = `
    <div class="na-csb-automation">
      <div style="margin-bottom:12px;">
        ${attr ? `<div style="font-size:13px;color:${escapeHtml(color || '#666')};margin-bottom:4px;font-weight:600;">${escapeHtml(attr)} = ${value}</div>` : ''}
        <div id="na-rm-formula" style="font-family:monospace;font-size:14px;background:#120f14;color:#f7f7f7;padding:6px 8px;border-radius:3px;border:1px solid #4a3a2a;">${escapeHtml(previewFormula({ value, autoModifier }))}</div>
      </div>
      ${autoBonusMarkup(bonuses, notes)}
      <div style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Atributo Secundário (até 1)</label>
        <select id="na-rm-secattr" style="width:100%;padding:4px;box-sizing:border-box;">${secOptionsHtml}</select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Bônus situacional (manual)</label>
        <input type="text" id="na-rm-bonus" placeholder="ex: 1d4, +2, 5" style="width:100%;padding:4px;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">CD do Teste (opcional)</label>
        <input type="number" id="na-rm-cd" min="0" placeholder="ex: 15" style="width:100%;padding:4px;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:6px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Modo de Rolagem</label>
        <select id="na-rm-rollmode" style="width:100%;padding:4px;box-sizing:border-box;">
          ${messageModeOptionsHtml()}
        </select>
      </div>
    </div>
  `;

    const readForm = (mode) => (_event, button) => {
        const form = button.form;
        const sec = form.elements['na-rm-secattr'];
        return {
            mode,
            rollMode: form.elements['na-rm-rollmode'].value ?? 'publicroll',
            secVal: Number(sec.value) || 0,
            secKey: sec.selectedOptions?.[0]?.dataset?.key ?? '',
            bonusRaw: form.elements['na-rm-bonus'].value ?? '',
            cdVal: Number(form.elements['na-rm-cd'].value) || 0,
        };
    };

    // Prévia ao vivo: a fórmula acompanha o secundário e o bônus manual.
    const render = (_event, dialog) => {
        const root = dialog.element;
        const display = root?.querySelector('#na-rm-formula');
        const sec = root?.querySelector('#na-rm-secattr');
        const bonus = root?.querySelector('#na-rm-bonus');
        if (!display) return;
        const update = () => {
            display.textContent = previewFormula({
                value,
                secVal: Number(sec?.value) || 0,
                autoModifier,
                bonusRaw: bonus?.value ?? '',
            });
        };
        sec?.addEventListener('change', update);
        bonus?.addEventListener('input', update);
    };

    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: test },
        content,
        modal: true,
        rejectClose: false,
        render,
        buttons: [
            { action: 'advantage', label: 'Vantagem', callback: readForm('advantage') },
            { action: 'normal', label: 'Normal', default: true, callback: readForm('normal') },
            { action: 'disadvantage', label: 'Desvantagem', callback: readForm('disadvantage') },
            // DialogV2 usa o action quando o callback retorna null/undefined;
            // false mantém o cancelamento falso para o chamador.
            { action: 'cancel', label: 'Cancelar', callback: () => false },
        ],
    });

    return result ?? null;
}
