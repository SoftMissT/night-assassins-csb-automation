/**
 * @fileoverview DialogV2 para rolagem de dano com múltiplas entradas.
 */

import { ATTRIBUTES, TIPOS_ACAO, TIPOS_DANO } from "../constants.mjs";
import { parseAttributeValue } from "../parsing.mjs";

function buildEntryFormula(dado, fixo, selAttrs, attrValues) {
  const parts = [];
  const cleanDado = (dado || "").trim();
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

  return parts.length > 0 ? parts.join(" ") : "0";
}

function makeAcaoOpts(sel) {
  return `<option value="">— Nenhuma —</option>
    ${TIPOS_ACAO.filter((t) => t.damage && t.key !== "epica").map((t) => `<option value="${t.key}" ${sel === t.key ? "selected" : ""}>${t.label}</option>`).join("")}`;
}

function makeDanoCheckboxes(selTipos, idx) {
  return TIPOS_DANO.map((t) => {
    const chk = selTipos.includes(t.key) ? "checked" : "";
    return `<label class="na-dano-label" title="${t.desc}">
      <input type="checkbox" class="na-dano-chk" data-idx="${idx}" value="${t.key}" ${chk} />
      <span>${t.label}</span>
    </label>`;
  }).join("");
}

function makeAttrCheckboxes(selAttrs, idx, attrValues) {
  return ATTRIBUTES.map(({ key, label, color }) => {
    const chk = selAttrs.includes(key) ? "checked" : "";
    return `<label class="na-attr-label">
      <input type="checkbox" class="na-attr-chk" data-idx="${idx}" value="${key}" ${chk} />
      <span style="color:${color};font-weight:700;font-size:11px;">${label}</span>
      <span style="color:#9C9284;font-size:10px;">${attrValues[key] ?? 0}</span>
    </label>`;
  }).join("");
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
        <input type="text" class="na-dado-inp" data-idx="${idx}" value="${e.dado ?? ""}" placeholder="sem dado" />
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

/**
 * Abre o dialog de dano e retorna os dados confirmados ou null.
 * @param {object} options
 * @param {Actor} options.actor
 * @param {string} options.nome
 * @param {Array} options.entradas
 * @param {number} options.pdrCusto
 * @returns {Promise<{nome:string,pdrGasto:number,entradas:Array}|null>}
 */
export async function openDamageDialog({ actor, nome, entradas, pdrCusto }) {
  const props = actor?.system?.props ?? {};
  const attrValues = {};
  for (const { key } of ATTRIBUTES) {
    attrValues[key] = parseAttributeValue(props[`${key}_display`]);
  }

  const preEntradas = Array.isArray(entradas) && entradas.length > 0
    ? entradas.map((e) => ({
        tipoAcao: e.tipoAcao ?? "",
        dado: e.dado ?? "",
        fixo: Number.isFinite(Number(e.fixo)) ? Number(e.fixo) : 0,
        attrs: Array.isArray(e.attrs) ? e.attrs : e.attr ? [e.attr] : [],
        tiposDano: Array.isArray(e.tiposDano) ? e.tiposDano : e.tipoDano ? [e.tipoDano] : [],
      }))
    : [{
        tipoAcao: "",
        dado: "",
        fixo: 0,
        attrs: [],
        tiposDano: [],
      }];

  const entradasIniciais = preEntradas.map((e, i) => makeEntradaHtml(e, i, attrValues)).join("");

  const content = `
  <div class="na-dmg-dialog">
    <div style="margin-bottom:8px;">
      <label class="na-label">Nome do Ataque / Técnica</label>
      <input type="text" id="na-dmg-nome" value="${nome ?? ""}" placeholder="ex: Corte Celestial" />
    </div>
    <div id="na-entradas-container">${entradasIniciais}</div>
    <button type="button" id="na-add-btn">+ Adicionar Entrada de Dano</button>
    <div style="margin-bottom:8px;">
      <label class="na-label">PDR / PDK a Gastar <span class="na-hint">(total)</span></label>
      <input type="number" id="na-dmg-pdr" min="0" value="${Number.isFinite(Number(pdrCusto)) ? Number(pdrCusto) : 0}" placeholder="0" />
      <div class="na-hint" style="margin-top:2px;">Somado à chave <code>pdr_slayer_gasto_valor</code>.</div>
    </div>
    <label class="na-label">Fórmula Total</label>
    <div id="na-total-preview">—</div>
  </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Rolar Dano — Night Assassins" },
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "rolar",
        label: "Rolar",
        callback: (event, button) => {
          const form = button.form;
          const container = form.querySelector("#na-entradas-container");
          const entries = [];
          container.querySelectorAll(".na-entrada").forEach((el) => {
            const idx = el.dataset.idx;
            const dado = el.querySelector(`.na-dado-inp[data-idx="${idx}"]`)?.value?.trim() || "";
            const fixo = Number(el.querySelector(`.na-fixo-inp[data-idx="${idx}"]`)?.value) || 0;
            const tipoAcao = el.querySelector(`.na-acao-sel[data-idx="${idx}"]`)?.value || "";
            const selTiposDano = [];
            el.querySelectorAll(`.na-dano-chk[data-idx="${idx}"]:checked`).forEach((cb) => selTiposDano.push(cb.value));
            const selAttrs = [];
            el.querySelectorAll(`.na-attr-chk[data-idx="${idx}"]:checked`).forEach((cb) => {
              if (ATTRIBUTES.some((a) => a.key === cb.value)) selAttrs.push(cb.value);
            });
            entries.push({ dado, fixo, tipoAcao, selTiposDano, selAttrs });
          });
          return {
            nome: form.querySelector("#na-dmg-nome")?.value?.trim() || "Dano",
            pdrGasto: Math.max(0, Number(form.querySelector("#na-dmg-pdr")?.value) || 0),
            entradas: entries,
          };
        },
      },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });

  return result ?? null;
}
