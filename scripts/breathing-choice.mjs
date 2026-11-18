/**
 * Ponte entre a escolha da ficha (dropdown `resp_slayer_display`) e o nome
 * canônico da Respiração usado pelos Itens de Forma (`respiracao_nome`).
 * Sem esta ponte, duas fontes paralelas misturam Formas de respirações
 * diferentes no mesmo seletor.
 */
import { canonicalBreathing } from './breathing-contract.mjs';

export const RESP_CHOICE_TO_BREATHING = Object.freeze({
    resp_slayer_agua: 'Água',
    resp_slayer_chamas: 'Chamas',
    resp_slayer_eclipse: 'Eclipse',
    resp_slayer_metal: 'Metal',
    resp_slayer_neve: 'Neve',
    resp_slayer_nevoa: 'Névoa',
    resp_slayer_pedra: 'Pedra',
    resp_slayer_raposa: 'Raposa',
    resp_slayer_som: 'Som',
    resp_slayer_sonhos: 'Sonhos',
    resp_slayer_vento: 'Vento',
});

/** Nome canônico da respiração escolhida na ficha, ou null se nada foi escolhido. */
export function chosenBreathing(props = {}, { includeSecondary = false } = {}) {
    const explicit = String(props?.respiracao_escolhida ?? '').trim();
    if (explicit) return canonicalBreathing(explicit);
    const choices = [props?.resp_slayer_display];
    if (includeSecondary) choices.push(props?.resp_slayer_display_2);
    for (const choice of choices) {
        const name = RESP_CHOICE_TO_BREATHING[String(choice ?? '')];
        if (name) return name;
    }
    return null;
}

/** Filtra Itens de Forma pela respiração escolhida; sem escolha, devolve todos. */
export function formsForBreathing(items = [], breathing = null) {
    const list = Array.isArray(items) ? items : [];
    const wanted = breathing ? canonicalBreathing(breathing) : null;
    if (!wanted) return list;
    return list.filter(
        (item) =>
            canonicalBreathing(String(item?.system?.props?.respiracao_nome ?? '')) === wanted
    );
}
