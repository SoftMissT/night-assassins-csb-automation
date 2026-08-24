/**
 * @fileoverview Serviço de execução de técnicas de Respiração (formas).
 *
 * Cada item CSB do tipo "Respiração - Forma" contém props padronizadas
 * que este serviço lê para executar a técnica:
 *
 * Props do item:
 *   nome_forma     (string)  Nome em português
 *   nome_jp        (string)  Nome em japonês
 *   respiracao_nome(string)  Nome da respiração (Água, Sol, Trovão...)
 *   tipo_manobra   (string)  Única | Ataque | Especial | Completa | Reação
 *   nivel_req      (number)  Nível mínimo de respiração
 *   descricao      (string)  Descrição narrativa
 *   tem_requisito  (number)  1 se tem requisito especial
 *   requisito_texto(string)  Texto do requisito
 *
 *   Para cada nível N (1-4):
 *   tem_nvl_N      (number)  1 se o nível está disponível
 *   nvl_N_custo    (number)  Custo em PDR
 *   nvl_N_dano     (string)  Fórmula de dano (ex: "1d6", "2d6 + DEX")
 *   nvl_N_efeito   (string)  Descrição do efeito
 *   nvl_N_status   (string)  Status aplicado (vazio = nenhum)
 *   nvl_N_buff     (string)  Buff aplicado ao self (vazio = nenhum)
 *   nvl_N_tipos_dano(string) Tipos de dano (ex: "cortante,impacto"; vazio = catálogo)
 *   tipo_dano_base (string)  Tipos padrão da forma (fallback quando nvl_N_tipos_dano vazio)
 */

import { MODULE_ID, TIPOS_ACAO } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";
import { getDamageStatusEffects } from "./status-effects.mjs";
import { consumeSlayerActions } from "./action-service.mjs";
import { resolveWaterDamageTypes, waterFormById } from "./water-breathing-data.mjs";
import { flameFormById } from "./flame-breathing-data.mjs";
import { stoneFormById } from "./stone-breathing-data.mjs";
import { mistFormById } from "./mist-breathing-data.mjs";
import { metalFormById } from "./metal-breathing-data.mjs";
import { snowFormById } from "./snow-breathing-data.mjs";
import { windFormById, WIND_SYNERGY_BREATHINGS } from "./wind-breathing-data.mjs";
import { buildFlameBreathingPlan, clearFlameBreathingState, flameStatePatch, parseFlameBreathingState, resolveFlameRengokuAllies, FLAME_HEAT_FLAG, FLAME_SYNERGY_DAMAGE_PER_ALLY, FLAME_SYNERGY_PDR_COST, tickFlameBreathing } from "./flame-breathing-service.mjs";
import { buildStoneBreathingPlan, clearStoneBreathingState, parseStoneBreathingState, stoneStatePatch, tickStoneBreathing } from "./stone-breathing-service.mjs";
import { buildMistBreathingPlan, clearMistBreathingState, mistStatePatch, parseMistBreathingState, resolveEightLayersResult, resolveMistFormula, tickMistBreathing } from "./mist-breathing-service.mjs";
import { buildMetalBreathingPlan, clearMetalBreathingState, resolveMetalMagnetism, tickMetalBreathing } from "./metal-breathing-service.mjs";
import { buildSnowBreathingPlan, clearSnowBreathingState, grantBlizzardStealth, parseSnowBreathingState, resolveSnowRestrictionEscape, snowEffectiveBreathLevel, snowStatePatch, snowTickPatchWithExhaustion } from "./snow-breathing-service.mjs";
import { buildWindBreathingPlan, clearWindBreathingState, parseWindBreathingState, tickWindBreathing, windStatePatch } from "./wind-breathing-service.mjs";
import { applySlayerDamage, reapplyFiniteStatusEffect } from "./status-engine.mjs";
import { formatStatusSummary, parseStatusState } from "./status-service.mjs";
import { actorKind } from "./actor-kind.mjs";
import { actorWeapons, clearStonePassiveState, isPassiveItem, parseBreathPassiveState, passiveStatePatch, stoneConfirmedDamageForTarget } from "./breath-passives.mjs";

const MANOBRA_MAP = {
  "unica": "unica",
  "u00fanica": "unica",
  "ataque": "ataque",
  "acao de ataque": "ataque",
  "especial": "especial",
  "acao especial": "especial",
  "completa": "completa",
  "acao completa": "completa",
  "livre": "livre",
  "acao livre": "livre",
  "reaka": "reacao",
  "reakatilde;o": "reacao",
  "reação": "reacao",
  "rea\\u00e7\\u00e3o": "reacao",
};

function normalizeManobra(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return MANOBRA_MAP[key] ?? null;
}

function parseDamageTypes(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return [];
  return value.split(",").map((type) => type.trim().toLowerCase()).filter(Boolean);
}

function getFormData(item) {
  const props = item?.system?.props ?? {};
  const catalog = waterFormById(String(props.forma_id ?? ""))
    ?? flameFormById(String(props.forma_id ?? ""))
    ?? stoneFormById(String(props.forma_id ?? ""))
    ?? mistFormById(String(props.forma_id ?? ""))
    ?? metalFormById(String(props.forma_id ?? ""))
    ?? snowFormById(String(props.forma_id ?? ""));
  const baseTypes = parseDamageTypes(props.tipo_dano_base);
  const levels = [];
  for (let i = 1; i <= 4; i++) {
    const disponivel = parseNumber(props[`tem_nvl${i}`]) === 1 ||
      props[`tem_nvl${i}`] === true ||
      props[`tem_nvl${i}`] === "true";
    if (!disponivel) continue;
    levels.push({
      level: i,
      custo: parseNumber(props[`nvl${i}_custo`]),
      dano: String(props[`nvl${i}_dano`] ?? "").trim(),
      efeito: String(props[`nvl${i}_efeito`] ?? "").trim(),
      status: String(props[`nvl${i}_status`] ?? "").trim(),
      buff: String(props[`nvl${i}_buff`] ?? "").trim(),
      tiposDano: parseDamageTypes(props[`nvl${i}_tipos_dano`]),
    });
  }
  return {
    id: String(props.forma_id ?? catalog?.id ?? ""),
    nome: String(catalog?.name ?? props.nome_jp ?? props.nome_forma ?? item?.name ?? "Forma"),
    jp: String(catalog?.ptName ?? props.nome_forma ?? ""),
    respiracao: String(props.respiracao_nome ?? ""),
    tipo: String(catalog?.action ?? catalog?.actions?.[0] ?? props.tipo_manobra ?? ""),
    nivelReq: parseNumber(props.nivel_req),
    descricao: String(props.descricao ?? ""),
    temRequisito: parseNumber(props.tem_requisito) === 1,
    requisito: String(props.requisito_texto ?? ""),
    baseTypes,
    levels: catalog?.levels?.map((level, index) => level ? {
      level: index + 1,
      custo: level.cost,
      dano: level.damage ?? "",
      efeito: props[`nvl${index + 1}_efeito`] ?? "",
      status: "",
      buff: "",
      tiposDano: baseTypes,
    } : null).filter(Boolean) ?? levels,
  };
}

function slayerPdrInfo(props = {}) {
  const pdrMax = Math.max(0,
    parseNumber(props.pdr_slayer_total_conta) +
    parseNumber(props.metal_slayer_pdr_bonus) +
    parseNumber(props.pdr_slayer_extra)
  );
  const pdrCurrent = Math.max(0, Math.min(pdrMax,
    pdrMax + parseNumber(props.pdr_slayer_curado) - parseNumber(props.pdr_slayer_gasto_valor)
  ));
  return { pdrMax, pdrCurrent };
}

/**
 * Coleta aliados dispostos a contribuir com a sinergia do Rengoku
 * (Amor/Vento/Magma/Sol: 2 PDR cada → +5 de dano por contribuição).
 * @param {Actor} actor Usuário da Respiração das Chamas.
 * @param {{id: string}} form Forma sendo usada.
 * @param {object} props Props atuais do ator.
 * @returns {Promise<object>} `{ rengokuAllies: [{uuid, name}] }` ou `{}` .
 */
