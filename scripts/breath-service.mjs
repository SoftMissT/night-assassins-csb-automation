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
import { buildFlameBreathingPlan, clearFlameBreathingState, flameStatePatch, parseFlameBreathingState, tickFlameBreathing } from "./flame-breathing-service.mjs";
import { buildStoneBreathingPlan, clearStoneBreathingState, stoneStatePatch, tickStoneBreathing } from "./stone-breathing-service.mjs";
import { buildMistBreathingPlan, clearMistBreathingState, mistStatePatch, parseMistBreathingState, resolveEightLayersResult, tickMistBreathing } from "./mist-breathing-service.mjs";
import { buildMetalBreathingPlan, clearMetalBreathingState, tickMetalBreathing } from "./metal-breathing-service.mjs";
import { buildSnowBreathingPlan, clearSnowBreathingState, grantBlizzardStealth, parseSnowBreathingState, resolveSnowRestrictionEscape, snowEffectiveBreathLevel, snowStatePatch, snowTickPatchWithExhaustion } from "./snow-breathing-service.mjs";
import { applySlayerDamage } from "./status-engine.mjs";
import { formatStatusSummary, parseStatusState } from "./status-service.mjs";
import { actorKind } from "./actor-kind.mjs";
import { isPassiveItem } from "./breath-passives.mjs";

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
    nome: String(props.nome_forma ?? item?.name ?? "Forma"),
    jp: String(props.nome_jp ?? ""),
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
    Object.assign(base.patch, statePatch({ ...state, pendingDamage: { source: formId, formula: selected.damage, uses: 1, area: true, allyDefenseBonus: dex, types: damageTypes }, nextHit: { bonus: hitBonus, source: formId } }, {
      "system.props.resp_bonus_dano_dados": selected.damage, "system.props.resp_bonus_acerto_temp": hitBonus, "system.props.resp_efeito_flag": `Água 6: área; aliados +${dex} Defesa`,
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

async function collectCuratedChoices(actor, form, level, props) {
  const targetActor = [...(game.user?.targets ?? [])][0]?.actor ?? null;
  if (form.id === "pedra_01") {
    if (!targetActor) return { cancelled: true, reason: "Marque o inimigo atingido pelo ataque originário." };
    const originDamage = await askNumber("Serpentino Duplo", "Dano causado pelo ataque originário", { max: 100000 });
    return originDamage === null ? { cancelled: true } : { originDamage, targetUuid: targetActor.uuid };
  }
  if (form.id === "pedra_03") {
    if (!targetActor) return { cancelled: true, reason: "Marque o inimigo alvo da reação." };
    const ranged = await confirmRule("Reflexão da Pedra", "A arma usada é de distância?");
    return { targetUuid: targetActor.uuid, weaponRange: ranged ? "distancia" : "corpo-a-corpo" };
  }
  if (form.id === "pedra_05") return { markReactivation: Boolean(props.marca_ativa && parseNumber(props.marca_ativa) > 0) };
  if (form.id === "nevoa_04") {
    const advantageAttack = await confirmRule("Corte de Advecção", "Este uso parte de uma rolagem de Acerto com Vantagem?");
    if (!advantageAttack) return { advantageAttack: false };
    const suppressResistance = await confirmRule("Corte de Advecção", "Pagar +1 PDR para Anular Resistências do alvo?");
    return { advantageAttack, suppressResistance, suppressAttribute: Math.max(parseNumber(props.dex_display), parseNumber(props.for_display)) };
  }
  if (form.id === "nevoa_05") return { doubleCost: await confirmRule("Mar de Nuvens", "Pagar o dobro do PDR para obter Reflexão da Névoa?") };
  if (form.id === "nevoa_06") {
    const dex = parseNumber(props.dex_display);
    const check = await Roll.create(`1d20 + ${dex}`).evaluate();
    const message = await check.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "<strong>Névoa sob o Luar</strong> — DEX CD 12" });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    if (check.total < 12) return { dexCheckPassed: false, extraAttacks: 0 };
    const available = Math.max(0, Math.min(19, Math.floor(slayerPdrInfo(props).pdrCurrent) - 2));
    const extraAttacks = await askNumber("Névoa sob o Luar", "Máximo de ataques adicionais (+1 PDR cada)", { max: available });
    return extraAttacks === null ? { cancelled: true } : { dexCheckPassed: true, extraAttacks };
  }
  if (form.id === "nevoa_07") {
    if (!targetActor) return { cancelled: true, reason: "Marque o inimigo do teste oposto de SAB." };
    const ownSab = parseNumber(props.sab_display);
    const enemySab = parseNumber(targetActor.system?.props?.sab_display);
    const [own, enemy] = await Promise.all([Roll.create(`2d20kh1 + ${ownSab}`).evaluate(), Roll.create(`1d20 + ${enemySab}`).evaluate()]);
    await Promise.all([own.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "<strong>Neblina</strong> — SAB com Vantagem" }), enemy.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: "<strong>Neblina</strong> — SAB do alvo" })]);
    return { opposedPassed: own.total > enemy.total };
  }
  if (form.id === "nevoa_08") return { allyUuid: targetActor?.uuid ?? "" };
  if (form.id === "metal_06") {
    const magnetismEligible = parseNumber(props.vit_display) >= 6 || parseNumber(props.for_display) >= 6;
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

async function applyBreathingStatus(targetActor, key, effect) {
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
  await applyBreathingStatus(targetActor, "invisivel_inalvejavel", { remainingTurns: 1, sourceName: "Nevasca", tick: "start", stacks: 1 });
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
  const message = await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Congelar</strong> — FOR contra CD ${flag.escapeDc}` });
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

async function rollConfirmedBreathDamage({ actor, form, hitResult, rollDamage, rollWeaponItem }) {
  const successful = hitResult.attempts.filter((attempt) => attempt.hit);
  const weaponItem = hitResult.weapon?.id ? actor.items?.get?.(hitResult.weapon.id) : null;
  const actionId = foundry.utils.randomID();
  if (form.id === "nevoa_02") {
    const mistState = parseMistBreathingState(actor.system?.props?.resp_nevoa_estado);
    const resolved = resolveEightLayersResult(mistState, successful.length);
    await actor.update(mistStatePatch(resolved.state), { naCsbAutomation: true, naBreathing: true });
    if (resolved.mode === "fixed" && resolved.formula) {
      await rollDamage({ actor, nome: `${form.respiracao} — ${form.nome}`, entradas: [{ tipoAcao: "ataque", dado: resolved.formula, fixo: 0, attrs: [], tiposDano: ["cortante"] }], actionId, skipActionConsumption: true, forceAttackDamage: true });
      return;
    }
  }
  for (const attempt of successful) {
    if (weaponItem) {
      await rollWeaponItem({ actor, item: weaponItem, weaponProfileIndex: hitResult.weapon.profileIndex, critical: attempt.critical, actionId, skipActionConsumption: true, forceAttackDamage: true });
    } else {
      await rollDamage({ actor, nome: `${form.respiracao} — ${form.nome}`, entradas: [{ tipoAcao: "ataque", dado: "", fixo: 0, attrs: [], tiposDano: [] }], critical: attempt.critical, actionId, skipActionConsumption: true, forceAttackDamage: true });
    }
  }
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
  const choices = isWaterForm ? await collectWaterChoices(actor, form, selected.level, props) : await collectCuratedChoices(actor, form, selected.level, props);
  if (choices?.cancelled) {
    if (choices.reason) ui.notifications?.warn?.(choices.reason);
    return;
  }
  const plan = isWaterForm
    ? buildWaterBreathingPlan(form.id, selected.level, props, choices)
    : isFlameForm
      ? buildFlameBreathingPlan(form.id, selected.level, props)
      : isStoneForm
        ? buildStoneBreathingPlan(form.id, selected.level, props, choices)
        : isMistForm
          ? buildMistBreathingPlan(form.id, selected.level, props, choices)
          : isMetalForm
            ? buildMetalBreathingPlan(form.id, selected.level, props, choices)
            : isSnowForm
              ? buildSnowBreathingPlan(form.id, selected.level, props, choices)
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
      turns: Math.max(1, Number(plan.state.reflection.blockTurns) || 1),
      sourceActorUuid: actor.uuid,
      sourceState: plan.state,
    });
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

  if (isStoneForm && form.id === "pedra_01") {
    const targetActor = choices.targetUuid ? await fromUuid(choices.targetUuid) : null;
    if (!targetActor) return ui.notifications?.warn?.("Alvo do Serpentino Duplo não encontrado.");
    const vit = parseNumber(targetActor.system?.props?.vit_display);
    const save = await Roll.create(`1d20 + ${vit}`).evaluate();
    const message = await save.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: `<strong>Serpentino Duplo</strong> — VIT CD ${plan.state.serpentine.saveDc}` });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    if (save.total < plan.state.serpentine.saveDc) {
      const { rollDamage } = await import("./damage-service.mjs");
      await rollDamage({
        actor, nome: `${form.respiracao} — ${form.nome}`,
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
    if (form.id === "chamas_06") {
      await rollDamage({
        actor,
        nome: `${form.respiracao} — ${form.nome}`,
        entradas: [{ tipoAcao: "ataque", dado: "", fixo: 0, attrs: [], tiposDano: [] }],
        skipActionConsumption: true,
        forceAttackDamage: true,
      });
      await postBreathChat({ actor, form, selected: { ...selected, custo: custoFinal }, damageRoll: null });
      return;
    }

    const hitResult = await rollHit({ actor, actorUuid: actor.uuid });
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
      const currentSpent = parseNumber(actor.system?.props?.pdr_slayer_gasto_valor);
      await actor.update({ "system.props.pdr_slayer_gasto_valor": Math.max(0, currentSpent - 2) }, { naCsbAutomation: true, naBreathing: true });
    }

    const targetActor = [...(game.user?.targets ?? [])][0]?.actor ?? null;
    if (isStoneForm && form.id === "pedra_02" && targetActor && plan.state?.bleeding) {
      await applyBreathingStatus(targetActor, "sangramento", {
        damageFormula: String(plan.state.bleeding.amount), remainingTurns: plan.state.bleeding.turns,
        sourceName: form.nome, tick: "start", stacks: 1,
      });
    }
    if (isSnowForm && form.id === "neve_02" && targetActor && plan.state?.pendingTargetEffect) {
      await targetActor.setFlag(MODULE_ID, "snowPenalty", plan.state.pendingTargetEffect);
    }
    if (!(isSnowForm && form.id === "neve_02")) {
      await rollConfirmedBreathDamage({ actor, form, hitResult, rollDamage, rollWeaponItem });
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
    await flameHealingRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Cauterizar</strong> — recuperação de PDV` });
  }
}

