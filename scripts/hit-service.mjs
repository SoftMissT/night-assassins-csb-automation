/**
 * @fileoverview Serviço de rolagem de acerto.
 */

import { parseAttributeValue } from "./parsing.mjs";
import { openHitConfirmationDialog, openHitDialog } from "./dialogs/hit-dialog.mjs";
import { getRollStatusEffects, mergeRollMode } from "./status-effects.mjs";
import { MODULE_ID, TIPOS_ACAO } from "./constants.mjs";
import { consumeSlayerActions, recoverSlayerFolego } from "./action-service.mjs";
import { parseWaterBreathingState } from "./breath-service.mjs";
import { flameWeaponTier } from "./flame-breathing-data.mjs";
import { consumeFlamePending, flameStatePatch, parseFlameBreathingState } from "./flame-breathing-service.mjs";
import { consumeStonePending, parseStoneBreathingState, stoneReflectionPenalty, stoneStatePatch } from "./stone-breathing-service.mjs";
import { consumeMistPending, mistStatePatch, parseMistBreathingState } from "./mist-breathing-service.mjs";
import { metalStatePatch, parseMetalBreathingState, registerMetalBattleHit, resolveMetalMagnetism } from "./metal-breathing-service.mjs";
import { consumeWindPending, parseWindBreathingState, windStatePatch } from "./wind-breathing-service.mjs";
import { WIND_SYNERGY_BREATHINGS } from "./wind-breathing-data.mjs";
import { consumeSnowPending, parseSnowBreathingState, resolveSnowFreezeGain, snowRestrictionFlag, snowStatePatch, spendFreezeForRestriction } from "./snow-breathing-service.mjs";
import { actorWeapons, effectiveWeaponCritical, parseBreathPassiveState, passiveStatePatch, registerConfirmedCritical, registerWeaponUse } from "./breath-passives.mjs";

function naturalD20(roll) {
  return Math.max(0, ...(roll?.dice ?? []).flatMap((die) => (die?.results ?? []).filter((result) => result.active !== false).map((result) => Number(result.result) || 0)));
}

function getDice(mode) {
  if (mode === "advantage") return "2d20kh1";
  if (mode === "disadvantage") return "2d20kl1";
  return "1d20";
}

function getModeLabel(mode) {
  if (mode === "advantage") return "Vantagem";
  if (mode === "disadvantage") return "Desvantagem";
  return "Normal";
}

async function chooseSnowRecovery() {
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Abaixo de Zero" },
    content: "<p>Uma aplicação de Congelar foi bem-sucedida. Escolha a recuperação.</p>",
    buttons: [
      { action: "pdv", label: "Recuperar 2 PDV", default: true, callback: () => "pdv" },
      { action: "pdr", label: "Recuperar 1 PDR", callback: () => "pdr" },
      { action: "none", label: "Não recuperar", callback: () => "" },
    ],
    rejectClose: false,
  });
}

function parseBonus(raw) {
  const s = (raw || "").trim();
  if (!s) return { extra: "", display: "" };
  const clean = s.replace(/^\+/, "");
  return { extra: clean ? `+ ${clean}` : "", display: s };
}

function buildFormula(mode, attrVal, bonusExtra, statusModifier = 0) {
  const dice = getDice(mode);
  let base = attrVal ? `${dice} + ${attrVal}` : dice;
  if (statusModifier) base += statusModifier > 0 ? ` + ${statusModifier}` : ` - ${Math.abs(statusModifier)}`;
  return bonusExtra ? `${base} ${bonusExtra}` : base;
}