async function collectFlameChoices(actor, form, props = {}) {
  const distinctWeapons = [...new Map(actorWeapons(actor).map((weapon) => [weapon.id, weapon])).values()];
  if (distinctWeapons.length === 0) {
    return { cancelled: true, reason: "A Respiração das Chamas exige uma arma sincronizada no inventário." };
  }
  const flameState = parseFlameBreathingState(props.resp_chamas_estado);
  const currentId = String(flameState.synchronizedWeapon?.id ?? "");
  let synchronizedWeapon = distinctWeapons.find((weapon) => weapon.id === currentId) ?? distinctWeapons[0];
  if (distinctWeapons.length > 1) {
    const options = distinctWeapons.map((weapon) => `<option value="${weapon.id}" ${weapon.id === synchronizedWeapon.id ? "selected" : ""}>${weapon.name}</option>`).join("");
    const selectedId = await foundry.applications.api.DialogV2.wait({
      window: { title: "Honō no Kokyū — arma sincronizada" },
      content: `<div class="na-csb-automation"><p>Esquentar e o crítico pertencem à arma sincronizada.</p><label>Arma</label><select name="weaponId">${options}</select></div>`,
      modal: true,
      rejectClose: false,
      buttons: [
        { action: "confirmar", label: "Sincronizar", default: true, callback: (_event, button) => button.form.elements.weaponId.value },
        { action: "cancelar", label: "Cancelar", callback: () => "" },
      ],
    });
    if (!selectedId) return { cancelled: true };
    synchronizedWeapon = distinctWeapons.find((weapon) => weapon.id === selectedId) ?? synchronizedWeapon;
  }
  const baseChoices = { synchronizedWeapon };
  if (form.id !== "chamas_09") return baseChoices;
  const candidates = [];
  const seen = new Set([actor.uuid]);
  const combatants = [
    ...(((game.combat?.combatants)?.contents) ?? (game.combat?.combatants) ?? []),
  ];
  for (const combatant of combatants) {
    const doc = combatant?.actor;
    if (!doc || seen.has(doc.uuid)) continue;
    seen.add(doc.uuid);
    if (actorKind(doc) !== "slayer") continue;
    const respiracoes = [...(doc.items ?? [])]
      .map((item) => String(item.system?.props?.respiracao_nome ?? ""))
      .filter(Boolean);
    const { pdrCurrent } = slayerPdrInfo(doc.system?.props ?? {});
    candidates.push({ uuid: doc.uuid, name: doc.name ?? "", respiracoes, pdrAvailable: pdrCurrent });
  }
  const eligible = resolveFlameRengokuAllies(candidates, actor.uuid);
  if (!eligible.length) return { ...baseChoices, rengokuAllies: [] };
  const checkboxes = eligible.map((ally, index) => `
    <label style="display:flex;gap:6px;align-items:center">
      <input type="checkbox" data-index="${index}">
      <span>${ally.name} — PDR disponível: ${ally.pdrAvailable} (custa ${FLAME_SYNERGY_PDR_COST})</span>
    </label>`).join("");
  const chosenIndexes = await foundry.applications.api.DialogV2.wait({
    window: { title: "Ku no Kata Rengoku — Sinergia" },
    content: `<div class="na-csb-automation"><p>Aliados de Koi no Kokyū, Kaze no Kokyū, Yōgan no Kokyū ou Hi no Kokyū podem gastar ${FLAME_SYNERGY_PDR_COST} PDR para somar +${FLAME_SYNERGY_DAMAGE_PER_ALLY} de dano ao Rengoku (somente se o ataque acertar).</p>${checkboxes}</div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "confirmar", label: "Confirmar", callback: (_event, _button, dialog) => [...dialog.element.querySelectorAll("input[data-index]:checked")].map((input) => Number(input.dataset.index)) },
      { action: "sem_sinergia", label: "Sem sinergia", callback: () => [] },
    ],
  });
  return { ...baseChoices, rengokuAllies: (Array.isArray(chosenIndexes) ? chosenIndexes : []).map((index) => eligible[index]).filter(Boolean) };
}

export function getBreathLevel(props = {}) {
  const candidates = [
    ["nvl_respiracao_num", props.nvl_respiracao_num],
    ["respiracao_nivel", props.respiracao_nivel],
    ["nivel_respiracao", props.nivel_respiracao],
    ["nvl_respiracao", props.nvl_respiracao],
  ];

  for (const [key, raw] of candidates) {
    if (raw === undefined || raw === null || raw === "") continue;
    const val = Math.trunc(parseNumber(raw));
    // Nível de Respiração válido é 1–4. Qualquer valor acima disso
    // provavelmente é nível de personagem vazando para a key errada.
    if (val >= 1 && val <= 4) return val;
    console.warn(`[NA Breath] Ignorando ${key}=${raw}; nível de respiração deve estar entre 1 e 4.`);
  }

  return 1;
}

async function resolveActorFromItem(item, fallbackUuid) {
  if (item?.parent?.system?.props) return item.parent;
  if (item?.actor?.system?.props) return item.actor;
  if (fallbackUuid) {
    const doc = await fromUuid(fallbackUuid);
    if (doc?.system?.props) return doc;
    if (doc?.actor?.system?.props) return doc.actor;
  }
  const controlled = canvas?.tokens?.controlled;
  if (controlled?.length > 0) return controlled[0].actor;
  return game?.user?.character ?? null;
}

function buildDialogHtml(form, pdrCurrent, breathLevel) {
  const levelOptions = form.levels.filter((level) => level.level <= breathLevel).map(l => {
    const danoTxt = l.dano ? ` · Dano: ${l.dano}` : "";
    const statusTxt = l.status ? ` · Status: ${l.status}` : "";
    const buffTxt = l.buff ? ` · Buff: ${l.buff}` : "";
    return `<option value="${l.level}">Nível ${l.level} ${l.custo} PDR${danoTxt}${statusTxt}${buffTxt}</option>`;
  }).join("");

  const reqHtml = form.temRequisito
    ? `<div class="na-breath-req" style="color:#FF2B4A;font-size:12px;margin-bottom:6px;">⚠ Requisito: ${form.requisito}</div>`
    : "";

  const lvlReqHtml = form.nivelReq > 1
    ? `<div style="color:#FF9100;font-size:12px;margin-bottom:6px;">Requer Nível de Respiração ${form.nivelReq} (atual: ${breathLevel})</div>`
    : "";

  return `
    <div class="na-breath-dialog">
      <div style="margin-bottom:8px;">
        <strong style="font-size:15px;">${form.nome}</strong>
        ${form.jp ? `<div style="font-size:12px;color:#888;">${form.jp}</div>` : ""}
        <div style="font-size:12px;color:#aaa;">${form.respiracao} · ${form.tipo}</div>
      </div>
      ${reqHtml}
      ${lvlReqHtml}
      <div style="font-size:12px;color:#888;margin-bottom:8px;line-height:1.4;">${form.descricao}</div>
      <div style="margin-bottom:8px;">
        <label style="font-size:13px;">Escolha o nível:</label>
        <select name="na-breath-level" style="width:100%;margin-top:4px;">${levelOptions}</select>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#888;">
        <span>PDR disponível: <strong>${pdrCurrent}</strong></span>
      </div>
    </div>
  `;
}

export function parseWaterBreathingState(raw) {
  if (raw && typeof raw === "object") return { version: 1, ...raw };
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" ? { version: 1, ...parsed } : { version: 1 };
  } catch (_) {
    return { version: 1 };
  }
}

function statePatch(state, overrides = {}) {
  return {
    "system.props.resp_agua_estado": JSON.stringify({ version: 1, ...state }),
    ...overrides,
  };
}

export function buildWaterBreathingPlan(formId, level, props = {}, choices = {}) {
  const form = waterFormById(formId);
  const selected = form?.levels?.[level - 1];
  if (!form || !selected) return { ok: false, reason: "Forma ou nível indisponível." };
  const damageTypes = resolveWaterDamageTypes(form, selected);
  const state = parseWaterBreathingState(props.resp_agua_estado);
  const int = parseNumber(props.int_display);
  const dex = parseNumber(props.dex_display);
  const base = { ok: true, form, selected, action: form.action === "ataque_especial" ? (choices.special ? "especial" : "ataque") : form.action, cost: selected.cost, patch: {}, state };
  if (formId === "agua_01") {
    Object.assign(base.patch, statePatch({ ...state, pendingDamage: { source: formId, formula: selected.damage, uses: 1, types: damageTypes } }, {
      "system.props.resp_bonus_dano_dados": selected.damage, "system.props.resp_efeito_flag": "Água 1: próximo ataque", "system.props.resp_efeito_duracao": 0,
    }));
  } else if (formId === "agua_02") {
    if (!choices.jumpPassed && !choices.water9Active) return { ok: false, noCost: true, reason: "Falha no teste de DEX CD 12." };
    if (choices.special && !choices.comboWater1) base.cost += 1;
    Object.assign(base.patch, statePatch({ ...state, pendingDamage: { source: formId, formula: selected.damage, uses: 1, halfOnDefense: true, types: damageTypes }, nextHit: { advantage: true, source: formId } }, {
      "system.props.resp_bonus_dano_dados": selected.damage, "system.props.resp_bonus_acerto_temp": 0, "system.props.resp_efeito_flag": "Água 2: Vantagem e metade na Defesa",
    }));
  } else if (formId === "agua_03") {
    const bonus = level < 2 ? 0 : int + (level >= 3 ? level - 2 : 0);
    Object.assign(base.patch, statePatch({ ...state, pendingDamage: { source: formId, formula: selected.damage, uses: 3, types: damageTypes }, nextHit: { count: 3, bonus, distinctTargets: true, source: formId } }, {
      "system.props.resp_bonus_dano_dados": selected.damage, "system.props.resp_bonus_acerto_temp": bonus, "system.props.resp_efeito_flag": "Água 3: até 3 alvos distintos",
    }));
  } else if (formId === "agua_04") {
    if (!choices.triggerConfirmed) return { ok: false, noCost: true, reason: "A Forma exige finalização ou Acerto Crítico." };
    Object.assign(base.patch, statePatch({ ...state, nextHit: { source: formId, immediate: true, range: parseNumber(props.deslocamento_slayer) } }, { "system.props.resp_efeito_flag": "Água 4: ataque imediato" }));
  } else if (formId === "agua_05") {
    if (!choices.targetIncapacitated) return { ok: false, noCost: true, reason: "O alvo precisa estar rendido ou atordoado." };
    Object.assign(base.patch, statePatch({ ...state, pendingDamage: { source: formId, critical: true, uses: 1, recoverPdrOnKill: level, types: damageTypes } }, { "system.props.resp_efeito_flag": "Água 5: crítico automático" }));
  } else if (formId === "agua_06") {
    const hitBonus = choices.submerged ? 3 : 0;
    // Combo com a 7ª Forma (Nível 3-4): metade do custo de PDR o combo é
    // consumido nesta ativação, não persiste para usos futuros.
    const comboActive = Boolean(state.block?.comboWater6);
    if (comboActive) base.cost = Math.ceil(base.cost / 2);
    const nextBlock = comboActive ? undefined : state.block;
    Object.assign(base.patch, statePatch({ ...state, block: nextBlock, pendingDamage: { source: formId, formula: selected.damage, uses: 1, area: true, allyDefenseBonus: dex, types: damageTypes }, nextHit: { bonus: hitBonus, source: formId } }, {
      "system.props.resp_bonus_dano_dados": selected.damage, "system.props.resp_bonus_acerto_temp": hitBonus, "system.props.resp_efeito_flag": comboActive ? `Água 6: área (combo Água 7, metade do custo); aliados +${dex} Defesa` : `Água 6: área; aliados +${dex} Defesa`,
    }));
  } else if (formId === "agua_07") {
    Object.assign(base.patch, statePatch({ ...state, block: { bonus: int, comboWater6: level >= 3, source: formId } }, {
      "system.props.resp_bonus_bloqueio_temp": int, "system.props.resp_efeito_flag": level >= 3 ? "Água 7: Bloqueio + combo Água 6" : "Água 7: Bloqueio da ação",
    }));
  } else if (formId === "agua_08") {
    if (parseNumber(props.resp_agua_08_recarga_turno) > 0) return { ok: false, noCost: true, reason: "A 8ª Forma ainda está em recarga." };
    Object.assign(base.patch, statePatch({ ...state, pendingDamage: { source: formId, formula: selected.damage, uses: 1, suppressResistanceTurns: 2, vitCheck: level >= 2, criticalDiceInt: level >= 3, types: damageTypes }, nextHit: { advantage: level >= 4, source: formId } }, {
      "system.props.resp_bonus_dano_dados": selected.damage, "system.props.resp_agua_08_recarga_turno": 3, "system.props.resp_efeito_flag": "Água 8: resistência suprimida por 2 turnos",
    }));
  } else if (formId === "agua_09") {
    const evade = level <= 2 ? 1 : 3;
    Object.assign(base.patch, statePatch({ ...state, water9: { turns: 2, evasion: evade, movement: level, source: formId } }, {
      "system.props.resp_bonus_esquiva_temp": evade, "system.props.resp_efeito_duracao": 2, "system.props.resp_efeito_flag": `Água 9: +${evade} Esquiva, +${level}m`,
    }));
  } else if (formId === "agua_10") {
    const charges = Math.max(0, Math.trunc(parseNumber(choices.charges ?? state.water10?.charges)));
    if (choices.release) {
      if (charges < 1) return { ok: false, noCost: true, reason: "A 10ª Forma exige ao menos um turno carregado." };
      const formula = Array.from({ length: charges }, () => `(${selected.damage})`).join(" + ");
      Object.assign(base.patch, statePatch({ ...state, water10: null, pendingDamage: { source: formId, formula, uses: 1, charges, exhaustion: charges > 1 ? 2 : 0, types: damageTypes } }, {
        "system.props.resp_bonus_dano_dados": formula, "system.props.resp_carga_acumulada": 0, "system.props.resp_efeito_flag": `Água 10: liberar ${charges} carga(s)`,
      }));
    } else {
      base.cost = 0;
      Object.assign(base.patch, statePatch({ ...state, water10: { level, charges: 0, active: true, comboWater9: Boolean(state.water9?.turns) } }, {
        "system.props.resp_carga_acumulada": 0, "system.props.resp_efeito_flag": "Água 10: carregando",
      }));
    }
  } else if (formId === "agua_11") {
    const maximum = Math.max(0, level - 1);
    const used = Math.max(0, Math.trunc(parseNumber(props.resp_agua_11_usos_hoje)));
    if (used >= maximum) return { ok: false, noCost: true, reason: "Nenhum uso diário de Calmaria disponível." };
    Object.assign(base.patch, statePatch({ ...state, calm: { negateNextAttack: true, source: formId } }, {
      "system.props.resp_agua_11_usos_hoje": used + 1, "system.props.resp_efeito_flag": "Água 11: próximo ataque anulado",
    }));
  }
  return base;
}

export function buildGenericBreathingPlan(form, selected) {
  if (!form || !selected) return { ok: false, reason: "Forma ou nível indisponível." };
  return {
    ok: true,
    action: normalizeManobra(form.tipo),
    cost: Math.max(0, parseNumber(selected.custo)),
    patch: {},
  };
}

function resolveGenericDamageFormula(formula, props = {}) {
  return String(formula ?? "")
    .replace(/@(vit|dex|for|car|fdv|int|sab)\b/giu, (_match, key) => String(parseNumber(props[`${String(key).toLowerCase()}_display`])))
    .trim();
}

export function tickWaterBreathing(props = {}) {
  const state = parseWaterBreathingState(props.resp_agua_estado);
  const patch = {};
  const cooldown = Math.max(0, Math.trunc(parseNumber(props.resp_agua_08_recarga_turno)) - 1);
  patch["system.props.resp_agua_08_recarga_turno"] = cooldown;
  if (state.water9?.turns > 0) {
    state.water9.turns -= 1;
    patch["system.props.resp_efeito_duracao"] = state.water9.turns;
    if (state.water9.turns === 0) {
      state.water9 = null;
      patch["system.props.resp_bonus_esquiva_temp"] = 0;
    }
  }
  if (state.water10?.active) {
    state.water10.charges = Math.max(0, Math.trunc(parseNumber(state.water10.charges)) + 1);
    patch["system.props.resp_carga_acumulada"] = state.water10.charges;
  }
  return statePatch(state, patch);
}

async function openBreathDialog({ form, pdrCurrent, breathLevel }) {
  const allowedLevels = form.levels.filter((level) => level.level <= breathLevel);
  if (allowedLevels.length === 0) {
    ui.notifications?.warn?.(
      `Nenhum nível disponível para ${form.nome}. Respiração atual: ${breathLevel}; requisito: ${form.nivelReq}.`
    );
    return null;
  }
  const html = buildDialogHtml({ ...form, levels: allowedLevels }, pdrCurrent, breathLevel);
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Respiração da ${form.respiracao} ${form.nome}` },
    content: html,
    buttons: [
      {
        action: "usar",
        label: "Usar Forma",
        callback: (_event, _button, dialog) => {
          const level = Number(dialog.element.querySelector('[name="na-breath-level"]')?.value ?? 1);
          return { level };
        },
      },
      { action: "close", label: "Cancelar", default: true, callback: () => null },
    ],
  });
  return result;
}

