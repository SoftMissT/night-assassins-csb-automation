/**
 * @fileoverview Serviço de Marca do Caçador (Slayer).
 *
 * Toda a lógica pesada de Despertar, Ativar, Encerrar, Nascido Marcado,
 * Atributo da Cicatriz, Anos de Vida, Bônus Temporários e Dano de Ferida
 * ficam aqui. A macro na-marca-cacador.js é apenas wrapper para esta API.
 *
 * Contrato:
 *   - Despertar Marca (teste FDV vs CD)
 *   - Ativar Marca (escolhe anos de vida / intensidade)
 *   - Encerrar Marca (aplica custo final)
 *   - Nascido Marcado (CD 0, bônus duplos)
 *   - Marca do Destino (CD 14 no nível 12)
 *   - Atributo da Cicatriz (+2 no atributo escolhido)
 *   - Bônus temporários em todos os atributos
 *   - Dano de Ferida (+Xd12 ou +Xd20)
 */

import { MODULE_ID } from "../constants.mjs";

const ATTRIBUTES = Object.freeze([
  { key: "vit", label: "VIT" },
  { key: "dex", label: "DEX" },
  { key: "for", label: "FOR" },
  { key: "car", label: "CAR" },
  { key: "fdv", label: "FDV" },
  { key: "int", label: "INT" },
  { key: "sab", label: "SAB" },
]);

const PHYSICAL = new Set(["vit", "dex", "for", "fdv"]);

/**
 * Converte valor bruto para número seguro.
 * @param {unknown} raw
 * @returns {number}
 */
