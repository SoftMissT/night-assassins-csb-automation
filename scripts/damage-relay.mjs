import { MASTER_BATTLE_BLEEDING, MODULE_ID } from './constants.mjs';
import { parseNumber } from './parsing.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import { isHomebrewExtra, ruleVariant, vanillaRuleSelection } from './rules-profile.mjs';
import { applySlayerDamage, buildWindBattleDamagePatch, recordResolvedPdvLoss } from './status-engine.mjs';
import { mitigateBreathingPassiveDamage } from './breathing-defense.mjs';
import { addFlameEnemyHeat, FLAME_HEAT_FLAG } from './flame-breathing-service.mjs';
import { formatStatusSummary, parseStatusState, statusKeysForProps } from './status-service.mjs';
import { actorKind, isSlayerActor } from './actor-kind.mjs';
import { releaseSnowRestriction } from './snow-breathing-service.mjs';
import { resolveActorReference } from './core/combat-context.mjs';
import { companionResistance, pendingCompanionInterception } from './slayer/companion-oni-service.mjs';
import { masterBattleBenefits, masterBattleCriticalPlan } from './slayer/master-battle-rules.mjs';
import { weaponProfilesForActor } from './weapon-service.mjs';
import { mitigateOniPoisonDamage, oniSpecializationAbility, ONI_TOXIC_PENDING, TOXIC } from './oni/specialization-rules.mjs';

const SOCKET_NAME = `module.${MODULE_ID}`;
const DAMAGE_KEY = 'pdv_oni_dano_tomado';
const WOUND_KEY = 'pdv_oni_dano_ferida';
const REQUEST_TYPE = 'applyOniDamage';
const RESPONSE_TYPE = 'applyOniDamageResult';
const SLAYER_REQUEST_TYPE = 'applySlayerDamage';
const SLAYER_RESPONSE_TYPE = 'applySlayerDamageResult';
const REQUEST_TIMEOUT_MS = 60000;

const pendingRequests = new Map();
const interceptingDamage = new Set();

export const DAMAGE_TYPES = Object.freeze([
    ['cortante', 'Cortante'],
    ['perfurante', 'Perfurante'],
    ['concussao', 'Concussão'],
    ['trovejante', 'Trovejante'],
    ['sonoro', 'Sonoro'],
    ['ferida', 'Ferida'],
    ['sangramento', 'Sangramento'],
    ['envenenamento', 'Envenenamento'],
    ['necrotico', 'Necrótico'],
    ['acido', 'Ácido'],
    ['colapso', 'Colapso'],
    ['congelante', 'Congelante'],
    ['eletrico', 'Elétrico'],
    ['fogo', 'Fogo'],
    ['impacto', 'Impacto'],
    ['mental', 'Mental'],
    ['solar', 'Solar'],
    ['venenoso', 'Venenoso'],
]);