async function confirmRule(title, content) {
  return foundry.applications.api.DialogV2.confirm({
    window: { title }, content: `<div class="na-csb-automation"><p>${content}</p></div>`,
    yes: { label: "Confirmar" }, no: { label: "Cancelar" }, defaultYes: false, modal: true,
  });
}

async function collectWaterChoices(actor, form, level, props) {
  const state = parseWaterBreathingState(props.resp_agua_estado);
  if (form.id === "agua_02") {
    const special = await confirmRule("Roda D'Água", "Usar como Ação Especial? Sem combo com a 1ª Forma, isso custa +1 PDR.");
    let jumpPassed = Boolean(state.water9?.turns);
    if (!jumpPassed) {
      const dex = parseNumber(props.dex_display);
      const roll = await Roll.create(`1d20 + ${dex}`).evaluate();
      await roll.toMessage({ flavor: "Roda D'Água · Teste de pulo (DEX CD 12)", speaker: ChatMessage.getSpeaker({ actor }) });
      jumpPassed = roll.total >= 12;
    }
    return { special, jumpPassed, water9Active: Boolean(state.water9?.turns), comboWater1: state.pendingDamage?.source === "agua_01" };
  }
  if (form.id === "agua_04") return { triggerConfirmed: await confirmRule("Maré Impressionante", "Você finalizou um inimigo ou obteve um Acerto Crítico?") };
  if (form.id === "agua_05") return { targetIncapacitated: await confirmRule("Chuva Misericordiosa", "O alvo está rendido ou Atordoado?") };
  if (form.id === "agua_06") return { submerged: await confirmRule("Torção de Hidromassagem", "O personagem está submerso em água?") };
  if (form.id === "agua_10") return { release: Boolean(state.water10?.active), charges: state.water10?.charges ?? 0 };
  return {};
}