async function doRoll({ actor, attrName, attrVal, mode, rollMode, bonusRaw, cdVal, rollCount = 1, actionType = "", statusEffects, weapon = null, metalReroll = false, stopOnMiss = false }) {
  mode = mergeRollMode(mode, statusEffects.mode);
  const { extra, display } = parseBonus(bonusRaw);
  const maximum = Math.min(20, Math.max(1, Math.trunc(Math.max(rollCount || 1, weapon?.attacks || 1))));
  const modeLabel = getModeLabel(mode);
  const bonusLine = display ? ` | Bônus: ${display}` : "";
  const statusLine = statusEffects.reasons.length ? ` | Status: ${statusEffects.reasons.join(", ")}` : "";
  const attempts = [];
  let interrupted = false;
  const actionLabel = TIPOS_ACAO.find((entry) => entry.key === actionType)?.label;
  const criticalThreshold = weapon?.effectiveCritical ?? 20;

  for (let index = 0; index < maximum; index += 1) {
    const secondaryAttack = index > 0 && weapon?.secondaryNoAttribute === true;
    const attemptAttrVal = secondaryAttack ? 0 : attrVal;
    const secondaryPenalty = secondaryAttack ? Number(weapon?.secondaryPenalty) || 0 : 0;
    const secondaryBonus = secondaryPenalty > 0 ? `+ ${secondaryPenalty}` : secondaryPenalty < 0 ? `- ${Math.abs(secondaryPenalty)}` : "";
    const attemptBonus = [extra, secondaryBonus].filter(Boolean).join(" ");
    const formula = buildFormula(mode, attemptAttrVal, attemptBonus, statusEffects.modifier);
    let roll;
    try {
      roll = await Roll.create(formula).evaluate();
    } catch (err) {
      ui.notifications?.error?.(`Erro na fórmula: ${formula}`);
      return;
    }
    let cdLine = "";
    if (cdVal > 0) {
      const passou = roll.total >= cdVal;
      cdLine = ` | CD ${cdVal} → ${passou ? "✅ Sucesso!" : "❌ Falha!"}`;
    }
    const countLine = maximum > 1 ? ` ${index + 1}/${maximum}` : "";
    let message = await roll.toMessage({
      flavor: `${actionLabel ? `${actionLabel} · ` : ""}Acerto${countLine} (${modeLabel}) ${attrName} ${attrVal}${bonusLine}${statusLine}${cdLine}`,
      speaker: ChatMessage.getSpeaker({ actor }),
      rollMode,
    });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    let usedMetalReroll = false;
    if (metalReroll && roll.total < 10) {
      const reroll = await foundry.applications.api.DialogV2.confirm({
        window: { title: "O Dobro ou Nada" },
        content: `<p>O resultado foi <strong>${roll.total}</strong>. Rerolar este Acerto?</p><p>Se a nova rolagem não acertar, você recebe 1 de Exaustão.</p>`,
        yes: { label: "Rerolar" }, no: { label: "Manter resultado" }, rejectClose: false,
      });
      if (reroll) {
        roll = await Roll.create(formula).evaluate();
        message = await roll.toMessage({ flavor: `<strong>O Dobro ou Nada</strong> nova rolagem de Acerto`, speaker: ChatMessage.getSpeaker({ actor }), rollMode });
        await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
        usedMetalReroll = true;
      }
    }
    const decision = await openHitConfirmationDialog({ current: index + 1, maximum, total: roll.total, cdVal });
    if (!decision || decision.stop) {
      interrupted = true;
      break;
    }
    const natural = naturalD20(roll);
    const critical = decision.hit && statusEffects.criticalAllowed !== false && weapon?.criticalDisabled !== true && natural >= criticalThreshold;
    attempts.push({ roll, hit: decision.hit, natural, critical, criticalThreshold, weaponId: weapon?.id ?? "", attackIndex: index, secondary: secondaryAttack });
    if (usedMetalReroll && !decision.hit) {
      const current = Math.max(0, Number(actor.system?.props?.status_slayer_exaustao) || 0);
      await actor.update({ "system.props.status_slayer_exaustao": Math.min(8, current + 1) }, { naCsbAutomation: true, naBreathing: true });
    }
    if (critical) await recoverSlayerFolego(actor, 1);
    if (stopOnMiss && !decision.hit) {
      interrupted = true;
      break;
    }
    if (!decision.continue && index + 1 < maximum) {
      interrupted = true;
      break;
    }
  }

  const hits = attempts.filter(({ hit }) => hit).length;
  const misses = attempts.length - hits;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: "Sequência de Acerto",
    content: `<p><strong>${attempts.length}/${maximum}</strong> tentativa(s) · <strong>${hits}</strong> acerto(s) · <strong>${misses}</strong> erro(s)${interrupted ? " · encerrada" : ""}</p>`,
  });
  return { attempts, hits, misses, interrupted, maximum, criticals: attempts.filter((attempt) => attempt.critical).length };
}

async function resolveActor(options) {
  if (options.actor && typeof options.actor.update === "function") return options.actor;
  if (options.actorUuid) {
    const doc = await fromUuid(options.actorUuid);
    return doc?.actor ?? doc ?? null;
  }
  const controlled = canvas?.tokens?.controlled;
  if (controlled?.length > 0) return controlled[0].actor;
  return game?.user?.character ?? null;
}

