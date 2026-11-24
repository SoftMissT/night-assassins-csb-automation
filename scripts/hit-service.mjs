/**
 * @fileoverview Serviço de rolagem de acerto.
 */

import { parseNumber } from './parsing.mjs';
import { masterBattleBenefits, masterBattleCounterattackHits, masterBattlePressureAttack, masterBattlePressureHit } from './slayer/master-battle-rules.mjs';
import { MASTER_BATTLE_COUNTERATTACK, offerMasterBattleCounterattack } from './slayer/master-battle-counterattack.mjs';
import {
    companionGuardKey, consumeCompanionCoordination, consumeCompanionGuard,
    pendingCompanionCoordination, registerCoordinatedHit,
} from './slayer/companion-oni-service.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { combatPassiveBonuses, passiveExecutionId, recordBreathingPassiveEvent } from './breathing-combat-passives.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import { isHomebrewExtra, ruleVariant } from './rules-profile.mjs';
import { oniSpecializationAbility, TITAN } from './oni/specialization-rules.mjs';
import { breathingResourceKeys } from './actor-resources.mjs';
import { openHitConfirmationDialog, openHitDialog } from './dialogs/hit-dialog.mjs';
import { getRollStatusEffects, mergeRollMode } from './status-effects.mjs';
import { consumeKakushiAdvantage, kakushiRollEffect } from './slayer/kakushi-service.mjs';
import { ATTR_COLORS, MODULE_ID, TIPOS_ACAO } from './constants.mjs';
import { resolveMessageMode } from './damage-formula.mjs';
import { consumeOniActions, consumeSlayerActions, recoverSlayerFolego } from './action-service.mjs';
import { actorKind } from './actor-kind.mjs';
import { applyBreathingStatus, parseWaterBreathingState } from './breath-service.mjs';
import { flameWeaponTier } from './flame-breathing-data.mjs';
import {
    consumeFlamePending,
    flameTurnKey,
    flameStatePatch,
    flameWeaponHeat,
    flamingUniverseForAttack,
    parseFlameBreathingState,
    synchronizeFlameWeapon,
} from './flame-breathing-service.mjs';
import {
    consumeMistPending,
    mistStatePatch,
    parseMistBreathingState,
} from './mist-breathing-service.mjs';
import {
    metalStatePatch,
    parseMetalBreathingState,
    registerMetalBattleHit,
    resolveMetalMagnetism,
} from './metal-breathing-service.mjs';
import {
    consumeWindPending,
    windStatePatch,
    windStateWithManualScars,
} from './wind-breathing-service.mjs';
import { WIND_SYNERGY_BREATHINGS } from './wind-breathing-data.mjs';
import { classLevel, classRankAtLevel, selectedSlayerClassKey } from './slayer/class-contracts.mjs';
import { markCriticalMargin, markExtraAttack } from './slayer/hunter-mark.mjs';
import {
    consumeSnowPending,
    breakSnowRestrictionOnDamage,
    parseSnowBreathingState,
    resolveSnowFreezeGain,
    snowRestrictionFlag,
    snowStatePatch,
    spendFreezeForRestriction,
} from './snow-breathing-service.mjs';
import {
    consumeCombatManeuverPending,
    resolveCombatManeuverBonuses,
} from './combat-maneuver-service.mjs';

async function waitForHitRoll3d(message) {
    const wait = globalThis.game?.dice3d?.waitFor3DAnimationByMessageID;
    if (!message?.id || typeof wait !== 'function') return false;
    await wait.call(game.dice3d, message.id);
    return true;
}
import {
    actorWeapons,
    effectiveWeaponCritical,
    parseBreathPassiveState,
    passiveStatePatch,
    registerConfirmedCritical,
    registerWeaponUse,
} from './breath-passives.mjs';
import { SETTINGS } from './settings.mjs';
import { resolveSlayerDerivedBonuses } from './derived-bonus-service.mjs';
import { actorBuffSources } from './breathing-buffs.mjs';

import { resolveActorLoose } from './actor-resolution.mjs';
function naturalD20(roll) {
    return Math.max(
        0,
        ...(roll?.dice ?? []).flatMap((die) =>
            (die?.results ?? [])
                .filter((result) => result.active !== false)
                .map((result) => Number(result.result) || 0)
        )
    );
}

function getDice(mode) {
    if (mode === 'advantage') return '2d20kh1';
    if (mode === 'disadvantage') return '2d20kl1';
    return '1d20';
}

function getModeLabel(mode) {
    if (mode === 'advantage') return 'Vantagem';
    if (mode === 'disadvantage') return 'Desvantagem';
    return 'Normal';
}

async function chooseSnowRecovery() {
    return foundry.applications.api.DialogV2.wait({
        window: { title: 'Roku no Kata: Zero Ika' },
        content: '<p>Uma aplicação de Congelar foi bem-sucedida. Escolha a recuperação.</p>',
        buttons: [
            { action: 'pdv', label: 'Recuperar 2 PDV', default: true, callback: () => 'pdv' },
            { action: 'pdr', label: 'Recuperar 1 PDR', callback: () => 'pdr' },
            { action: 'none', label: 'Não recuperar', callback: () => '' },
        ],
        rejectClose: false,
    });
}

function parseBonus(raw) {
    const s = (raw || '').trim();
    if (!s) return { extra: '', display: '' };
    const clean = s.replace(/^\+/, '');
    return { extra: clean ? `+ ${clean}` : '', display: s };
}

function buildFormula(mode, attrVal, bonusExtra, statusModifier = 0) {
    const dice = getDice(mode);
    let base = attrVal ? `${dice} + ${attrVal}` : dice;
    if (statusModifier)
        base += statusModifier > 0 ? ` + ${statusModifier}` : ` - ${Math.abs(statusModifier)}`;
    return bonusExtra ? `${base} ${bonusExtra}` : base;
}

// Mantém o bônus informado no diálogo como parcela de cada tentativa da
// sequência. O valor não deve ser consumido pela primeira rolagem.
export function attemptBonusFormula({ situational = '', secondary = '', chain = '' } = {}) {
    return [situational, secondary, chain].filter(Boolean).join(' ');
}

async function chooseNitoryuFollowUpAction(actor, consumeActions) {
    const buttons = [];
    for (const action of ['especial', 'unica']) {
        const availability = await consumeActions(actor, action, { update: false });
        if (availability.ok) buttons.push({
            action, label: TIPOS_ACAO.find(entry => entry.key === action).label,
            callback: () => action,
        });
    }
    if (buttons.length === 0) {
        ui.notifications?.warn?.('Nitoryu: Ação Especial e Ação Única indisponíveis.');
        return null;
    }
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Segundo golpe · Nitoryu' },
        content: '<p>Escolha a ação para rolar o segundo golpe. O Acerto é rolado sem FOR ou DEX.</p>',
        modal: true,
        rejectClose: false,
        buttons: [...buttons, { action: 'cancel', label: 'Encerrar', callback: () => null }],
    });
    return buttons.some(button => button.action === choice) ? choice : null;
}