async function askNumber(title, label, { value = 0, min = 0, max = 99 } = {}) {
  return foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<div class="form-group"><label>${label}</label><input type="number" name="value" value="${value}" min="${min}" max="${max}" step="1"></div>`,
    buttons: [
      { action: "ok", label: "Confirmar", default: true, callback: (_event, button) => Math.max(min, Math.min(max, Math.trunc(Number(button.form.elements.value.value) || 0))) },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
    rejectClose: false,
  });
}

async function collectWindChoices(actor, form, level, props) {
  if (form.id === "vento_02") {
    const dex = parseNumber(props.dex_display);
    const maxPdr = Math.trunc(2 * dex);
    const pdrInvested = await askNumber("Ichi no Kata Jin Senpū Sogi", "PDR a investir (dano escala junto)", { min: 1, max: Math.max(1, maxPdr) });
    return pdrInvested === null ? { cancelled: true } : { pdrInvested };
  }
  if (form.id === "vento_04") {
    const secondUse = await confirmRule("San no Kata Kokufū Enran", "Este é o 2º uso (Reação/contra-ataque)?");
    return { secondUse };
  }
  return {};
}

async function collectCuratedChoices(actor, form, level, props) {
  const targetActor = [...(game.user?.targets ?? [])][0]?.actor ?? null;
  // Ciclone da Névoa: "durante qualquer momento de seu próximo turno, pode
  // conjurar qualquer técnica da Névoa sem gastar PDR". Pergunta-se uma vez,
  // para qualquer Forma da Névoa, se o benefício ainda estiver disponível.
  let mistCyclone = {};
  if (mistFormById(form.id)) {
    const mistState = parseMistBreathingState(props.resp_nevoa_estado);
    if (mistState.patterns.cyclone.benefitAvailable) {
      mistCyclone = { useCycloneFree: await confirmRule("Ciclone da Névoa", "Usar o benefício gratuito do Ciclone (isenta o custo BASE desta técnica)?") };
    }
  }
  if (form.id === "pedra_01") {
    if (!targetActor) return { cancelled: true, reason: "Marque o inimigo atingido pelo ataque originário." };
    const record = stoneConfirmedDamageForTarget(parseBreathPassiveState(props.resp_passivas_estado), targetActor.uuid, {
      combatId: game.combat?.uuid ?? "",
      round: game.combat?.round ?? 0,
      turn: game.combat?.turn ?? 0,
    });
    if (!record) return { cancelled: true, reason: "Jamongan Sōkyoku exige dano confirmado neste mesmo alvo e turno." };
    return { originDamage: record.damage, targetUuid: targetActor.uuid, originActionId: record.actionId };
  }
  if (form.id === "pedra_03") {
    if (!targetActor) return { cancelled: true, reason: "Marque o inimigo alvo da reação." };
    const passiveState = parseBreathPassiveState(props.resp_passivas_estado);
    const weaponId = String(passiveState.lastWeapon?.id ?? "");
    const weaponItem = weaponId ? actor.items?.get?.(weaponId) : null;
    const rangeRaw = String(weaponItem?.system?.props?.arma_alcance ?? "").toLocaleLowerCase("pt-BR");
    const rangeMeters = Number.parseFloat(rangeRaw.replace(",", "."));
    const ranged = (Number.isFinite(rangeMeters) && rangeMeters > 2)
      || /dist[aâ]ncia|ranged|longo|proj[eé]til|arremesso/u.test(rangeRaw);
    const protectingAlly = await confirmRule("Reflexão da Pedra", "Você está protegendo um aliado (em vez de si mesmo)?");
    let protectedUuid = actor.uuid;
    if (protectingAlly) {
      const allyToken = [...(game.user?.targets ?? [])].find((token) => token.actor?.uuid !== targetActor.uuid)
        ?? canvas?.tokens?.controlled?.find((token) => token.actor?.uuid !== actor.uuid);
      protectedUuid = allyToken?.actor?.uuid ?? actor.uuid;
    }
    return { targetUuid: targetActor.uuid, weaponRange: ranged ? "distancia" : "corpo-a-corpo", protectedUuid };
  }
  if (form.id === "pedra_05") return { markReactivation: Boolean(props.marca_ativa && parseNumber(props.marca_ativa) > 0) };
  if (form.id === "nevoa_03") {
    return { ...mistCyclone, kekkijutsuReduced: await confirmRule("Expansão de Névoa", "Este uso diminuiu ou anulou com sucesso o dano de um Kekkijutsu?") };
  }
  if (form.id === "nevoa_04") {
    const advantageAttack = await confirmRule("Corte de Advecção", "Este uso parte de uma rolagem de Acerto que JÁ tem Vantagem (não é a Forma quem concede a Vantagem)?");
    if (!advantageAttack) return { ...mistCyclone, advantageAttack: false };
    const suppressResistance = await confirmRule("Corte de Advecção", "Pagar +1 PDR extra para aplicar Anulação de Resistências no alvo (Sinergia Água/Vento/Sonhos)?");
    const suppressAttribute = suppressResistance && await confirmRule("Corte de Advecção", "Usar DEX para definir a duração? (Cancelar usa FOR)")
      ? "dex" : "for";
    return { ...mistCyclone, advantageAttack, suppressResistance, suppressAttribute };
  }
  if (form.id === "nevoa_05") {
    return { ...mistCyclone, doubleCost: await confirmRule("Mar de Nuvens", "Pagar o dobro do PDR total para obter Reflexão da Névoa?"), targetUuid: targetActor?.uuid ?? "" };
  }
  if (form.id === "nevoa_06") {
    const dex = parseNumber(props.dex_display);
    const check = await Roll.create(`1d20 + ${dex}`).evaluate();
    const message = await check.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "<strong>Névoa sob o Luar</strong> DEX CD 12" });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    // Nota: os 2 PDR de declaração são cobrados pelo chamador independente
    // do resultado deste teste (custo por DECLARAÇÃO, não por sucesso).
    if (check.total < 12) return { ...mistCyclone, dexCheckPassed: false, extraAttacks: 0 };
    const available = Math.max(0, Math.min(19, Math.floor(slayerPdrInfo(props).pdrCurrent) - 2));
    const extraAttacks = await askNumber("Névoa sob o Luar", "Máximo de ataques adicionais (+1 PDR cada)", { max: available });
    return extraAttacks === null ? { cancelled: true } : { ...mistCyclone, dexCheckPassed: true, extraAttacks };
  }
  if (form.id === "nevoa_07") {
    if (!targetActor) return { cancelled: true, reason: "Marque o inimigo do teste oposto de SAB." };
    const ownSab = parseNumber(props.sab_display);
    const enemySab = parseNumber(targetActor.system?.props?.sab_display);
    const [own, enemy] = await Promise.all([Roll.create(`2d20kh1 + ${ownSab}`).evaluate(), Roll.create(`1d20 + ${enemySab}`).evaluate()]);
    await Promise.all([own.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "<strong>Neblina</strong> SAB com Vantagem" }), enemy.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: "<strong>Neblina</strong> SAB do alvo" })]);
    return { ...mistCyclone, opposedPassed: own.total > enemy.total, targetUuid: targetActor.uuid };
  }
  if (form.id === "nevoa_08") {
    if (!targetActor) return { cancelled: true, reason: "Marque o inimigo que será ofuscado." };
    const allyToken = [...(game.user?.targets ?? [])].find((token) => token.actor?.uuid !== targetActor.uuid)
      ?? canvas?.tokens?.controlled?.find((token) => token.actor?.uuid !== actor.uuid);
    return { ...mistCyclone, targetUuid: targetActor.uuid, allyUuid: allyToken?.actor?.uuid ?? actor.uuid };
  }
  if (mistFormById(form.id)) return { ...mistCyclone };
  if (form.id === "metal_06") {
    const magnetismEligible = resolveMetalMagnetism(props).eligible;
    if (magnetismEligible && !targetActor) return { cancelled: true, reason: "Marque o inimigo afetado por Magnetismo." };
    return { targetUuid: magnetismEligible ? targetActor.uuid : "" };
  }
  if (form.id === "neve_03") return { ownerUuid: actor.uuid, allyUuid: targetActor?.uuid ?? "", allyBreathing: String(targetActor?.system?.props?.respiracao_escolhida ?? "") };
  if (form.id === "neve_05") return { targetUuid: targetActor?.uuid ?? "" };
  if (form.id === "neve_07") return { ownerUuid: actor.uuid, protectedUuid: targetActor?.uuid ?? actor.uuid, allyBreathing: String(targetActor?.system?.props?.respiracao_escolhida ?? "") };
  return {};
}

async function postBreathChat({ actor, form, selected, damageRoll }) {
  const danoLine = damageRoll
    ? `<div style="margin-top:6px;">Dano rolado: <strong>${damageRoll.total}</strong> <button class="na-breath-damage-die" style="border:none;background:none;cursor:pointer;color:#28D7FF;font-size:11px;">(ver dados)</button></div>`
    : "";
  const statusLine = selected.status
    ? `<div style="color:#FF9100;">Status: ${selected.status}</div>`
    : "";
  const buffLine = selected.buff
    ? `<div style="color:#2EFF7A;">Buff (self): ${selected.buff}</div>`
    : "";
  const efeitoLine = selected.efeito
    ? `<div style="font-size:12px;color:#aaa;margin-top:4px;">${selected.efeito}</div>`
    : "";

  const flavor = `
    <div class="na-breath-chat" style="border-left:3px solid #28D7FF;padding:8px 12px;">
      <div style="font-size:14px;">
        <strong>${form.nome}</strong>
        ${form.jp ? `<span style="font-size:11px;color:#888;"> ${form.jp}</span>` : ""}
      </div>
      <div style="font-size:12px;color:#888;">${form.respiracao} · ${form.tipo} · Nível ${selected.level}</div>
      <div style="margin-top:4px;">Custo: <strong>${selected.custo} PDR</strong></div>
      ${danoLine}
      ${statusLine}
      ${buffLine}
      ${efeitoLine}
    </div>
  `;

  const chatData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
  };
  if (damageRoll) {
    chatData.rolls = [damageRoll];
  }
  chatData.messageMode = game.settings?.get?.("core", "messageMode") ?? "public";
  await ChatMessage.create(chatData);
}

export async function applyBreathingStatus(targetActor, key, effect) {
  const kind = actorKind(targetActor);
  if (!kind) return;
  const dataKey = `status_${kind}_dados`;
  const summaryKey = `status_${kind}_resumo`;
  const exhaustionKey = `status_${kind}_exaustao`;
  const props = targetActor.system?.props ?? {};
  const state = parseStatusState(props[dataKey]);
  if (!state.active.includes(key)) state.active.push(key);
  state.effects[key] = effect;
  await targetActor.update({
    [`system.props.${dataKey}`]: JSON.stringify(state),
    [`system.props.${summaryKey}`]: formatStatusSummary(state.active, state.exhaustion),
    [`system.props.${exhaustionKey}`]: state.exhaustion,
  }, { naCsbAutomation: true, naBreathing: true });
}

async function grantActiveSnowBlizzard(actor, targetActor) {
  if (!targetActor) return { ok: false, reason: "Marque o aliado que receberá Furtividade." };
  const granted = grantBlizzardStealth(actor.system?.props?.resp_neve_estado, {
    allyUuid: targetActor.uuid,
    allyBreathing: String(targetActor.system?.props?.respiracao_escolhida ?? ""),
    currentRound: game.combat?.round ?? 0,
  });
  if (!granted.ok) return granted;
  await actor.update(snowStatePatch(granted.state), { naCsbAutomation: true, naBreathing: true });
  await applyBreathingStatus(targetActor, "invisivel_inalvejavel", { remainingTurns: 1, sourceName: "San no Kata: Burizado", tick: "start", stacks: 1 });
  await targetActor.setFlag(MODULE_ID, "snowBlizzardStealth", { sourceActorUuid: actor.uuid, round: game.combat?.round ?? 0 });
  if (granted.pdrRecovery > 0 && actorKind(targetActor) === "slayer") {
    const spent = parseNumber(targetActor.system?.props?.pdr_slayer_gasto_valor);
    await targetActor.update({ "system.props.pdr_slayer_gasto_valor": Math.max(0, spent - granted.pdrRecovery) }, { naCsbAutomation: true, naBreathing: true });
  }
  return granted;
}

export async function attemptSnowRestrictionEscape({ actorUuid } = {}) {
  const document = actorUuid ? await fromUuid(actorUuid) : null;
  const actor = document?.actor ?? document ?? canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character;
  if (!actor) return ui.notifications?.warn?.("Nenhum Actor encontrado para tentar escapar.");
  const flag = actor.getFlag?.(MODULE_ID, "snowRestriction");
  if (!flag) return ui.notifications?.info?.("Este personagem não está restringido por Congelar.");
  const action = await consumeSlayerActions(actor, ["ataque"], { update: false });
  if (!action.ok) return ui.notifications?.warn?.(action.reason);
  const roll = await Roll.create(`1d20 + ${parseNumber(actor.system?.props?.for_display)}`).evaluate();
  const message = await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Congelar</strong> FOR contra CD ${flag.escapeDc}` });
  await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
  const outcome = resolveSnowRestrictionEscape(flag, roll.total);
  await actor.update(action.patch, { naCsbAutomation: true, naBreathing: true });
  if (!outcome.escaped) return ui.notifications?.warn?.(`${actor.name} não conseguiu escapar de Congelar.`);
  await actor.unsetFlag(MODULE_ID, "snowRestriction");
  const sourceDocument = flag.sourceActorUuid ? await fromUuid(flag.sourceActorUuid) : null;
  const source = sourceDocument?.actor ?? sourceDocument;
  if (source?.system?.props?.resp_neve_estado) {
    const state = parseSnowBreathingState(source.system.props.resp_neve_estado);
    if (state.restrictedTarget?.uuid === actor.uuid) delete state.restrictedTarget;
    await source.update(snowStatePatch(state), { naCsbAutomation: true, naBreathing: true });
  }
  ui.notifications?.info?.(`${actor.name} escapou da restrição de Congelar.`);
  return outcome;
}

