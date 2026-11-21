import { TIPOS_ACAO } from '../constants.mjs';
import { slayerClassContract } from './class-contracts.mjs';
import { dualBreathingCompositeCost, dualBreathingRankPlan } from './class-runtime.mjs';

const ACTIONS = new Set(TIPOS_ACAO.map(({ key }) => key));
const FIXED_LOSSES = new Set(['movement', 'defense', 'reach']);
const COMPOSITE_PRICES = new Set([
    'once-per-combat', 'internal-damage', 'end-posture', 'lock-secondary', 'full-action',
    'target-condition', 'next-defense-disadvantage', 'exhaustion-on-fail',
]);

const isKey = value => typeof value === 'string' && value.trim() !== '';
const isCost = value => Number.isSafeInteger(value) && value >= 0;
const fail = (reason, state) => ({ ok: false, reason, state });

function combatState(state, combatKey) {
    return state?.combatKey === combatKey ? state : { combatKey };
}

function endPosture(state) {
    return { ...state, active: false, waitingForSequence: false, lastSide: null };
}

function intermediateRank(rank, profile) {
    return profile === 'homebrew' && (rank === 'S' || rank === 'SS')
        ? dualBreathingRankPlan('S', profile) : null;
}

/** Configures a posture or ends it with mode: null. Sequence can wait for both standard techniques. */
export function planDualBreathingPosture(state, context = {}) {
    const { profile, rank, combatKey, mode, pdrAvailable, incapacitated, fixedLoss } = context;
    const rules = intermediateRank(rank, profile);
    if (!rules || !isKey(combatKey)) return fail('Forma Intermediária exige Rank S e combate ativo.', state);
    const current = combatState(state, combatKey);
    if (mode === null) return { ok: true, state: endPosture(current) };
    if (!rules.modes.includes(mode)) return fail('Escolha um modo de Forma Intermediária.', current);
    if (incapacitated || !isCost(pdrAvailable) || pdrAvailable === 0)
        return fail('Forma Intermediária exige capacidade física e PDR disponível.', endPosture(current));
    if (mode === 'fixed-stance' && !FIXED_LOSSES.has(fixedLoss))
        return fail('Postura Fixa exige escolher uma perda de movimento, defesa ou alcance.', current);
    if (current.active || current.waitingForSequence)
        return fail('Encerre a Forma Intermediária atual antes de iniciar outra.', current);

    const waitingForSequence = mode === 'sequence' && !(current.usedPrimary && current.usedSecondary);
    return { ok: true, state: {
        ...current, mode, waitingForSequence, active: !waitingForSequence, lastSide: null,
        fixedLoss: mode === 'fixed-stance' ? fixedLoss : null,
    } };
}

/** Costs already include the selected technique level and compatibility. Apply state only on use. */
export function planDualBreathingUse(state, context = {}) {
    const { profile, rank, combatKey, turnKey, side, kind, action, pdrAvailable, pdrCost,
        pdvAvailable, pdvCost = 0, incapacitated, grantsExtraAttack } = context;
    const variation = kind === 'variation';
    if (profile !== 'homebrew' || !['primary', 'secondary'].includes(side) || !['technique', 'variation'].includes(kind)
        || !ACTIONS.has(action) || (variation && (!dualBreathingRankPlan(rank, profile) || grantsExtraAttack)))
        return fail('Uso de técnica ou Variação inválido.', state);
    if (!isCost(pdrCost) || !isCost(pdrAvailable) || !isCost(pdvCost) || !isCost(pdvAvailable))
        return fail('Custos ou recursos inválidos.', state);

    const inCombat = isKey(combatKey);
    if (inCombat && !isKey(turnKey)) return fail('Identifique o turno atual do combate.', state);
    let current = inCombat ? combatState(state, combatKey) : null;
    if (incapacitated || pdrAvailable < pdrCost) {
        const postureEnded = Boolean(current?.active || current?.waitingForSequence);
        return { ...fail(incapacitated ? 'Personagem incapacitado.' : 'PDR insuficiente.',
            postureEnded ? endPosture(current) : current), postureEnded };
    }

    const rules = intermediateRank(rank, profile);
    const breaksAlternation = current?.mode === 'alternation' && current.lastSide === side;
    const active = Boolean(rules && current?.active && !breaksAlternation && pdrAvailable > 0);
    if (variation && active && action === 'completa')
        return fail('A Forma Intermediária não permite Variação como Ação Completa.', current);
    const extraPdv = variation && active && current.mode === 'overload' ? 1 : 0;
    if (pdvAvailable < pdvCost + extraPdv) return fail('PDV insuficiente.', current);
    if (!inCombat) return { ok: true, state: null, extraPdv: 0, manualLoss: null };

    const limited = variation || side === 'secondary';
    const uses = current.turnKey === turnKey && Array.isArray(current.uses) ? current.uses : [];
    if (limited && current.secondaryLockedTurn === turnKey)
        return fail('Respiração Secundária bloqueada até o próximo turno.', current);
    if (limited && uses.length && (!active || !variation || uses.some(use => !use.variation || use.action === action)
        || uses.length >= rules.variationsPerTurn))
        return fail('Limite compartilhado de técnicas da Secundária e Variações neste turno.', current);

    const manualLoss = variation && active && current.mode === 'fixed-stance' ? current.fixedLoss : null;
    if ((current.active || current.waitingForSequence) && (!rules || breaksAlternation || pdrAvailable === pdrCost))
        current = endPosture(current);
    const usedPrimary = Boolean(current.usedPrimary || (kind === 'technique' && side === 'primary'));
    const usedSecondary = Boolean(current.usedSecondary || (kind === 'technique' && side === 'secondary'));
    const completedSequence = current.waitingForSequence && usedPrimary && usedSecondary;
    return { ok: true, extraPdv, manualLoss, state: {
        ...current, turnKey, usedPrimary, usedSecondary,
        uses: limited ? [...uses, { variation, action }] : uses,
        active: Boolean(current.active || completedSequence),
        waitingForSequence: Boolean(current.waitingForSequence && !completedSequence),
        lastSide: current.active && current.mode === 'alternation' ? side : null,
    } };
}

