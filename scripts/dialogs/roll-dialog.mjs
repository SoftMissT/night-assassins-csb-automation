/**
 * @fileoverview DialogV2 para rolagem geral de teste.
 */

import { ATTRIBUTES, ATTR_NAMES, ATTR_COLORS } from "../constants.mjs";
import { parseAttributeValue } from "../parsing.mjs";

function buildFormula(mode, val, secVal, bonusExtra) {
  const dice = mode === "advantage" ? "2d20kh1" : mode === "disadvantage" ? "2d20kl1" : "1d20";
  let base = `${dice} + ${val}`;
  if (secVal) base += ` + ${secVal}`;
  return bonusExtra ? `${base} ${bonusExtra}` : base;
}

function parseBonus(raw) {
  const s = (raw || "").trim();
  if (!s) return { extra: "", display: "" };
  const clean = s.replace(/^\+/, "");
  return { extra: clean ? `+ ${clean}` : "", display: s };
}

/**
 * Abre o dialog de teste geral e retorna os parâmetros escolhidos.
 * @param {object} options
 * @param {Actor} options.actor
 * @param {string} options.test
 * @param {string} options.attr
 * @param {string} options.color
 * @returns {Promise<{mode:string,rollMode:string,secVal:number,bonusRaw:string,cdVal:number}|null>}
 */
export async function openRollDialog({ actor, test, attr, value, color }) {
  const props = actor?.system?.props ?? {};
  const attrValues = {};
  for (const { key } of ATTRIBUTES) {
    attrValues[key] = parseAttributeValue(props[`${key}_display`]);
  }

  const primaryKey = attr ? attr.toLowerCase() : "";
  const secondaryOptions = [{ key: "", label: "Nenhum", val: 0 }];
  for (const { key, label } of ATTRIBUTES) {
    if (key !== primaryKey) {
      secondaryOptions.push({ key, label, val: attrValues[key] });
    }
  }

  const secOptionsHtml = secondaryOptions
    .map((o) => `<option value="${o.val}" data-key="${o.key}">${o.label}${o.val ? ` = ${o.val}` : ""}</option>`)
    .join("");

  const content = `
    <div class="na-csb-automation">
      <div style="margin-bottom:12px;">
        ${attr ? `<div style="font-size:13px;color:${color || "#666"};margin-bottom:4px;font-weight:600;">${attr} = ${value}</div>` : ""}
        <div id="na-rm-formula" style="font-family:monospace;font-size:14px;background:#120f14;color:#f7f7f7;padding:6px 8px;border-radius:3px;border:1px solid #4a3a2a;">1d20 + ${value}</div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Atributo Secundário (até 1)</label>
        <select id="na-rm-secattr" style="width:100%;padding:4px;box-sizing:border-box;">${secOptionsHtml}</select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Bônus Situacional?</label>
        <input type="text" id="na-rm-bonus" placeholder="ex: 1d4, +2, 5" style="width:100%;padding:4px;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">CD do Teste (opcional)</label>
        <input type="number" id="na-rm-cd" min="0" placeholder="ex: 15" style="width:100%;padding:4px;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:6px;">
        <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Modo de Rolagem</label>
        <select id="na-rm-rollmode" style="width:100%;padding:4px;box-sizing:border-box;">
          <option value="publicroll">Rolar Público</option>
          <option value="gmroll">Rolar Privado (GM)</option>
          <option value="blindroll">Rolar Cego (GM)</option>
          <option value="selfroll">Rolar Para Si</option>
        </select>
      </div>
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: test },
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "advantage",
        label: "Vantagem",
        callback: (event, button) => {
          const form = button.form;
          return {
            mode: "advantage",
            rollMode: form.elements["na-rm-rollmode"].value ?? "publicroll",
            secVal: Number(form.elements["na-rm-secattr"].value) || 0,
            bonusRaw: form.elements["na-rm-bonus"].value ?? "",
            cdVal: Number(form.elements["na-rm-cd"].value) || 0,
          };
        },
      },
      {
        action: "normal",
        label: "Normal",
        callback: (event, button) => {
          const form = button.form;
          return {
            mode: "normal",
            rollMode: form.elements["na-rm-rollmode"].value ?? "publicroll",
            secVal: Number(form.elements["na-rm-secattr"].value) || 0,
            bonusRaw: form.elements["na-rm-bonus"].value ?? "",
            cdVal: Number(form.elements["na-rm-cd"].value) || 0,
          };
        },
      },
      {
        action: "disadvantage",
        label: "Desvantagem",
        callback: (event, button) => {
          const form = button.form;
          return {
            mode: "disadvantage",
            rollMode: form.elements["na-rm-rollmode"].value ?? "publicroll",
            secVal: Number(form.elements["na-rm-secattr"].value) || 0,
            bonusRaw: form.elements["na-rm-bonus"].value ?? "",
            cdVal: Number(form.elements["na-rm-cd"].value) || 0,
          };
        },
      },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });

  return result ?? null;
}