function primaryActiveGm() {
  return game.users?.filter((user) => user.active && user.isGM).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

export function registerBreathingEngine() {
  const clearCombatFlames = (combat) => {
    if (!game.user?.isGM || primaryActiveGm()?.id !== game.user.id) return;
    for (const combatant of combat.combatants ?? []) {
      const actor = combatant.actor;
      if (actor?.system?.props?.resp_chamas_estado) void actor.update(clearFlameBreathingState(), { naCsbAutomation: true, naBreathing: true });
      if (actor?.system?.props?.resp_pedra_estado) void actor.update(clearStoneBreathingState(actor.system.props.resp_pedra_estado), { naCsbAutomation: true, naBreathing: true });
      if (actor?.system?.props?.resp_nevoa_estado) void actor.update(clearMistBreathingState(actor.system.props.resp_nevoa_estado), { naCsbAutomation: true, naBreathing: true });
      if (actor?.system?.props?.resp_metal_estado) void actor.update(clearMetalBreathingState(actor.system.props.resp_metal_estado), { naCsbAutomation: true, naBreathing: true });
      if (actor?.system?.props?.resp_neve_estado) void actor.update(clearSnowBreathingState(), { naCsbAutomation: true, naBreathing: true });
      if (actor?.getFlag?.(MODULE_ID, "flameHeat")) void actor.unsetFlag(MODULE_ID, "flameHeat");
      if (actor?.getFlag?.(MODULE_ID, "flameBlockPenalty")) void actor.unsetFlag(MODULE_ID, "flameBlockPenalty");
    }
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
}
