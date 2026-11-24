/**
 * @fileoverview Motor autoritativo de turnos, dano e Exaustão do Slayer.
 */

import { MASTER_BATTLE_BLEEDING, MODULE_ID, STATUS_SLAYER_DANO_CONTINUO } from './constants.mjs';
import { actorKind } from './actor-kind.mjs';
import { breathingPdvInfo } from './actor-resources.mjs';
import { mitigateBreathingPassiveDamage } from './breathing-defense.mjs';
import { MASTER_BATTLE_PARRY_GUARD, prepareMasterBattleParry, resolvePreparedMasterBattleParry } from './slayer/master-battle-parry.mjs';
import { recordBreathingPassiveEvent } from './breathing-combat-passives.mjs';
import { releaseSnowRestriction } from './snow-breathing-service.mjs';
import { mitigateOniPoisonDamage, ONI_TOXIC_PENDING } from './oni/specialization-rules.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { parseNumber } from './parsing.mjs';
import { formatStatusSummary, parseStatusState } from './status-service.mjs';
import {
    USER_POISON_STATE_KEY,
    parseUserPoisonState,
    tickUserPoison,
    userPoisonStatePatch,
} from './slayer/poison-user-service.mjs';
import {
    registerWindBattleDamage,
    windStatePatch,
    windStateWithManualScars,
    WIND_STATE_KEY,
} from './wind-breathing-service.mjs';

const TURN_FLAG = 'lastStatusTurn';
const resolvingExhaustion = new Set();
const FINITE_SOURCE_DAMAGE = new Set(['sangramento', MASTER_BATTLE_BLEEDING, 'hemorragia', 'envenenamento']);

function statusContract(actor) {
    const props = actor?.system?.props ?? {};
    const kind = actorKind(actor);
    const oni =
        kind === 'oni' ||
        kind === 'oni_minion' ||
        (props.status_oni_dados !== undefined && props.status_slayer_dados === undefined);
    return oni
        ? {
              kind: 'oni',
              data: 'status_oni_dados',
              summary: 'status_oni_resumo',
              exhaustion: 'status_oni_exaustao',
              damage: kind === 'oni_minion' ? 'oni_minion_pdv_dano' : 'pdv_oni_dano_tomado',
          }
        : {
              kind: kind === 'npc' ? 'npc' : 'slayer',
              data: 'status_slayer_dados',
              summary: 'status_slayer_resumo',
              exhaustion: 'status_slayer_exaustao',
              damage: kind === 'npc' ? 'npc_pdv_dano' : 'pdv_slayer_dano_tomado',
          };
}

function actorStatusPatch(actor, state) {
    const contract = statusContract(actor);
    return {
        [`system.props.${contract.data}`]: JSON.stringify(state),
        [`system.props.${contract.summary}`]: formatStatusSummary(state.active, state.exhaustion),
        [`system.props.${contract.exhaustion}`]: state.exhaustion,
    };
}

function joinedDamageFormula(left, right) {
    const formulas = [left, right].map((value) => String(value ?? '').trim()).filter(Boolean);
    return formulas.length > 1
        ? formulas.map((formula) => `(${formula})`).join(' + ')
        : (formulas[0] ?? '');
}

/**
 * Reaplica um dano finito no contrato plano atual do CSB.
 * A mesma fonte acumula o dano e renova para dois turnos. Fontes distintas
 * continuam identificadas no nome e têm suas fórmulas preservadas na soma.
 */
export function reapplyFiniteStatusEffect(existing = {}, incoming = {}) {
    const currentSource = String(existing.sourceName ?? '').trim();
    const incomingSource = String(incoming.sourceName ?? '').trim();
    const sameSource = Boolean(currentSource && incomingSource && currentSource === incomingSource);
    const sourceNames = [...new Set([currentSource, incomingSource].filter(Boolean))];
    return {
        ...existing,
        ...incoming,
        damageFormula: joinedDamageFormula(existing.damageFormula, incoming.damageFormula),
        remainingTurns: sameSource
            ? 2
            : Math.max(
                  1,
                  Number.parseInt(existing.remainingTurns, 10) || 0,
                  Number.parseInt(incoming.remainingTurns, 10) || 0
              ),
        sourceName: sourceNames.join(' + '),
        stacks: 1,
        tick: 'start',
    };
}

