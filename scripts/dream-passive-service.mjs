import { actorKind } from './actor-kind.mjs';
import { parseNumber } from './parsing.mjs';
import { breathingPdvInfo, breathingResourceKeys } from './actor-resources.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { clampExhaustion, formatStatusSummary, parseStatusState } from './status-service.mjs';
import { isHomebrewExtra } from './rules-profile.mjs';

const pending = new Set();

export async function attemptDreamExchange(actor) {
    if (!isHomebrewExtra('sonhos') || !isHomebrewExtra('troca_equivalente')) return false;
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM)) return false;
    const key = actor.uuid ?? actor;
    if (pending.has(key)) return false;
    pending.add(key);
    try {
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
    if (!isHomebrewExtra('sonhos') || !isHomebrewExtra('troca_equivalente')) return;
    Hooks.on('updateActor', (actor, changes, options) => {
        if (options?.naDreamExchange || !globalThis.game?.user?.isGM || actorKind(actor) !== 'npc') return;
        const gm = [...(game.users ?? [])].filter(user => user.active && user.isGM)
            .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
        if (gm?.id !== game.user.id) return;
        const changed = changes?.system?.props ?? {};
        if (!Object.keys(changes ?? {}).some(path => path.startsWith('system.props.npc_pdv_')) &&
            !Object.keys(changed).some(path => path.startsWith('npc_pdv_'))) return;
        void attemptDreamExchange(actor).catch(error => ui.notifications?.error?.(error.message));
    });
}