/**
 * API pública: rolagem de acerto.
 * @param {object} options
 * @param {Actor} [options.actor]
 * @param {string} [options.actorUuid]
 * @returns {Promise<void>}
 */
export async function rollHit(options) {
  const actor = await resolveActor(options);
  if (!actor) {
    ui.notifications?.warn?.("Nenhum Actor encontrado para acerto.");
    return;
  }

  const props = actor.system?.props ?? {};
  const magnetismSource = [...(game.combat?.combatants ?? [])]
    .map((combatant) => combatant.actor)
    .find((candidate) => {
      if (!candidate || candidate.uuid === actor.uuid) return false;
      const state = parseMetalBreathingState(candidate.system?.props?.resp_metal_estado);
      // Magnetismo: legado (elegibilidade congelada no Forjado) ou passiva
      // permanente recalculada pelas atributos efetivas do candidato.
      const legacyActive = state.battleForged?.magnetismEligible === true && state.battleForged?.magnetismTargetUuid === actor.uuid;
      const permanentActive = resolveMetalMagnetism(candidate.system?.props ?? {}, state).eligible
        && String(state.magnetism?.targetUuid ?? "") === actor.uuid;
      return legacyActive || permanentActive;
    });
  if (magnetismSource) {
    const selectedTargets = new Set([...(game.user?.targets ?? [])].map((token) => token.actor?.uuid).filter(Boolean));
    if (!selectedTargets.has(magnetismSource.uuid)) {
      ui.notifications?.warn?.(`Magnetismo: este ataque deve ter ${magnetismSource.name} como alvo.`);
      return;
    }
  }
  const acertoLabel = props.acerto_label ?? "";

  let attrName = "";
  let attrVal = 0;
  let color = "";

  if (acertoLabel === "acerto_label_dex") {
    if (!Object.prototype.hasOwnProperty.call(props, "dex_display")) return ui.notifications?.error?.("A ficha não possui a key dex_display.");
    attrName = "DEX";
    attrVal = parseAttributeValue(props.dex_display);
    color = "#28D7FF";
  } else if (acertoLabel === "acerto_label_for") {
    if (!Object.prototype.hasOwnProperty.call(props, "for_display")) return ui.notifications?.error?.("A ficha não possui a key for_display.");
    attrName = "FOR";
    attrVal = parseAttributeValue(props.for_display);
    color = "#C1000C";
  } else {
    ui.notifications?.warn?.("Escolha DEX ou FOR no campo 'Como Acerta'.");
    return;
  }

  const statusEffects = getRollStatusEffects(props, { test: "Acerto", attr: attrName, kind: "attack" });
  if (statusEffects.blocked) return ui.notifications?.warn?.("Este personagem está incapacitado e não pode atacar.");
  if (statusEffects.autoFail) return ui.notifications?.warn?.("Paralisia: falha automática neste Acerto.");

  const passiveState = parseBreathPassiveState(props.resp_passivas_estado);
  const strength = parseAttributeValue(props.for_display);
  const weapons = actorWeapons(actor).map((weapon) => ({
    ...weapon,
    effectiveCritical: effectiveWeaponCritical({ base: weapon.critical, state: passiveState, weaponId: weapon.id, strength }),
  }));
  const dialogResult = await openHitDialog({ attrName, attrVal, color, weapons });
  if (!dialogResult) return;

  const breathingState = parseWaterBreathingState(props.resp_agua_estado);
  const breathHit = breathingState.nextHit;
  const flameState = parseFlameBreathingState(props.resp_chamas_estado);
  const flameHit = flameState.nextHit;
  const stoneState = parseStoneBreathingState(props.resp_pedra_estado);
  const stoneHit = stoneState.nextHit;
  const mistState = parseMistBreathingState(props.resp_nevoa_estado);
  const mistHit = mistState.nextHit;
  const metalState = parseMetalBreathingState(props.resp_metal_estado);
  const snowState = parseSnowBreathingState(props.resp_neve_estado);
  const snowHit = snowState.nextHit;
  const windState = parseWindBreathingState(props.resp_vento_estado);
  const windHit = windState.nextHit;
  const snowPenalty = actor.getFlag?.(MODULE_ID, "snowPenalty");
  const stonePenalty = actor.getFlag?.(MODULE_ID, "stoneReflectionPenalty");
  const flameTier = flameWeaponTier(flameState.weaponHeat);
  // 8ª Forma Ofuscamento (Névoa): a partir do Nível 2, quem tenta acertar o usuário/aliado
  // ofuscado sofre -2 na rolagem de Acerto. O estado "dazzle" fica salvo em resp_nevoa_estado
  // do PRÓPRIO usuário da Névoa (com allyUuid apontando o aliado também protegido); então, ao
  // rolar Acerto contra um alvo, é preciso checar se o alvo é o usuário da névoa (dazzle no
  // próprio) ou o aliado protegido (dazzle no usuário, allyUuid === alvo). Segue o mesmo padrão
  // usado para snowPenalty/stoneReflectionPenalty (penalidade lida do alvo e aplicada ao atacante).
  const targetedActors = [...(game.user?.targets ?? [])].map((token) => token.actor).filter(Boolean);
  const combatantActors = [...(game.combat?.combatants ?? [])].map((combatant) => combatant.actor).filter(Boolean);
  const dazzlePenalty = targetedActors.reduce((total, targetActor) => {
    if (targetActor.uuid === actor.uuid) return total;
    const targetMist = parseMistBreathingState(targetActor.system?.props?.resp_nevoa_estado);
    if (targetMist.dazzle?.hitPenalty) return total + (Number(targetMist.dazzle.hitPenalty) || 0);
    const protector = combatantActors.find((candidate) => {
      if (!candidate || candidate.uuid === targetActor.uuid) return false;
      const candidateMist = parseMistBreathingState(candidate.system?.props?.resp_nevoa_estado);
      return candidateMist.dazzle?.hitPenalty && candidateMist.dazzle.allyUuid === targetActor.uuid;
    });
    if (protector) {
      const protectorMist = parseMistBreathingState(protector.system?.props?.resp_nevoa_estado);
      return total + (Number(protectorMist.dazzle.hitPenalty) || 0);
    }
    return total;
  }, 0);
  const breathBonus = (Number(breathHit?.bonus) || 0) + (Number(flameHit?.bonus) || 0)
    + (Number(stoneHit?.bonus) || 0) + (Number(mistHit?.bonus) || 0)
    + (Number(snowHit?.bonus) || 0) + (Number(snowState.belowZero?.fdvHitBonus) || 0)
    + (Number(windHit?.bonus) || 0)
    + (Number(snowState.iceHeart?.hitBonus) || 0) + (Number(mistState.fog?.bonus) || 0) + (Number(mistState.dazzle?.hitBonus) || 0)
    + (Number(snowPenalty?.hitPenalty) || 0) + (Number(stonePenalty?.value) || 0) + flameTier.hit + dazzlePenalty;
  if (stonePenalty?.sourceState) {
    const canonical = stoneReflectionPenalty(stonePenalty.sourceState);
    if (canonical !== Number(stonePenalty.value)) ui.notifications?.warn?.("Penalidade da Reflexão da Pedra foi normalizada.");
  }
  const bonusRaw = [dialogResult.bonusRaw, breathBonus ? String(breathBonus) : ""].filter(Boolean).join(" + ");
  const requestedMode = breathHit?.advantage || flameHit?.advantage || mistHit?.advantage
    ? mergeRollMode(dialogResult.mode, "advantage") : dialogResult.mode;
  const weapon = weapons.find((entry) => entry.id === dialogResult.weaponId && entry.profileIndex === Number(dialogResult.weaponProfileIndex ?? 0))
    ?? weapons.find((entry) => entry.id === dialogResult.weaponId)
    ?? null;
  const allowedWeaponAttributes = Array.isArray(weapon?.attackAttributes) ? weapon.attackAttributes : [];
  const requestedWeaponAttribute = String(dialogResult.weaponAttribute ?? "").toUpperCase();
  const selectedWeaponAttribute = weapon && allowedWeaponAttributes.length > 0
    ? (allowedWeaponAttributes.includes(requestedWeaponAttribute) ? requestedWeaponAttribute : allowedWeaponAttributes.includes(attrName) ? attrName : allowedWeaponAttributes[0])
    : attrName;
  if (selectedWeaponAttribute !== attrName) {
    attrName = selectedWeaponAttribute;
    attrVal = parseAttributeValue(props[`${attrName.toLowerCase()}_display`]);
  }
  const finalStatusEffects = getRollStatusEffects(props, { test: "Acerto", attr: attrName, kind: "attack" });
  if (finalStatusEffects.blocked) return ui.notifications?.warn?.("Este personagem está incapacitado e não pode atacar.");
  if (finalStatusEffects.autoFail) return ui.notifications?.warn?.("Paralisia: falha automática neste Acerto.");

  const result = await doRoll({
    actor,
    attrName,
    attrVal,
    mode: requestedMode,
    rollMode: dialogResult.rollMode,
    bonusRaw,
    cdVal: dialogResult.cdVal,
    rollCount: Math.max(dialogResult.rollCount, Number(dialogResult.weaponProfileIndex) >= 0 ? Number(weapon?.attacks) || 1 : 1, Number(breathHit?.count) || 1, Number(flameHit?.count) || 1, Number(stoneHit?.count) || 1, Number(mistHit?.count) || 1, Number(snowHit?.count) || 1, Number(windHit?.count) || 1),
    actionType: dialogResult.actionType,
    statusEffects: finalStatusEffects,
    weapon,
    metalReroll: metalState.chainReaction?.turns > 0,
    stopOnMiss: mistHit?.stopOnMiss === true,
  });
  const confirmedCritical = result?.attempts?.find((attempt) => attempt.critical);
  const knowsMetal = [...(actor.items ?? [])].some((item) => item.system?.props?.respiracao_nome === "Metal");
  if (result?.attempts?.length && weapon) {
    let nextPassiveState = registerWeaponUse(passiveState, weapon);
    if (confirmedCritical && knowsMetal) nextPassiveState = registerConfirmedCritical(nextPassiveState, {
      weaponId: weapon?.id ?? "",
      weaponName: weapon?.name ?? "Sem arma",
      natural: confirmedCritical.natural,
      threshold: confirmedCritical.criticalThreshold,
    });
    await actor.update(passiveStatePatch(nextPassiveState), { naCsbAutomation: true, naBreathing: true });
    if (confirmedCritical && knowsMetal) ui.notifications?.info?.("Martelo do Julgamento disponível: ataque adicional liberado pelo crítico.");
  }
  if (result?.attempts?.length && windHit) {
    await actor.update(windStatePatch(consumeWindPending(windState, { hit: true })), { naCsbAutomation: true, naBreathing: true });
  }
  // 3º Estilo (Reação) — Sinergia de crítico: cura 1 PDV por aliado compatível
  // presente no campo (Insetos/Névoa/Grama/Areia, por respiracao_nome).
  if (confirmedCritical && windState.pendingDamage?.criticalSynergy) {
    const allies = [...(game.combat?.combatants ?? [])]
      .map((combatant) => combatant.actor)
      .filter((candidate) => candidate && candidate.uuid !== actor.uuid
        && [...(candidate.items ?? [])].some((item) => WIND_SYNERGY_BREATHINGS.includes(item.system?.props?.respiracao_nome)));
    if (allies.length > 0) {
      const healed = Math.min(parseNumber(props.pdv_slayer_maximo_num), parseNumber(props.pdv_slayer_curado) + allies.length);
      await actor.update({ "system.props.pdv_slayer_curado": healed }, { naCsbAutomation: true, naBreathing: true });
      ui.notifications?.info?.(`Árvore Balançando: crítico com ${allies.length} aliado(s) compatível(is) — +${allies.length} PDV.`);
    }
  }
  if (result?.attempts?.length && breathHit) {
    delete breathingState.nextHit;
    await actor.update({
      "system.props.resp_agua_estado": JSON.stringify(breathingState),
      "system.props.resp_bonus_acerto_temp": 0,
    }, { naCsbAutomation: true, naBreathing: true });
  }
  if (result?.attempts?.length && flameHit) {
    await actor.update(flameStatePatch(consumeFlamePending(flameState, { hit: true })), { naCsbAutomation: true, naBreathing: true });
  }
  if (result?.attempts?.length && stoneHit) {
    await actor.update(stoneStatePatch(consumeStonePending(stoneState, { hit: true })), { naCsbAutomation: true, naBreathing: true });
  }
  if (result?.attempts?.length && stonePenalty) {
    // Reflexão da Pedra: "diminui... a próxima rolagem de acerto do inimigo"
    // é uso único — consome a penalidade assim que ela é aplicada a UMA
    // rolagem de Acerto, independente de quantos turnos restavam na
    // expiração de segurança.
    await actor.unsetFlag?.(MODULE_ID, "stoneReflectionPenalty");
  }
  if (result?.attempts?.length && mistHit) {
    await actor.update(mistStatePatch(consumeMistPending(mistState, { hit: true })), { naCsbAutomation: true, naBreathing: true });
  }
  if (result?.attempts?.length && snowHit) {
    let nextSnow = consumeSnowPending(snowState, { hit: true });
    // Inverno Sombrio (neve_02) é uma Forma em Área: todo inimigo marcado como
    // alvo participa da mesma rolagem de Acerto. As demais Formas da Neve com
    // Congelar (Fluxo/Avalanche) seguem alvo único — usa apenas o primeiro.
    const isAreaForm = snowHit.source === "neve_02";
    const allTargets = [...(game.user?.targets ?? [])].map((token) => token.actor).filter(Boolean);
    const affectedTargets = isAreaForm ? allTargets : allTargets.slice(0, 1);
    const patch = {};
    let recoveryChoice = "";
    let recoveryPrompted = false;
    for (const target of affectedTargets) {
      const freeze = result.hits > 0
        ? (Number(snowState.pendingDamage?.freezeOnHit) || 0) + (result.criticals > 0 ? Number(snowHit.criticalFreeze) || 0 : 0)
        : 0;
      if (target?.uuid && freeze > 0 && snowState.belowZero?.freezeRecovery && !recoveryPrompted) {
        recoveryChoice = await chooseSnowRecovery();
        recoveryPrompted = true;
      }
      const gain = target?.uuid && freeze > 0
        ? resolveSnowFreezeGain(nextSnow, target.uuid, freeze, { recoveryChoice })
        : { state: nextSnow, reachedFive: false, burstFormula: "", recovery: null };
      nextSnow = gain.state;
      if (gain.recovery?.pdv) {
        const base = Number(patch["system.props.pdv_slayer_curado"] ?? actor.system?.props?.pdv_slayer_curado) || 0;
        patch["system.props.pdv_slayer_curado"] = base + gain.recovery.pdv;
      }
      if (gain.recovery?.pdr) {
        const base = Number(patch["system.props.pdr_slayer_gasto_valor"] ?? actor.system?.props?.pdr_slayer_gasto_valor) || 0;
        patch["system.props.pdr_slayer_gasto_valor"] = Math.max(0, base - gain.recovery.pdr);
      }

      if (gain.reachedFive && target) {
        const restrain = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Congelar Restrição de Movimentos" },
          content: `<p>${target.name} atingiu 5 acúmulos. Gastar uma Ação Única para restringir seus movimentos?</p>`,
          rejectClose: false,
        });
        if (restrain) {
          const action = await consumeSlayerActions(actor, ["unica"], { update: false });
          if (action.ok) {
            const restriction = spendFreezeForRestriction(nextSnow, target.uuid, Number(actor.system?.props?.car_display) || 0);
            nextSnow = restriction.state;
            Object.assign(patch, action.patch);
            await target.setFlag(MODULE_ID, "snowRestriction", snowRestrictionFlag(restriction.restriction, actor.uuid));
          } else ui.notifications?.warn?.(action.reason);
        }
      }
      if (gain.burstFormula && target) {
        const { rollDamage } = await import("./damage-service.mjs");
        await rollDamage({
          actor,
          nome: "Abaixo de Zero Explosão de Gelo",
          entradas: [{ tipoAcao: "especial", dado: gain.burstFormula, fixo: 0, attrs: [], tiposDano: ["concussao"] }],
          skipActionConsumption: true,
          forceAttackDamage: true,
        });
      }
    }
    Object.assign(patch, snowStatePatch(nextSnow));
    await actor.update(patch, { naCsbAutomation: true, naBreathing: true });
  }
  // Status de Metal (decisão do Operador): conta evento mecânico de acerto
  // confirmado QUE USE A NICHIRIN/ARMA VÁLIDA. Dano automático, status,
  // técnicas sem arma e efeitos ambientais não passam pelo contador.
  if (result?.hits > 0 && weapon && metalState.battleForged?.turns > 0) {
    let nextMetal = metalState;
    for (let index = 0; index < result.hits; index += 1) nextMetal = registerMetalBattleHit(nextMetal).state;
    await actor.update(metalStatePatch(nextMetal), { naCsbAutomation: true, naBreathing: true });
  }
  return result ? { ...result, weapon } : result;
}