function primaryActiveGm() {
    return (
        game.users
            ?.filter((user) => user.active && user.isGM)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null
    );
}

function isPrimaryGm() {
    return game.user?.isGM && primaryActiveGm()?.id === game.user.id;
}

function statePatch(state) {
    return {
        'system.props.status_slayer_dados': JSON.stringify(state),
        'system.props.status_slayer_resumo': formatStatusSummary(state.active, state.exhaustion),
        'system.props.status_slayer_exaustao': state.exhaustion,
    };
}

export function currentPdv(props = {}) {
    // Prefere as parcelas numéricas canônicas. Labels do CSB podem conter CSS
    // com outros números (font-size, weight etc.) e não são uma fonte segura.
    const computedTotal = props.pdv_slayer_total_conta;
    if (computedTotal !== undefined && computedTotal !== null && computedTotal !== '') {
        const wound = parseNumber(props.pdv_slayer_dano_ferida);
        const healed = parseNumber(props.pdv_slayer_curado);
        const extra = parseNumber(props.pdv_slayer_extra);
        const damage = parseNumber(props.pdv_slayer_dano_tomado);
        return Math.max(0, parseNumber(computedTotal) - wound + healed + extra - damage);
    }
    const computedCurrent = props.pdv_slayer_conta_atual;
    if (typeof computedCurrent === 'number' && Number.isFinite(computedCurrent)) {
        return Math.max(0, computedCurrent);
    }
    const display = props.pdv_slayer_atual_valor_display;
    if (display !== undefined && display !== null && display !== '') {
        const withoutCss = String(display).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
        return Math.max(0, parseNumber(withoutCss));
    }
    const totalLabel = String(props.pdv_slayer_total_valor ?? '').replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        ' '
    );
    const total = parseNumber(totalLabel);
    const wound = parseNumber(props.pdv_slayer_dano_ferida);
    const healed = parseNumber(props.pdv_slayer_curado);
    const extra = parseNumber(props.pdv_slayer_extra);
    const damage = parseNumber(props.pdv_slayer_dano_tomado);
    return Math.max(0, total - wound + healed + extra - damage);
}

/**
 * Passiva Sangue Especial (Respiração do Vento): acumula dano Cortante/
 * Perfurante e Sangramento/Infecção recebidos na batalha atual para
 * consolidar em cicatrizes/bônus de VIT no Descanso Longo (ver
 * `consolidateWindScars` em wind-breathing-service.mjs).
 */
export function buildWindBattleDamagePatch(actor, props, context) {
    const knowsWind = hasBreathingPassive(props, 'Vento') || [...(actor.items ?? [])].some(
        (item) => item.system?.props?.respiracao_nome === 'Vento'
    );
    if (!knowsWind) return {};
    const components = (Array.isArray(context.components) && context.components.length
        ? context.components
        : [{ types: context.damageTypes ?? [], subtotal: (context.normalDamage ?? 0) + (context.woundDamage ?? 0) }])
        .map(component => ({
            types: (Array.isArray(component.types) ? component.types : [])
                .filter(type => !context.approvedTypes || context.approvedTypes.includes(type)),
            subtotal: Math.max(0, Math.trunc(Number(component.subtotal) || 0)),
        }));
    const groupTotal = wound => components.filter(c => c.types.includes('ferida') === wound)
        .reduce((total, c) => total + c.subtotal, 0);
    const normalTotal = groupTotal(false);
    const woundTotal = groupTotal(true);
    // Distribui apenas o dano recebido, sem contar a parte resistida novamente.
    const received = component => {
        const wound = component.types.includes('ferida');
        const total = wound ? woundTotal : normalTotal;
        const applied = wound ? context.woundDamage : context.normalDamage;
        return total > 0 ? component.subtotal * (applied ?? total) / total : 0;
    };
    const cutPierce = components
        .filter(
            (c) =>
                Array.isArray(c.types) &&
                (c.types.includes('cortante') || c.types.includes('perfurante'))
        )
        .reduce((total, c) => total + received(c), 0);
    const bleedInfection = components
        .filter(
            (c) =>
                Array.isArray(c.types) &&
                (c.types.includes('sangramento') || c.types.includes('infeccao'))
        )
        .reduce((total, c) => total + received(c), 0);
    if (cutPierce <= 0 && bleedInfection <= 0) return {};
    const windState = windStateWithManualScars(props);
    const nextWindState = registerWindBattleDamage(windState, { cutPierce, bleedInfection });
    return windStatePatch(nextWindState);
}