/**
 * A Canção de um Dia Frio (Nível 3+): quando protege um aliado com Água/Vento/
 * Cristal, esse aliado ganha um Ataque de Oportunidade real contra o inimigo
 * que conjurou o Kekkijutsu (não é dano automático — o aliado precisa rolar
 * Acerto normalmente pelo pipeline padrão, sem consumir a economia de ações
 * porque é um ataque concedido, não uma Ação de Ataque comum).
 */
export async function triggerSnowOpportunityAttack({ actorUuid } = {}) {
  const document = actorUuid ? await fromUuid(actorUuid) : null;
  const actor = document?.actor ?? document ?? canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character;
  if (!actor) return ui.notifications?.warn?.("Nenhum Actor encontrado para o Ataque de Oportunidade.");
  const flag = actor.getFlag?.(MODULE_ID, "snowOpportunityAttack");
  if (!flag?.available) {
    ui.notifications?.info?.("Nenhum Ataque de Oportunidade da Canção de um Dia Frio disponível.");
    return { ok: false, reason: "Nenhum Ataque de Oportunidade disponível." };
  }
  await actor.unsetFlag(MODULE_ID, "snowOpportunityAttack");
  const enemyDocument = flag.enemyUuid ? await fromUuid(flag.enemyUuid) : null;
  const enemyActor = enemyDocument?.actor ?? enemyDocument;
  const enemyToken = enemyActor?.getActiveTokens?.()[0];
  if (enemyToken) enemyToken.setTarget(true, { user: game.user, releaseOthers: true });
  ui.notifications?.info?.(`${actor.name} ganhou um Ataque de Oportunidade (Canção de um Dia Frio) contra ${enemyActor?.name ?? "o conjurador do Kekkijutsu"}. Role o Acerto normalmente; este ataque não consome a economia de ações.`);
  const { rollHit } = await import("./hit-service.mjs");
  return rollHit({ actor, actorUuid: actor.uuid });
}

/**
 * Extrai as fórmulas de dano das técnicas armadas (pendingDamage das sete
 * Respirações) como entradas editáveis para pré-popular o modal de dano.
 */
function breathingTechniqueEntradas(actor) {
  const props = actor?.system?.props ?? {};
  const entradas = [];
  const push = (formula, types) => {
    if (!formula) return;
    entradas.push({ tipoAcao: "ataque", dado: String(formula), fixo: 0, attrs: [], tiposDano: Array.isArray(types) ? types : [] });
  };
  const water = parseWaterBreathingState(props.resp_agua_estado).pendingDamage;
  if (water?.formula) push(water.formula, water.types);
  const flame = parseFlameBreathingState(props.resp_chamas_estado).pendingDamage;
  if (flame?.formula) push(flame.formula, flame.types ?? ["fogo"]);
  if (flame?.comboRider?.formula) push(flame.comboRider.formula, flame.comboRider.types ?? ["fogo"]);
  const stone = parseStoneBreathingState(props.resp_pedra_estado).pendingDamage;
  if (stone?.formula) push(String(stone.formula).replace(/@for\b/giu, String(props.for_display ?? 0)), stone.types ?? ["concussao"]);
  const mist = parseMistBreathingState(props.resp_nevoa_estado).pendingDamage;
  if (mist?.formula) push(resolveMistFormula(mist.formula, props), ["cortante"]);
  const snow = parseSnowBreathingState(props.resp_neve_estado).pendingDamage;
  if (snow?.formula) push(snow.formula, ["congelante"]);
  const wind = parseWindBreathingState(props.resp_vento_estado).pendingDamage;
  if (wind?.formula) push(String(wind.formula).replace(/@(dex|fdv|for)\b/giu, (_m, key) => String(props[`${key.toLowerCase()}_display`] ?? 0)), wind.types);
  return entradas;
}

/**
 * Resolve o dano de uma Forma já confirmada no Acerto.
 *
 * A maioria das Formas segue o caminho genérico compartilhado com ataques
 * de arma "crus" (`resolveAutoDamage` em attack-follow-up.mjs, que também
 * cobre o fallback de arma quando a técnica não tem dado de dano próprio —
 * ex.: Céu em Chamas Ascendentes, 2ª Forma das Chamas). `nevoa_02` (Oito
 * Camadas) é a única com uma resolução de dano própria (fórmula fixa
 * derivada da contagem de acertos), então continua tratada aqui antes do
 * caminho genérico.
 */
async function rollConfirmedBreathDamage({ actor, form, hitResult, rollDamage, rollWeaponItem }) {
  const successful = hitResult.attempts.filter((attempt) => attempt.hit);
  const nome = form ? `${form.respiracao} ${form.nome}` : "Ataque";
  if (form?.id === "nevoa_02") {
    const mistState = parseMistBreathingState(actor.system?.props?.resp_nevoa_estado);
    const resolved = resolveEightLayersResult(mistState, successful.length);
    await actor.update(mistStatePatch(resolved.state), { naCsbAutomation: true, naBreathing: true });
    if (resolved.mode === "fixed" && resolved.formula) {
      const actionId = foundry.utils.randomID();
      await rollDamage({ actor, nome, entradas: [{ tipoAcao: "ataque", dado: resolved.formula, fixo: 0, attrs: [], tiposDano: ["cortante"] }], actionId, skipActionConsumption: true, forceAttackDamage: true });
      return;
    }
  }
  const { resolveAutoDamage } = await import("./attack-follow-up.mjs");
  await resolveAutoDamage({ actor, hitResult, techniqueLabel: nome, techniqueEntradas: breathingTechniqueEntradas(actor) });
}

