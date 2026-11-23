import { actorKind } from './actor-kind.mjs';
import { parseNumber } from './parsing.mjs';
import { breathingPdvInfo, breathingResourceKeys } from './actor-resources.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { clampExhaustion, formatStatusSummary, parseStatusState } from './status-service.mjs';
import { isHomebrewExtra, ruleVariant } from './rules-profile.mjs';
import { MODULE_ID, configKey } from './constants.mjs';

export const DREAM_EXCHANGE_FLAG = 'dreamExchange';
export const VANILLA_DREAM_EXCHANGE_MAX_USES = 3;

const pending = new Set();

/**
 * Livro base p. 58: 1×/dia, ao receber dano letal, custa SAB permanente (1, depois 2, depois 3;
 * não há quarta vez) e a alma volta com 1 PDV. Sem Exaustão, sem memória.
 * @returns {{ ok: boolean, cost: number, reason?: string }}
 */
export function planVanillaDreamExchange({ uses = 0, usedToday = false, sab = 0 } = {}) {
    const done = Math.max(0, Math.trunc(Number(uses) || 0));
    if (done >= VANILLA_DREAM_EXCHANGE_MAX_USES)
        return { ok: false, cost: 0, reason: 'A Troca Equivalente não pode ser ativada uma quarta vez.' };
    if (usedToday) return { ok: false, cost: done + 1, reason: 'A Troca Equivalente já foi usada hoje.' };
    const cost = done + 1;
    if (Math.trunc(Number(sab) || 0) < cost)
        return { ok: false, cost, reason: `Sabedoria insuficiente: a Troca custa ${cost} de SAB.` };
    return { ok: true, cost };
}

/** 'vanilla' (livro base), 'homebrew' (extra ligado) ou null (desligada). */
export function dreamExchangeMode() {
    if (ruleVariant('respiracao') === 'vanilla') return 'vanilla';
    return isHomebrewExtra('sonhos') && isHomebrewExtra('troca_equivalente') ? 'homebrew' : null;
}

function sabBaseKey(actor) {
    return actorKind(actor) === 'npc' ? 'npc_sab_base' : configKey('slayer', 'sab');
}

async function attemptVanillaDreamExchange(actor) {
    const eligible = () => {
        const props = actor.system?.props ?? {};
        const resources = breathingPdvInfo(props);
        const record = actor.getFlag?.(MODULE_ID, DREAM_EXCHANGE_FLAG) ?? {};
        const plan = planVanillaDreamExchange({ uses: record.uses, usedToday: record.usedToday, sab: parseNumber(props[sabBaseKey(actor)]) });
        return { props, resources, record, plan, valid: hasBreathingPassive(props, 'Sonhos') &&
            resources.pdvMax > 0 && resources.pdvRaw <= 0 };
    };
    const before = eligible();
    if (!before.valid) return false;
    if (!before.plan.ok) {
        ui.notifications?.warn?.(before.plan.reason);
        return false;
    }
    const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Troca Equivalente — Sonhos' },
        content: `<p>Voltar com <strong>1 PDV</strong> ofertando suas memórias ao Domínio dos Sonhos?</p><p>Custa <strong>${before.plan.cost} de Sabedoria permanentemente</strong> (uso ${before.plan.cost} de ${VANILLA_DREAM_EXCHANGE_MAX_USES}). Só pode ser usada uma vez por dia.</p>`,
        rejectClose: false,
    });
    if (!confirmed) return false;
    const current = eligible();
    if (!current.valid || !current.plan.ok) return false;
    const { pdvHealed } = breathingResourceKeys(current.props);
    const sabKey = sabBaseKey(actor);
    await actor.update({
        [`system.props.${pdvHealed}`]: parseNumber(current.props[pdvHealed]) + 1 - current.resources.pdvRaw,
        [`system.props.${sabKey}`]: parseNumber(current.props[sabKey]) - current.plan.cost,
    }, { naCsbAutomation: true, naDreamExchange: true });
    await actor.setFlag?.(MODULE_ID, DREAM_EXCHANGE_FLAG, { uses: (current.record.uses ?? 0) + 1, usedToday: true });
    return true;
}

export async function attemptDreamExchange(actor) {
    const mode = dreamExchangeMode();
    if (!mode) return false;
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM)) return false;
    const key = actor.uuid ?? actor;
    if (pending.has(key)) return false;
    pending.add(key);
    try {
        if (mode === 'vanilla') return await attemptVanillaDreamExchange(actor);
        const eligible = () => {
            const props = actor.system?.props ?? {};
            const resources = breathingPdvInfo(props);
            const status = parseStatusState(props.status_slayer_dados);
            status.exhaustion = Math.max(status.exhaustion, clampExhaustion(props.status_slayer_exaustao));
            return { props, resources, status, valid:
                hasBreathingPassive(props, 'Sonhos') && status.exhaustion + 2 < 8 &&
                resources.pdvMax > 0 && resources.pdvRaw <= 0 };
        };
        const before = eligible();
        if (!before.valid) return false;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Troca Equivalente — Sonhos' },
            content: `<p>Voltar com <strong>1 PDV</strong> e receber <strong>2 níveis de Exaustão</strong> (total ${before.status.exhaustion + 2})?</p><p>Ao aceitar, o praticante perde permanentemente uma memória importante, determinada em conjunto com o Mestre. Descanso e cura convencional não recuperam essa memória.</p>`,
            rejectClose: false,
        });
        if (!confirmed) return false;
        const current = eligible();
        if (!current.valid) return false;
        const { pdvHealed } = breathingResourceKeys(current.props);
        current.status.exhaustion += 2;
        await actor.update({
            [`system.props.${pdvHealed}`]: parseNumber(current.props[pdvHealed]) + 1 - current.resources.pdvRaw,
            'system.props.status_slayer_dados': JSON.stringify(current.status),
            'system.props.status_slayer_resumo': formatStatusSummary(current.status.active, current.status.exhaustion),
            'system.props.status_slayer_exaustao': current.status.exhaustion,
        }, { naCsbAutomation: true, naDreamExchange: true });
        return true;
    } finally {
        pending.delete(key);
    }
}

export function registerDreamPassiveEngine() {
    Hooks.on('updateActor', (actor, changes, options) => {
        if (!dreamExchangeMode() || options?.naDreamExchange || !globalThis.game?.user?.isGM || actorKind(actor) !== 'npc') return;
        const gm = [...(game.users ?? [])].filter(user => user.active && user.isGM)
            .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
        if (gm?.id !== game.user.id) return;
        const changed = changes?.system?.props ?? {};
        if (!Object.keys(changes ?? {}).some(path => path.startsWith('system.props.npc_pdv_')) &&
            !Object.keys(changed).some(path => path.startsWith('npc_pdv_'))) return;
        void attemptDreamExchange(actor).catch(error => ui.notifications?.error?.(error.message));
    });
}