export function resolveIncomingDamage(state, amount, { isAttack = true } = {}) {
    const base = Math.max(0, Math.trunc(Number(amount) || 0));
    const vulnerable =
        isAttack && ((state.active ?? []).includes('vulneravel') || state.exhaustion >= 6);
    return { damage: vulnerable ? base * 2 : base, vulnerable };
}

export async function recordResolvedPdvLoss(actor, props, damage, context = {}) {
    const { pdvCurrent } = breathingPdvInfo(props);
    const temporary = actorKind(actor) === 'slayer' ? Math.max(0, parseNumber(props.pdv_slayer_extra)) : 0;
    const normalPdv = Math.max(0, pdvCurrent - temporary);
    const pdvLost = Math.min(normalPdv, Math.max(0, damage));
    if (pdvLost > 0) {
        const status = parseStatusState(props.status_slayer_dados).active;
        try {
            await recordBreathingPassiveEvent(actor, {
                type: 'damageTaken',
                amount: pdvLost,
                directPdv: true,
                conscious: normalPdv > pdvLost && !status.includes('inconsciente'),
                hostile: context.hostile === true,
                selfInflicted: context.sourceActorUuid === actor.uuid && Boolean(actor.uuid),
                cannotDodge: context.cannotDodge === true,
            });
        } catch (error) {
            ui.notifications?.warn?.(`Dano aplicado a ${actor.name}; não foi possível atualizar as passivas. ${error.message}`);
        }
    }
    return pdvLost;
}