async function clearResolvedTechniqueQueue(actor, formId) {
  const props = actor.system?.props ?? {};
  if (formId.startsWith("chamas_")) {
    const state = parseFlameBreathingState(props.resp_chamas_estado);
    delete state.nextHit; delete state.pendingDamage;
    await actor.update(flameStatePatch(state), { naCsbAutomation: true, naBreathing: true });
  } else if (formId.startsWith("pedra_")) {
    const state = parseStoneBreathingState(props.resp_pedra_estado);
    delete state.nextHit; delete state.pendingDamage; delete state.bleeding;
    await actor.update(stoneStatePatch(state), { naCsbAutomation: true, naBreathing: true });
  } else if (formId.startsWith("nevoa_")) {
    const state = parseMistBreathingState(props.resp_nevoa_estado);
    delete state.nextHit; delete state.pendingDamage; delete state.eightLayers;
    await actor.update(mistStatePatch(state), { naCsbAutomation: true, naBreathing: true });
  } else if (formId.startsWith("neve_")) {
    const state = parseSnowBreathingState(props.resp_neve_estado);
    delete state.nextHit; delete state.pendingDamage; delete state.pendingTargetEffect;
    await actor.update(snowStatePatch(state), { naCsbAutomation: true, naBreathing: true });
  }
}

function snapshotActorPatch(actor, patch) {
  return Object.fromEntries(Object.keys(patch).map((key) => [
    key,
    foundry.utils.deepClone(foundry.utils.getProperty(actor, key)),
  ]));
}

/**
 * API pública: executa uma forma de respiração a partir de um item CSB.
 * @param {object} options
 * @param {string} options.itemUuid - UUID do item (forma de respiração)
 * @param {string} [options.actorUuid] - UUID do actor (fallback)
 * @returns {Promise<void>}
 */
