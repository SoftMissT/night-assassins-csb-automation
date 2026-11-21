import { actorKind } from './actor-kind.mjs';
import { ATTRIBUTES, ATTR_NAMES, configKey, tempKey } from './constants.mjs';
import { normalizeAbilityKey, parseAttributeValue, parseNumber } from './parsing.mjs';
import { effectiveRulesAbility, ruleVariant } from './rules-profile.mjs';

function readAttributeField(field) {
    const value =
        field && typeof field === 'object' ? field.value ?? field.current ?? field.raw : field;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !/\d/.test(value.replace(/<[^>]*>|&#160;/gi, ''))) return null;
    return parseAttributeValue(value);
}

export function resolveSheetAttribute(actor, attribute) {
    const key = String(attribute).toLowerCase();
    if (!Object.hasOwn(ATTR_NAMES, key)) return null;
    const props = actor?.system?.props ?? {};
    const read = (name) => readAttributeField(props[name]);
    const display = read(`${key}_display`);
    if (display !== null) return display;

    const kind = actorKind(actor);
    if (kind === 'oni_minion' || kind === null) {
        const minion = read(`oni_minion_${key}_display`) ?? read(`oni_minion_${key}_base`);
        if (kind === 'oni_minion' || minion !== null) return minion;
    }
    if (kind === 'npc' || kind === null) {
        const base = read(`npc_${key}_base`);
        if (base !== null) {
            const ability = normalizeAbilityKey(effectiveRulesAbility(props));
            // Em vanilla a fórmula da ficha zera Tsuyoi/Marca; o fallback precisa acompanhar.
            const vanilla = ruleVariant('habilidades') === 'vanilla';
            const destinyMark =
                !vanilla && ability === 'hab_escolhida_marca_destino' && props.hab_marca_destino_atributo === key
                    ? parseNumber(props.hab_marca_destino_bonus)
                    : 0;
            const constitution =
                !vanilla && ability === 'hab_escolhida_tsuyoi' && ['vit', 'for'].includes(key) ? 1 : 0;
            const breathing = read(`${key}_resp_bonus_temp_slayer`) ?? 0;
            const metal = ['for', 'fdv'].includes(key) ? (read(`resp_metal_${key}_temp`) ?? 0) : 0;
            return (
                base + (read(tempKey('slayer', key)) ?? 0) + (read(`${key}_marca_temp`) ?? 0) +
                destinyMark + constitution + breathing + metal
            );
        }
        if (kind === 'npc') return null;
    }

    if (kind === 'oni' || kind === null) {
        const base = read(configKey('oni', key));
        if (base !== null) return base + (read(tempKey('oni', key)) ?? 0);
        if (kind === 'oni') return null;
    }
    const base = read(configKey(kind, key));
    if (base === null) return null;
    const temporary = read(tempKey(kind, key)) ?? 0;

    const vanilla = ruleVariant('habilidades') === 'vanilla';
    const slayerExtras = {
        for: [...(vanilla ? [] : ['hab_tsuyoi_for_bonus']), 'resp_metal_for_temp'],
        vit: vanilla ? [] : ['hab_tsuyoi_vit_bonus'],
        fdv: ['resp_metal_fdv_temp'],
    };
    return [
        `${key}_marca_temp`,
        `${key}_resp_bonus_temp_slayer`,
        ...(slayerExtras[key] ?? []),
    ].reduce((total, name) => total + (read(name) ?? 0), base + temporary);
}

export function fillMissingSheetAttributes(root, actor) {
    for (const { key, label } of ATTRIBUTES) {
        for (const element of root.querySelectorAll(`.na-sheet-stat.na-sheet-role-${key}`)) {
            const text = element.textContent.trim();
            // CSB pode deixar "NaN"/"undefined"/"ERROR" quando a fórmula falha; trata como vazio.
            const broken = ['nan', 'undefined', 'error'].includes(text.toLocaleLowerCase('pt-BR'));
            if (!broken && text !== '' && text !== `${label}:`) continue;
            const value = resolveSheetAttribute(actor, key);
            if (value === null) continue;
            element.textContent = text !== '' && !broken ? `${text} ${value}` : String(value);
        }
    }
}
