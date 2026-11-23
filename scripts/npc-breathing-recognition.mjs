import { actorKind } from './actor-kind.mjs';
import { RESP_CHOICE_TO_BREATHING } from './breathing-choice.mjs';
import { canonicalBreathing } from './breathing-contract.mjs';

const CHOICE_BY_BREATHING = Object.freeze(
    Object.fromEntries(Object.entries(RESP_CHOICE_TO_BREATHING).map(([choice, name]) => [name, choice]))
);
const NO_CHOICE = new Set(['', 'resp_slayer_base']);

/**
 * O NPC não tem Respiração "de classe": as passivas (Chamas, Vento, Sonhos, Raposa...) leem o seletor
 * `resp_slayer_display`. Quando o NPC recebe a primeira Forma de uma Respiração e ainda não escolheu
 * nenhuma, o seletor passa a apontar para ela. Escolha já feita nunca é trocada.
 * @returns {string|null} valor do seletor a gravar, ou null
 */
export function npcBreathingChoiceForItem(actor, item) {
    if (actorKind(actor) !== 'npc' || item?.system?.props?.inventario_categoria !== 'respiracao') return null;
    const choice = CHOICE_BY_BREATHING[canonicalBreathing(String(item.system.props.respiracao_nome ?? ''))];
    if (!choice) return null;
    const props = actor.system?.props ?? {};
    const taken = [props.resp_slayer_display, props.resp_slayer_display_2];
    if (taken.includes(choice)) return null;
    return NO_CHOICE.has(String(props.resp_slayer_display ?? '')) ? choice : null;
}

/** Hook `createItem`: grava a Respiração reconhecida no seletor da ficha do NPC. */
export async function recognizeNpcBreathing(item) {
    const actor = item?.parent;
    if (!actor?.update || !actor.isOwner) return false;
    const choice = npcBreathingChoiceForItem(actor, item);
    if (!choice) return false;
    await actor.update({ 'system.props.resp_slayer_display': choice }, { naCsbAutomation: true });
    return true;
}
