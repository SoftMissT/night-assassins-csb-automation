import { TIPOS_ACAO } from "../constants.mjs";

/**
 * @fileoverview DialogV2 para rolagem de acerto.
 */

function parseBonus(raw) {
  const s = (raw || "").trim();
  if (!s) return { extra: "", display: "" };
  const clean = s.replace(/^\+/, "");
  return { extra: clean ? `+ ${clean}` : "", display: s };
}

/**
 * Abre o dialog de acerto e retorna os parâmetros escolhidos.
 * @param {object} options
 * @param {string} options.attrName
 * @param {number} options.attrVal
 * @param {string} options.color
 * @returns {Promise<{mode:string,rollMode:string,bonusRaw:string,cdVal:number,rollCount:number}|null>}
 */
export async function openHitDialog({ attrName, attrVal, color, weapons = [] }) {
  const weaponOptions = weapons.map((weapon) => {
    const attributes = Array.isArray(weapon.attackAttributes) ? weapon.attackAttributes.join("/") : "";
    const profileLabel = weapon.profileName ? ` ${weapon.profileName}` : "";
    const value = `${weapon.id}|${Number.isInteger(weapon.profileIndex) ? weapon.profileIndex : 0}`;
    return `<option value="${value}" data-critical="${weapon.effectiveCritical}" data-attributes="${attributes}">${weapon.name}${profileLabel} ${attributes || "atributo do Actor"} crítico ${weapon.effectiveCritical}+</option>`;
  }).join("");
  const weaponAttributeOptions = [...new Set(weapons.flatMap((weapon) => Array.isArray(weapon.attackAttributes) ? weapon.attackAttributes : []))]
    .map((attribute) => `<option value="${attribute}" ${attribute === attrName ? "selected" : ""}>${attribute}</option>`)
    .join("");
  const content = `
    <div class="na-csb-automation na-hit-setup">
      <header class="na-hit-hero" style="--na-hit-color:${color}">
        <span class="na-hit-kicker">SEQUÊNCIA DE ATAQUE</span>
        <strong>${attrName} <b>${attrVal}</b></strong>
        <code>1d20 + ${attrVal}</code>
      </header>
      <div class="na-hit-grid">
        <label class="na-hit-field">
          <span>Bônus situacional</span>
          <input type="text" id="na-ac-bonus" placeholder="1d4, +2 ou 5" />
        </label>
        <label class="na-hit-field">
          <span>CD opcional</span>
          <input type="number" id="na-ac-cd" min="0" placeholder="15" />
        </label>
      </div>
      <label class="na-hit-field na-hit-count">
        <span>Máximo de tentativas</span>
        <input type="number" id="na-ac-count" min="1" max="20" step="1" value="1" />
        <small>Uma rolagem por vez. Depois de cada resultado você confirma o acerto ou encerra a sequência.</small>
      </label>
      <label class="na-hit-field">
        <span>Tipo de ação</span>
        <select id="na-ac-action">
          <option value="">Não informar —</option>
          ${TIPOS_ACAO.map((entry) => `<option value="${entry.key}">${entry.label}</option>`).join("")}
        </select>
        <small>Identifica a técnica no chat. A rolagem de Acerto não gasta a ação.</small>
      </label>
      <label class="na-hit-field">
        <span>Arma usada / crítico</span>
        <select id="na-ac-weapon">
          <option value="">Sem arma crítico 20</option>
          ${weaponOptions}
        </select>
        <small>O crítico vem da arma. Quebra da Respiração da Pedra reduz este número.</small>
      </label>
      <label class="na-hit-field">
        <span>Atributo do acerto</span>
        <select id="na-ac-weapon-attribute">
          <option value="">Usar padrão da ficha</option>
          ${weaponAttributeOptions}
        </select>
        <small>Armas com Acuidade permitem FOR ou DEX; Manejável usa DEX; Concussão usa FOR.</small>
      </label>
      <label class="na-hit-field">
        <span>Visibilidade da rolagem</span>
        <select id="na-ac-rollmode">
          <option value="publicroll">Rolar Público</option>
          <option value="gmroll">Rolar Privado (GM)</option>
          <option value="blindroll">Rolar Cego (GM)</option>
          <option value="selfroll">Rolar Para Si</option>
        </select>
      </label>
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Acerto" },
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
            rollMode: form.elements["na-ac-rollmode"].value ?? "publicroll",
            bonusRaw: form.elements["na-ac-bonus"].value ?? "",
            cdVal: Number(form.elements["na-ac-cd"].value) || 0,
            rollCount: Math.min(20, Math.max(1, Math.trunc(Number(form.elements["na-ac-count"].value) || 1))),
            actionType: form.elements["na-ac-action"].value ?? "",
            weaponId: (form.elements["na-ac-weapon"].value ?? "").split("|")[0],
            weaponProfileIndex: Number((form.elements["na-ac-weapon"].value ?? "").split("|")[1] ?? 0),
            weaponAttribute: form.elements["na-ac-weapon-attribute"].value ?? "",
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
            rollMode: form.elements["na-ac-rollmode"].value ?? "publicroll",
            bonusRaw: form.elements["na-ac-bonus"].value ?? "",
            cdVal: Number(form.elements["na-ac-cd"].value) || 0,
            rollCount: Math.min(20, Math.max(1, Math.trunc(Number(form.elements["na-ac-count"].value) || 1))),
            actionType: form.elements["na-ac-action"].value ?? "",
            weaponId: (form.elements["na-ac-weapon"].value ?? "").split("|")[0],
            weaponProfileIndex: Number((form.elements["na-ac-weapon"].value ?? "").split("|")[1] ?? 0),
            weaponAttribute: form.elements["na-ac-weapon-attribute"].value ?? "",
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
            rollMode: form.elements["na-ac-rollmode"].value ?? "publicroll",
            bonusRaw: form.elements["na-ac-bonus"].value ?? "",
            cdVal: Number(form.elements["na-ac-cd"].value) || 0,
            rollCount: Math.min(20, Math.max(1, Math.trunc(Number(form.elements["na-ac-count"].value) || 1))),
            actionType: form.elements["na-ac-action"].value ?? "",
            weaponId: (form.elements["na-ac-weapon"].value ?? "").split("|")[0],
            weaponProfileIndex: Number((form.elements["na-ac-weapon"].value ?? "").split("|")[1] ?? 0),
            weaponAttribute: form.elements["na-ac-weapon-attribute"].value ?? "",
          };
        },
      },
      { action: "cancel", label: "Cancelar", callback: () => ({ cancelled: true }) },
    ],
  });

  return !result || result.cancelled ? null : result;
}

/**
 * Pergunta se o jogador quer encadear outra Forma de Respiração antes de
 * rolar o dano do Acerto que acabou de ser confirmado. "Não rolar dano"
 * nunca fica indisponível — mesmo sem Formas para encadear ou com o
 * diálogo fechado, o chamador segue para a rolagem de dano normal.
 * @param {object} options
 * @param {{uuid:string,label:string}[]} [options.chainable]
 * @returns {Promise<{chain:boolean,itemUuid?:string}>}
 */
export async function openChainFormDialog({ chainable = [] } = {}) {
  const hasOptions = chainable.length > 0;
  const optionsHtml = chainable.map((entry) => `<option value="${entry.uuid}">${entry.label}</option>`).join("");
  const content = `
    <div class="na-csb-automation na-hit-chain">
      <p>Acerto confirmado. Deseja usar <strong>outra Forma de Respiração</strong> encadeada agora, antes de rolar o dano?</p>
      ${hasOptions
        ? `<label class="na-hit-field"><span>Próxima Forma</span><select id="na-chain-form">${optionsHtml}</select></label>`
        : "<p><em>Nenhuma outra Forma disponível para encadear.</em></p>"}
    </div>
  `;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Encadear Forma?" },
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      ...(hasOptions ? [{
        action: "chain",
        label: "Sim, encadear",
        callback: (event, button) => ({ chain: true, itemUuid: button.form.elements["na-chain-form"]?.value ?? "" }),
      }] : []),
      { action: "damage", label: "Não, rolar dano", default: true, callback: () => ({ chain: false }) },
    ],
  });
  return result ?? { chain: false };
}

/**
 * Confirma o resultado de uma tentativa antes de liberar a próxima.
 * @returns {Promise<{hit:boolean,continue:boolean}|null>}
 */
export async function openHitConfirmationDialog({ current, maximum, total, cdVal = 0 }) {
  const isLast = current >= maximum;
  const cdResult = cdVal > 0 ? `<span class="na-hit-cd ${total >= cdVal ? "is-success" : "is-failure"}">CD ${cdVal}: ${total >= cdVal ? "superada" : "não superada"}</span>` : "";
  const content = `<div class="na-csb-automation na-hit-confirm">
    <span class="na-hit-kicker">TENTATIVA ${current} DE ${maximum}</span>
    <div class="na-hit-total"><small>RESULTADO</small><strong>${total}</strong></div>
    ${cdResult}
    <p>${isLast ? "Última tentativa. Confirme o resultado." : "Este ataque acertou? Você pode continuar ou encerrar a técnica agora."}</p>
    ${isLast ? "" : `<label class="na-hit-stop"><input type="checkbox" name="na-hit-stop"><span>Encerrar a sequência depois deste resultado</span></label>`}
  </div>`;
  const decision = await foundry.applications.api.DialogV2.wait({
    window: { title: `Confirmar Acerto ${current}/${maximum}` },
    content,
    position: { width: 430 },
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "hit", label: "Acertou", default: true, callback: (event, button) => ({ hit: true, continue: !isLast && !button.form.elements["na-hit-stop"]?.checked }) },
      { action: "miss", label: "Errou", callback: (event, button) => ({ hit: false, continue: !isLast && !button.form.elements["na-hit-stop"]?.checked }) },
      { action: "stop", label: "Encerrar sequência", callback: () => ({ stop: true }) },
    ],
  });
  return decision ?? null;
}
