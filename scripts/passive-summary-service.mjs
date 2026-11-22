import { MODULE_ID } from './constants.mjs';
import { ruleVariant } from './rules-profile.mjs';
import { FLAME_HEAT_FLAG, FLAME_STATE_KEY, parseFlameBreathingState } from './flame-breathing-service.mjs';
import { FOX_PASSIVE_KEY, parseFoxPassive } from './fox-passive-service.mjs';
import { METAL_FORGE_KEY, parseMetalForge } from './metal-forge-passive.mjs';
import { parseSoundPassive, SOUND_PASSIVE_KEY } from './sound-passive-service.mjs';
import { parseWindBreathingState, WIND_STATE_KEY } from './wind-breathing-service.mjs';
import { parseWindCurrent, WIND_CURRENT_KEY } from './wind-current-passive.mjs';

/**
 * Resumo em texto puro dos acúmulos de passiva da ficha (Slayer e NPC).
 * Texto puro porque o CSB avalia o `value` do label: HTML vira lixo (lição 15).
 */
export const PASSIVE_SUMMARY_KEY = 'resp_acumulos_resumo';
export const EMPTY_PASSIVE_SUMMARY = 'Nenhum acúmulo ativo';

const WIND_SCARS_KEY = 'resp_vento_cicatrizes';
const FLAME_SUMMARY_KEY = 'resp_chamas_resumo';
const SCAR_DAMAGE_TYPES = ['cortante', 'perfurante'];
const SOUND_BPM_MAX = 200;
const FOX_VEILS_MAX = 9;
const FLAME_HEAT_MAX = 60;
const BURNING_THRESHOLD = 5;

const WATCHED_PROP_KEYS = Object.freeze([
    FLAME_STATE_KEY,
    FLAME_SUMMARY_KEY,
    WIND_STATE_KEY,
    WIND_SCARS_KEY,
    WIND_CURRENT_KEY,
    SOUND_PASSIVE_KEY,
    FOX_PASSIVE_KEY,
    METAL_FORGE_KEY,
]);

function int(value) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/**
 * Respirações que o personagem usa, pelas Formas na ficha ("Vento: 1º Estilo …").
 * Os contadores delas aparecem sempre, mesmo em 0: o jogador precisa ver quanto já tem.
 */
export function breathingFamilies(items = []) {
    const families = new Set();
    for (const item of items ?? []) {
        if (item?.system?.props?.inventario_categoria !== 'respiracao') continue;
        const prefix = String(item.name ?? '').split(':')[0];
        const family = prefix.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
        if (family) families.add(family);
    }
    return families;
}

function flameLine(props, always = false) {
    const heat = int(parseFlameBreathingState(props[FLAME_STATE_KEY]).weaponHeat);
    if (heat <= 0) return always ? `Fogo Fátuo 0/${FLAME_HEAT_MAX}` : null;
    const detailed = String(props[FLAME_SUMMARY_KEY] ?? '').trim();
    return detailed && !detailed.includes('<') ? detailed : `Fogo Fátuo ${heat}/${FLAME_HEAT_MAX}`;
}

function emberLine(heatMap) {
    const heats = Object.values(heatMap ?? {}).map((entry) => int(entry?.heat)).filter((heat) => heat > 0);
    if (!heats.length) return null;
    const highest = Math.max(...heats);
    const sources = heats.length > 1 ? ` de ${heats.length} fontes` : '';
    const burning = highest >= BURNING_THRESHOLD ? ' (Queimando)' : '';
    return `Brasas Ardentes ${highest}${sources}${burning}`;
}

function windLines(props, always = false, { homebrew = true } = {}) {
    const wind = parseWindBreathingState(props[WIND_STATE_KEY]);
    const scars = Math.max(int(props[WIND_SCARS_KEY]), int(wind.scars));
    const pending = SCAR_DAMAGE_TYPES.reduce((sum, type) => sum + int(wind.battleDamage?.[type]), 0);
    const current = parseWindCurrent(props[WIND_CURRENT_KEY]);
    const lines = [];
    if (scars > 0 || always) lines.push(`Cicatrizes ${scars}`);
    if (pending > 0) lines.push(`Dano para Cicatrizes ${pending}`);
    if (homebrew && (int(current.current) > 0 || always)) {
        const mode = current.mode === 'uncontrolled' ? 'Descontrolado' : 'Controlado';
        lines.push(`Corrente do Vendaval ${int(current.current)} (${mode})`);
    }
    return lines;
}

function soundLine(props, always = false) {
    const bpm = int(parseSoundPassive(props[SOUND_PASSIVE_KEY]).bpm);
    return bpm > 0 || always ? `BPM ${Math.min(bpm, SOUND_BPM_MAX)}/${SOUND_BPM_MAX}` : null;
}

function foxLines(props, always = false) {
    const fox = parseFoxPassive(props[FOX_PASSIVE_KEY]);
    const lines = [];
    if (int(fox.veils) > 0 || always) lines.push(`Véus ${Math.min(int(fox.veils), FOX_VEILS_MAX)}/${FOX_VEILS_MAX}`);
    if (fox.supreme?.active) lines.push(`Véu Supremo ${int(fox.supreme.remaining)} restante(s)`);
    return lines;
}

