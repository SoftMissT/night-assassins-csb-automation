export function cleanWeaponScalar(value = '') {
    return String(value ?? '')
        .trim()
        .replace(/^\*+\s*/u, '')
        .replace(/\*+$/u, '')
        .trim();
}

function stripBlockquote(value = '') {
    return String(value ?? '')
        .split(/\r?\n/u)
        .map((line) => line.replace(/^\s*>\s?/u, '').trimEnd())
        .join('\n')
        .trim();
}

export function splitWeaponPresentation(value = '') {
    const normalized = String(value ?? '').replace(/\r\n/gu, '\n').trim();
    if (!normalized) return { description: '', ability: '' };

    const abilityMatch = normalized.match(/(?:^|\n)\s*(?:#{1,6}\s*)?Habilidade\s*\n([\s\S]*?)(?:\n\s*---\s*$|$)/iu);
    const beforeAbility = abilityMatch ? normalized.slice(0, abilityMatch.index) : normalized;
    const description = beforeAbility
        .split(/\n\s*\n/u)
        .map((entry) => entry.trim())
        .find((entry) => entry && !/^[-*]\s/u.test(entry));

    return {
        description: description ?? '',
        ability: stripBlockquote(abilityMatch?.[1] ?? ''),
    };
}

export function normalizeNormalWeaponProps(props = {}) {
    const presentation = splitWeaponPresentation(props.descricao);
    return {
        ...props,
        arma_alcance: cleanWeaponScalar(props.arma_alcance),
        arma_propriedades: cleanWeaponScalar(props.arma_propriedades),
        arma_requisito: cleanWeaponScalar(props.arma_requisito),
        arma_tipo: cleanWeaponScalar(props.arma_tipo),
        descricao: presentation.description,
        arma_regra_completa: cleanWeaponScalar(
            props.arma_regra_completa || presentation.ability
        ),
    };
}