export async function applySlayerDamage(actor, amount, context = {}) {
    if (!actor?.update) throw new Error('Slayer inválido para receber dano.');
    const preparation = prepareMasterBattleParry(actor, Math.max(0, Math.trunc(Number(amount) || 0)), context);
    const prepared = preparation ? await preparation : null;
    const props = { ...actor.system?.props };
    const state = parseStatusState(props.status_slayer_dados);
    state.exhaustion = Math.max(
        state.exhaustion,
        Number.parseInt(props.status_slayer_exaustao, 10) || 0
    );
    const components = Array.isArray(context.components) ? context.components : [];
    const requestedWound = components
        .filter((component) => Array.isArray(component.types) && component.types.includes('ferida'))
        .reduce(
            (total, component) => total + Math.max(0, Math.trunc(Number(component.subtotal) || 0)),
            0
        );
    const requested = Math.max(0, Math.trunc(Number(amount) || 0));
    const woundBase = Math.min(requested, requestedWound);
    const demonicBonus = context.isDemonic && state.active.includes('corrupcao') ? 2 : 0;
    const normalBase = requested - woundBase + demonicBonus;
    // Choque Adrenérgico ignora as penalidades de Exaustão, inclusive o Vulnerável da Exaustão 6.
    const incomingState = state.active.includes('choque_adrenergico')
        ? { ...state, exhaustion: 0 }
        : state;
    const normalResolution = resolveIncomingDamage(incomingState, normalBase, context);
    const woundResolution = resolveIncomingDamage(incomingState, woundBase, context);
    const mitigation = mitigateBreathingPassiveDamage(props, normalResolution.damage, woundResolution.damage, {
        ...context,
        components: components.map(entry => ({
            ...entry,
            subtotal: (Number(entry.subtotal) || 0) * (normalResolution.vulnerable ? 2 : 1),
        })),
    });
    // PDV temporário (`pdv_slayer_extra`) absorve o dano antes do PDV, o normal primeiro.
    const parry = mitigation.woundDamage === 0
        ? resolvePreparedMasterBattleParry(prepared, mitigation.normalDamage) : null;
    const mitigatedNormal = parry?.damage ?? mitigation.normalDamage;
    const temporary = Math.max(0, parseNumber(props.pdv_slayer_extra));
    const absorbedNormal = Math.min(temporary, mitigatedNormal);
    const absorbedWound = Math.min(temporary - absorbedNormal, mitigation.woundDamage);
    const temporaryAbsorbed = absorbedNormal + absorbedWound;
    const resolution = {
        damage: mitigatedNormal - absorbedNormal,
        woundDamage: mitigation.woundDamage - absorbedWound,
        vulnerable: normalResolution.vulnerable || woundResolution.vulnerable,
        temporaryAbsorbed,
    };
    const currentDamage = parseNumber(props.pdv_slayer_dano_tomado);
    const currentWounds = parseNumber(props.pdv_slayer_dano_ferida);
    const removable = new Set(['confuso', 'distraido', 'sonhando']);
    const removed =
        resolution.damage + resolution.woundDamage > 0
            ? state.active.filter((key) => removable.has(key))
            : [];
    if (removed.length) {
        state.active = state.active.filter((key) => !removable.has(key));
        for (const key of removed) delete state.effects[key];
    }
    const windUpdate = buildWindBattleDamagePatch(actor, props, {
        ...context, normalDamage: resolution.damage, woundDamage: resolution.woundDamage,
    });

    await actor.update(
        {
            'system.props.pdv_slayer_dano_tomado': currentDamage + resolution.damage,
            'system.props.pdv_slayer_dano_ferida': currentWounds + resolution.woundDamage,
            ...(temporaryAbsorbed > 0
                ? { 'system.props.pdv_slayer_extra': temporary - temporaryAbsorbed }
                : {}),
            ...statePatch(state),
            ...windUpdate,
            ...parry?.patch,
        },
        { naCsbAutomation: true, naStatusDamage: true, naCritical: context.critical === true }
    );
    if (parry?.guard) {
        const { attacker, ...guard } = parry.guard;
        await attacker.setFlag(MODULE_ID, MASTER_BATTLE_PARRY_GUARD, guard);
    }
    if (parry) await parry.roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `Aparar Instintivo · ${parry.attribute} · −${parry.reduction} dano` });
    if (resolution.damage + resolution.woundDamage > 0) await releaseSnowRestriction(actor);
    const pdvLost = await recordResolvedPdvLoss(actor, props, resolution.damage + resolution.woundDamage, context);
    return {
        ...resolution,
        pdvLost,
        concussionDamage: parry ? Math.min(mitigation.concussionDamage, mitigatedNormal) : mitigation.concussionDamage,
        // Dano deste golpe (inclui o absorvido pelo PDV temporário). Sem este campo o
        // aviso "recebeu N de dano" mostrava 0 e o Calor das Chamas lia o dano acumulado.
        appliedDamage: resolution.damage + resolution.woundDamage + temporaryAbsorbed,
        normalDamage: resolution.damage,
        removed,
        totalDamage: currentDamage + resolution.damage,
        woundTotal: currentWounds + resolution.woundDamage,
        actorName: actor.name,
    };
}

function repeatedFormula(formula, stacks) {
    const count = Math.max(1, Math.trunc(stacks || 1));
    return Array.from({ length: count }, () => `(${formula})`).join(' + ');
}

async function rollFormula(formula) {
    const clean = String(formula ?? '').trim();
    if (!clean) throw new Error('Fórmula de dano não configurada.');
    const roll = await Roll.create(clean).evaluate();
    return { roll, total: Math.max(0, Math.trunc(Number(roll.total) || 0)) };
}