function normalizeDamageContext(context = {}) {
    const allowed = new Set(DAMAGE_TYPES.map(([key]) => key));
    const components = Array.isArray(context.components)
        ? context.components.slice(0, 12).map((component, index) => ({
              label: String(component?.label ?? `Dano ${index + 1}`).slice(0, 80),
              types: [
                  ...new Set(
                      Array.isArray(component?.types)
                          ? component.types.filter((key) => allowed.has(key))
                          : []
                  ),
              ],
              subtotal: Math.max(0, Math.trunc(Number(component?.subtotal) || 0)),
          }))
        : [];
    return {
        attackName: String(context.attackName ?? 'Dano').slice(0, 120),
        critical: context.critical === true,
        isAttack: context.isAttack !== false,
        isDemonic: context.isDemonic === true,
        rolledTotal: Math.max(0, Math.trunc(Number(context.rolledTotal) || 0)),
        damageTypes: [
            ...new Set(
                Array.isArray(context.damageTypes)
                    ? context.damageTypes.filter((key) => allowed.has(key))
                    : []
            ),
        ],
        components,
        requireApproval: context.requireApproval === true,
        ignoreResistance: context.ignoreResistance === true,
        sourceActorUuid: typeof context.sourceActorUuid === 'string' ? context.sourceActorUuid.slice(0, 256) : '',
        companionSlayerUuid: typeof context.companionSlayerUuid === 'string'
            ? context.companionSlayerUuid.slice(0, 256) : '',
        attackTotal: Number.isFinite(context.attackTotal) ? context.attackTotal : null,
        hostile: context.hostile === true,
        masterBattleCritical: ['FOR', 'DEX'].includes(context.masterBattleCritical?.attribute) &&
            typeof context.masterBattleCritical.weaponId === 'string' && context.masterBattleCritical.weaponId.length <= 64
            ? {
                  attribute: context.masterBattleCritical.attribute,
                  weaponId: context.masterBattleCritical.weaponId,
                  injury: ['tendon', 'open-guard', 'deep-impact'].includes(context.masterBattleCritical.injury)
                      ? context.masterBattleCritical.injury : null,
              } : null,
        oniToxicUnarmedCritical: context.oniToxicUnarmedCritical === true,
        cannotDodge: context.cannotDodge === true,
        flame:
            context.flame && typeof context.flame === 'object'
                ? {
                      sourceId: String(context.flame.sourceId ?? '').slice(0, 64),
                      heat: Math.max(0, Math.min(5, Math.trunc(Number(context.flame.heat) || 0))),
                      knockdownDc: Math.max(0, Math.min(1000, Math.trunc(Number(context.flame.knockdownDc) || 0))),
                      blockPenalty: Math.max(
                          -10,
                          Math.min(0, Math.trunc(Number(context.flame.blockPenalty) || 0))
                      ),
                      blockPenaltyTurns: Math.max(
                          0,
                          Math.min(10, Math.trunc(Number(context.flame.blockPenaltyTurns) || 0))
                      ),
                      exhaustionOnHit: Math.max(
                          0,
                          Math.min(2, Math.trunc(Number(context.flame.exhaustionOnHit) || 0))
                      ),
                      exhaustionOverDamage: Math.max(
                          0,
                          Math.min(
                              1000,
                              Math.trunc(Number(context.flame.exhaustionOverDamage) || 0)
                          )
                      ),
                  }
                : null,
    };
}

async function applyFlameAfterDamage(actor, context, appliedDamage) {
    if (!isHomebrewExtra('brasas')) return null;
    const flame = context.flame;
    if (!flame?.sourceId || flame.heat < 1) return null;
    const heatMap = actor.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG) ?? {};
    const heat = addFlameEnemyHeat(heatMap, flame.sourceId, flame.heat);
    await actor.setFlag(MODULE_ID, FLAME_HEAT_FLAG, heat.state);

    const slayer = isSlayerActor(actor);
    const prefix = slayer || actorKind(actor) === 'npc' ? 'status_slayer' : 'status_oni';
    const dataKey = `${prefix}_dados`;
    const exhaustionKey = `${prefix}_exaustao`;
    const props = actor.system?.props ?? {};
    const status = parseStatusState(props[dataKey]);
    const thresholdExhaustion = heat.thresholds.filter((value) =>
        [5, 20, 40].includes(value)
    ).length;
    const conditionalExhaustion =
        flame.exhaustionOnHit +
        (flame.exhaustionOverDamage > 0 && appliedDamage > flame.exhaustionOverDamage ? 1 : 0);
    const patch = {};
    if (thresholdExhaustion + conditionalExhaustion > 0) {
        status.exhaustion = Math.min(
            8,
            Math.max(status.exhaustion, Number(props[exhaustionKey]) || 0) +
                thresholdExhaustion +
                conditionalExhaustion
        );
        patch[`system.props.${exhaustionKey}`] = status.exhaustion;
    }
    if (heat.thresholds.includes(50)) {
        if (!status.active.includes('atordoamento')) status.active.push('atordoamento');
        status.effects.atordoamento = {
            remainingTurns: 2,
            tick: 'end',
            sourceName: 'Brasas Ardentes 50',
        };
    }
    let knockedDown = false;
    if (flame.knockdownDc > 0) {
        const vit = resolveSheetAttribute(actor, 'VIT') ?? 0;
        const save = await Roll.create(`1d20 + (${vit})`).evaluate();
        knockedDown = save.total < flame.knockdownDc;
        await save.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `Universo Flamejante · VIT CD ${flame.knockdownDc} · ${knockedDown ? 'Derrubado' : 'Permanece de pé'}`,
        });
        if (knockedDown && !status.active.includes('derrubado')) status.active.push('derrubado');
    }
    if (thresholdExhaustion + conditionalExhaustion > 0 || heat.thresholds.includes(50) || knockedDown) {
        patch[`system.props.${dataKey}`] = JSON.stringify(status);
        patch[`system.props.${prefix}_resumo`] = formatStatusSummary(status.active, status.exhaustion);
    }
    if (flame.blockPenalty < 0 && flame.blockPenaltyTurns > 0) {
        await actor.setFlag(MODULE_ID, 'flameBlockPenalty', {
            value: flame.blockPenalty,
            turns: flame.blockPenaltyTurns,
        });
    }
    if (Object.keys(patch).length)
        await actor.update(patch, { naCsbAutomation: true, naFlameHeat: true });
    return { heat: heat.heat, thresholds: heat.thresholds };
}

