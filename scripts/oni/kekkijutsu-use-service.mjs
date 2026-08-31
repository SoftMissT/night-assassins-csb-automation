/**
 * @fileoverview Fluxo "USAR KEKKIJUTSU" (P0 UI Kekkijutsu na ficha Oni).
 *
 * Item → validar nível/PDK/ação (kekkijutsu-service.mjs) → confirmar via
 * DialogV2 → consumir PDK/ação → rolar teste (se houver) e dano → registrar
 * uso → postar no chat. Não reimplementa o pipeline completo de dano do
 * Slayer (flame/status/resistências) cobre o essencial para a técnica
 * ser jogável; integração fina com damage-relay.mjs fica para follow-up.
 */
import { MODULE_ID } from '../constants.mjs';
import {
    normalizeKekkijutsu,
    validateKekkijutsuUse,
    buildKekkijutsuAttack,
    buildKekkijutsuUsePatch,
    buildKekkijutsuPdkPatch,
} from './kekkijutsu-service.mjs';

/**
 * Executa o uso de um Item Kekkijutsu por um Actor Oni.
 * @param {{item: Item, actor: Actor}} options
 * @returns {Promise<{ok:boolean, errors?:string[]}>}
 */
export async function useKekkijutsuItem({ item, actor } = {}) {
    if (!item || !actor) {
        globalThis.ui?.notifications?.warn?.('Kekkijutsu: item ou Actor ausente.');
        return { ok: false, errors: ['missing_item_or_actor'] };
    }
    const technique = normalizeKekkijutsu(item);
    const props = actor.system?.props ?? {};
    const validation = validateKekkijutsuUse(actor, technique, {
        level: props.nvl_num,
        currentPdk: props.pdk_oni_atual_num,
    });
    if (!validation.ok) {
        globalThis.ui?.notifications?.warn?.(
            `Kekkijutsu bloqueado: ${validation.errors.join(' ')}`
        );
        return { ok: false, errors: validation.errors };
    }

    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (DialogV2?.confirm) {
        const confirmed = await DialogV2.confirm({
            window: { title: `Usar ${technique.name}` },
            content: `<p>Custo: <strong>${technique.pdkCost} PDK</strong> · Ação: <strong>${technique.action}</strong></p>`,
            rejectClose: false,
        });
        if (!confirmed) return { ok: false, errors: ['cancelled'] };
    }

    const attack = buildKekkijutsuAttack(technique, props);
    const pdkPatch = buildKekkijutsuPdkPatch(props.pdk_oni_gasto_valor, technique.pdkCost);
    const usePatch = buildKekkijutsuUsePatch(technique);
    await actor.update({ ...pdkPatch, ...usePatch }, { naCsbAutomation: true });

    const rolls = [];
    if (attack.testFormula) {
        try {
            const testRoll = await globalThis.Roll.create(attack.testFormula).evaluate();
            rolls.push(testRoll);
        } catch {
            /* fórmula de teste inválida/ausente segue sem rolagem de teste */
        }
    }
    for (const component of attack.damage) {
        try {
            const damageRoll = await globalThis.Roll.create(component.formula).evaluate();
            rolls.push(damageRoll);
        } catch {
            /* fórmula de dano inválida/ausente ignora componente */
        }
    }

    if (globalThis.ChatMessage && globalThis.game?.user) {
        const flavor = `<strong>${technique.name}</strong> (${technique.origin ?? 'Kekkijutsu'}) Rank ${technique.rank} · ${technique.pdkCost} PDK`;
        await globalThis.ChatMessage.create({
            speaker: globalThis.ChatMessage.getSpeaker({ actor }),
            flavor,
            rolls,
            content: rolls.length ? undefined : flavor,
        });
    }

    return { ok: true, technique, attack, rolls };
}
