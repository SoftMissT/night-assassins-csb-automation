/**
 * @fileoverview Resolução mecânica pura dos status do Slayer.
 */

import { parseStatusState } from './status-service.mjs';

function statusContext(props = {}) {
    const state = parseStatusState(props.status_slayer_dados);
    const storedExhaustion = Math.max(
        state.exhaustion,
        Number.parseInt(props.status_slayer_exaustao, 10) || 0
    );
    let exhaustionImmune = false;
    try {
        const mist =
            typeof props.resp_nevoa_estado === 'string'
                ? JSON.parse(props.resp_nevoa_estado)
                : props.resp_nevoa_estado;
        exhaustionImmune = mist?.dazzle?.exhaustionImmune === true && Number(mist.dazzle.turns) > 0;
    } catch (_) {
        exhaustionImmune = false;
    }
    return {
        active: new Set(state.active),
        exhaustion: exhaustionImmune ? 0 : storedExhaustion,
        storedExhaustion,
        exhaustionImmune,
    };
}

function lifeDeathBlocked(props = {}) {
    try {
        let raw = props.vida_morte_slayer_dados;
        if (!raw) return false;
        if (typeof raw === 'string') {
            raw = raw
                .replace(/<[^>]*>/g, '')
                .replaceAll('&quot;', '"')
                .replaceAll('&amp;', '&')
                .trim();
            const first = raw.indexOf('{');
            const last = raw.lastIndexOf('}');
            if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
            raw = JSON.parse(raw);
        }
        return Boolean(raw?.dying || raw?.dead);
    } catch {
        return false;
    }
}

export function mergeRollMode(requested = 'normal', forced = 'normal') {
    const modes = new Set(
        [requested, forced].filter((mode) => mode === 'advantage' || mode === 'disadvantage')
    );
    if (modes.size !== 1) return 'normal';
    return modes.has('advantage') ? 'advantage' : 'disadvantage';
}

function forcedMode(active, disadvantage) {
    const advantage = active.has('vantagem');
    const hasDisadvantage = active.has('desvantagem') || disadvantage;
    if (advantage === hasDisadvantage) return 'normal';
    return advantage ? 'advantage' : 'disadvantage';
}

export function getRollStatusEffects(props = {}, { test = '', attr = '', kind = 'test' } = {}) {
    const { active, exhaustion } = statusContext(props);
    const state = parseStatusState(props.status_slayer_dados);
    const attribute = String(attr).trim().toUpperCase();
    const testName = String(test).trim().toLowerCase();
    const attack = kind === 'attack';
    const defense = kind === 'defense' || testName === 'bloqueio' || testName === 'esquiva';
    const resistance = testName.includes('resist');
    const initiative = testName.includes('iniciativa');
    const reasons = [];
    let modifier = 0;
    let disadvantage = false;

    const lifeBlocked = lifeDeathBlocked(props);
    const blocked =
        lifeBlocked ||
        (!defense &&
            (active.has('atordoamento') ||
                active.has('suprimido') ||
                active.has('sonhando') ||
                exhaustion >= 7));
    const autoFail =
        !defense && active.has('paralisia') && (attribute === 'FOR' || attribute === 'DEX');
    if (blocked) reasons.push(lifeBlocked ? 'À Beira da Morte' : 'incapacitado');
    if (autoFail) reasons.push('Paralisia: falha automática');

    if (active.has('fratura') && attribute === 'FOR') {
        modifier -= 2;
        reasons.push('Fratura −2 FOR');
    }
    if (active.has('corrupcao') && attribute === 'FDV') {
        const stacks = Math.max(1, state.effects?.corrupcao?.stacks || 1);
        modifier -= stacks;
        reasons.push(`Corrupção −${stacks} FDV`);
    }
    if (exhaustion >= 2 && attribute === 'DEX') {
        modifier -= 2;
        reasons.push('Exaustão 2 −2 DEX');
    }
    if (active.has('fadiga_espiritual') && attribute === 'FDV' && resistance) {
        modifier -= 2;
        reasons.push('Fadiga Espiritual −2 resistência FDV');
    }
    if (active.has('fadiga_mental') && (attribute === 'SAB' || initiative)) {
        disadvantage = true;
        reasons.push('Fadiga Mental: Desvantagem');
    }

    if (active.has('cegueira_parcial') && (attack || defense)) {
        modifier -= 2;
        reasons.push('Cegueira Parcial −2');
    }
    if (active.has('cegueira_parcial') && attribute === 'SAB' && testName.includes('percep')) {
        disadvantage = true;
        reasons.push('Cegueira Parcial: Desvantagem visual');
    }
    if (active.has('surdez_parcial') && attribute === 'SAB' && testName.includes('percep')) {
        modifier -= 2;
        reasons.push('Surdez Parcial −2 percepção auditiva');
    }

    if (attack) {
        if (active.has('desorientado')) {
            modifier -= 2;
            reasons.push('Desorientado −2 Ataque');
        }
        if (exhaustion >= 1) {
            modifier -= 1;
            reasons.push('Exaustão 1 −1 Ataque');
        }
        if (exhaustion >= 4) {
            disadvantage = true;
            reasons.push('Exaustão 4: Desvantagem');
        }
        if (active.has('encorajado')) {
            modifier += 2;
            reasons.push('Encorajado +2 Ataque');
        }
    }

    if (defense) {
        if (active.has('desequilibrado')) {
            modifier -= 2;
            reasons.push('Desequilibrado −2 Defesa');
        }
        if (active.has('flanqueado')) {
            modifier -= 2;
            reasons.push('Flanqueado −2 Defesa');
        }
        if (active.has('encorajado') && testName === 'esquiva') {
            modifier += 1;
            reasons.push('Encorajado +1 Esquiva');
        }
    }

    if (resistance && attribute === 'FDV' && active.has('encorajado')) {
        modifier += 2;
        reasons.push('Encorajado +2 FDV');
    }
    if (initiative && active.has('encorajado')) {
        modifier += 1;
        reasons.push('Encorajado +1 Iniciativa');
    }

    return {
        blocked,
        autoFail,
        mode: forcedMode(active, disadvantage),
        modifier,
        reasons,
        exhaustion,
    };
}

