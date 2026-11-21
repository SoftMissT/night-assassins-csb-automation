import { consumeOniActions, parseActionState } from '../action-service.mjs';
import { actorKind } from '../actor-kind.mjs';
import { MODULE_ID } from '../constants.mjs';
import { resolveActorReference } from '../core/combat-context.mjs';
import { getRollStatusEffects, mergeRollMode } from '../status-effects.mjs';
import { resolveSheetAttribute } from '../sheet-attributes.mjs';
import { oniPdkInfo, oniSpecializationAbility, RECOVERY_MASTER, TITAN, TITAN_CHARGE } from './specialization-rules.mjs';

const pendingActors = new Set();
const recoveryChoice = 'oniVanillaRecoveryMaximum';

export async function reserveOniSpecializationAction(actor, run) {
    const key = actor.uuid || actor;
    if (pendingActors.has(key)) return ui.notifications?.warn?.('Aguarde a resolução da ação em andamento.');
    pendingActors.add(key);
    try {
        return await run();
    } finally {
        pendingActors.delete(key);
    }
}

function turnKey(actor) {
    const combat = globalThis.game?.combat;
    if (!combat?.started) return '';
    const active = combat.combatant?.actor;
    if (!active || (active !== actor && (!actor.uuid || active.uuid !== actor.uuid))) return null;
    return `${combat.uuid ?? combat.id}:${combat.round}:${combat.turn}`;
}

function alreadyRegenerated(props) {
    return [true, 'true'].includes(props.oni_regeneracao_usada_turno);
}

export async function useOniSpecialization(options = {}) {
    const actor = (await resolveActorReference(options.actor ?? options.actorUuid)) ??
        (!options.actorUuid ? globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? globalThis.game?.user?.character : null);
    if (actorKind(actor) !== 'oni' || (!actor.isOwner && !game.user?.isGM))
        return ui.notifications?.warn?.('Selecione um Oni que você possa controlar.');

    const props = actor.system.props;
    const titan = oniSpecializationAbility(props, TITAN, 'C');
    const recovery = oniSpecializationAbility(props, RECOVERY_MASTER, 'B');
    const permanent = oniSpecializationAbility(props, RECOVERY_MASTER, 'A');
    const actions = [];
    if (titan) actions.push({ action: 'charge', label: 'Carregar' });
    if (recovery) actions.push({ action: 'restore', label: 'Imposição' });
    if (permanent && !actor.getFlag?.(MODULE_ID, recoveryChoice)) {
        actions.push({ action: 'pdv', label: 'Aumentar PDV máximo' }, { action: 'pdk', label: 'Aumentar PDK/R máximo' });
    }
    if (actions.length === 0)
        return ui.notifications?.warn?.('Nenhuma ação de especialização Vanilla disponível neste rank.');
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Especialização Oni' },
        content: titan
            ? `<p>Carregar gasta uma Ação Única e ${titan.chargeCost} PDK/R para somar FOR ao próximo movimento em linha reta deste turno.</p>`
            : `<p>Imposição usa uma Ação Especial. FDV CD ${recovery.fdvDc} recupera até ${recovery.pdk} PDK/R. O ganho de máximo só pode ser escolhido uma vez.</p>`,
        buttons: [
            ...actions.map(action => ({ ...action, callback: () => action.action })),
            { action: 'cancel', label: 'Fechar', default: true, callback: () => null },
        ],
        rejectClose: false,
    });
    if (!actions.some(action => action.action === choice)) return null;
    return reserveOniSpecializationAction(actor, () => applyOniSpecializationChoice(actor, choice));
}

