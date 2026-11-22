import vanilla from '../catalogs/rules-vanilla.json' with { type: 'json' };

/**
 * As escolhas Vanilla agora são selects na ficha (sem o modal que validava).
 * Aqui fica a regra que o modal aplicava: Metal Preto só com a origem exigida
 * (Descendente). A combinação inválida é barrada na gravação, com aviso.
 */
const METAL_KEY = 'na_vanilla_metal';
const ORIGIN_KEY = 'na_vanilla_origin';

/**
 * @returns {string|null} motivo do bloqueio, ou null quando a combinação vale
 */
export function vanillaChoiceViolation(metal, origin) {
    const required = vanilla.metal?.[metal]?.requiredOrigin;
    if (!required || origin === required) return null;
    const originLabel = vanilla.slayerOrigin?.[required]?.label ?? required;
    return `${vanilla.metal[metal].label} exige a origem ${originLabel}.`;
}

// A ficha do CSB envia o formulário inteiro; a mesma chave pode vir aninhada
// (system.props.x) ou pontilhada ('system.props.x'). Os dois formatos contam.
function pendingValue(changes, key) {
    const dotted = `system.props.${key}`;
    if (Object.hasOwn(changes, dotted)) return { has: true, value: changes[dotted] };
    const nested = changes.system?.props;
    if (nested && Object.hasOwn(nested, key)) return { has: true, value: nested[key] };
    return { has: false };
}

function dropPending(changes, key) {
    delete changes[`system.props.${key}`];
    if (changes.system?.props) delete changes.system.props[key];
}

/** Hook `preUpdateActor`: desfaz a escolha que tornaria a combinação inválida. */
export function guardVanillaChoices(actor, changes) {
    const props = actor?.system?.props;
    if (!props || !changes || typeof changes !== 'object') return;
    const metalChange = pendingValue(changes, METAL_KEY);
    const originChange = pendingValue(changes, ORIGIN_KEY);
    // O formulário reenvia valores iguais aos atuais: só conta o que mudou de fato.
    const metalChanged = metalChange.has && metalChange.value !== props[METAL_KEY];
    const originChanged = originChange.has && originChange.value !== props[ORIGIN_KEY];
    if (!metalChanged && !originChanged) return;
    const metal = metalChanged ? metalChange.value : props[METAL_KEY];
    const origin = originChanged ? originChange.value : props[ORIGIN_KEY];
    const reason = vanillaChoiceViolation(metal, origin);
    if (!reason) return;
    // Desfaz só o campo que o usuário mudou agora; o resto da gravação segue.
    dropPending(changes, metalChanged ? METAL_KEY : ORIGIN_KEY);
    globalThis.ui?.notifications?.warn?.(reason);
}