export function calculateApprovedDamage(amount, resisted = false) {
    const damage = Math.max(0, Math.trunc(Number(amount) || 0));
    return resisted ? Math.floor(damage / 2) : damage;
}

function activePrimaryGM() {
    return (
        game.users
            ?.filter((user) => user.active && user.isGM)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null
    );
}

function splitDamage(amount, context, selectedTypes, resisted) {
    const hasComponents = context.components.length > 0;
    const woundRequested = hasComponents
        ? context.components
              .filter((component) => component.types.includes('ferida'))
              .reduce((total, component) => total + component.subtotal, 0)
        : selectedTypes.includes('ferida')
          ? amount
          : 0;
    const boundedWound = selectedTypes.includes('ferida')
        ? Math.min(amount, woundRequested || (!hasComponents ? amount : 0))
        : 0;
    const normalRequested = amount - boundedWound;
    return {
        normalDamage: calculateApprovedDamage(normalRequested, resisted),
        woundDamage: calculateApprovedDamage(boundedWound, resisted),
    };
}

// Chave de dano por tipo de alvo: Oni completo usa as chaves históricas da
// ficha Oni; Oni Minion usa as chaves do próprio template de minion.
function damageKeysFor(actor) {
    const kind = actorKind(actor);
    if (kind === 'oni_minion') {
        return { damage: 'oni_minion_pdv_dano', wound: 'oni_minion_pdv_dano' };
    }
    if (kind === 'npc') {
        return { damage: 'npc_pdv_dano', wound: 'npc_pdv_dano' };
    }
    return { damage: DAMAGE_KEY, wound: WOUND_KEY };
}