function validSource(source, side) {
    return source?.side === side && isKey(source.itemId) && isCost(source.pdrCost)
        && Number.isInteger(source.level) && source.level >= 1 && source.level <= 4;
}

/** The caller resolves each known source and honors manual prices before committing a use. */
export function planDualBreathingComposite(state, context = {}) {
    const { profile, rank, combatKey, turnKey, primary, secondary, secondaryLevel, compatibility,
        mixType, price, pdrAvailable, pdvAvailable, incapacitated, targetMeetsCondition } = context;
    if (profile !== 'homebrew' || rank !== 'SS' || !isKey(combatKey) || !isKey(turnKey))
        return fail('Forma Composta exige Rank SS e combate ativo.', state);
    const current = combatState(state, combatKey);
    if (current.compositeUsed) return fail('Forma Composta já foi usada neste combate.', current);
    if (incapacitated) return fail('Personagem incapacitado.', endPosture(current));
    if (!validSource(primary, 'primary') || !validSource(secondary, 'secondary') || primary.itemId === secondary.itemId
        || !isCost(secondaryLevel) || secondary.level > secondaryLevel)
        return fail('Escolha uma técnica disponível de cada Respiração.', current);
    if (!['compatible', 'incompatible'].includes(compatibility))
        return fail('Defina a compatibilidade entre as Respirações.', current);
    if (!dualBreathingRankPlan('SS', profile).mixTypes.includes(mixType))
        return fail('Escolha um tipo de mistura válido.', current);
    const priceType = price?.type;
    if (!COMPOSITE_PRICES.has(priceType)) return fail('Escolha um preço para a Forma Composta.', current);
    if (priceType === 'end-posture' && !current.active)
        return fail('Este preço exige Forma Intermediária ativa.', current);
    if (priceType === 'target-condition' && (!isKey(price.condition) || targetMeetsCondition !== true))
        return fail('O alvo deve ter a condição exigida pela Forma Composta.', current);
    if (current.secondaryLockedTurn === turnKey)
        return fail('Respiração Secundária bloqueada até o próximo turno.', current);

    const surcharge = slayerClassContract('classe_usuario_de_duas_resp', profile).surcharges[compatibility];
    const cost = {
        pdr: dualBreathingCompositeCost(primary.pdrCost, secondary.pdrCost, surcharge.pdr),
        pdv: surcharge.pdv + (priceType === 'internal-damage' ? 2 : 0),
    };
    if (!isCost(pdrAvailable) || pdrAvailable < cost.pdr)
        return fail('PDR insuficiente.', endPosture(current));
    if (!isCost(pdvAvailable) || pdvAvailable < cost.pdv) return fail('PDV insuficiente.', current);

    const willEnd = priceType === 'end-posture' || pdrAvailable === cost.pdr;
    const next = willEnd ? endPosture(current) : current;
    return {
        ok: true, cost, action: priceType === 'full-action' ? 'completa' : 'especial',
        manualPrice: ['next-defense-disadvantage', 'exhaustion-on-fail'].includes(priceType) ? priceType : null,
        state: { ...next, compositeUsed: true,
            secondaryLockedTurn: priceType === 'lock-secondary' ? turnKey : next.secondaryLockedTurn ?? null },
    };
}