export async function useBreathForm({ itemUuid, actorUuid } = {}) {
  if (!itemUuid) {
    ui.notifications?.warn?.("UUID do item não fornecido.");
    return;
  }

  const item = await fromUuid(itemUuid);
  if (!item) {
    ui.notifications?.warn?.("Item não encontrado.");
    return;
  }

  const actor = await resolveActorFromItem(item, actorUuid);
  if (!actor) {
    ui.notifications?.warn?.("Nenhum personagem encontrado para usar a respiração.");
    return;
  }

  if (!actor.isOwner) {
    ui.notifications?.error?.("Você não pode usar técnicas com este personagem.");
    return;
  }

  const form = getFormData(item);
  if (form.levels.length === 0) {
    ui.notifications?.warn?.("Nenhum nível disponível para esta forma.");
    return;
  }

  const props = actor.system?.props ?? {};
  if (form.id === "neve_03" && parseSnowBreathingState(props.resp_neve_estado).blizzard?.turns > 0) {
    const targetActor = [...(game.user?.targets ?? [])][0]?.actor ?? null;
    const granted = await grantActiveSnowBlizzard(actor, targetActor);
    if (!granted.ok) ui.notifications?.warn?.(granted.reason);
    return;
  }
  if (isPassiveItem(form.id)) {
    const passiveName = form.id === "metal_05" ? "Martelo do Julgamento" : "Congelar";
    ui.notifications?.info?.(`${passiveName} é uma passiva automática e não gasta ação ou PDR.`);
    return;
  }
  const { pdrCurrent } = slayerPdrInfo(props);
  const baseBreathLevel = getBreathLevel(props);
  const breathLevel = snowFormById(form.id)
    ? snowEffectiveBreathLevel(baseBreathLevel, props.resp_neve_estado)
    : baseBreathLevel;

  if (breathLevel < form.nivelReq) {
    ui.notifications?.warn?.(`Requer Nível de Respiração ${form.nivelReq}. Atual: ${breathLevel}.`);
    return;
  }

  const statusEffects = getDamageStatusEffects(props);
  if (statusEffects.blocked) {
    ui.notifications?.warn?.("Este personagem está incapacitado e não pode usar técnicas.");
    return;
  }

  if (form.id === "chamas_01") {
    const selected = form.levels.find((level) => level.level <= breathLevel) ?? form.levels[0];
    await postBreathChat({ actor, form, selected: { ...selected, custo: 0 }, damageRoll: null });
    ui.notifications?.info?.("Esquentar é uma passiva: o módulo controla Fogo Fátuo e Brasas Ardentes automaticamente.");
    return;
  }

  const dialogResult = await openBreathDialog({ form, pdrCurrent, breathLevel });
  if (!dialogResult) return;

  const selected = form.levels.find(l => l.level === dialogResult.level);
  if (!selected) {
    ui.notifications?.warn?.("Nível selecionado inválido.");
    return;
  }

  const isWaterForm = Boolean(waterFormById(form.id));
  const isFlameForm = Boolean(flameFormById(form.id));
  const isStoneForm = Boolean(stoneFormById(form.id));
  const isMistForm = Boolean(mistFormById(form.id));
  const isMetalForm = Boolean(metalFormById(form.id));
  const isSnowForm = Boolean(snowFormById(form.id));
  const isWindForm = Boolean(windFormById(form.id));
  const choices = isWaterForm
    ? await collectWaterChoices(actor, form, selected.level, props)
    : isFlameForm
      ? await collectFlameChoices(actor, form, props)
      : isWindForm
        ? await collectWindChoices(actor, form, selected.level, props)
        : await collectCuratedChoices(actor, form, selected.level, props);
  if (choices?.cancelled) {
    if (choices.reason) ui.notifications?.warn?.(choices.reason);
    return;
  }
  const plan = isWaterForm
    ? buildWaterBreathingPlan(form.id, selected.level, props, choices)
    : isFlameForm
      ? buildFlameBreathingPlan(form.id, selected.level, props, choices)
      : isStoneForm
        ? buildStoneBreathingPlan(form.id, selected.level, props, choices)
        : isMistForm
          ? buildMistBreathingPlan(form.id, selected.level, props, choices)
          : isMetalForm
            ? buildMetalBreathingPlan(form.id, selected.level, props, choices)
            : isSnowForm
              ? buildSnowBreathingPlan(form.id, selected.level, props, choices)
              : isWindForm
                ? buildWindBreathingPlan(form.id, selected.level, props, choices)
                : buildGenericBreathingPlan(form, selected);
  if (!plan.ok) {
    ui.notifications?.warn?.(plan.reason);
    return;
  }

  let custoFinal = plan.cost;
  if (statusEffects.pdrSurcharge > 0 && custoFinal > 0) {
    custoFinal += statusEffects.pdrSurcharge;
    ui.notifications?.info?.(`Fadiga Espiritual: +${statusEffects.pdrSurcharge} PDR (custo total: ${custoFinal}).`);
  }

  if (custoFinal > pdrCurrent) {
    ui.notifications?.warn?.(`PDR insuficiente! Disponível: ${pdrCurrent}, necessário: ${custoFinal}.`);
    return;
  }

  const tiposManobra = (plan.actions ?? [plan.action]).filter(Boolean).map((action) => normalizeManobra(action) ?? action);
  const tipoManobra = tiposManobra[0] ?? null;
  const patch = { ...plan.patch };
  const actionResult = { ok: true };

  if (tiposManobra.length) {
    const res = await consumeSlayerActions(actor, tiposManobra, { update: false });
    if (!res.ok) {
      ui.notifications?.warn?.(res.reason);
      return;
    }
    actionResult.ok = true;
    if (res.patch && Object.keys(res.patch).length > 0) {
      Object.assign(patch, res.patch);
    }
  }

  if (custoFinal > 0) {
    const pdrGastoAtual = parseNumber(props.pdr_slayer_gasto_valor);
    patch["system.props.pdr_slayer_gasto_valor"] = pdrGastoAtual + custoFinal;
  }

  let flameHealingRoll = null;
  if (isFlameForm && plan.state?.healing) {
    flameHealingRoll = await Roll.create(plan.state.healing.formula).evaluate();
    patch["system.props.pdv_slayer_curado"] = parseNumber(props.pdv_slayer_curado) + Math.max(0, Math.trunc(Number(flameHealingRoll.total) || 0));
    if (plan.state.healing.removeBleeding) {
      const status = parseStatusState(props.status_slayer_dados);
      status.active = status.active.filter((key) => key !== "sangramento");
      delete status.effects.sangramento;
      patch["system.props.status_slayer_dados"] = JSON.stringify(status);
      patch["system.props.status_slayer_resumo"] = status.active.length ? status.active.join(" · ") : "Nenhum status ativo";
    }
    delete plan.state.healing;
    Object.assign(patch, flameStatePatch(plan.state));
  }
  let rollbackPatch = null;
  if (Object.keys(patch).length > 0) {
    rollbackPatch = snapshotActorPatch(actor, patch);
    await actor.update(patch, { naCsbAutomation: true, naBreathForm: true });
  }
  if (isFlameForm && form.id === "chamas_09" && Array.isArray(plan.state?.rengokuAllies) && plan.state.rengokuAllies.length) {
    for (const allyUuid of plan.state.rengokuAllies) {
      const allyDocument = await fromUuid(allyUuid);
      const allyActor = allyDocument?.actor ?? allyDocument;
      if (!allyActor?.system?.props) continue;
      const gasto = parseNumber(allyActor.system.props.pdr_slayer_gasto_valor);
      await allyActor.update({ "system.props.pdr_slayer_gasto_valor": gasto + FLAME_SYNERGY_PDR_COST }, { naCsbAutomation: true });
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: "<strong>Rengoku — Sinergia de Aliados</strong>",
      content: `${plan.state.rengokuAllies.length} aliado(s) gastaram ${FLAME_SYNERGY_PDR_COST} PDR cada: +${plan.state.rengokuAllies.length * FLAME_SYNERGY_DAMAGE_PER_ALLY} de dano se o ataque acertar.`,
    });
  }
  if (isSnowForm && form.id === "neve_03" && choices.allyUuid) {
    const allyDocument = await fromUuid(choices.allyUuid);
    const allyActor = allyDocument?.actor ?? allyDocument;
    const granted = await grantActiveSnowBlizzard(actor, allyActor);
    if (!granted.ok) ui.notifications?.warn?.(granted.reason);
  }
  if (isSnowForm && form.id === "neve_07" && choices.protectedUuid && choices.protectedUuid !== actor.uuid) {
    const protectedDocument = await fromUuid(choices.protectedUuid);
    const protectedActor = protectedDocument?.actor ?? protectedDocument;
    if (protectedActor?.setFlag) await protectedActor.setFlag(MODULE_ID, "snowKekkijutsuGuardSource", { sourceActorUuid: actor.uuid });
  }
  if (isStoneForm && form.id === "pedra_03" && choices.targetUuid && plan.state?.reflection) {
    const reflected = await fromUuid(choices.targetUuid);
    const targetActor = reflected?.actor ?? reflected;
    if (targetActor?.setFlag) await targetActor.setFlag(MODULE_ID, "stoneReflectionPenalty", {
      value: -Math.max(0, Number(plan.state.reflection.attackPenalty) || 0),
      // Regra: "diminui... a próxima rolagem de acerto do inimigo" é um
      // efeito de USO ÚNICO (a próxima rolagem, singular) — independente da
      // duração do bônus de Bloqueio (que dura 2 turnos nos Níveis 3/4). O
      // campo `turns` aqui é só uma expiração de segurança (1 turno) caso o
      // alvo nunca chegue a atacar; o consumo real acontece em hit-service.mjs
      // assim que a penalidade é aplicada a uma rolagem de Acerto.
      turns: 1,
      sourceActorUuid: actor.uuid,
      sourceState: plan.state,
    });

    // Sinergia: aliado protegido usuário de Metal/Cristal/Madeira testa FDV
    // (CD 16 - CAR do usuário da Pedra); se passar, recupera PDR = metade
    // da CAR do usuário da Pedra (arredondado para cima).
    const STONE_SYNERGY_BREATHINGS = new Set(["Metal", "Cristal", "Madeira"]);
    const protectedUuid = choices.protectedUuid && choices.protectedUuid !== actor.uuid ? choices.protectedUuid : null;
    if (protectedUuid) {
      const protectedDocument = await fromUuid(protectedUuid);
      const protectedActor = protectedDocument?.actor ?? protectedDocument;
      const hasSynergyBreathing = [...(protectedActor?.items ?? [])]
        .some((item) => STONE_SYNERGY_BREATHINGS.has(item.system?.props?.respiracao_nome));
      if (protectedActor?.update && hasSynergyBreathing) {
        const car = parseNumber(props.car_display);
        const fdv = parseNumber(protectedActor.system?.props?.fdv_display);
        const synergyDc = 16 - car;
        const synergyRoll = await Roll.create(`1d20 + ${fdv}`).evaluate();
        await synergyRoll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: protectedActor }),
          flavor: `<strong>Sinergia da Pedra</strong> FDV CD ${synergyDc}`,
        });
        if (synergyRoll.total >= synergyDc) {
          const recovery = Math.ceil(car / 2);
          const protectedPdrGasto = parseNumber(protectedActor.system?.props?.pdr_slayer_gasto_valor);
          await protectedActor.update({
            "system.props.pdr_slayer_gasto_valor": Math.max(0, protectedPdrGasto - recovery),
          }, { naCsbAutomation: true, naBreathing: true });
          ui.notifications?.info?.(`Sinergia da Pedra: ${protectedActor.name} recuperou ${recovery} PDR.`);
        }
      }
    }
  }
  if (isMistForm && form.id === "nevoa_08" && plan.state?.dazzle?.allyUuid) {
    const allyDocument = await fromUuid(plan.state.dazzle.allyUuid);
    const allyActor = allyDocument?.actor ?? allyDocument;
    if (allyActor?.update && allyActor.uuid !== actor.uuid) {
      const allyState = parseMistBreathingState(allyActor.system?.props?.resp_nevoa_estado);
      allyState.dazzle = { ...plan.state.dazzle, sourceActorUuid: actor.uuid };
      await allyActor.update(mistStatePatch(allyState), { naCsbAutomation: true, naBreathing: true });
      const ownerState = parseMistBreathingState(actor.system?.props?.resp_nevoa_estado);
      delete ownerState.dazzle;
      await actor.update(mistStatePatch(ownerState), { naCsbAutomation: true, naBreathing: true });
    }
  }

  if (isMistForm && form.id === "nevoa_06" && plan.state?.dexFailed) {
    // Névoa sob o Luar: o custo de DECLARAÇÃO (2 PDR) já foi cobrado acima,
    // mesmo com o teste de DEX falho. A Forma não entra em funcionamento —
    // sem SAB nos ataques, sem cadeia, sem Colapso — e nenhum dano é criado.
    await postBreathChat({ actor, form, selected: { ...selected, custo: custoFinal }, damageRoll: null });
    ui.notifications?.info?.("Névoa sob o Luar: falhou no teste de DEX CD 12. O custo de declaração já foi pago, mas a técnica não teve efeito.");
    return;
  }

  if (isStoneForm && form.id === "pedra_01") {
    const targetActor = choices.targetUuid ? await fromUuid(choices.targetUuid) : null;
    if (!targetActor) return ui.notifications?.warn?.("Alvo do Serpentino Duplo não encontrado.");
    const vit = parseNumber(targetActor.system?.props?.vit_display);
    const save = await Roll.create(`1d20 + ${vit}`).evaluate();
    const message = await save.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: `<strong>Jamongan Sōkyoku</strong> VIT CD ${plan.state.serpentine.saveDc}` });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    if (save.total < plan.state.serpentine.saveDc) {
      const { rollDamage } = await import("./damage-service.mjs");
      await rollDamage({
        actor, nome: `${form.respiracao} ${form.nome}`,
        entradas: plan.state.serpentine.damageComponents.map((component) => ({ tipoAcao: "unica", dado: component.formula, fixo: 0, attrs: [], tiposDano: component.types })),
        skipActionConsumption: true, forceAttackDamage: true,
      });
    }
    await postBreathChat({ actor, form, selected: { ...selected, custo: custoFinal }, damageRoll: null });
    return;
  }

  const flameNeedsAttackResolution = isFlameForm && Boolean(plan.state?.nextHit || plan.state?.pendingDamage);
  const stoneNeedsAttackResolution = isStoneForm && ["pedra_02", "pedra_04"].includes(form.id);
  const mistNeedsAttackResolution = isMistForm && ["nevoa_01", "nevoa_02", "nevoa_04", "nevoa_06"].includes(form.id);
  const metalNeedsAttackResolution = isMetalForm && form.id === "metal_06";
  const snowNeedsAttackResolution = isSnowForm && ["neve_01", "neve_02", "neve_05"].includes(form.id);
  if (flameNeedsAttackResolution || stoneNeedsAttackResolution || mistNeedsAttackResolution || metalNeedsAttackResolution || snowNeedsAttackResolution) {
    const [{ rollHit }, { rollDamage, rollWeaponItem }] = await Promise.all([
      import("./hit-service.mjs"),
      import("./damage-service.mjs"),
    ]);
    // autoDamage:false — este fluxo de Forma resolve seu próprio dano
    // abaixo (encadeamento opcional + resolução específica da técnica), o
    // rollHit padrão NÃO deve disparar o dano sozinho aqui.
    const hitResult = await rollHit({
      actor,
      actorUuid: actor.uuid,
      autoDamage: false,
      requiredWeaponId: isFlameForm ? plan.state?.synchronizedWeapon?.id : "",
    });
    if (!hitResult?.attempts?.length) {
      if (rollbackPatch && Object.keys(rollbackPatch).length > 0) {
        await actor.update(rollbackPatch, { naCsbAutomation: true, naBreathRollback: true });
      }
      return;
    }
    if (hitResult.hits < 1) {
      await clearResolvedTechniqueQueue(actor, form.id);
      await postBreathChat({ actor, form, selected: { ...selected, custo: custoFinal }, damageRoll: null });
      return;
    }

    if (isStoneForm && form.id === "pedra_04" && hitResult.criticals > 0) {
      // Recuperação por Crítico: até `recoverPdrOnCritical` PDR (2, hoje) por
      // uso — "efeito de contato não duplicável": mesmo se os dois ataques
      // (ação de Ataque + ação Especial) forem críticos, recupera só uma vez.
      const recovery = Math.max(0, Math.trunc(parseNumber(selected.recoverPdrOnCritical)));
      if (recovery > 0) {
        const currentSpent = parseNumber(actor.system?.props?.pdr_slayer_gasto_valor);
        await actor.update({ "system.props.pdr_slayer_gasto_valor": Math.max(0, currentSpent - recovery) }, { naCsbAutomation: true, naBreathing: true });
      }
    }

    if (isSnowForm && form.id === "neve_02" && plan.state?.pendingTargetEffect) {
      // Inverno Sombrio é uma Forma em Área (raio 5m): todo inimigo marcado
      // como alvo do usuário recebe a mesma penalidade de Nível, não apenas
      // o primeiro alvo selecionado.
      const areaTargets = [...(game.user?.targets ?? [])].map((token) => token.actor).filter(Boolean);
      for (const enemyActor of areaTargets) {
        await enemyActor.setFlag(MODULE_ID, "snowPenalty", plan.state.pendingTargetEffect);
      }
    }
    if (!(isSnowForm && form.id === "neve_02")) {
      // Ponto de decisão pós-Acerto: pergunta se o jogador quer encadear
      // outra Forma antes do dano (nunca trava — "Não"/diálogo fechado
      // segue direto para o dano desta técnica).
      const { confirmChainedForma } = await import("./attack-follow-up.mjs");
      const chained = await confirmChainedForma(actor, { excludeItemUuid: item.uuid });
      if (!chained) await rollConfirmedBreathDamage({ actor, form, hitResult, rollDamage, rollWeaponItem });
    }
    await clearResolvedTechniqueQueue(actor, form.id);
    await postBreathChat({ actor, form, selected: { ...selected, custo: custoFinal }, damageRoll: null });
    return;
  }

  const genericFormula = isWaterForm || isFlameForm ? "" : resolveGenericDamageFormula(selected.dano, props);
  const damageRoll = genericFormula ? await new Roll(genericFormula).evaluate() : null;
  if (damageRoll && game.dice3d?.showForRoll) await game.dice3d.showForRoll(damageRoll, game.user, true);
  await postBreathChat({ actor, form, selected: { ...selected, custo: custoFinal }, damageRoll });
  if (flameHealingRoll) {
    await flameHealingRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Shichi no Kata Yaki Suru</strong> recuperação de PDV` });
  }
}

function primaryActiveGm() {
  return game.users?.filter((user) => user.active && user.isGM).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

export function registerBreathingEngine() {
  const clearCombatFlames = async (combat) => {
    if (!game.user?.isGM || primaryActiveGm()?.id !== game.user.id) return;
    const tasks = [];
    for (const combatant of combat.combatants ?? []) {
      const actor = combatant.actor;
      if (actor?.system?.props?.resp_chamas_estado) tasks.push(actor.update(clearFlameBreathingState(), { naCsbAutomation: true, naBreathing: true }));
      const stonePassive = parseBreathPassiveState(actor?.system?.props?.resp_passivas_estado);
      if (actor?.system?.props?.resp_pedra_estado || stonePassive.stone) tasks.push(actor.update({
        ...(actor?.system?.props?.resp_pedra_estado ? clearStoneBreathingState(actor.system.props.resp_pedra_estado) : {}),
        ...passiveStatePatch(clearStonePassiveState(stonePassive)),
      }, { naCsbAutomation: true, naBreathing: true }));
      if (actor?.system?.props?.resp_nevoa_estado) tasks.push(actor.update(clearMistBreathingState(actor.system.props.resp_nevoa_estado), { naCsbAutomation: true, naBreathing: true }));
      if (actor?.system?.props?.resp_metal_estado) tasks.push(actor.update(clearMetalBreathingState(actor.system.props.resp_metal_estado), { naCsbAutomation: true, naBreathing: true }));
      if (actor?.system?.props?.resp_neve_estado) tasks.push(actor.update(clearSnowBreathingState(actor.system.props.resp_neve_estado), { naCsbAutomation: true, naBreathing: true }));
      if (actor?.getFlag?.(MODULE_ID, "flameHeat")) tasks.push(actor.unsetFlag(MODULE_ID, "flameHeat"));
      if (actor?.getFlag?.(MODULE_ID, "flameBlockPenalty")) tasks.push(actor.unsetFlag(MODULE_ID, "flameBlockPenalty"));
    }
    await Promise.allSettled(tasks);
  };
  Hooks.on("updateCombat", (combat, changes) => {
    if (!game.user?.isGM || primaryActiveGm()?.id !== game.user.id || !Object.hasOwn(changes, "turn")) return;
    const actor = combat?.combatant?.actor;
    if (!actor?.system?.props) return;
    const flameBlock = actor.getFlag?.(MODULE_ID, "flameBlockPenalty");
    if (Number(flameBlock?.turns) > 0) {
      const turns = Number(flameBlock.turns) - 1;
      if (turns > 0) void actor.setFlag(MODULE_ID, "flameBlockPenalty", { ...flameBlock, turns });
      else void actor.unsetFlag(MODULE_ID, "flameBlockPenalty");
    }
    const snowPenalty = actor.getFlag?.(MODULE_ID, "snowPenalty");
    if (Number(snowPenalty?.turns) > 0) {
      const turns = Number(snowPenalty.turns) - 1;
      if (turns > 0) void actor.setFlag(MODULE_ID, "snowPenalty", { ...snowPenalty, turns });
      else void actor.unsetFlag(MODULE_ID, "snowPenalty");
    }
    const snowMovementPenalty = actor.getFlag?.(MODULE_ID, "snowMovementPenalty");
    if (Number(snowMovementPenalty?.turns) > 0) {
      const turns = Number(snowMovementPenalty.turns) - 1;
      if (turns > 0) void actor.setFlag(MODULE_ID, "snowMovementPenalty", { ...snowMovementPenalty, turns });
      else void actor.unsetFlag(MODULE_ID, "snowMovementPenalty");
    }
    const stonePenalty = actor.getFlag?.(MODULE_ID, "stoneReflectionPenalty");
    if (Number(stonePenalty?.turns) > 0) {
      const turns = Number(stonePenalty.turns) - 1;
      if (turns > 0) void actor.setFlag(MODULE_ID, "stoneReflectionPenalty", { ...stonePenalty, turns });
      else void actor.unsetFlag(MODULE_ID, "stoneReflectionPenalty");
    }
    const mistSuppression = actor.getFlag?.(MODULE_ID, "mistResistanceSuppression");
    if (Number(mistSuppression?.turns) > 0) {
      const turns = Number(mistSuppression.turns) - 1;
      if (turns > 0) void actor.setFlag(MODULE_ID, "mistResistanceSuppression", { ...mistSuppression, turns });
      else void actor.unsetFlag(MODULE_ID, "mistResistanceSuppression");
    }
    if (actor.system.props.resp_agua_estado) void actor.update(tickWaterBreathing(actor.system.props), { naCsbAutomation: true, naBreathing: true });
    if (actor.system.props.resp_pedra_estado) void actor.update(tickStoneBreathing(actor.system.props.resp_pedra_estado).patch, { naCsbAutomation: true, naBreathing: true });
    if (actor.system.props.resp_nevoa_estado) void actor.update(tickMistBreathing(actor.system.props.resp_nevoa_estado), { naCsbAutomation: true, naBreathing: true });
    if (actor.system.props.resp_metal_estado) void actor.update(tickMetalBreathing(actor.system.props.resp_metal_estado).patch, { naCsbAutomation: true, naBreathing: true });
    if (actor.system.props.resp_neve_estado) {
      const tick = snowTickPatchWithExhaustion(actor.system.props.resp_neve_estado, actor.system.props.status_slayer_exaustao);
      void actor.update(tick.patch, { naCsbAutomation: true, naBreathing: true });
    }
    if (actor.system.props.resp_chamas_estado) {
      const tick = tickFlameBreathing(actor.system.props.resp_chamas_estado);
      void (async () => {
        for (const event of tick.events) await applySlayerDamage(actor, event.amount, { isAttack: false, source: event.source });
        await actor.update(tick.patch, { naCsbAutomation: true, naBreathing: true });
      })();
    }
  });
  Hooks.on("combatEnd", clearCombatFlames);
  Hooks.on("deleteCombat", clearCombatFlames);
  Hooks.on("updateActor", (actor) => {
    if (!game.user?.isGM || primaryActiveGm()?.id !== game.user.id || !actor?.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG)) return;
    const props = actor.system?.props ?? {};
    const rawCurrent = props.pdv_slayer_conta_atual ?? props.pdv_slayer_atual_valor_display
      ?? props.pdv_oni_conta_atual ?? props.pdv_oni_atual_valor_display;
    if (rawCurrent === undefined || rawCurrent === null || rawCurrent === "") return;
    const current = parseNumber(rawCurrent);
    if (current <= 0) void actor.unsetFlag(MODULE_ID, FLAME_HEAT_FLAG);
  });
}

export async function applyStackingBreathingStatus(targetActor, key, effect) {
  const kind = actorKind(targetActor);
  if (!kind) return;
  const statusKind = kind === "oni" || kind === "oni_minion" ? "oni" : "slayer";
  const dataKey = `status_${statusKind}_dados`;
  const summaryKey = `status_${statusKind}_resumo`;
  const exhaustionKey = `status_${statusKind}_exaustao`;
  const props = targetActor.system?.props ?? {};
  const state = parseStatusState(props[dataKey]);
  if (!state.active.includes(key)) state.active.push(key);
  state.effects[key] = state.effects[key]
    ? reapplyFiniteStatusEffect(state.effects[key], effect)
    : effect;
  await targetActor.update({
    [`system.props.${dataKey}`]: JSON.stringify(state),
    [`system.props.${summaryKey}`]: formatStatusSummary(state.active, state.exhaustion),
    [`system.props.${exhaustionKey}`]: state.exhaustion,
  }, { naCsbAutomation: true, naBreathing: true });
}