async function updateOniDamage(actor, normalDamage, woundDamage = 0, context = {}) {
    const props = { ...actor.system?.props };
    normalDamage = mitigateOniPoisonDamage(props, normalDamage, context);
    const mitigation = mitigateBreathingPassiveDamage(props, normalDamage, woundDamage, {
        ...context, typedResistance: actorKind(actor) === 'oni' ? companionResistance(actor) : '',
    });
    ({ normalDamage, woundDamage } = mitigation);
    const keys = damageKeysFor(actor);
    const current = parseNumber(actor.system?.props?.[keys.damage]);
    const currentWounds = parseNumber(actor.system?.props?.[keys.wound]);
    const sharedDamageKey = keys.damage === keys.wound;
    const total = current + normalDamage + (sharedDamageKey ? woundDamage : 0);
    const woundTotal = currentWounds + woundDamage;
    const patch = { [`system.props.${keys.damage}`]: total };
    if (context.companion)
        patch[context.companion.key] = { ...context.companion.state, pending: false };
    if (!sharedDamageKey && woundDamage > 0) patch[`system.props.${keys.wound}`] = woundTotal;
    if (actorKind(actor) === 'npc')
        Object.assign(patch, buildWindBattleDamagePatch(actor, actor.system?.props ?? {}, {
            ...context, normalDamage, woundDamage,
        }));
    await actor.update(patch, { naCsbAutomation: true });
    if (normalDamage + woundDamage > 0) await releaseSnowRestriction(actor);
    const pdvLost = await recordResolvedPdvLoss(actor, props, normalDamage + woundDamage, context);
    return { total, woundTotal, normalDamage, woundDamage, pdvLost,
        concussionDamage: mitigation.concussionDamage, appliedDamage: normalDamage + woundDamage };
}

async function applyResolvedOniDamage(actor, normalDamage, woundDamage, context) {
    if (!context.companionSlayerUuid) return updateOniDamage(actor, normalDamage, woundDamage, context);
    if (!game.user.isGM || interceptingDamage.has(actor.uuid))
        throw new Error('O GM precisa resolver uma interceptação por vez.');
    interceptingDamage.add(actor.uuid);
    try {
        const slayer = await resolveActorReference(context.companionSlayerUuid);
        const companion = slayer && pendingCompanionInterception(slayer, context);
        if (!companion || companion.oni.uuid !== actor.uuid)
            throw new Error('A interceptação não está mais disponível.');
        const result = await updateOniDamage(actor, normalDamage, woundDamage, { ...context, companion });
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: '<p><strong>Cercar &amp; Proteger</strong> · ' + escapeHtml(actor.name) +
                ' interceptou um acerto contra ' + escapeHtml(slayer.name) + '.</p>',
        });
        return result;
    } finally {
        interceptingDamage.delete(actor.uuid);
    }
}

async function validateDamageSource(context, requester) {
    if (!context.hostile || requester.isGM) return;
    const document = context.sourceActorUuid ? await fromUuid(context.sourceActorUuid) : null;
    const source = document?.actor ?? document;
    if (!source?.testUserPermission?.(requester, 'OWNER')) context.hostile = false;
}

async function queueToxicCritical(target, context) {
    if (!context.oniToxicUnarmedCritical || !context.critical || !context.hostile || !context.sourceActorUuid) return;
    const combat = game.combat;
    if (!combat?.started || ![...(combat.combatants ?? [])].some(entry => entry.actor?.uuid === target.uuid)) return;
    const document = await fromUuid(context.sourceActorUuid);
    const source = document?.actor ?? document;
    if (!source || source.uuid === target.uuid || (!game.user.isGM && !source.isOwner)) return;
    const poison = oniSpecializationAbility(source.system?.props, TOXIC, 'C')?.criticalPoison;
    if (!poison) return;
    const combatId = combat.uuid ?? combat.id;
    const pending = target.getFlag(MODULE_ID, ONI_TOXIC_PENDING);
    const current = pending?.combatId === combatId ? Math.max(0, parseNumber(pending.damage)) : 0;
    await target.setFlag(MODULE_ID, ONI_TOXIC_PENDING, { combatId, damage: current + poison });
}

function tacticalInjuryPatch(target, injury, sourceActorUuid) {
    if (!['tendon', 'open-guard'].includes(injury?.id)) return {};
    const combat = globalThis.game?.combat;
    const combatKey = combat?.uuid ?? combat?.id;
    if (!combat?.started || !combatKey || !Number.isInteger(combat.round) || !Number.isInteger(combat.turn)) return {};
    const turn = combat.turns?.findIndex(entry => entry.actor?.uuid === target.uuid) ?? -1;
    if (turn < 0) return {};
    const expiresAt = injury.id === 'tendon' ? { round: combat.round + (turn > combat.turn ? 0 : 1), turn } : null;
    return { [`flags.${MODULE_ID}.masterBattleTacticalInjury`]: { id: injury.id, combatKey, sourceActorUuid, expiresAt } };
}