async function applyOniSpecializationChoice(actor, choice) {
    const props = actor.system.props;
    if (choice === 'pdv' || choice === 'pdk') {
        if (!oniSpecializationAbility(props, RECOVERY_MASTER, 'A') || actor.getFlag?.(MODULE_ID, recoveryChoice)) return null;
        const attribute = resolveSheetAttribute(actor, choice === 'pdv' ? 'VIT' : 'FDV');
        if (attribute === null) return ui.notifications?.warn?.('Configure o atributo antes de escolher.');
        const bonus = Math.max(0, attribute) * (choice === 'pdv' ? 5 : 3);
        await actor.update({
            [`system.props.oni_vanilla_mestre_${choice}_bonus`]: bonus,
            [`flags.${MODULE_ID}.${recoveryChoice}`]: choice,
        }, { naCsbAutomation: true });
        ui.notifications?.info?.(`Mestre da Recuperação concede +${bonus} ${choice.toUpperCase()} máximo.`);
        return { ok: true, bonus };
    }

    const turn = turnKey(actor);
    if (turn === null) return ui.notifications?.warn?.('Use esta ação no turno do Oni.');
    const pdk = oniPdkInfo(props);
    if (choice === 'charge') {
        const ability = oniSpecializationAbility(props, TITAN, 'C');
        if (!ability || !turn) return ui.notifications?.warn?.('Carregar requer um turno ativo de combate.');
        if (parseActionState(props.acoes_oni_dados).turn.movimento > 0)
            return ui.notifications?.warn?.('A Ação de Movimento deste turno já foi usada.');
        if (pdk.current < ability.chargeCost) return ui.notifications?.warn?.('PDK/R insuficiente para Carregar.');
        const movement = resolveSheetAttribute(actor, 'FOR');
        if (movement === null) return ui.notifications?.warn?.('Configure FOR antes de usar Carregar.');
        const action = await consumeOniActions(actor, 'unica', { update: false });
        if (!action.ok) return ui.notifications?.warn?.(action.reason);
        await actor.update({ ...action.patch, [`system.props.${TITAN_CHARGE}`]: Math.max(0, movement),
            'system.props.pdk_oni_gasto_valor': pdk.spent + ability.chargeCost }, { naCsbAutomation: true });
        ui.notifications?.info?.(`Carregar concede +${Math.max(0, movement)}m no próximo movimento em linha reta.`);
        return { ok: true, movement };
    }

    const ability = oniSpecializationAbility(props, RECOVERY_MASTER, 'B');
    if (!ability || alreadyRegenerated(props)) return ui.notifications?.warn?.('Imposição e Regeneração não podem ser usadas no mesmo turno.');
    if (pdk.current >= pdk.maximum) return ui.notifications?.warn?.('PDK/R já está no máximo.');
    const fdv = resolveSheetAttribute(actor, 'FDV');
    if (fdv === null) return ui.notifications?.warn?.('Configure FDV antes de usar Imposição.');
    const status = getRollStatusEffects(props, { test: 'Imposição', attr: 'FDV', kind: 'test' });
    if (status.blocked || status.autoFail) return ui.notifications?.warn?.('Os status atuais impedem o teste de Imposição.');
    const action = await consumeOniActions(actor, 'especial', { update: false });
    if (!action.ok) return ui.notifications?.warn?.(action.reason);
    const mode = mergeRollMode('normal', status.mode);
    const dice = mode === 'advantage' ? '2d20kh1' : mode === 'disadvantage' ? '2d20kl1' : '1d20';
    const roll = await Roll.create(`${dice} + (${fdv + status.modifier})`).evaluate();
    if (turnKey(actor) !== turn) return ui.notifications?.warn?.('O turno mudou durante a Imposição.');
    const liveProps = actor.system.props;
    const liveAction = await consumeOniActions(actor, 'especial', { update: false });
    if (!liveAction.ok || alreadyRegenerated(liveProps) || !oniSpecializationAbility(liveProps, RECOVERY_MASTER, 'B'))
        return ui.notifications?.warn?.(liveAction.reason ?? 'Imposição deixou de estar disponível.');
    const livePdk = oniPdkInfo(liveProps);
    const recovered = roll.total >= ability.fdvDc ? Math.min(ability.pdk, livePdk.maximum - livePdk.current) : 0;
    await actor.update({ ...liveAction.patch, 'system.props.oni_regeneracao_usada_turno': true,
        'system.props.pdk_oni_curado': livePdk.recovered + recovered }, { naCsbAutomation: true });
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `Imposição · FDV CD ${ability.fdvDc} · ${recovered} PDK/R recuperado` });
    return { ok: true, recovered };
}

export async function chooseTitanImpact(actor, preparedCost = 0) {
    const props = actor.system.props;
    if ((!actor.isOwner && !game.user?.isGM) || !oniSpecializationAbility(props, TITAN, 'A')) return 0;
    const maximum = Math.floor(Math.min(resolveSheetAttribute(actor, 'FDV') ?? 0, oniPdkInfo(props).current - preparedCost));
    if (maximum <= 0) return 0;
    const amount = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Impacto · Titan' },
        content: `<label>PDK/R a gastar <input name="oni-impact" type="number" min="0" max="${maximum}" step="1" value="0"></label><p>Cada ponto gasto acrescenta 1 ao dano deste acerto.</p>`,
        buttons: [
            { action: 'impact', label: 'Aplicar', callback: (_event, button) => Number(button.form.elements['oni-impact']?.value) },
            { action: 'skip', label: 'Seguir sem Impacto', default: true, callback: () => 0 },
        ],
        rejectClose: false,
    });
    const current = actor.system.props;
    return Number.isInteger(amount) && amount > 0 && amount <= maximum && amount + preparedCost <= oniPdkInfo(current).current &&
        amount <= (resolveSheetAttribute(actor, 'FDV') ?? 0) && oniSpecializationAbility(current, TITAN, 'A') ? amount : 0;
}