async function makeSave(actor, effect, label) {
    if (!effect?.saveAttr || effect.saveDc <= 0) return false;
    const value = parseNumber(actor.system?.props?.[`${effect.saveAttr.toLowerCase()}_display`]);
    const roll = await Roll.create(`1d20 + ${value}`).evaluate();
    const success = roll.total >= effect.saveDc;
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<strong>${label}</strong> — ${effect.saveAttr} CD ${effect.saveDc}: ${success ? 'Sucesso' : 'Falha'}`,
    });
    return success;
}

function decrementEffect(state, key) {
    const effect = state.effects[key];
    if (!effect || effect.remainingTurns === null) return false;
    effect.remainingTurns = Math.max(0, effect.remainingTurns - 1);
    if (effect.remainingTurns > 0) return false;
    state.active = state.active.filter((entry) => entry !== key);
    delete state.effects[key];
    return true;
}

export async function processActorStatusTiming(actor, timing = 'start') {
    if (!actor?.update) return { processed: false, reason: 'actor-invalid' };
    const props = actor.system?.props ?? {};
    const contract = statusContract(actor);
    const state = parseStatusState(props[contract.data]);
    state.exhaustion = Math.max(
        state.exhaustion,
        Number.parseInt(props[contract.exhaustion], 10) || 0
    );
    const stateBeforeTiming = JSON.stringify(state);
    const recoveryFatigue = props.resp_recuperacao_fadiga_suspensa;
    const recoveryFatigueExpired =
        timing === 'start' &&
        (recoveryFatigue === 'fadiga_corporal' ||
            recoveryFatigue === 'fadiga_mental' ||
            parseNumber(recoveryFatigue) > 0);
    const ignorePoison = parseNumber(props.resp_recuperacao_veneno_ignorar) > 0;
    let poisonIgnored = false;
    const active = new Set(state.active);
    const messages = [];
    let statusDamageTotal = parseNumber(props[contract.damage]);

    if (timing === 'start') {
        if (active.has('distraido')) {
            state.active = state.active.filter((key) => key !== 'distraido');
            delete state.effects.distraido;
            messages.push('Distraído removido no início do turno');
        }
        if (active.has('confuso') && !active.has('encorajado')) {
            const confusion = await Roll.create('1d4').evaluate();
            const outcomes = [
                '',
                'ataca o aliado mais próximo',
                'ataca o inimigo mais próximo',
                'ataca a si mesmo',
                'perde a Ação de Ataque',
            ];
            messages.push(`Confuso: ${outcomes[confusion.total]}`);
            await confusion.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: `<strong>Confuso — ${actor.name}</strong>`,
            });
        }
    }

    const damageKeys = new Set([...STATUS_SLAYER_DANO_CONTINUO, MASTER_BATTLE_BLEEDING]);
    for (const key of [...state.active]) {
        const effect = state.effects[key];
        const defaultTiming = [
            'invisivel_inalvejavel',
            'vulneravel',
            'restricao_movimentos',
            'atordoamento',
            'paralisia',
            'colapso',
            'confuso',
            'amedrontado',
            'desorientado',
            'hipotermia',
            'suprimido',
        ].includes(key)
            ? 'end'
            : 'start';
        if ((effect?.tick ?? defaultTiming) !== timing) continue;

        if (damageKeys.has(key)) {
            const damageType = key === MASTER_BATTLE_BLEEDING ? 'sangramento' : key;
            const formula = key === 'em_chamas' ? '1d4' : effect?.damageFormula;
            if (
                FINITE_SOURCE_DAMAGE.has(key) &&
                (!formula || !Number.isInteger(effect?.remainingTurns) || effect.remainingTurns < 1)
            ) {
                const label = key.replaceAll('_', ' ');
                ui.notifications?.error?.(
                    `${actor.name}: ${label} precisa de dano e quantidade de turnos.`
                );
                messages.push(`${label}: configuração incompleta; efeito não processado`);
                continue;
            }
            if (key === 'envenenamento' && ignorePoison) {
                poisonIgnored = true;
                messages.push('Envenenamento: dano periódico ignorado pela Respiração da Recuperação');
                if (decrementEffect(state, key)) messages.push(`${key} expirou`);
                continue;
            }
            try {
                const { roll, total: rolledTotal } = await rollFormula(
                    key === 'corroido' ? repeatedFormula(formula, effect?.stacks) : formula
                );
                const total = key === 'envenenamento'
                    ? mitigateOniPoisonDamage(props, rolledTotal, { damageTypes: ['venenoso'] })
                    : rolledTotal;
                if (total > 0 && contract.kind === 'slayer') {
                    await applySlayerDamage(actor, total, {
                        isAttack: false, hostile: true, cannotDodge: true, source: key,
                        components: [{ types: [damageType], subtotal: total }],
                    });
                } else if (total > 0) {
                    const beforeDamage = { ...actor.system?.props };
                    const resolution = resolveIncomingDamage(state, total, { isAttack: false });
                    statusDamageTotal += resolution.damage;
                    await actor.update(
                        {
                            [`system.props.${contract.damage}`]: statusDamageTotal,
                            ...(contract.kind === 'npc' ? buildWindBattleDamagePatch(actor, actor.system?.props ?? props, {
                                components: [{ types: [damageType], subtotal: resolution.damage }],
                            }) : {}),
                        },
                        { naCsbAutomation: true, naStatusDamage: true }
                    );
                    if (resolution.damage > 0) {
                        await releaseSnowRestriction(actor);
                        await recordResolvedPdvLoss(actor, beforeDamage, resolution.damage, {
                            hostile: true, cannotDodge: true,
                        });
                    }
                }
                if (total > 0) {
                    for (const removedKey of ['confuso', 'distraido', 'sonhando']) {
                        state.active = state.active.filter((entry) => entry !== removedKey);
                        delete state.effects[removedKey];
                    }
                }
                await roll.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    flavor: `<strong>${key.replaceAll('_', ' ')}</strong> — dano no início do turno`,
                });
                const remainingAfterTick =
                    effect?.remainingTurns === null
                        ? null
                        : Math.max(0, (effect?.remainingTurns ?? 1) - 1);
                messages.push(
                    `${key}: ${total} de dano${remainingAfterTick === null ? '' : ` · ${remainingAfterTick} turno(s) restante(s)`}`
                );
            } catch (error) {
                ui.notifications?.error?.(
                    `${actor.name}: ${key} não processado — ${error.message}`
                );
            }
        }

        if (
            (key === 'silenciado' || key === 'suprimido' || key === 'hipotermia') &&
            (await makeSave(actor, effect, key))
        ) {
            state.active = state.active.filter((entry) => entry !== key);
            delete state.effects[key];
            messages.push(`${key} removido por salvaguarda`);
            continue;
        }
        if (decrementEffect(state, key)) messages.push(`${key} expirou`);
    }

    const toxic = timing === 'start' ? actor.getFlag?.(MODULE_ID, ONI_TOXIC_PENDING) : null;
    if (toxic) {
        const combat = globalThis.game?.combat;
        const dose = toxic.combatId === (combat?.uuid ?? combat?.id) ? parseNumber(toxic.damage) : 0;
        if (dose > 0 && ignorePoison && !poisonIgnored) {
            poisonIgnored = true;
            messages.push('Decomposição ignorada pela Respiração da Recuperação');
        } else if (dose > 0) {
            const { applyOniDamage, applySlayerDamageAuto } = await import('./damage-relay.mjs');
            const apply = contract.kind === 'slayer' ? applySlayerDamageAuto : applyOniDamage;
            const result = await apply(actor, dose, {
                isAttack: false, hostile: true, cannotDodge: true, requireApproval: false,
                attackName: 'Decomposição', damageTypes: ['venenoso'],
            });
            const applied = result.appliedDamage ?? result.totalDamage ?? 0;
            messages.push(`Decomposição: ${applied} de dano venenoso`);
        }
        await actor.unsetFlag(MODULE_ID, ONI_TOXIC_PENDING);
    }

    const patch = actorStatusPatch(actor, state);
    if (recoveryFatigueExpired)
        patch['system.props.resp_recuperacao_fadiga_suspensa'] = 0;
    const resetPoisonProtection =
        ignorePoison && (poisonIgnored || !state.active.includes('envenenamento'));
    if (resetPoisonProtection)
        patch['system.props.resp_recuperacao_veneno_ignorar'] = 0;
    const stateChanged = JSON.stringify(state) !== stateBeforeTiming;
    const summaryChanged = patch[`system.props.${contract.summary}`] !== props[contract.summary];
    const exhaustionChanged =
        patch[`system.props.${contract.exhaustion}`] !==
        (Number.parseInt(props[contract.exhaustion], 10) || 0);
    const updated =
        stateChanged || summaryChanged || exhaustionChanged || recoveryFatigueExpired || resetPoisonProtection;
    if (updated) {
        await actor.update(patch, {
            naCsbAutomation: true,
            naStatusTurn: true,
        });
    }
    if (messages.length) {
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<strong>Status — ${actor.name}</strong><br>${messages.join('<br>')}`,
        });
    }
    return {
        processed: updated || messages.length > 0,
        updated,
        messages,
        state,
    };
}

