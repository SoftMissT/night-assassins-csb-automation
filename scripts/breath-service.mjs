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
 */

import { MODULE_ID, TIPOS_ACAO } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";
import { getDamageStatusEffects } from "./status-effects.mjs";
import { consumeSlayerActions } from "./action-service.mjs";

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

function getFormData(item) {
  const props = item?.system?.props ?? {};
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
    });
  }
  return {
    nome: String(props.nome_forma ?? item?.name ?? "Forma"),
    jp: String(props.nome_jp ?? ""),
    respiracao: String(props.respiracao_nome ?? ""),
    tipo: String(props.tipo_manobra ?? ""),
    nivelReq: parseNumber(props.nivel_req),
    descricao: String(props.descricao ?? ""),
    temRequisito: parseNumber(props.tem_requisito) === 1,
    requisito: String(props.requisito_texto ?? ""),
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

function getBreathLevel(props = {}) {
  const raw = props.nvl_respiracao ?? props.respiracao_nivel ?? props.nivel_respiracao;
  const val = parseNumber(raw);
  return val > 0 ? val : 1;
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
  const levelOptions = form.levels.map(l => {
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

async function openBreathDialog({ form, pdrCurrent, breathLevel }) {
  const html = buildDialogHtml(form, pdrCurrent, breathLevel);
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

  let custoFinal = selected.custo;
  if (statusEffects.pdrSurcharge > 0 && custoFinal > 0) {
    custoFinal += statusEffects.pdrSurcharge;
    ui.notifications?.info?.(`Fadiga Espiritual: +${statusEffects.pdrSurcharge} PDR (custo total: ${custoFinal}).`);
  }

  if (custoFinal > pdrCurrent) {
    ui.notifications?.warn?.(`PDR insuficiente! Disponível: ${pdrCurrent}, necessário: ${custoFinal}.`);
    return;
  }

  const tipoManobra = normalizeManobra(form.tipo);
  const patch = {};
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

  let damageRoll = null;
  if (selected.dano) {
    try {
      const formula = selected.dano.replace(/@([a-z_]+)/gi, (_, key) => {
        const displayKey = `${key.toLowerCase()}_display`;
        return String(parseNumber(props[displayKey]));
      });
      damageRoll = await Roll.create(formula).evaluate();
    } catch (err) {
      ui.notifications?.error?.(`Fórmula de dano inválida: ${selected.dano}`);
    }
  }

  await postBreathChat({ actor, form, selected, damageRoll });
}