async function doRoll({
    actor,
    attrName,
    attrVal,
    mode,
    rollMode,
    bonusRaw,
    cdVal,
    rollCount = 1,
    actionType = '',
    statusEffects,
    weapon = null,
    metalReroll = false,
    stopOnMiss = false,
    markMargin = null,
    oniMargin = null,
    firstAttemptBonus = 0,
    firstAttemptAdvantage = false,
    disableExtraAttacks = false,
    forcedRollCount,
    passiveEvent = null,
    counterattack = null,
    cancelAdvantage = false,
    nitoryuActions = null,
    attackSequence = null,
}) {
    if (cancelAdvantage && mode === 'advantage') mode = 'normal';
    if (cancelAdvantage && statusEffects.mode === 'advantage') statusEffects = { ...statusEffects, mode: 'normal' };
    mode = mergeRollMode(mode, statusEffects.mode);
    const { extra, display } = parseBonus(bonusRaw);
    let maximum = forcedRollCount ?? Math.min(
        20,
        Math.max(1, Math.trunc(Math.max(rollCount || 1, weapon?.attacks || 1)))
    );
    const modeLabel = getModeLabel(mode);
    const bonusLine = display ? ` | Bônus: ${display}` : '';
    const statusLine = statusEffects.reasons.length
        ? ` | Status: ${statusEffects.reasons.join(', ')}`
        : '';
    const attempts = [];
    let misses = 0;
    let interrupted = false;
    // Crítico Marcado (Marca do Caçador ativa, alvo Oni): a menor margem entre a da arma e a da Marca.
    const criticalThreshold = Math.min(weapon?.effectiveCritical ?? 20, markMargin ?? 20, oniMargin ?? 20);
    let criticalChainBonus = 0;
    const battle = actorKind(actor) === 'slayer' && (actor.isOwner || game.user?.isGM)
        ? masterBattleBenefits(actor.system?.props) : null;
    const turnKey = battle?.pressure && game.combat?.combatant?.actor?.uuid === actor.uuid
        ? flameTurnKey(game.combat) : null;
    const pressureAttack = {
        turnKey,
        targetUuid: passiveEvent?.targetCount === 1 ? passiveEvent.targetUuid : '',
        isBasic: actionType === 'ataque' && !passiveEvent?.noPassiveGeneration,
        isTechnique: passiveEvent?.isTechnique === true,
        isProficient: weapon?.proficient === true,
    };
    let pressureState = turnKey ? actor.getFlag?.(MODULE_ID, 'masterBattlePressure') : null;
    const nitoryuTurn = nitoryuActions && flameTurnKey(game.combat);
    const sequenceTurn = attackSequence && flameTurnKey(game.combat);

    for (let index = 0; attackSequence ? misses < attackSequence.missLimit : index < maximum; index += 1) {
        if (attackSequence && flameTurnKey(game.combat) !== sequenceTurn) {
            interrupted = true;
            break;
        }
        let chosenNitoryuAction;
        if (nitoryuActions && index === 1) {
            if (flameTurnKey(game.combat) === nitoryuTurn)
                chosenNitoryuAction = await chooseNitoryuFollowUpAction(actor, nitoryuActions);
            if (flameTurnKey(game.combat) !== nitoryuTurn) {
                ui.notifications?.warn?.('Nitoryu: o turno do primeiro golpe terminou.');
                interrupted = true;
                break;
            }
            if (!chosenNitoryuAction) {
                interrupted = true;
                continue;
            }
        }
        const attemptAction = chosenNitoryuAction ?? actionType;
        const actionLabel = TIPOS_ACAO.find(entry => entry.key === attemptAction)?.label;
        const pressure = masterBattlePressureAttack(battle, pressureState, pressureAttack);
        const secondaryAttack = !attackSequence && (weapon?.paidSecondaryAttack === true
            ? Boolean(chosenNitoryuAction) : index > 0 && weapon?.secondaryNoAttribute === true);
        const attemptAttrVal = secondaryAttack ? 0 : attrVal;
        const secondaryPenalty = secondaryAttack ? Number(weapon?.secondaryPenalty) || 0 : 0;
        const secondaryBonus =
            secondaryPenalty > 0
                ? `+ ${secondaryPenalty}`
                : secondaryPenalty < 0
                  ? `- ${Math.abs(secondaryPenalty)}`
                  : '';
        const chainBonus = index > 0 && criticalChainBonus > 0 ? `+ ${criticalChainBonus}` : '';
        const attemptBonus = attemptBonusFormula({
            situational: `${extra}${index === 0 && firstAttemptBonus ? ` + ${firstAttemptBonus}` : ''}`,
            secondary: secondaryBonus,
            chain: [chainBonus, pressure.bonus ? '+ 1' : ''].filter(Boolean).join(' '),
        });
        const kakushiAdvantage = index === 0 && kakushiRollEffect(actor).advantage;
        const attemptMode = index === 0 && (firstAttemptAdvantage || kakushiAdvantage)
            ? mergeRollMode(mode, 'advantage') : mode;
        const formula = buildFormula(attemptMode, attemptAttrVal, attemptBonus, statusEffects.modifier);
        let roll;
        try {
            roll = await Roll.create(formula).evaluate();
        } catch (err) {
            ui.notifications?.error?.(`Erro na fórmula: ${formula}`);
            if (chosenNitoryuAction) {
                interrupted = true;
                continue;
            }
            if (attackSequence && index > 0) {
                interrupted = true;
                break;
            }
            return;
        }
        if (attackSequence && index === 0 && !await attackSequence.beforeFirstRoll()) return;
        if (chosenNitoryuAction) {
            if (flameTurnKey(game.combat) !== nitoryuTurn) {
                ui.notifications?.warn?.('Nitoryu: o turno do primeiro golpe terminou.');
                interrupted = true;
                break;
            }
            const spent = await nitoryuActions(actor, chosenNitoryuAction);
            if (!spent.ok) {
                ui.notifications?.warn?.(spent.reason);
                interrupted = true;
                continue;
            }
        }
        if (kakushiAdvantage) await consumeKakushiAdvantage(actor);
        let cdLine = '';
        if (cdVal > 0) {
            const passou = roll.total >= cdVal;
            cdLine = ` | CD ${cdVal} → ${passou ? '✅ Sucesso!' : '❌ Falha!'}`;
        }
        const countLine = attackSequence ? ` · Golpe ${index + 1}` : maximum > 1 ? ` ${index + 1}/${maximum}` : '';
        let message = await roll.toMessage({
            flavor: `${actionLabel ? `${actionLabel} · ` : ''}Acerto${countLine} (${modeLabel}) ${secondaryAttack ? 'sem atributo' : `${attrName} ${attrVal}`}${bonusLine}${statusLine}${cdLine}${pressure.bonus ? ' | Pressão de Combate +1' : ''}`,
            speaker: ChatMessage.getSpeaker({ actor }),
        }, { messageMode: resolveMessageMode(rollMode) });
        await waitForHitRoll3d(message);
        if (passiveEvent) await recordBreathingPassiveEvent(actor, { ...passiveEvent, actionType: attemptAction, type: 'attackRoll', eventId: `${passiveEvent.executionId}:${index}:roll` });
        let usedMetalReroll = false;
        if (metalReroll && roll.total < 10) {
            const reroll = await foundry.applications.api.DialogV2.confirm({
                window: { title: 'O Dobro ou Nada' },
                content: `<p>O resultado foi <strong>${roll.total}</strong>. Rerolar este Acerto?</p><p>Se a nova rolagem não acertar, você recebe 1 de Exaustão.</p>`,
                yes: { label: 'Rerolar' },
                no: { label: 'Manter resultado' },
                rejectClose: false,
            });
            if (reroll) {
                roll = await Roll.create(formula).evaluate();
                message = await roll.toMessage({
                    flavor: `<strong>O Dobro ou Nada</strong> nova rolagem de Acerto`,
                    speaker: ChatMessage.getSpeaker({ actor }),
                }, { messageMode: resolveMessageMode(rollMode) });
                await waitForHitRoll3d(message);
                usedMetalReroll = true;
            }
        }
        const natural = naturalD20(roll);
        const inCriticalRange =
            statusEffects.criticalAllowed !== false &&
            weapon?.criticalDisabled !== true &&
            natural >= criticalThreshold;
        // Golpe extra da Manopla vale também dentro de Forma de sequência (regra do operador, 2026-11-23):
        // ele conta para os erros e não troca o dano da Forma (o dano é o pool, em breathing-pipeline).
        const extendsOnCriticalHit =
            inCriticalRange && !disableExtraAttacks && weapon?.criticalChain?.ativa === true && maximum < 20;
        const decision = counterattack ? { hit: masterBattleCounterattackHits(counterattack, { total: roll.total, natural }) } : await openHitConfirmationDialog({
            current: index + 1,
            maximum,
            missLimit: attackSequence?.missLimit,
            misses,
            total: roll.total,
            cdVal,
            natural,
            criticalThreshold,
            critical: inCriticalRange,
            extendsOnCriticalHit,
            weaponName: weapon?.name ?? '',
            profileName: weapon?.profileName ?? '',
        });
        if (!decision || decision.stop) {
            interrupted = true;
            break;
        }
        const critical = decision.hit && inCriticalRange;
        if (turnKey && flameTurnKey(game.combat) === turnKey) {
            const next = decision.hit
                ? masterBattlePressureHit(battle, pressure.state, pressureAttack)
                : pressure.state;
            if (next && (next.turnKey !== pressureState?.turnKey || next.targetUuid !== pressureState?.targetUuid))
                await actor.setFlag?.(MODULE_ID, 'masterBattlePressure', next);
            pressureState = next;
        }
        if (passiveEvent) await recordBreathingPassiveEvent(actor, { ...passiveEvent, actionType: attemptAction,
            type: decision.hit ? 'hit' : 'miss', success: decision.hit, critical,
            eventId: `${passiveEvent.executionId}:${index}`, incoming: false });
        if (!decision.hit && passiveEvent) for (const target of passiveEvent.targetActors ?? [])
            await recordBreathingPassiveEvent(target, { type: 'miss', incoming: true, targetUuid: actor.uuid,
                sourceActorUuid: actor.uuid, eventId: `${passiveEvent.executionId}:${index}:incoming` });
        attempts.push({
            roll,
            hit: decision.hit,
            natural,
            critical,
            criticalThreshold,
            weaponId: weapon?.id ?? '',
            attackIndex: weapon?.paidSecondaryAttack && !nitoryuActions && index > 0 ? index + 1 : index,
            ...(chosenNitoryuAction ? { actionType: chosenNitoryuAction } : {}),
            secondary: secondaryAttack,
        });
        if (critical && extendsOnCriticalHit) {
            criticalChainBonus += Math.max(
                1,
                Math.trunc(Number(weapon.criticalChain.bonus_acerto) || 1)
            );
            maximum += 1;
        }
        if (usedMetalReroll && !decision.hit) {
            const current = Math.max(0, Number(actor.system?.props?.status_slayer_exaustao) || 0);
            await actor.update(
                { 'system.props.status_slayer_exaustao': Math.min(8, current + 1) },
                { naCsbAutomation: true, naBreathing: true }
            );
        }
        if (critical) await recoverSlayerFolego(actor, 1);
        if (!decision.hit) misses += 1;
        if (attackSequence) {
            if (decision.hit) await attackSequence.onHit({
                attempt: attempts.at(-1),
                executionId: `${passiveEvent.executionId}:${index}`,
            });
            if (misses === attackSequence.missLimit) break;
            if (!decision.continue) {
                interrupted = true;
                break;
            }
            continue;
        }
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
    const attemptSummary = attackSequence ? attempts.length : `${attempts.length}/${maximum}`;
    const missSummary = attackSequence ? `${misses}/${attackSequence.missLimit}` : misses;
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: 'Sequência de Acerto',
        content: `<p><strong>${attemptSummary}</strong> tentativa(s) · <strong>${hits}</strong> acerto(s) · <strong>${missSummary}</strong> erro(s)${interrupted ? ' · encerrada' : ''}</p>`,
    });
    return {
        attempts,
        hits,
        misses,
        interrupted,
        maximum,
        criticals: attempts.filter((attempt) => attempt.critical).length,
    };
}

