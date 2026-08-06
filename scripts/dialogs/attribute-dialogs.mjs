/**
 * @fileoverview DialogV2 para criação e progressão de atributos.
 */

import { ATTRIBUTES, STANDARD_POOL } from "../constants.mjs";
import { parseNumber, poolMatches } from "../parsing.mjs";

/**
 * Pergunta o método de geração dos atributos no nível 1.
 * @returns {Promise<"standard"|"roll"|"discord"|null>}
 */
export async function chooseCreationMethod() {
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Criar atributos — Nível 1" },
    content: `
      <div class="na-csb-automation" style="padding:5px 0;">
        <p>Escolha como gerar os sete atributos.</p>
        <p><strong>Padrão:</strong> 4 · 3 · 2 · 2 · 1 · 1 · 1</p>
        <p><strong>Rolagem:</strong> até três tentativas de 7d4.</p>
      </div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "standard", label: "Valores padrão", callback: () => "standard" },
      { action: "roll", label: "Rolar 7d4", callback: () => "roll" },
      { action: "discord", label: "Inserir do Discord", callback: () => "discord" },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
}

/**
 * Envia uma rolagem 7d4 ao chat e retorna os resultados.
 * @param {Actor} actor
 * @param {number} attempt
 * @returns {Promise<number[]>}
 */
export async function rollPool(actor, attempt) {
  const roll = await Roll.create("7d4").evaluate();
  await roll.toMessage({
    flavor: `Atributos — ${attempt}ª rolagem de 7d4`,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
  return roll.dice[0].results.filter((r) => r.active !== false).map((r) => Number(r.result));
}

/**
 * Escolha entre rolagens já feitas.
 * @param {Actor} actor
 * @param {number[]} first
 * @returns {Promise<number[]|null>}
 */
export async function chooseRolledPool(actor, first) {
  const afterFirst = await foundry.applications.api.DialogV2.wait({
    window: { title: "Atributos — 1ª rolagem" },
    content: `<div class="na-csb-automation"><p>Resultado: <strong>${first.join(" · ")}</strong></p><p>Você pode usar esta rolagem ou tentar novamente.</p></div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "use-first", label: "Usar 1ª rolagem", callback: () => "first" },
      { action: "roll-second", label: "Rolar novamente", callback: () => "second" },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (!afterFirst) return null;
  if (afterFirst === "first") return first;

  const second = await rollPool(actor, 2);
  const afterSecond = await foundry.applications.api.DialogV2.wait({
    window: { title: "Atributos — escolha entre as rolagens" },
    content: `<div class="na-csb-automation"><p>1ª: <strong>${first.join(" · ")}</strong></p><p>2ª: <strong>${second.join(" · ")}</strong></p><p>Se fizer a terceira rolagem, será obrigado a usá-la.</p></div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "use-first", label: "Usar 1ª", callback: () => "first" },
      { action: "use-second", label: "Usar 2ª", callback: () => "second" },
      { action: "roll-third", label: "Fazer 3ª obrigatória", callback: () => "third" },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (!afterSecond) return null;
  if (afterSecond === "first") return first;
  if (afterSecond === "second") return second;

  const third = await rollPool(actor, 3);
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Atributos — 3ª rolagem obrigatória" },
    content: `<div class="na-csb-automation"><p>Resultado obrigatório: <strong>${third.join(" · ")}</strong></p></div>`,
    modal: true,
    rejectClose: true,
    buttons: [
      { action: "distribute-third", label: "Distribuir 3ª rolagem", callback: () => true },
    ],
  });
  return third;
}

/**
 * Lê sete valores inseridos manualmente (Discord).
 * @returns {Promise<number[]|null>}
 */
export async function readDiscordPool() {
  while (true) {
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Atributos — resultados do Discord" },
      content: `
        <div class="na-csb-automation" style="padding:6px 0;">
          <p>Digite os sete resultados separados por vírgula.</p>
          <input id="na-discord-pool" type="text" placeholder="4, 3, 2, 2, 1, 1, 1" style="width:100%;" />
        </div>`,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "use-discord-results",
          label: "Usar resultados",
          callback: (event, button) => String(button.form.elements["na-discord-pool"]?.value ?? ""),
        },
        { action: "cancel", label: "Cancelar", callback: () => null },
      ],
    });
    if (result === null || result === undefined) return null;
    const pool = result.split(/[;,\s]+/).filter(Boolean).map(parseNumber);
    if (pool.length === 7 && pool.every((v) => Number.isFinite(v) && v >= 1)) return pool;
    ui.notifications?.warn?.("Informe exatamente sete valores numéricos.");
  }
}

/**
 * Distribui um pool de sete valores nos sete atributos.
 * @param {number[]} pool
 * @param {number} level
 * @param {Record<string,number>} currentValues
 * @returns {Promise<Record<string,number>|null>}
 */
export async function distributePool(pool, level, currentValues) {
  while (true) {
    const fields = ATTRIBUTES.map((attribute, attributeIndex) => {
      const options = pool.map((value, poolIndex) =>
        `<option value="${poolIndex}:${value}" ${poolIndex === attributeIndex ? "selected" : ""}>${value} — resultado ${poolIndex + 1}</option>`
      ).join("");
      return `
        <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#171411;border-left:3px solid ${attribute.color};padding:7px 9px;">
          <span style="display:flex;flex-direction:column;gap:2px;color:${attribute.color};font-weight:700;">
            <span>${attribute.label} · ${attribute.name}</span>
            <small style="color:#a99f93;font-size:10px;font-weight:500;">Atual: ${currentValues[attribute.key]}</small>
          </span>
          <select id="na-distribute-${attribute.key}" style="width:145px;">${options}</select>
        </label>`;
    }).join("");

    const selected = await foundry.applications.api.DialogV2.wait({
      window: { title: `Distribuir atributos — Nível ${level}` },
      content: `<div class="na-csb-automation" style="display:grid;gap:5px;padding:4px 0;"><p style="margin:0 0 5px;">Use cada resultado exatamente uma vez.</p>${fields}</div>`,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "save-distribution",
          label: "Salvar atributos",
          callback: (event, button) =>
            ATTRIBUTES.map((attribute) =>
              String(button.form.elements[`na-distribute-${attribute.key}`]?.value ?? "")
            ),
        },
        { action: "cancel", label: "Cancelar", callback: () => null },
      ],
    });
    if (!selected) return null;
    const indexes = selected.map((value) => parseNumber(value.split(":")[0]));
    const values = selected.map((value) => parseNumber(value.split(":")[1]));
    if (new Set(indexes).size === 7 && poolMatches(values, pool)) {
      return Object.fromEntries(ATTRIBUTES.map((attribute, index) => [attribute.key, values[index]]));
    }
    ui.notifications?.warn?.("Cada resultado precisa ser usado uma única vez.");
  }
}

/**
 * Diálogo de ganho de +1 permanente nos níveis 3 e 7.
 * @param {Record<string,number>} values
 * @param {number} level
 * @returns {Promise<Record<string,number>|null>}
 */
export async function applyAttributeGain(values, level) {
  const cards = ATTRIBUTES.map((attribute) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#171411;border-left:3px solid ${attribute.color};border-radius:3px;padding:7px 9px;">
      <span style="color:${attribute.color};font-weight:700;">${attribute.label} · ${attribute.name}</span>
      <span style="white-space:nowrap;color:#ddd;">${values[attribute.key]} <strong style="color:${attribute.color};">→ ${values[attribute.key] + 1}</strong></span>
    </div>`).join("");

  const options = ATTRIBUTES.map((attribute) =>
    `<option value="${attribute.key}">${attribute.label} · ${attribute.name} (${values[attribute.key]} → ${values[attribute.key] + 1})</option>`
  ).join("");

  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title: `Nível ${level} — aumento de atributo` },
    content: `
      <div class="na-csb-automation" style="display:grid;gap:8px;padding:4px 0;">
        <p style="margin:0;">Neste nível, escolha <strong>um atributo base</strong> para receber <strong>+1 permanente</strong>.</p>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;">${cards}</div>
        <label style="display:grid;gap:4px;margin-top:4px;">
          <strong>Atributo escolhido</strong>
          <select id="na-gain-attribute" style="width:100%;">${options}</select>
        </label>
        <small style="color:#a99f93;">Bônus de Marca, Respiração, habilidade ou treinamento não entram neste aumento.</small>
      </div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "confirm-gain",
        label: "Aplicar +1 permanente",
        callback: (event, button) => String(button.form.elements["na-gain-attribute"]?.value ?? ""),
      },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (!ATTRIBUTES.some((attribute) => attribute.key === chosen)) return null;
  return { ...values, [chosen]: values[chosen] + 1 };
}

/**
 * Diálogo de confirmação final de snapshot.
 * @param {Record<string,number>} values
 * @param {Record<string,number>} currentValues
 * @param {number} level
 * @returns {Promise<boolean>}
 */
export async function confirmSnapshot(values, currentValues, level) {
  const cards = ATTRIBUTES.map((attribute) => `
    <div style="background:#171411;border:1px solid ${attribute.color}66;border-radius:5px;padding:8px 6px;text-align:center;">
      <div style="color:${attribute.color};font-weight:700;letter-spacing:.1em;">${attribute.label}</div>
      <div style="color:#fff;font-size:22px;font-weight:700;">${values[attribute.key]}</div>
      <div style="color:#a99f93;font-size:9px;">Atual: ${currentValues[attribute.key]}</div>
    </div>`).join("");

  return foundry.applications.api.DialogV2.wait({
    window: { title: `Confirmar atributos — Nível ${level}` },
    content: `<div class="na-csb-automation"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">${cards}</div><p>Confirme para atualizar os atributos da ficha.</p></div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "confirm-save", label: "Confirmar e salvar", callback: () => true },
      { action: "cancel", label: "Cancelar", callback: () => false },
    ],
  });
}