async function applyMasterBattleCritical(target, context, appliedDamage) {
    const choice = context.masterBattleCritical;
    if (!choice || !(appliedDamage > 0) || !context.isAttack || !context.critical || !context.hostile || !context.sourceActorUuid) return;
    try {
        const source = await resolveActorReference(context.sourceActorUuid);
        if (!isSlayerActor(source) || source.uuid === target.uuid || (!game.user.isGM && !source.isOwner)) return;
        const sourceProps = source.system?.props ?? {};
        const item = source.items?.get?.(choice.weaponId);
        if (!item?.system?.props || !weaponProfilesForActor(item.system.props, sourceProps).some(profile => profile.proficiente === true)) return;
        const benefits = masterBattleBenefits(sourceProps);
        if (benefits?.profile === 'homebrew' && !choice.injury) return;
        const plan = masterBattleCriticalPlan(benefits, {
            ...choice,
            attributeValue: Math.trunc(resolveSheetAttribute(source, choice.attribute.toLowerCase()) ?? 0),
            isBasic: true, isProficient: true, isCritical: true,
        });
        if (!plan) return;
        const patch = tacticalInjuryPatch(target, plan.injury, source.uuid);
        if (plan.bleeding) {
            const contactDamageBonus = ruleVariant('metal') === 'vanilla'
                ? vanillaRuleSelection(sourceProps, 'metal')?.contactDamage ?? 0 : 0;
            const props = target.system?.props ?? {};
            const contract = statusKeysForProps(props);
            const state = parseStatusState(props[contract.data]);
            state.exhaustion = Math.max(state.exhaustion, Number.parseInt(props[contract.exhaustion], 10) || 0);
            if (!state.active.includes(MASTER_BATTLE_BLEEDING)) state.active.push(MASTER_BATTLE_BLEEDING);
            state.effects[MASTER_BATTLE_BLEEDING] = {
                damageFormula: contactDamageBonus
                    ? `${plan.bleeding.formula} + ${contactDamageBonus}` : plan.bleeding.formula,
                remainingTurns: plan.bleeding.turns,
                tick: 'start', sourceName: 'Crítico Brutal',
            };
            patch[`system.props.${contract.data}`] = JSON.stringify(state);
            patch[`system.props.${contract.summary}`] = formatStatusSummary(state.active, state.exhaustion);
        }
        if (Object.keys(patch).length) await target.update(patch, { naCsbAutomation: true });
    } catch (error) {
        ui.notifications?.warn?.('O dano foi aplicado, mas o efeito de Crítico Brutal falhou.');
        console.warn?.(`[${MODULE_ID}] Falha no efeito de Crítico Brutal`, error);
    }
}

function emitResult(recipientId, requestId, result) {
    game.socket.emit(SOCKET_NAME, {
        type: RESPONSE_TYPE,
        recipientId,
        requestId,
        ...result,
    });
}