/**
 * API pública: rolagem de acerto.
 * @param {object} options
 * @param {Actor} [options.actor]
 * @param {string} [options.actorUuid]
 * @returns {Promise<void>}
 */
export async function rollHit(options) {
    const actor = await resolveActorLoose(options);
    if (!actor) {
        ui.notifications?.warn?.('Nenhum Actor encontrado para acerto.');
        return;
    }

    const props = actor.system?.props ?? {};
    const selectedTargets = options.targets ?? game.user?.targets ?? new Set();
    const magnetismSource = [...(game.combat?.combatants ?? [])]
        .map((combatant) => combatant.actor)
        .find((candidate) => {
            if (!candidate || candidate.uuid === actor.uuid) return false;
            const state = parseMetalBreathingState(candidate.system?.props?.resp_metal_estado);
            // Magnetismo: legado (elegibilidade congelada no Forjado) ou passiva
            // permanente recalculada pelas atributos efetivas do candidato.
            const legacyActive =
                state.battleForged?.magnetismEligible === true &&
                state.battleForged?.magnetismTargetUuid === actor.uuid;
            const permanentActive =
                resolveMetalMagnetism(candidate.system?.props ?? {}, state).eligible &&
                String(state.magnetism?.targetUuid ?? '') === actor.uuid;
            return legacyActive || permanentActive;
        });
    if (magnetismSource) {
        const selectedTargets = new Set(
            [...selectedTargets].map((token) => token.actor?.uuid).filter(Boolean)
        );
        if (!selectedTargets.has(magnetismSource.uuid)) {
            ui.notifications?.warn?.(
                `Magnetismo: este ataque deve ter ${magnetismSource.name} como alvo.`
            );
            return;
        }
    }
    const acertoLabel = props.acerto_label ?? '';

    if (!['acerto_label_dex', 'acerto_label_for'].includes(acertoLabel)) {
        ui.notifications?.warn?.("Escolha DEX ou FOR no campo 'Como Acerta'.");
        return;
    }
    let attrName = acertoLabel === 'acerto_label_for' ? 'FOR' : 'DEX';
    let attrVal = resolveSheetAttribute(actor, attrName);
    const color = ATTR_COLORS[attrName.toLowerCase()];
    if (attrVal === null)
        return ui.notifications?.error?.(`A ficha não possui um valor válido para ${attrName}.`);

    const statusEffects = getRollStatusEffects(props, {
        test: 'Acerto',
        attr: attrName,
        kind: 'attack',
    });
    if (statusEffects.blocked)
        return ui.notifications?.warn?.('Este personagem está incapacitado e não pode atacar.');
    if (statusEffects.autoFail)
        return ui.notifications?.warn?.('Paralisia: falha automática neste Acerto.');

    const passiveState = parseBreathPassiveState(props.resp_passivas_estado);
    const flameState = parseFlameBreathingState(props.resp_chamas_estado);
    const strength = resolveSheetAttribute(actor, 'FOR');
    const criticalFloor = game.settings?.get?.(MODULE_ID, SETTINGS.criticalFloor) ?? 1;
    const allWeapons = actorWeapons(actor).map((weapon) => ({
        ...weapon,
        effectiveCritical: effectiveWeaponCritical({
            base: weapon.critical,
            state: isHomebrewExtra('extras_pedra') ? passiveState : {},
            strength: strength ?? 0,
            floor: criticalFloor,
        }),
    }));
    const pendingFlameWeaponId = flameState.nextHit?.source?.startsWith?.('chamas_')
        ? String(flameState.synchronizedWeapon?.id ?? '')
        : '';
    const requiredWeaponId = String(options.requiredWeaponId ?? pendingFlameWeaponId);
    const requiredWeaponProfileIndex = Number.isInteger(options.requiredWeaponProfileIndex)
        ? options.requiredWeaponProfileIndex
        : null;
    const weapons = requiredWeaponId
        ? allWeapons.filter(
              (weapon) =>
                  weapon.id === requiredWeaponId &&
                  (requiredWeaponProfileIndex === null ||
                      weapon.profileIndex === requiredWeaponProfileIndex)
          )
        : allWeapons;
    if (requiredWeaponId && weapons.length === 0) {
        ui.notifications?.warn?.('A arma sincronizada não está mais no inventário do personagem.');
        return;
    }
    const guardTarget = selectedTargets.size === 1 ? [...selectedTargets][0]?.actor : null;
    const guardAvailable = guardTarget && companionGuardKey(actor, guardTarget);
    const counterattackTarget = !options.noPassiveGeneration && actorKind(guardTarget) === 'slayer' &&
        (guardTarget.isOwner || game.user?.isGM) && Boolean(masterBattleBenefits(guardTarget.system?.props)?.counterattack);
    const oniBasicAttack = ruleVariant('classes') === 'vanilla' && actorKind(actor) === 'oni' && options.isTechnique !== true;
    const oniUnarmedCritical = oniBasicAttack ? oniSpecializationAbility(props, TITAN, 'C')?.unarmedCritical : undefined;
    const dialogResult = await openHitDialog({
        attrName,
        attrVal,
        color,
        weapons,
        requiredWeapon: Boolean(requiredWeaponId),
        oniBasicAttack,
        oniUnarmedCritical,
        companionGuard: Boolean(guardAvailable),
        counterattackTarget,
        missLimit: options.attackSequence?.missLimit,
    });
    if (!dialogResult) return;
    if (options.forceActionType) dialogResult.actionType = String(options.forceActionType);

    const breathingState = parseWaterBreathingState(props.resp_agua_estado);
    const breathHit = breathingState.nextHit;
    const flameHit = flameState.nextHit;
    const mistState = parseMistBreathingState(props.resp_nevoa_estado);
    const mistHit = mistState.nextHit;
    const metalState = parseMetalBreathingState(props.resp_metal_estado);
    const snowState = parseSnowBreathingState(props.resp_neve_estado);
    const snowHit = snowState.nextHit;
    const windState = windStateWithManualScars(props);
    const windHit = windState.nextHit;
    const classTechniquePending = options.isTechnique === true || [breathHit, flameHit, mistHit, snowHit, windHit].some(
        (pending) => pending && typeof pending === 'object'
    );
    const counterattack = options[MASTER_BATTLE_COUNTERATTACK];
    if (counterattack && classTechniquePending)
        return ui.notifications?.warn?.('Resolva a técnica preparada antes de fazer o Contra-ataque.');
    const snowPenalty = actor.getFlag?.(MODULE_ID, 'snowPenalty');
    const flameTier = flameWeaponTier(flameWeaponHeat(flameState), ruleVariant('respiracao'));
    // 8ª Forma Ofuscamento (Névoa): a partir do Nível 2, quem tenta acertar o usuário/aliado
    // ofuscado sofre -2 na rolagem de Acerto. O estado "dazzle" fica salvo em resp_nevoa_estado
    // do PRÓPRIO usuário da Névoa (com allyUuid apontando o aliado também protegido); então, ao
    // rolar Acerto contra um alvo, é preciso checar se o alvo é o usuário da névoa (dazzle no
    // próprio) ou o aliado protegido (dazzle no usuário, allyUuid === alvo). Segue o mesmo padrão
    // usado para snowPenalty (penalidade lida do alvo e aplicada ao atacante).
    const targetedActors = [...selectedTargets]
        .map((token) => token.actor)
        .filter(Boolean);
    if (isHomebrewExtra('olhos_escarlate') && (dialogResult.physicalSurprise || options.physicalSurprise) &&
        targetedActors.some(target => hasBreathingPassive(target.system?.props, 'Raposa'))) {
        ui.notifications?.warn?.('Olhos Escarlate: o alvo não pode ser surpreendido. O ataque segue sem a Vantagem de surpresa.');
        if (dialogResult.mode === 'advantage') dialogResult.mode = 'normal';
    }
    const maneuverTargetUuid = targetedActors[0]?.uuid ?? '';
    const maneuverBonuses = resolveCombatManeuverBonuses(actor, {
        targetUuid: maneuverTargetUuid,
        channel: 'acerto',
    });
    const combatantActors = [...(game.combat?.combatants ?? [])]
        .map((combatant) => combatant.actor)
        .filter(Boolean);
    // 7ª Forma Neblina: teste de SAB-vs-SAB é POR ALVO. O bônus registrado em
    // `mistState.fog` só se aplica quando o alvo atual da rolagem é o mesmo
    // inimigo (`enemyUuid`) que fez o teste oposto e falhou.
    const fogAppliesToTarget = targetedActors.some(
        (targetActor) => targetActor.uuid === mistState.fog?.enemyUuid
    );
    const fogBonus = fogAppliesToTarget ? Number(mistState.fog?.bonus) || 0 : 0;
    const dazzlePenalty = targetedActors.reduce((total, targetActor) => {
        if (targetActor.uuid === actor.uuid) return total;
        const targetMist = parseMistBreathingState(targetActor.system?.props?.resp_nevoa_estado);
        if (targetMist.dazzle?.hitPenalty)
            return total + (Number(targetMist.dazzle.hitPenalty) || 0);
        const protector = combatantActors.find((candidate) => {
            if (!candidate || candidate.uuid === targetActor.uuid) return false;
            const candidateMist = parseMistBreathingState(
                candidate.system?.props?.resp_nevoa_estado
            );
            return (
                candidateMist.dazzle?.hitPenalty &&
                candidateMist.dazzle.allyUuid === targetActor.uuid
            );
        });
        if (protector) {
            const protectorMist = parseMistBreathingState(
                protector.system?.props?.resp_nevoa_estado
            );
            return total + (Number(protectorMist.dazzle.hitPenalty) || 0);
        }
        return total;
    }, 0);
    const breathBonus =
        (Number(breathHit?.bonus) || 0) +
        (Number(flameHit?.bonus) || 0) +
        (Number(mistHit?.bonus) || 0) +
        (Number(snowHit?.bonus) || 0) +
        (Number(snowState.belowZero?.fdvHitBonus) || 0) +
        (Number(windHit?.bonus) || 0) +
        (Number(snowState.iceHeart?.hitBonus) || 0) +
        fogBonus +
        (Number(mistState.dazzle?.hitBonus) || 0) +
        (Number(snowPenalty?.hitPenalty) || 0) +
        flameTier.hit +
        dazzlePenalty;
    const derivedBonuses = resolveSlayerDerivedBonuses(props, {
        isAttack: true,
        isTechnique: classTechniquePending,
        actionType: dialogResult.actionType,
        channel: 'acerto',
        dealsDamage: options.techniqueDealsDamage ?? (classTechniquePending ? true : undefined),
        appliesCondition: options.appliesCondition === true,
        runtimeSources: [
            ...actorBuffSources(actor),
            ...(breathBonus
                ? [
                      {
                          channel: 'acerto',
                          value: breathBonus,
                          label: 'Efeitos ativos',
                          origin: 'Respiração',
                      },
                  ]
                : []),
            ...(maneuverBonuses.attackBonus
                ? [
                      {
                          channel: 'acerto',
                          value: maneuverBonuses.attackBonus,
                          label: 'Manobra',
                          origin: 'Manobra de Combate',
                      },
                  ]
                : []),
        ],
    });
    const hitBonus = derivedBonuses.channels.acerto.total;
    const directBonus = Number(options.bonus) || 0;
    const bonusRaw = [
        dialogResult.bonusRaw,
        hitBonus ? String(hitBonus) : '',
        directBonus ? String(directBonus) : '',
    ]
        .filter(Boolean)
        .join(' + ');
    // Ni no Kata Sōsō Shinato Kaze — passiva a partir do Nível 3 de Respiração:
    // ataques básicos e desta técnica deixam de sofrer atrito do vento e têm
    // Vantagem uma vez por turno (não depende de ativar a técnica em si).
    const windLevel = Math.trunc(
        parseNumber(
            props.nvl_respiracao_num ??
                props.respiracao_nivel ??
                props.nivel_respiracao ??
                props.nvl_respiracao
        )
    );
    const knowsWind = [...(actor.items ?? [])].some(
        (item) => item.system?.props?.respiracao_nome === 'Vento'
    );
    // Livro base p. 50: a Vantagem do 2º Estilo vale também em Vanilla.
    const windAdvantageEligible = knowsWind && windLevel >= 3;
    const windAdvantageKey = 'windGarrasAdvantage';
    const windAdvantageState = actor.getFlag?.(MODULE_ID, windAdvantageKey);
    const currentRound = game.combat?.round ?? 0;
    const currentTurn = game.combat?.turn ?? 0;
    const windAdvantageUsed =
        windAdvantageState?.round === currentRound && windAdvantageState?.turn === currentTurn;
    const windAdvantageAvailable = windAdvantageEligible && !windAdvantageUsed;
    let requestedMode =
        options.advantage === true ||
        breathHit?.advantage ||
        flameHit?.advantage ||
        mistHit?.advantage ||
        maneuverBonuses.advantage ||
        windAdvantageAvailable
            ? mergeRollMode(dialogResult.mode, 'advantage')
            : dialogResult.mode;
    const passiveBonuses = combatPassiveBonuses(props);
    const eligibleFoxAttack = dialogResult.actionType === 'ataque' || classTechniquePending;
    const firstAttemptAdvantage = eligibleFoxAttack && passiveBonuses.fox.attackAdvantage &&
        !passiveBonuses.fox.incomingAttackDisadvantage;
    if (eligibleFoxAttack && passiveBonuses.fox.attackAdvantage && !firstAttemptAdvantage)
        requestedMode = mergeRollMode(requestedMode, 'advantage');
    if (targetedActors.some(target => combatPassiveBonuses(target.system?.props ?? {}).fox.incomingAttackDisadvantage))
        requestedMode = mergeRollMode(requestedMode, 'disadvantage');
    const advantageCancelTargets = targetedActors.filter(target =>
        target.getFlag?.(MODULE_ID, 'soundCancelAdvantage')?.attackerUuid === actor.uuid);
    const weapon =
        weapons.find(
            (entry) =>
                entry.id === dialogResult.weaponId &&
                entry.profileIndex === Number(dialogResult.weaponProfileIndex ?? 0)
        ) ??
        weapons.find((entry) => entry.id === dialogResult.weaponId) ??
        null;
    const kind = actorKind(actor);
    const consumeActions = kind === 'oni' || kind === 'oni_minion' ? consumeOniActions : consumeSlayerActions;
    const nitoryuActions = weapon?.paidSecondaryAttack === true && !classTechniquePending &&
        options.skipActionConsumption !== true && options.noPassiveGeneration !== true &&
        !Number.isInteger(options.forceRollCount) && !counterattack &&
        (!dialogResult.actionType || dialogResult.actionType === 'ataque') ? consumeActions : null;
    if (nitoryuActions && !dialogResult.actionType) dialogResult.actionType = 'ataque';
    if (
        weapon?.mode &&
        actor.items?.get?.(weapon.id)?.system?.props?.arma_modo_uso !== weapon.mode
    ) {
        await actor.items
            .get(weapon.id)
            .update({ 'system.props.arma_modo_uso': weapon.mode }, { naCsbAutomation: true });
    }
    const allowedWeaponAttributes = Array.isArray(weapon?.attackAttributes)
        ? weapon.attackAttributes
        : [];
    const requestedWeaponAttribute = String(dialogResult.weaponAttribute ?? '').toUpperCase();
    const selectedWeaponAttribute =
        weapon && allowedWeaponAttributes.length > 0
            ? allowedWeaponAttributes.includes(requestedWeaponAttribute)
                ? requestedWeaponAttribute
                : allowedWeaponAttributes.includes(attrName)
                  ? attrName
                  : allowedWeaponAttributes[0]
            : attrName;
    if (selectedWeaponAttribute !== attrName) {
        attrName = selectedWeaponAttribute;
        attrVal = resolveSheetAttribute(actor, attrName);
        if (attrVal === null)
            return ui.notifications?.error?.(`A ficha não possui um valor válido para ${attrName}.`);
    }
    const finalStatusEffects = getRollStatusEffects(props, {
        test: 'Acerto',
        attr: attrName,
        kind: 'attack',
    });
    if (finalStatusEffects.blocked)
        return ui.notifications?.warn?.('Este personagem está incapacitado e não pode atacar.');
    if (finalStatusEffects.autoFail)
        return ui.notifications?.warn?.('Paralisia: falha automática neste Acerto.');

    const universe =
        dialogResult.actionType === 'ataque' &&
        !classTechniquePending &&
        !metalState.nextHit &&
        options.skipActionConsumption !== true &&
        options.autoDamage !== false &&
        weapon?.id
            ? flamingUniverseForAttack(flameState, { combat: game.combat, weaponId: weapon.id, props, strength })
            : null;
    const universeTarget = universe
        ? [...selectedTargets].find((token) => token.actor && token.actor.uuid !== actor.uuid)
        : null;
    if (universe && !universeTarget)
        return ui.notifications?.warn?.('Marque o alvo do Ataque Padrão com Universo Flamejante.');
    if (universe && strength === null)
        return ui.notifications?.error?.('Universo Flamejante exige FOR configurada para calcular a CD.');

    const poisonRank =
        selectedSlayerClassKey(props) === 'classe_usuario_de_veneno'
            ? classRankAtLevel(classLevel(props))
            : null;
    const poisonExtraFlag = actor.getFlag?.(MODULE_ID, 'poisonExtraAttack');
    const combatRound = game.combat?.round ?? null;
    const combatTurn = game.combat?.turn ?? null;
    const poisonExtraUsed =
        combatRound !== null &&
        poisonExtraFlag?.round === combatRound &&
        poisonExtraFlag?.turn === combatTurn;
    const poisonExtraAttack =
        ['A', 'S', 'SS'].includes(poisonRank) &&
        dialogResult.actionType === 'ataque' &&
        !classTechniquePending &&
        !poisonExtraUsed;
    // Marca do Caçador: margem de crítico só contra Oni e Frequência Cardíaca Elevada (1×/turno).
    // ponytail: com arma Nitoryu/Ryōtō o ataque adicional segue a regra de 2º golpe (sem FOR/DEX);
    // para separar, o doRoll precisaria marcar quais tentativas são do rider.
    const markMargin = markCriticalMargin(props, {
        targetIsOni: targetedActors.some((target) => actorKind(target) === 'oni'),
    });
    const markExtraFlag = actor.getFlag?.(MODULE_ID, 'markExtraAttack');
    const markExtraUsed =
        combatRound !== null &&
        markExtraFlag?.round === combatRound &&
        markExtraFlag?.turn === combatTurn;
    const markExtra = markExtraAttack(props, {
        actionType: dialogResult.actionType,
        classTechniquePending,
        usedThisTurn: markExtraUsed,
    });
    const baseRollCount = Number.isInteger(options.forceRollCount) ? Math.max(1, Math.min(20, options.forceRollCount)) : Math.max(
        dialogResult.rollCount,
        nitoryuActions ? 2 : 1,
        Number(dialogResult.weaponProfileIndex) >= 0 ? Number(weapon?.attacks) || 1 : 1,
        Number(breathHit?.count) || 1,
        Number(flameHit?.count) || 1,
        Number(mistHit?.count) || 1,
        Number(snowHit?.count) || 1,
        Number(windHit?.count) || 1
    );
    if (options.skipActionConsumption !== true && dialogResult.actionType) {
        const actionResult = await consumeActions(actor, [dialogResult.actionType]);
        if (!actionResult.ok) return ui.notifications?.warn?.(actionResult.reason);
    }
    const executionId = options.executionId ?? passiveExecutionId(actor);
    const formId = options.formId ?? breathHit?.source ?? flameHit?.source ?? mistHit?.source ?? snowHit?.source ?? windHit?.source ?? '';
    const oniUnarmed = oniBasicAttack && !weapon && !classTechniquePending && dialogResult.actionType === 'ataque';
    const guardKey = (options.melee === true || dialogResult.companionMelee) && guardAvailable
        ? companionGuardKey(actor, guardTarget) : '';
    const opening = targetedActors.length === 1 && pendingCompanionCoordination('opening', actor, targetedActors[0].uuid);
    const result = await doRoll({
        actor,
        attrName,
        attrVal,
        mode: requestedMode,
        rollMode: dialogResult.rollMode,
        bonusRaw,
        cdVal: dialogResult.cdVal,
        rollCount: baseRollCount + (poisonExtraAttack ? 1 : 0) + (markExtra ? 1 : 0),
        actionType: dialogResult.actionType,
        statusEffects: finalStatusEffects,
        weapon,
        nitoryuActions,
        attackSequence: options.attackSequence,
        metalReroll: !counterattack && metalState.chainReaction?.turns > 0,
        stopOnMiss: mistHit?.stopOnMiss === true,
        markMargin,
        oniMargin: oniUnarmed ? oniUnarmedCritical : null,
        firstAttemptBonus: passiveBonuses.sound.acerto + passiveBonuses.wind.acerto +
            Number(Boolean(opening)) - Number(Boolean(guardKey)),
        firstAttemptAdvantage,
        cancelAdvantage: advantageCancelTargets.length > 0,
        counterattack,
        disableExtraAttacks: options.noPassiveGeneration === true || Number.isInteger(options.forceRollCount),
        forcedRollCount: Number.isInteger(options.forceRollCount) ? baseRollCount : undefined,
        passiveEvent: { executionId, formId, isTechnique: classTechniquePending,
            actionType: dialogResult.actionType, noPassiveGeneration: options.noPassiveGeneration === true,
            noContactEffects: options.noContactEffects === true, hostile: true,
            targetUuid: targetedActors[0]?.uuid ?? '', targetCount: targetedActors.length, targetActors: targetedActors },
    });
    if (guardKey && result?.attempts?.length)
        await consumeCompanionGuard(actor, guardTarget, guardKey);
    if (opening && result?.attempts?.length) await consumeCompanionCoordination(actor, opening);
    if (counterattackTarget && result?.misses > 0 && (options.melee === true || dialogResult.companionMelee))
        await offerMasterBattleCounterattack(guardTarget, actor, { enemyMissed: true, melee: true });
    if (targetedActors.length === 1 && !options.noContactEffects && result?.attempts?.some(attempt => attempt.hit))
        await registerCoordinatedHit(actor, targetedActors[0], { breathing: classTechniquePending && Boolean(formId) });
    if (result?.attempts?.length) for (const target of advantageCancelTargets)
        await target.unsetFlag?.(MODULE_ID, 'soundCancelAdvantage');
    if (result)
        await consumeCombatManeuverPending(actor, {
            targetUuid: maneuverTargetUuid,
            part: 'hit',
        });
    if (poisonExtraAttack && result && combatRound !== null)
        await actor.setFlag?.(MODULE_ID, 'poisonExtraAttack', {
            round: combatRound,
            turn: combatTurn,
        });
    if (markExtra && result && combatRound !== null)
        await actor.setFlag?.(MODULE_ID, 'markExtraAttack', {
            round: combatRound,
            turn: combatTurn,
        });
    if (windAdvantageAvailable) {
        await actor.setFlag(MODULE_ID, windAdvantageKey, {
            round: currentRound,
            turn: currentTurn,
        });
    }
    const confirmedCritical = dialogResult.actionType === 'ataque' && !classTechniquePending && !options.noContactEffects
        ? result?.attempts?.find((attempt) => attempt.critical) : null;
    const knowsMetal = [...(actor.items ?? [])].some(
        (item) => item.system?.props?.respiracao_nome === 'Metal'
    );
    if (result?.attempts?.length && weapon) {
        let nextPassiveState = registerWeaponUse(passiveState, weapon);
        if (confirmedCritical && knowsMetal)
            nextPassiveState = registerConfirmedCritical(nextPassiveState, {
                weaponId: weapon?.id ?? '',
                weaponName: weapon?.name ?? 'Sem arma',
                natural: confirmedCritical.natural,
                threshold: confirmedCritical.criticalThreshold,
            });
        const weaponPatch = passiveStatePatch(nextPassiveState);
        if (
            [...(actor.items ?? [])].some(
                (item) => item.system?.props?.respiracao_nome === 'Chamas'
            )
        ) {
            Object.assign(
                weaponPatch,
                flameStatePatch(synchronizeFlameWeapon(flameState, weapon, 0))
            );
        }
        await actor.update(weaponPatch, { naCsbAutomation: true, naBreathing: true });
        if (confirmedCritical && knowsMetal)
            ui.notifications?.info?.(
                'Martelo do Julgamento disponível: ataque adicional liberado pelo crítico.'
            );
    }
    if (result?.attempts?.length && windHit) {
        await actor.update(windStatePatch(consumeWindPending(windState, { hit: true })), {
            naCsbAutomation: true,
            naBreathing: true,
        });
    }
    // 3º Estilo (Reação) — Sinergia de crítico: cura 1 PDV por aliado compatível
    // presente no campo (Insetos/Névoa/Grama/Areia, por respiracao_nome).
    if (confirmedCritical && windState.pendingDamage?.criticalSynergy) {
        const allies = [...(game.combat?.combatants ?? [])]
            .map((combatant) => combatant.actor)
            .filter(
                (candidate) =>
                    candidate &&
                    candidate.uuid !== actor.uuid &&
                    [...(candidate.items ?? [])].some((item) =>
                        WIND_SYNERGY_BREATHINGS.includes(item.system?.props?.respiracao_nome)
                    )
            );
        if (allies.length > 0) {
            const healed = Math.min(
                parseNumber(props.pdv_slayer_maximo_num),
                parseNumber(props.pdv_slayer_curado) + allies.length
            );
            await actor.update(
                { 'system.props.pdv_slayer_curado': healed },
                { naCsbAutomation: true, naBreathing: true }
            );
            ui.notifications?.info?.(
                `San no Kata Kokufū Enran: crítico com ${allies.length} aliado(s) compatível(is) — +${allies.length} PDV.`
            );
        }
    }
    if (result?.attempts?.length && breathHit) {
        delete breathingState.nextHit;
        await actor.update(
            {
                'system.props.resp_agua_estado': JSON.stringify(breathingState),
                'system.props.resp_bonus_acerto_temp': 0,
            },
            { naCsbAutomation: true, naBreathing: true }
        );
    }
    if (result?.attempts?.length && flameHit) {
        await actor.update(flameStatePatch(consumeFlamePending(flameState, { hit: true })), {
            naCsbAutomation: true,
            naBreathing: true,
        });
    }
    if (result?.attempts?.length && mistHit) {
        await actor.update(mistStatePatch(consumeMistPending(mistState, { hit: true })), {
            naCsbAutomation: true,
            naBreathing: true,
        });
    }
    if (result?.attempts?.length && snowHit) {
        let nextSnow = consumeSnowPending(snowState, { hit: true });
        // Inverno Sombrio (neve_02) é uma Forma em Área: todo inimigo marcado como
        // alvo participa da mesma rolagem de Acerto. As demais Formas da Neve com
        // Congelar (Fluxo/Avalanche) seguem alvo único — usa apenas o primeiro.
        const isAreaForm = snowHit.source === 'neve_02';
        const allTargets = [...selectedTargets]
            .map((token) => token.actor)
            .filter(Boolean);
        const affectedTargets = isAreaForm ? allTargets : allTargets.slice(0, 1);
        const patch = {};
        let recoveryChoice = '';
        let recoveryPrompted = false;
        for (const target of affectedTargets) {
            const freeze =
                result.hits > 0
                    ? (Number(snowState.pendingDamage?.freezeOnHit) || 0) +
                      (result.criticals > 0 ? Number(snowHit.criticalFreeze) || 0 : 0)
                    : 0;
            if (
                target?.uuid &&
                freeze > 0 &&
                snowState.belowZero?.freezeRecovery &&
                !recoveryPrompted
            ) {
                recoveryChoice = await chooseSnowRecovery();
                recoveryPrompted = true;
            }
            const gain =
                target?.uuid && freeze > 0
                    ? resolveSnowFreezeGain(nextSnow, target.uuid, freeze, { recoveryChoice })
                    : { state: nextSnow, reachedFive: false, burstFormula: '', recovery: null };
            nextSnow = gain.state;
            const { pdvHealed, pdrSpent } = breathingResourceKeys(actor.system?.props);
            if (gain.recovery?.pdv) {
                const base =
                    Number(
                        patch[`system.props.${pdvHealed}`] ??
                            actor.system?.props?.[pdvHealed]
                    ) || 0;
                patch[`system.props.${pdvHealed}`] = base + gain.recovery.pdv;
            }
            if (gain.recovery?.pdr) {
                const base =
                    Number(
                        patch[`system.props.${pdrSpent}`] ??
                            actor.system?.props?.[pdrSpent]
                    ) || 0;
                patch[`system.props.${pdrSpent}`] = Math.max(
                    0,
                    base - gain.recovery.pdr
                );
            }

            if (gain.reachedFive && target) {
                const restrain = await foundry.applications.api.DialogV2.confirm({
                    window: { title: 'Congelar Restrição de Movimentos' },
                    content: `<p>${target.name} atingiu 5 acúmulos. Gastar uma Ação Única para restringir seus movimentos?</p>`,
                    rejectClose: false,
                });
                if (restrain) {
                    const action = await consumeSlayerActions(actor, ['unica'], { update: false });
                    if (action.ok) {
                        if (target.getFlag?.(MODULE_ID, 'snowRestriction')?.sourceActorUuid !== actor.uuid)
                            nextSnow = breakSnowRestrictionOnDamage(nextSnow, target.uuid);
                        const restriction = spendFreezeForRestriction(
                            nextSnow,
                            target.uuid,
                            resolveSheetAttribute(actor, 'CAR') ?? 0
                        );
                        if (!restriction.ok) continue;
                        nextSnow = restriction.state;
                        Object.assign(patch, action.patch);
                        await applyBreathingStatus(target, 'restricao_movimentos', {
                            remainingTurns: null, tick: 'end',
                            sourceName: `Congelar ${actor.uuid}`.slice(0, 120),
                        });
                        await target.setFlag(
                            MODULE_ID,
                            'snowRestriction',
                            snowRestrictionFlag(restriction.restriction, actor.uuid)
                        );
                    } else ui.notifications?.warn?.(action.reason);
                }
            }
            if (gain.burstFormula && target) {
                const { rollDamage } = await import('./damage-service.mjs');
                await rollDamage({
                    actor,
                    nome: 'Abaixo de Zero Explosão de Gelo',
                    entradas: [
                        {
                            tipoAcao: 'especial',
                            dado: gain.burstFormula,
                            fixo: 0,
                            attrs: [],
                            tiposDano: ['concussao'],
                        },
                    ],
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
        for (let index = 0; index < result.hits; index += 1)
            nextMetal = registerMetalBattleHit(nextMetal).state;
        await actor.update(metalStatePatch(nextMetal), {
            naCsbAutomation: true,
            naBreathing: true,
        });
    }
    if (universe && result?.attempts?.length) {
        // O primeiro golpe gasta o preparo mesmo quando erra ou há outros golpes no perfil.
        const latest = parseFlameBreathingState(actor.system?.props?.resp_chamas_estado);
        delete latest.flamingUniverse;
        await actor.update(flameStatePatch(latest), { naCsbAutomation: true, naBreathing: true });
        if (result.attempts[0].hit)
            result.attempts[0].flamingUniverse = { ...universe, target: universeTarget };
    }
    const finalResult = result ? { ...result, weapon, executionId, formId, isTechnique: classTechniquePending,
        actionType: dialogResult.actionType, oniUnarmed, attackAttribute: attrName } : result;

    // Continuação automática pós-Acerto: dispara o dano sem exigir clique
    // manual na arma. Chamadores que já fazem sua própria resolução de dano
    // (ex.: useBreathForm, o ataque extra do Martelo do Julgamento) passam
    // `autoDamage: false` para não rolar dano em duplicidade. Reaproveita o
    // mesmo diálogo de encadeamento de Forma usado por useBreathForm — o
    // jogador vê a mesma pergunta/UX depois de QUALQUER Acerto confirmado,
    // com arma pura ou com Forma.
    if (finalResult?.hits > 0 && options.autoDamage !== false) {
        const { confirmChainedForma, resolveAutoDamage } = await import('./attack-follow-up.mjs');
        const chained = !universe && await confirmChainedForma(actor);
        if (!chained) {
            const actionLabel = TIPOS_ACAO.find(
                (entry) => entry.key === dialogResult.actionType
            )?.label;
            await resolveAutoDamage({
                actor,
                hitResult: finalResult,
                techniqueLabel: actionLabel || 'Ataque',
                classBasicAttack: !classTechniquePending,
                targets: options.targets,
            });
        }
    }
    if (finalResult?.attempts?.length && options.autoDamage !== false && !options.noPassiveGeneration &&
        !classTechniquePending && dialogResult.actionType === 'ataque' && targetedActors.length === 1 &&
        combatPassiveBonuses(actor.system?.props ?? {}).sound.nightcoreAvailable) {
        const { activateSoundPassive } = await import('./sound-passive-service.mjs');
        const { executeCombatPassive } = await import('./combat-passive-execution.mjs');
        const extra = await activateSoundPassive(actor, 'nightcore', { baseActionType: 'ataque',
            targetUuid: targetedActors[0].uuid, execute: plan => executeCombatPassive(actor, plan) });
        if (extra.reason) ui.notifications.warn(extra.reason);
    }
    return finalResult;
}