export function getDamageStatusEffects(props = {}) {
    const { active, exhaustion } = statusContext(props);
    const reasons = [];
    let modifier = 0;
    let pdrSurcharge = 0;
    if (exhaustion >= 1) {
        modifier -= 1;
        reasons.push('Exaustão 1 −1 Dano');
    }
    if (active.has('fadiga_espiritual')) {
        pdrSurcharge = 1;
        reasons.push('Fadiga Espiritual +1 PDR');
    }
    const criticalAllowed = !active.has('fadiga_corporal');
    if (!criticalAllowed) reasons.push('Fadiga Corporal impede crítico');
    const blocked =
        lifeDeathBlocked(props) ||
        active.has('atordoamento') ||
        active.has('suprimido') ||
        active.has('sonhando') ||
        exhaustion >= 7;
    return { blocked, criticalAllowed, modifier, pdrSurcharge, reasons };
}

export function isReactionBlocked(props = {}) {
    const { active, exhaustion } = statusContext(props);
    return (
        lifeDeathBlocked(props) ||
        exhaustion >= 7 ||
        [
            'atordoamento',
            'suprimido',
            'sonhando',
            'frenesi',
            'desorientado',
            'distraido',
            'sem_reacao',
        ].some((key) => active.has(key))
    );
}

export function getStatusCapabilities(props = {}) {
    const state = parseStatusState(props.status_slayer_dados);
    const active = new Set(state.active);
    const exhaustion = Math.max(
        state.exhaustion,
        Number.parseInt(props.status_slayer_exaustao, 10) || 0
    );
    const hypothermiaStacks = active.has('hipotermia')
        ? Math.max(1, state.effects?.hipotermia?.stacks || 1)
        : 0;
    const lifeBlocked = lifeDeathBlocked(props);
    return {
        targetable: !active.has('invisivel_inalvejavel'),
        movementAllowed: !(
            lifeBlocked ||
            exhaustion >= 3 ||
            active.has('restricao_movimentos') ||
            active.has('colapso')
        ),
        movementMultiplier: active.has('fratura') ? 0.5 : 1,
        movementPenaltyMeters:
            hypothermiaStacks > 0 ? 3 + Math.max(0, hypothermiaStacks - 1) * 1.5 : 0,
        spiritualActionsAllowed: !lifeBlocked && !active.has('silenciado'),
        sprintAllowed: !active.has('fadiga_corporal'),
        healingMultiplier: active.has('corrupcao') || active.has('regeneracao_suprimida') ? 0.5 : 1,
        incomingDemonicDamageBonus: active.has('corrupcao') ? 2 : 0,
        reactionsAllowed: !lifeBlocked && !isReactionBlocked(props),
        ignoresFear: active.has('encorajado') || active.has('frenesi'),
        ignoresConfusion: active.has('encorajado'),
        deadFromExhaustion: exhaustion >= 8,
    };
}