function emitSlayerResult(recipientId, requestId, result) {
    game.socket.emit(SOCKET_NAME, {
        type: SLAYER_RESPONSE_TYPE,
        recipientId,
        requestId,
        ...result,
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export async function requestDamageApproval(
    actor,
    requester,
    amount,
    currentDamage,
    rawContext = {}
) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const context = normalizeDamageContext(rawContext);
    const typeOptions = DAMAGE_TYPES.map(([key, label]) => {
        const checked = context.damageTypes.includes(key) ? 'checked' : '';
        return `<label class="na-relay-type"><input type="checkbox" name="damageType" value="${key}" ${checked}><span>${label}</span></label>`;
    }).join('');
    const typeLabels = new Map(DAMAGE_TYPES);
    const componentRows =
        context.components.length > 0
            ? context.components
                  .map(
                      (component) =>
                          `<tr><td>${escapeHtml(component.label)}</td><td>${escapeHtml(component.types.map((key) => typeLabels.get(key) ?? key).join(' · ') || 'Sem tipo')}</td><td style="text-align:right"><strong>${component.subtotal}</strong></td></tr>`
                  )
                  .join('')
            : `<tr><td>Dano</td><td>${escapeHtml(context.damageTypes.map((key) => typeLabels.get(key) ?? key).join(' · ') || 'Sem tipo')}</td><td style="text-align:right"><strong>${amount}</strong></td></tr>`;
    const resistanceControl = context.ignoreResistance
        ? `<div class="form-group"><label>Resistência</label><div class="form-fields"><strong>Ignorada pela técnica</strong></div></div>`
        : `<div class="form-group"><label>Resistência</label><div class="form-fields"><select name="damageResistance"><option value="normal">Sem resistência</option><option value="resisted">Resistente · metade</option></select></div></div>`;

    return DialogV2.wait({
        window: { title: 'Autorizar dano no inimigo' },
        position: { width: 680, height: 'auto' },
        modal: true,
        rejectClose: false,
        content: `
      <fieldset>
        <legend>Pedido de dano</legend>
        <div class="form-group"><label>Jogador</label><div class="form-fields"><strong>${escapeHtml(requester.name)}</strong></div></div>
        <div class="form-group"><label>Alvo</label><div class="form-fields"><strong>${escapeHtml(actor.name)}</strong></div></div>
        <div class="form-group"><label>Ataque</label><div class="form-fields"><strong>${escapeHtml(context.attackName)}</strong></div></div>
        <div class="form-group"><label>Dano atual</label><div class="form-fields"><span>${currentDamage}</span></div></div>
        <div class="form-group"><label>Dano solicitado</label><div class="form-fields"><strong>${amount}</strong>${context.critical ? `<span class="tag">Crítico · base ${context.rolledTotal}</span>` : ''}</div></div>
        ${context.masterBattleCritical && context.hostile && context.critical ? '<p>Inclui efeitos de Crítico Brutal.</p>' : ''}
        <table style="width:100%;margin-top:8px"><thead><tr><th style="text-align:left">Parte</th><th style="text-align:left">Tipo</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${componentRows}</tbody></table>
      </fieldset>
      <fieldset>
        <legend>Resolução</legend>
        ${resistanceControl}
        <label>Tipo(s) de dano</label>
        <div class="na-relay-types" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:6px;">${typeOptions}</div>
      </fieldset>
      <p class="hint">${context.ignoreResistance ? 'Esta técnica ignora resistência.' : 'O crítico já está incluído no dano solicitado. A resistência é aplicada depois dele.'}</p>`,
        buttons: [
            {
                action: 'deny',
                label: 'Recusar',
                callback: () => ({ approved: false }),
            },
            {
                action: 'approve',
                label: 'Autorizar e aplicar',
                default: true,
                callback: (_event, _button, dialog) => {
                    const root = dialog.element;
                    const resisted = context.ignoreResistance
                        ? false
                        : root.querySelector('[name="damageResistance"]')?.value === 'resisted';
                    const damageTypes = [
                        ...root.querySelectorAll('[name="damageType"]:checked'),
                    ].map((input) => input.value);
                    const breakdown = splitDamage(amount, context, damageTypes, resisted);
                    const appliedDamage = breakdown.normalDamage + breakdown.woundDamage;
                    return {
                        approved: true,
                        resisted,
                        damageTypes,
                        appliedDamage,
                        ...breakdown,
                        projectedTotal: currentDamage + appliedDamage,
                    };
                },
            },
        ],
    });
}

async function handleDamageRequest(message) {
    if (!game.user.isGM || message.gmId !== game.user.id) return;

    const requester = game.users.get(message.requesterId);
    const amount = Math.trunc(Number(message.amount));
    const context = normalizeDamageContext(message.context);
    if (!requester?.active || !Number.isSafeInteger(amount) ||
        amount < (context.companionSlayerUuid ? 0 : 1) || amount > 100000) {
        emitResult(message.requesterId, message.requestId, {
            ok: false,
            error: 'Pedido de dano inválido.',
        });
        return;
    }

    const document = await fromUuid(message.actorUuid);
    const actor = document?.actor ?? document;
    if (!actor || actor.documentName !== 'Actor') {
        emitResult(message.requesterId, message.requestId, {
            ok: false,
            error: 'Actor alvo não encontrado.',
        });
        return;
    }

    try {
        const currentDamage = parseNumber(actor.system?.props?.[damageKeysFor(actor).damage]);
        await validateDamageSource(context, requester);
        const approval = await requestDamageApproval(
            actor,
            requester,
            amount,
            currentDamage,
            context
        );
        if (!approval?.approved) {
            emitResult(message.requesterId, message.requestId, {
                ok: false,
                error: `O GM recusou o pedido de ${amount} de dano em ${actor.name}.`,
            });
            return;
        }

        const result = await applyResolvedOniDamage(
            actor,
            approval.normalDamage,
            approval.woundDamage,
            { ...context, approvedTypes: approval.damageTypes, approvalResisted: approval.resisted }
        );
        const flame = await applyFlameAfterDamage(actor, context, result.appliedDamage);
        await applyMasterBattleCritical(actor, context, result.appliedDamage);
        await queueToxicCritical(actor, context);
        emitResult(message.requesterId, message.requestId, {
            ok: true,
            ...result,
            actorName: actor.name,
            resisted: approval.resisted,
            damageTypes: approval.damageTypes,
            flame,
        });
    } catch (error) {
        emitResult(message.requesterId, message.requestId, {
            ok: false,
            error: error?.message || 'Falha ao atualizar o Oni.',
        });
    }
}

async function handleSlayerDamageRequest(message) {
    if (!game.user.isGM || message.gmId !== game.user.id) return;
    const requester = game.users.get(message.requesterId);
    const amount = Math.trunc(Number(message.amount));
    if (!requester?.active || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000) {
        emitSlayerResult(message.requesterId, message.requestId, {
            ok: false,
            error: 'Pedido de dano inválido.',
        });
        return;
    }
    const document = await fromUuid(message.actorUuid);
    const actor = document?.actor ?? document;
    if (!actor || actor.documentName !== 'Actor') {
        emitSlayerResult(message.requesterId, message.requestId, {
            ok: false,
            error: 'Slayer alvo não encontrado.',
        });
        return;
    }
    try {
        const context = normalizeDamageContext(message.context);
        await validateDamageSource(context, requester);
        const result = await applySlayerDamage(actor, amount, context);
        const flame = await applyFlameAfterDamage(
            actor,
            context,
            result.appliedDamage ?? result.totalDamage ?? amount
        );
        await applyMasterBattleCritical(actor, context, result.appliedDamage ?? result.totalDamage);
        await queueToxicCritical(actor, context);
        emitSlayerResult(message.requesterId, message.requestId, { ok: true, ...result, flame });
    } catch (error) {
        emitSlayerResult(message.requesterId, message.requestId, {
            ok: false,
            error: error?.message || 'Falha ao atualizar o Slayer.',
        });
    }
}

function handleDamageResponse(message) {
    if (message.recipientId !== game.user.id) return;
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    pendingRequests.delete(message.requestId);
    message.ok ? pending.resolve(message) : pending.reject(new Error(message.error));
}

export function registerDamageRelay() {
    game.socket.on(SOCKET_NAME, (message = {}) => {
        if (message.type === REQUEST_TYPE) void handleDamageRequest(message);
        if (message.type === SLAYER_REQUEST_TYPE) void handleSlayerDamageRequest(message);
        if (message.type === RESPONSE_TYPE || message.type === SLAYER_RESPONSE_TYPE)
            handleDamageResponse(message);
    });
}

export async function applySlayerDamageAuto(actor, amount, rawContext = {}) {
    const damage = Math.trunc(Number(amount));
    const context = normalizeDamageContext(rawContext);
    if (!actor || !Number.isSafeInteger(damage) || damage <= 0)
        throw new Error('Slayer alvo ou dano inválido.');
    if (game.user.isGM || actor.isOwner) {
        const result = await applySlayerDamage(actor, damage, context);
        const flame = await applyFlameAfterDamage(
            actor,
            context,
            result.appliedDamage ?? result.totalDamage ?? damage
        );
        await applyMasterBattleCritical(actor, context, result.appliedDamage ?? result.totalDamage);
        await queueToxicCritical(actor, context);
        return { ...result, flame };
    }

    const gm = activePrimaryGM();
    if (!gm) throw new Error('Nenhum GM ativo para aplicar o dano no Slayer.');
    const requestId = foundry.utils.randomID();
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error('O GM não respondeu ao dano do Slayer.'));
        }, REQUEST_TIMEOUT_MS);
        pendingRequests.set(requestId, { resolve, reject, timeoutId });
        game.socket.emit(SOCKET_NAME, {
            type: SLAYER_REQUEST_TYPE,
            requestId,
            requesterId: game.user.id,
            gmId: gm.id,
            actorUuid: actor.uuid,
            amount: damage,
            context,
        });
    });
}