export async function reconcileSlayerExhaustion(actor) {
    if (!actor?.update || resolvingExhaustion.has(actor.id)) return null;
    const props = actor.system?.props ?? {};
    const state = parseStatusState(props.status_slayer_dados);
    state.exhaustion = Math.max(
        state.exhaustion,
        Number.parseInt(props.status_slayer_exaustao, 10) || 0
    );
    state.exhaustionMilestones = state.exhaustionMilestones.filter(
        (level) => state.exhaustion >= level
    );
    const reached = [];
    let extraDamage = 0;
    const npc = actorKind(actor) === 'npc';
    const damageKey = npc ? 'npc_pdv_dano' : 'pdv_slayer_dano_tomado';
    const pdv = npc ? breathingPdvInfo(props).pdvCurrent : currentPdv(props);
    if (state.exhaustion >= 5 && !state.exhaustionMilestones.includes(5)) {
        extraDamage += Math.floor(pdv / 2);
        state.exhaustionMilestones.push(5);
        reached.push(5);
    }
    if (state.exhaustion >= 8 && !state.exhaustionMilestones.includes(8)) {
        extraDamage += Math.max(0, pdv - extraDamage);
        state.exhaustionMilestones.push(8);
        reached.push(8);
    }
    if (!reached.length) return { reached, extraDamage: 0 };
    resolvingExhaustion.add(actor.id);
    try {
        await actor.update(
            {
                ...statePatch(state),
                [`system.props.${damageKey}`]: parseNumber(props[damageKey]) + extraDamage,
            },
            { naCsbAutomation: true, naExhaustion: true }
        );
        if (reached.includes(8)) {
            const updates =
                [...(game.combats ?? [])].flatMap((combat) =>
                    [...combat.combatants]
                        .filter(
                            (combatant) => combatant.actorId === actor.id && !combatant.defeated
                        )
                        .map((combatant) => ({
                            combatant,
                            update: combatant.update({ defeated: true }),
                        }))
                ) ?? [];
            await Promise.allSettled(updates.map(({ update }) => update));
        }
        await ChatMessage.create({
            content: `<strong>Exaustão — ${actor.name}</strong><br>${reached.includes(8) ? 'Nível 8: morte.' : `Nível 5: perde ${extraDamage} PDV (metade do atual).`}`,
        });
        return { reached, extraDamage };
    } finally {
        resolvingExhaustion.delete(actor.id);
    }
}