/**
 * Diálogo para escolher o atributo marcado pela Marca do Destino.
 * @param {Record<string,number>} values
 * @param {number} bonus
 * @returns {Promise<string|null>}
 */
export async function chooseMarkedAttribute(values, bonus) {
  const options = ATTRIBUTES.map((attribute) =>
    `<option value="${attribute.key}">${attribute.label} · ${attribute.name} (${values[attribute.key]} → ${values[attribute.key] + bonus})</option>`
  ).join("");

  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title: "Marca do Destino — atributo marcado" },
    content: `
      <div class="na-csb-automation" style="display:grid;gap:8px;padding:4px 0;">
        <p style="margin:0;">Escolha o atributo que receberá <strong>+${bonus} permanente</strong>.</p>
        <label style="display:grid;gap:4px;">
          <strong>Atributo marcado</strong>
          <select id="na-destiny-mark-attribute" style="width:100%;">${options}</select>
        </label>
        <small style="color:#a99f93;">No nível 6, este bônus subirá automaticamente de +2 para +3.</small>
      </div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "confirm-mark",
        label: `Aplicar +${bonus}`,
        callback: (event, button) => String(button.form.elements["na-destiny-mark-attribute"]?.value ?? ""),
      },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  return ATTRIBUTES.some((attribute) => attribute.key === chosen) ? chosen : null;
}