function metalForgeLines(props, always = false) {
    const forge = parseMetalForge(props[METAL_FORGE_KEY]);
    const lines = [];
    if (int(forge.temperature) > 0 || always) lines.push(`Temperatura da Forja ${int(forge.temperature)}`);
    if (int(forge.whiteTurns) > 0) lines.push(`Metal Branco ${int(forge.whiteTurns)} turno(s)`);
    return lines;
}

/**
 * @param {object} props props do Actor CSB (já com as mudanças pendentes aplicadas)
 * @param {object} [heatMap] flag `flameHeat` do próprio Actor (Brasas recebidas)
 * @param {Set<string>} [families] Respirações do personagem (`breathingFamilies`)
 * @returns {string}
 */
export function buildPassiveSummary(props = {}, heatMap = {}, families = new Set(), { homebrew = true } = {}) {
    // Vanilla (livro base): só Fogo Fátuo, Brasas e Cicatrizes existem. BPM, Véus, Corrente
    // do Vendaval e Forja são Homebrew e não aparecem com Respirações em Vanilla.
    const lines = [
        flameLine(props, families.has('chamas')),
        emberLine(heatMap),
        ...windLines(props, families.has('vento'), { homebrew }),
        homebrew ? soundLine(props, families.has('som')) : null,
        ...(homebrew ? foxLines(props, families.has('raposa')) : []),
        ...(homebrew ? metalForgeLines(props, families.has('metal')) : []),
    ].filter(Boolean);
    return lines.length ? lines.join(' · ') : EMPTY_PASSIVE_SUMMARY;
}

function pendingHeatMap(actor, changes) {
    const flags = changes.flags?.[MODULE_ID] ?? {};
    if (Object.hasOwn(flags, `-=${FLAME_HEAT_FLAG}`)) return {};
    const current = actor.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG) ?? {};
    const pending = flags[FLAME_HEAT_FLAG];
    return pending && typeof pending === 'object' ? { ...current, ...pending } : current;
}

/**
 * Hook `preUpdateActor`: injeta o resumo na MESMA gravação que mexe num acúmulo.
 * Uma gravação e um render, em vez de gravar o resumo depois (cascata medida no QA).
 */
function homebrewBreathing() {
    try { return ruleVariant('respiracao') !== 'vanilla'; } catch { return true; }
}

export function injectPassiveSummary(actor, changes) {
    const props = actor?.system?.props;
    if (!props || !changes || typeof changes !== 'object') return;
    const flat = foundry.utils.flattenObject(changes);
    const touchesProps = WATCHED_PROP_KEYS.some((key) => Object.hasOwn(flat, `system.props.${key}`));
    const touchesHeat = Object.keys(flat).some((key) => key.startsWith(`flags.${MODULE_ID}.`) && key.includes(FLAME_HEAT_FLAG));
    if (!touchesProps && !touchesHeat) return;
    const nextProps = { ...props };
    for (const key of WATCHED_PROP_KEYS)
        if (Object.hasOwn(flat, `system.props.${key}`)) nextProps[key] = flat[`system.props.${key}`];
    const summary = buildPassiveSummary(nextProps, pendingHeatMap(actor, changes), breathingFamilies(actor.items), { homebrew: homebrewBreathing() });
    if (summary !== props[PASSIVE_SUMMARY_KEY])
        foundry.utils.setProperty(changes, `system.props.${PASSIVE_SUMMARY_KEY}`, summary);
}

/** Hooks `createItem`/`deleteItem`: uma Forma nova ou removida muda quais contadores aparecem. */
export async function refreshPassiveSummaryForItem(item) {
    const actor = item?.parent;
    if (item?.system?.props?.inventario_categoria !== 'respiracao' || !actor?.system?.props) return;
    if (!actor.isOwner || !actor.update) return;
    const summary = buildPassiveSummary(
        actor.system.props,
        actor.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG) ?? {},
        breathingFamilies(actor.items),
        { homebrew: homebrewBreathing() }
    );
    if (summary !== actor.system.props[PASSIVE_SUMMARY_KEY])
        await actor.update({ [`system.props.${PASSIVE_SUMMARY_KEY}`]: summary }, { naCsbAutomation: true });
}

/** Recalcula as fichas do mundo uma vez (fichas antigas ou acúmulos já existentes). */
export async function backfillPassiveSummaries(actors = []) {
    const updates = [];
    for (const actor of actors) {
        const props = actor?.system?.props;
        if (!props || !actor.id) continue;
        const summary = buildPassiveSummary(
            props,
            actor.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG) ?? {},
            breathingFamilies(actor.items),
            { homebrew: homebrewBreathing() }
        );
        if (summary !== props[PASSIVE_SUMMARY_KEY])
            updates.push({ _id: actor.id, [`system.props.${PASSIVE_SUMMARY_KEY}`]: summary });
    }
    // ponytail: só Actors do mundo; tokens não vinculados recalculam no próximo acúmulo.
    if (updates.length) await Actor.updateDocuments(updates, { naCsbAutomation: true });
    return updates.length;
}
