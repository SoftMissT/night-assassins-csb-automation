import { actorKind } from './actor-kind.mjs';
import { ATTR_NAMES, configKey, tempKey } from './constants.mjs';
import { parseAttributeValue } from './parsing.mjs';

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
            return base + (read(tempKey('slayer', key)) ?? 0) + (read(`${key}_marca_temp`) ?? 0);
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

    const slayerExtras = {
        for: ['hab_tsuyoi_for_bonus', 'resp_metal_for_temp'],
        vit: ['hab_tsuyoi_vit_bonus'],
        fdv: ['resp_metal_fdv_temp'],
    };
    return [
        `${key}_marca_temp`,
        `${key}_resp_bonus_temp_slayer`,
        ...(slayerExtras[key] ?? []),
    ].reduce((total, name) => total + (read(name) ?? 0), base + temporary);
}
