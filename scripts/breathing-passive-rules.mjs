import { chosenBreathing, RESP_CHOICE_TO_BREATHING } from './breathing-choice.mjs';
import { actorKind } from './actor-kind.mjs';
import { parseLevel } from './parsing.mjs';
import { selectedSlayerClassKey } from './slayer/class-contracts.mjs';

export function hasBreathingPassive(props = {}, breathing) {
    if (chosenBreathing(props) === breathing) return true;
    if (RESP_CHOICE_TO_BREATHING[String(props.resp_slayer_display_2 ?? '')] !== breathing) return false;
    if (actorKind({ system: { props } }) === 'npc') return true;
    return selectedSlayerClassKey(props) === 'classe_usuario_de_duas_resp' &&
        parseLevel(props.nvl_num ?? props.nvl_pj) >= 2;
}