export async function applyOniDamage(actor, amount, rawContext = {}) {
    const damage = Math.trunc(Number(amount));
    const context = normalizeDamageContext(rawContext);
    if (!actor || !Number.isSafeInteger(damage) || damage < (context.companionSlayerUuid ? 0 : 1)) {
        throw new Error('Actor alvo ou dano inválido.');
    }

    if ((game.user.isGM || actor.isOwner) && !(context.requireApproval && !game.user.isGM)) {
        let breakdown = splitDamage(damage, context, context.damageTypes, false);
        let resolution = { resisted: false, damageTypes: context.damageTypes };
        if (context.requireApproval && game.user.isGM) {
            const currentDamage = parseNumber(actor.system?.props?.[damageKeysFor(actor).damage]);
            const approval = await requestDamageApproval(
                actor,
                game.user,
                damage,
                currentDamage,
                context
            );
            if (!approval?.approved) throw new Error(`O dano em ${actor.name} foi cancelado.`);
            breakdown = { normalDamage: approval.normalDamage, woundDamage: approval.woundDamage };
            resolution = approval;
        }
        const result = await applyResolvedOniDamage(
            actor,
            breakdown.normalDamage,
            breakdown.woundDamage,
            { ...context, approvedTypes: resolution.approved ? resolution.damageTypes : undefined,
                approvalResisted: resolution.resisted }
        );
        const flame = await applyFlameAfterDamage(actor, context, result.appliedDamage);
        await applyMasterBattleCritical(actor, context, result.appliedDamage);
        await queueToxicCritical(actor, context);
        return {
            ok: true,
            ...result,
            actorName: actor.name,
            resisted: resolution.resisted,
            damageTypes: resolution.damageTypes,
            flame,
        };
    }

    const gm = activePrimaryGM();
    if (!gm) throw new Error('Nenhum GM ativo para aplicar o dano no Oni.');

    const requestId = foundry.utils.randomID();
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error('O GM não respondeu ao pedido de dano.'));
        }, REQUEST_TIMEOUT_MS);
        pendingRequests.set(requestId, { resolve, reject, timeoutId });
        game.socket.emit(SOCKET_NAME, {
            type: REQUEST_TYPE,
            requestId,
            requesterId: game.user.id,
            gmId: gm.id,
            actorUuid: actor.uuid,
            amount: damage,
            context,
        });
    });
}

export const DAMAGE_RELAY_KEY = DAMAGE_KEY;
export const WOUND_DAMAGE_KEY = WOUND_KEY;