function number(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = String(raw ?? "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/**
 * Lê nível do personagem.
 * @param {object} props
 * @returns {number}
 */
function level(props) {
  return number(props.nvl_num ?? props.nvl_pj);
}

/**
 * Lê valor de atributo (display > config > base).
 * @param {object} props
 * @param {string} key
 * @returns {number}
 */
function attribute(props, key) {
  const display = props[`${key}_display`];
  if (display !== undefined && display !== null && display !== "") return number(display);
  const configured = props[`atr_${key}_valor_config`];
  if (configured !== undefined && configured !== null && configured !== "") return number(configured);
  return number(props[`atr_${key}_valor`]);
}

/**
 * Verifica se é Marca do Destino.
 * @param {object} props
 * @returns {boolean}
 */
function isDestinyMark(props) {
  return String(props.hab_escolhida ?? "").includes("hab_escolhida_marca_destino");
}

/**
 * Verifica se é Descendente Perdido.
 * @param {object} props
 * @returns {boolean}
 */
function isLostDescendant(props) {
  return String(props.origem_dropdown ?? "").includes("origem_descendente_perdido");
}

/**
 * Verifica se é Nascido Marcado (Destino + Descendente Perdido).
 * @param {object} props
 * @returns {boolean}
 */
function isBornMarked(props) {
  return isDestinyMark(props) && isLostDescendant(props);
}

/**
 * Verifica se atributo da cicatriz é físico.
 * @param {string} scar
 * @returns {boolean}
 */
function validScar(scar) {
  return PHYSICAL.has(String(scar ?? "").toLowerCase());
}

/**
 * Gera patch de bônus zerados.
 * @returns {object}
 */
function emptyBonuses() {
  return Object.fromEntries(ATTRIBUTES.map(({ key }) => [`system.props.${key}_marca_temp`, 0]));
}

/**
 * Gera patch de bônus ativos conforme Nascido Marcado e cicatriz.
 * @param {boolean} bornMarked
 * @param {string} scar
 * @returns {object}
 */
function activeBonuses(bornMarked, scar) {
  const patch = {};
  for (const { key } of ATTRIBUTES) {
    const base = bornMarked ? (PHYSICAL.has(key) ? 4 : 2) : (PHYSICAL.has(key) ? 3 : 1);
    patch[`system.props.${key}_marca_temp`] = base + (key === scar ? 2 : 0);
  }
  return patch;
}

/**
 * Calcula CD de despertar.
 * @param {object} props
 * @returns {number} CD (0 = automático)
 */
function awakeningCd(props) {
  if (isBornMarked(props)) return 0;
  if (isDestinyMark(props) && level(props) >= 12) return 14;
  if (isLostDescendant(props)) return 16;
  return 18;
}

/**
 * Converte total rolado em anos de vida restantes.
 * @param {number} total
 * @returns {number}
 */
function lifeYears(total) {
  if (total <= 20) return 1;
  if (total <= 50) return 5;
  if (total <= 75) return 10;
  if (total <= 95) return 20;
  return 35;
}

/**
 * Retorna lista de atributos permitidos para cicatriz.
 * @param {boolean} bornMarked
 * @returns {Array<{key: string, label: string}>}
 */
export function allowedScarAttributes(bornMarked) {
  return bornMarked ? ATTRIBUTES : ATTRIBUTES.filter(({ key }) => PHYSICAL.has(key));
}

/**
 * Retorna label de cada atributo.
 * @param {string} key
 * @returns {string}
 */
export function attributeLabel(key) {
  return ATTRIBUTES.find((a) => a.key === key)?.label ?? key.toUpperCase();
}

/**
 * Verifica se a Marca já foi despertada.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isMarkAwakened(actor) {
  const props = actor?.system?.props ?? {};
  return number(props.marca_despertada) === 1;
}

/**
 * Verifica se a Marca está ativa.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isMarkActive(actor) {
  const props = actor?.system?.props ?? {};
  return number(props.marca_ativa) === 1;
}

/**
 * Retorna estado legível da Marca.
 * @param {Actor} actor
 * @returns {{status: string, type: string, life: number, damageDice?: number, damageFaces?: number}}
 */
export function markStatus(actor) {
  const props = actor?.system?.props ?? {};
  const awakened = number(props.marca_despertada) === 1;
  const active = number(props.marca_ativa) === 1;
  const bornMarked = isBornMarked(props);
  return {
    status: !awakened ? "Não despertada" : active ? "Ativa" : "Despertada",
    type: bornMarked ? "Nascido Marcado" : "Marca normal",
    life: number(props.vid_rest_num),
    damageDice: active ? number(props.marca_dano_dados) : undefined,
    damageFaces: active ? number(props.marca_dano_faces) : undefined,
    bornMarked,
  };
}

/**
 * Retorna máximo de anos/intensidade para ativação.
 * @param {Actor} actor
 * @returns {number}
 */
export function maxActivationPower(actor) {
  const props = actor?.system?.props ?? {};
  const bornMarked = isBornMarked(props);
  const breathLevel = Math.max(1, number(props.nvl_respiracao_num));
  const normalMax = 1 + breathLevel + (isLostDescendant(props) && !bornMarked ? 1 : 0);
  return bornMarked ? breathLevel : Math.min(normalMax, Math.max(0, Math.floor(number(props.vid_rest_num))));
}

/**
 * Desperta a Marca do Caçador.
 * @param {Actor} actor
 * @param {{scar: string}} options
 * @returns {{ok: boolean, roll?: Roll, message?: string}}
 */
export async function awakenMark(actor, { scar }) {
  const props = actor?.system?.props ?? {};
  if (number(props.marca_despertada) === 1) return { ok: false, message: "A Marca já foi despertada." };
  if (level(props) < 12) return { ok: false, message: "A Marca do Caçador exige Nível 12." };

  const bornMarked = isBornMarked(props);
  if (!scar || !allowedScarAttributes(bornMarked).some(({ key }) => key === scar)) {
    return { ok: false, message: "Atributo da cicatriz inválido." };
  }

  let roll = null;
  if (!bornMarked) {
    const cd = awakeningCd(props);
    const fdv = attribute(props, "fdv");
    roll = await new Roll(`1d20 + ${fdv}`).evaluate();
    await roll.toMessage({
      flavor: `<strong>Despertar da Marca do Caçador</strong> FDV ${fdv} contra CD ${cd}`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
    if (roll.total < cd) return { ok: false, roll, message: "A Marca não despertou." };
  }

  let remainingLife = number(props.vid_rest_num);
  if (!bornMarked && remainingLife <= 0) {
    const destinyBonus = isDestinyMark(props) && level(props) >= 12 ? 15 : 0;
    const lifeRoll = await new Roll(`1d100 + ${attribute(props, "vit")} + ${destinyBonus}`).evaluate();
    const rolledYears = lifeYears(lifeRoll.total);
    const age = number(props.idade);
    remainingLife = age >= 25
      ? (await new Roll("1d12").evaluate()).total / 12
      : Math.min(rolledYears, Math.max(1, 25 - age));
  }

  await actor.update({
    "system.props.marca_despertada": 1,
    "system.props.marca_ativa": 0,
    "system.props.marca_atributo_cicatriz": scar,
    "system.props.vid_rest_num": bornMarked ? number(props.vid_rest_num) : remainingLife,
    "system.props.marca_ressonancia_usada": 0,
  });

  return { ok: true, roll, message: bornMarked ? "Nascido Marcado reconhecido." : "A Marca do Caçador despertou." };
}

/**
 * Ativa a Marca do Caçador.
 * @param {Actor} actor
 * @param {{power: number}} options
 * @returns {{ok: boolean, message?: string}}
 */
export async function activateMark(actor, { power }) {
  const props = actor?.system?.props ?? {};
  if (number(props.marca_despertada) !== 1) {
    const result = await awakenMark(actor, { scar: String(props.marca_atributo_cicatriz ?? "").toLowerCase() });
    if (!result.ok) return result;
  }
  if (number(props.marca_ativa) === 1) return { ok: false, message: "A Marca já está ativa." };

  const bornMarked = isBornMarked(props);
  const maxPower = maxActivationPower(actor);
  if (power < 1 || power > maxPower) return { ok: false, message: `Potência inválida (máx: ${maxPower}).` };

  const scar = String(props.marca_atributo_cicatriz ?? props.hab_marca_destino_atributo ?? "").toLowerCase();
  if (!ATTRIBUTES.some(({ key }) => key === scar)) return { ok: false, message: "Atributo da Cicatriz inválido." };

  await actor.update({
    "system.props.marca_ativa": 1,
    "system.props.marca_anos_queimados": bornMarked ? 0 : power,
    "system.props.marca_intensidade": bornMarked ? power : 0,
    "system.props.marca_overdrive": 0,
    "system.props.marca_dano_dados": power,
    "system.props.marca_dano_faces": bornMarked ? 20 : 12,
    "system.props.marca_critico_margem": bornMarked ? 18 : power >= 3 ? 17 : 19,
    "system.props.marca_ataque_extra": 1,
    "system.props.marca_corpo_recusa_usado": 0,
    "system.props.marca_corte_impossivel_usado": 0,
    "system.props.marca_resistencia_usada": 0,
    ...activeBonuses(bornMarked, scar),
  });

  return { ok: true, message: `Marca ativa: +${power}d${bornMarked ? 20 : 12} de Dano de Ferida.` };
}

/**
 * Encerra a Marca do Caçador.
 * @param {Actor} actor
 * @returns {{ok: boolean, message?: string, necroticDice?: number}}
 */
export async function finishMark(actor) {
  const props = actor?.system?.props ?? {};
  if (number(props.marca_ativa) !== 1) return { ok: false, message: "A Marca não está ativa." };

  const bornMarked = isBornMarked(props);
  const years = number(props.marca_anos_queimados) + number(props.marca_overdrive);
  const activations = number(props.marca_ativacoes_dia) + 1;

  await actor.update({
    "system.props.marca_ativa": 0,
    "system.props.marca_anos_queimados": 0,
    "system.props.marca_intensidade": 0,
    "system.props.marca_overdrive": 0,
    "system.props.marca_dano_dados": 0,
    "system.props.marca_dano_faces": 0,
    "system.props.marca_critico_margem": 20,
    "system.props.marca_ataque_extra": 0,
    "system.props.marca_ativacoes_dia": activations,
    "system.props.marca_exaustao_final": bornMarked ? 0 : Math.min(8, activations * 2),
    "system.props.marca_dano_necrotico_dados": years,
    "system.props.vid_rest_num": bornMarked ? number(props.vid_rest_num) : Math.max(0, number(props.vid_rest_num) - years),
    ...emptyBonuses(),
  });

  return {
    ok: true,
    necroticDice: years,
    message: years > 0
      ? `Marca encerrada. Custo final pendente: ${years}d6 de dano necrótico irredutível.`
      : "Marca encerrada sem custo de vida.",
  };
}

/**
 * Abre o gerenciador de Marca do Caçador (DialogV2).
 * @param {{actorUuid?: string}} options
 * @returns {Promise<void>}
 */
export async function openHunterMarkManager({ actorUuid } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const DIALOG_POSITION = Object.freeze({ width: 680 });

  function panel(content) {
    return `<div style="display:grid;gap:14px;padding:8px 4px;min-width:0">${content}</div>`;
  }

  async function resolveActor() {
    if (actorUuid) {
      const doc = await fromUuid(actorUuid);
      const candidate = doc?.actor ?? doc;
      if (candidate?.system?.props) return candidate;
    }
    return canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;
  }

  const actor = await resolveActor();
  if (!actor) return ui.notifications.warn("Selecione um token ou defina um personagem ativo.");
  if (!actor.isOwner) return ui.notifications.error("Você não pode alterar este personagem.");

  const props = actor.system.props ?? {};
  const status = markStatus(actor);
  const awakened = isMarkAwakened(actor);
  const active = isMarkActive(actor);
  const bornMarked = status.bornMarked;

  const action = await DialogV2.wait({
    window: { title: "Marca do Caçador" },
    position: DIALOG_POSITION,
    content: panel(`
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        <div style="padding:10px;border:1px solid var(--color-border-light-primary);border-radius:6px"><small>ESTADO</small><br><strong>${status.status}</strong></div>
        <div style="padding:10px;border:1px solid var(--color-border-light-primary);border-radius:6px"><small>TIPO</small><br><strong>${status.type}</strong></div>
        <div style="padding:10px;border:1px solid var(--color-border-light-primary);border-radius:6px"><small>VIDA RESTANTE</small><br><strong>${status.life}</strong></div>
        ${active ? `<div style="padding:10px;border:1px solid var(--color-border-light-primary);border-radius:6px"><small>DANO DE FERIDA</small><br><strong>+${status.damageDice}d${status.damageFaces}</strong></div>` : ""}
      </div>
      ${active ? `<p style="margin:0">Os bônus temporários permanecem ativos até o encerramento do combate.</p>` : ""}`),
    modal: true,
    rejectClose: false,
    buttons: !awakened
      ? [{ action: "despertar", label: "Despertar Marca", callback: () => "despertar" }, { action: "cancelar", label: "Cancelar", callback: () => null }]
      : active
        ? [{ action: "encerrar", label: "Encerrar Marca", callback: () => "encerrar" }, { action: "cancelar", label: "Fechar", callback: () => null }]
        : [{ action: "ativar", label: "Ativar Marca", callback: () => "ativar" }, { action: "cancelar", label: "Cancelar", callback: () => null }],
  });

  if (action === "despertar") {
    const scar = String(props.marca_atributo_cicatriz ?? "").toLowerCase();
    const allowed = allowedScarAttributes(bornMarked);
    const options = allowed.map(({ key, label }) => {
      const current = attribute(props, key);
      const bonus = bornMarked ? (PHYSICAL.has(key) ? 6 : 4) : 5;
      return `<option value="${key}">${label} (${current} → ${current + bonus})</option>`;
    }).join("");

    const chosenScar = await DialogV2.wait({
      window: { title: "Marca do Caçador — Atributo da Cicatriz" },
      position: DIALOG_POSITION,
      content: panel(`
        <p style="margin:0">Escolha o atributo ligado à cicatriz.</p>
        <div class="form-group" style="margin:0">
          <label for="na-marca-cicatriz"><strong>Atributo da Cicatriz</strong></label>
          <select id="na-marca-cicatriz" style="width:100%">${options}</select>
        </div>`),
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "confirmar", label: "Confirmar", callback: (_event, _button, dialog) => String(dialog.element.querySelector("#na-marca-cicatriz")?.value ?? "") },
        { action: "cancelar", label: "Cancelar", callback: () => null },
      ],
    });
    if (!allowed.some(({ key }) => key === chosenScar)) return;

    const result = await awakenMark(actor, { scar: chosenScar });
    if (result.message) ui.notifications.info(result.message);
  }

  if (action === "ativar") {
    const maxPower = maxActivationPower(actor);
    if (maxPower < 1) return ui.notifications.warn("Não há potência válida para ativar a Marca.");
    const options = Array.from({ length: maxPower }, (_, index) => index + 1)
      .map(value => `<option value="${value}">${value} ${bornMarked ? "de Intensidade" : value === 1 ? "Ano de Vida" : "Anos de Vida"}</option>`)
      .join("");

    const power = await DialogV2.wait({
      window: { title: bornMarked ? "Ativar Marca — Intensidade" : "Ativar Marca — Anos de Vida" },
      position: DIALOG_POSITION,
      content: panel(`
        <p style="margin:0">${bornMarked ? `Intensidade máxima: ${maxPower}.` : `Limite desta ativação: ${maxPower}.`}</p>
        <div class="form-group" style="margin:0">
          <label for="na-marca-potencia"><strong>${bornMarked ? "Intensidade" : "Anos queimados"}</strong></label>
          <select id="na-marca-potencia" style="width:100%">${options}</select>
        </div>`),
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "ativar", label: "Ativar Marca", callback: (_event, _button, dialog) => number(dialog.element.querySelector("#na-marca-potencia")?.value) },
        { action: "cancelar", label: "Cancelar", callback: () => null },
      ],
    });
    if (!power) return ui.notifications.warn("Potência inválida.");

    const result = await activateMark(actor, { power });
    if (result.message) ui.notifications.info(result.message);
  }

  if (action === "encerrar") {
    const result = await finishMark(actor);
    if (result.message) ui.notifications.info(result.message);
  }
}
