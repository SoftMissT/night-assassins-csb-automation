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

const MANOBRA_MAP = {
  "unica": "unica",
  "u00fanica": "unica",
  "ataque": "ataque",
  "especial": "especial",
  "completa": "completa",
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
  const catalog = waterFormById(String(props.forma_id ?? ""));
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
    tipo: String(props.tipo_manobra ?? ""),
    nivelReq: parseNumber(props.nivel_req),
    descricao: String(props.descricao ?? ""),
    temRequisito: parseNumber(props.tem_requisito) === 1,
    requisito: String(props.requisito_texto ?? ""),
    baseTypes,
    levels,
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
  const mode = game.settings?.get?.("core", "rollMode") ?? "publicroll";
  await ChatMessage.create(
    ChatMessage.applyMode
      ? ChatMessage.applyMode(chatData, { publicroll: "public", gmroll: "gm", blindroll: "blind", selfroll: "self" }[mode] ?? "public")
      : chatData
  );
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
  const { pdrCurrent } = slayerPdrInfo(props);
  const breathLevel = getBreathLevel(props);

  if (breathLevel < form.nivelReq) {
    ui.notifications?.warn?.(`Requer Nível de Respiração ${form.nivelReq}. Atual: ${breathLevel}.`);
    return;
  }

  const statusEffects = getDamageStatusEffects(props);
  if (statusEffects.blocked) {
    ui.notifications?.warn?.("Este personagem está incapacitado e não pode usar técnicas.");
    return;
  }

  const dialogResult = await openBreathDialog({ form, pdrCurrent, breathLevel });
  if (!dialogResult) return;

  const selected = form.levels.find(l => l.level === dialogResult.level);
  if (!selected) {
    ui.notifications?.warn?.("Nível selecionado inválido.");
    return;
  }

  const choices = await collectWaterChoices(actor, form, selected.level, props);
  const plan = buildWaterBreathingPlan(form.id, selected.level, props, choices);
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

  const tipoManobra = normalizeManobra(plan.action) ?? plan.action;
  const patch = { ...plan.patch };
  const actionResult = { ok: true };

  if (tipoManobra) {
    const res = await consumeSlayerActions(actor, tipoManobra, { update: false });
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

  if (Object.keys(patch).length > 0) {
    await actor.update(patch, { naCsbAutomation: true, naBreathForm: true });
  }

  await postBreathChat({ actor, form, selected: { ...selected, custo: custoFinal }, damageRoll: null });
}

function primaryActiveGm() {
  return game.users?.filter((user) => user.active && user.isGM).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

export function registerBreathingEngine() {
  Hooks.on("updateCombat", (combat, changes) => {
    if (!game.user?.isGM || primaryActiveGm()?.id !== game.user.id || !Object.hasOwn(changes, "turn")) return;
    const actor = combat?.combatant?.actor;
    if (!actor?.system?.props?.resp_agua_estado) return;
    void actor.update(tickWaterBreathing(actor.system.props), { naCsbAutomation: true, naBreathing: true });
  });
}