async function processCurrentTurn(combat) {
    if (!isPrimaryGm() || !combat?.started) return;
    const combatant = combat.combatant;
    const actor = combatant?.actor;
    if (!actor) return;
    const key = `${combat.id}:${combat.round}:${combat.turn}:${combatant.id}`;
    const previousKey = combat.getFlag(MODULE_ID, TURN_FLAG);
    if (previousKey === key) return;
    const previousCombatantId = String(previousKey ?? '')
        .split(':')
        .at(-1);
    const previousActor = previousCombatantId
        ? combat.combatants.get(previousCombatantId)?.actor
        : null;
    const previousContract = previousActor ? statusContract(previousActor) : null;
    if (previousContract && previousActor.system?.props?.[previousContract.data] !== undefined) {
        await processActorStatusTiming(previousActor, 'end');
    }
    await combat.setFlag(MODULE_ID, TURN_FLAG, key);
    if (actor.getFlag?.(MODULE_ID, 'flameHeat')) {
        const { processFlameEmbers } = await import('./flame-breathing-service.mjs');
        await processFlameEmbers(actor, { turnKey: key });
    }
    const actorContract = statusContract(actor);
    if (actor.system?.props?.[actorContract.data] !== undefined)
        await processActorStatusTiming(actor, 'start');
    const poisonRaw = actor.system?.props?.[USER_POISON_STATE_KEY];
    if (poisonRaw !== undefined && poisonRaw !== '') {
        const poison = tickUserPoison(poisonRaw);
        await actor.update(userPoisonStatePatch(poison.state), {
            naCsbAutomation: true,
            naUserPoison: true,
        });
        if (poison.damage > 0) {
            const { applyOniDamage, applySlayerDamageAuto } = await import('./damage-relay.mjs');
            const kind = actorKind(actor);
            if (kind === 'slayer')
                await applySlayerDamageAuto(actor, poison.damage, {
                    isAttack: false,
                    attackName: 'Veneno do Usuário',
                    damageTypes: ['venenoso'],
                });
            else
                await applyOniDamage(actor, poison.damage, {
                    attackName: 'Veneno do Usuário',
                    rolledTotal: poison.damage,
                    damageTypes: ['venenoso'],
                    requireApproval: false,
                });
        }
    }
}

export function movementBlocked(props = {}) {
    const state = parseStatusState(props.status_slayer_dados);
    const exhaustion = Math.max(
        state.exhaustion,
        Number.parseInt(props.status_slayer_exaustao, 10) || 0
    );
    return (
        exhaustion >= 3 ||
        state.active.includes('restricao_movimentos') ||
        state.active.includes('colapso') ||
        state.active.includes('ofegante')
    );
}

export function resolveSlayerHealing(props = {}, requestedTotal = 0) {
    const state = parseStatusState(props.status_slayer_dados);
    const active = new Set(state.active);
    const exhaustion = Math.max(
        state.exhaustion,
        Number.parseInt(props.status_slayer_exaustao, 10) || 0
    );
    const current = parseNumber(props.pdv_slayer_curado);
    const delta = Math.max(0, parseNumber(requestedTotal) - current);
    const statusMultiplier =
        exhaustion >= 8
            ? 0
            : active.has('corrupcao') || active.has('regeneracao_suprimida')
              ? 0.5
              : 1;
    const poisonSuppressed = parseUserPoisonState(props[USER_POISON_STATE_KEY]).healingSuppressed;
    const afterStatus = Math.floor(delta * statusMultiplier);
    const applied = poisonSuppressed ? Math.ceil(afterStatus / 2) : afterStatus;
    const multiplier = statusMultiplier * (poisonSuppressed ? 0.5 : 1);
    return { value: current + applied, multiplier, requestedDelta: delta };
}

export function registerStatusEngine() {
    Hooks.on('combatStart', (combat) => void processCurrentTurn(combat));
    Hooks.on('updateCombat', (combat, changes) => {
        if (Object.hasOwn(changes, 'turn') || Object.hasOwn(changes, 'round'))
            void processCurrentTurn(combat);
    });
    Hooks.on('updateActor', (actor, changes, options) => {
        if (!isPrimaryGm() || options?.naExhaustion) return;
        const props = changes?.system?.props ?? {};
        if (
            Object.hasOwn(props, 'status_slayer_exaustao') ||
            Object.hasOwn(props, 'status_slayer_dados') ||
            Object.hasOwn(changes ?? {}, 'system.props.status_slayer_exaustao') ||
            Object.hasOwn(changes ?? {}, 'system.props.status_slayer_dados')
        ) {
            void reconcileSlayerExhaustion(actor);
        }
    });
    Hooks.on('preUpdateToken', (token, changes, options, userId) => {
        if (
            options?.naCsbAutomation ||
            (!Object.hasOwn(changes, 'x') && !Object.hasOwn(changes, 'y'))
        )
            return;
        if (!movementBlocked(token.actor?.system?.props)) return;
        if (userId === game.user.id)
            ui.notifications.warn(
                'Este personagem não pode usar movimento enquanto estiver enraizado ou restrito.'
            );
        return false;
    });
    Hooks.on('preUpdateActor', (actor, changes, options) => {
        if (options?.naCsbAutomation) return;
        const props = actor.system?.props ?? {};
        const nested = changes?.system?.props;
        const flatKey = 'system.props.pdv_slayer_curado';
        const requested = nested?.pdv_slayer_curado ?? changes?.[flatKey];
        if (requested === undefined) return;
        const resolution = resolveSlayerHealing(props, requested);
        if (resolution.requestedDelta <= 0) return;
        if (nested && Object.hasOwn(nested, 'pdv_slayer_curado'))
            nested.pdv_slayer_curado = resolution.value;
        else changes[flatKey] = resolution.value;
        if (resolution.multiplier < 1)
            ui.notifications.info(
                resolution.multiplier === 0
                    ? 'Exaustão 8 impede recuperação.'
                    : 'A cura recebida foi reduzida pela metade.'
            );
    });
}
