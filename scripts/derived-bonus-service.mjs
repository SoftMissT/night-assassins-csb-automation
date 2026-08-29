/**
 * @fileoverview Agregador canônico e auditável de bônus derivados do Slayer.
 */

import { normalizeAbilityKey, parseLevel, parseNumber } from './parsing.mjs';

export const DERIVED_BONUS_CHANNELS = Object.freeze([
    'acerto',
    'bloqueio',
    'esquiva',
    'percepcaoVisual',
    'percepcaoAuditiva',
    'socialVoz',
    'danoFixo',
    'iniciativa',
    'pdrMaximo',
]);

function abilityFallback(props, channel) {
    const ability = normalizeAbilityKey(props.hab_escolhida);
    const level = parseLevel(props.nvl_num ?? props.nvl_pj);
    if (ability === 'hab_escolhida_tato') {
        if (channel === 'bloqueio') return level >= 6 ? 3 : 2;
        if (channel === 'esquiva') return level >= 6 ? 2 : 1;
    }
    if (ability === 'hab_escolhida_visao') {
        if (channel === 'acerto' || channel === 'esquiva') return 1;
        if (channel === 'percepcaoVisual') return 2;
    }
    if (ability === 'hab_escolhida_audicao') {
        if (channel === 'percepcaoAuditiva' || channel === 'socialVoz') return level >= 6 ? 3 : 2;
    }
    return 0;
}

function metalFallback(props, channel) {
    const metal = String(props.metal_escolhido ?? '')
        .trim()
        .toLowerCase();
    const breathLevel = Math.max(0, parseLevel(props.nvl_respiracao_num));
    const values = {
        acerto: metal === 'metal_dourada' ? 4 : 0,
        bloqueio:
            metal === 'metal_preta' || metal === 'metal_azul'
                ? metal === 'metal_preta'
                    ? 4
                    : 3
                : 0,
        esquiva: metal === 'metal_azul' ? 3 : 0,
        percepcaoVisual: metal === 'metal_branca' ? 3 : 0,
        danoFixo: metal === 'metal_vermelha' ? 2 : 0,
        iniciativa: metal === 'metal_coral' ? 4 : 0,
        pdrMaximo: metal === 'metal_rosa' ? 4 * breathLevel : 0,
    };
    return values[channel] ?? 0;
}

function resolvedProp(props, key, fallback) {
    return Object.prototype.hasOwnProperty.call(props, key) ? parseNumber(props[key]) : fallback;
}

function emptyChannel() {
    return { total: 0, sources: [] };
}

/**
 * Resolve os bônus sem depender de Foundry, DOM ou Roll.
 * `runtimeSources` recebe contribuições já resolvidas por Respiração/Status,
 * evitando duplicar regras e contá-las duas vezes.
 *
 * @param {object} props
 * @param {object} [context]
 * @param {Array<{channel:string,value:number,label:string,origin?:string,types?:string[]}>} [context.runtimeSources]
 * @returns {{channels: Record<string,{total:number,sources:Array}>, typedDamage:Array, allSources:Array}}
 */
export function resolveSlayerDerivedBonuses(props = {}, context = {}) {
    const channels = Object.fromEntries(
        DERIVED_BONUS_CHANNELS.map((channel) => [channel, emptyChannel()])
    );
    const typedDamage = [];
    const allSources = [];

    const add = ({ channel, value, label, origin = 'Regra', types = [] }) => {
        const amount = parseNumber(value);
        if (!amount || !channels[channel]) return;
        const source = { channel, value: amount, label, origin, types: [...types] };
        channels[channel].total += amount;
        channels[channel].sources.push(source);
        allSources.push(source);
    };

    const abilityValues = {
        acerto: resolvedProp(props, 'hab_acerto_bonus', abilityFallback(props, 'acerto')),
        bloqueio: resolvedProp(props, 'hab_bloqueio_bonus', abilityFallback(props, 'bloqueio')),
        esquiva: resolvedProp(props, 'hab_esquiva_bonus', abilityFallback(props, 'esquiva')),
        percepcaoVisual: resolvedProp(
            props,
            'hab_percepcao_visual_bonus',
            abilityFallback(props, 'percepcaoVisual')
        ),
        percepcaoAuditiva: resolvedProp(
            props,
            'hab_percepcao_auditiva_bonus',
            abilityFallback(props, 'percepcaoAuditiva')
        ),
        socialVoz: resolvedProp(props, 'hab_social_voz_bonus', abilityFallback(props, 'socialVoz')),
        danoFixo: resolvedProp(props, 'hab_dano_bonus', abilityFallback(props, 'danoFixo')),
    };
    for (const [channel, value] of Object.entries(abilityValues)) {
        add({ channel, value, label: 'Habilidade Especial', origin: 'Habilidade' });
    }

    const metalValues = {
        acerto: resolvedProp(props, 'metal_acerto_bonus', metalFallback(props, 'acerto')),
        bloqueio: resolvedProp(props, 'metal_bloqueio_bonus', metalFallback(props, 'bloqueio')),
        esquiva: resolvedProp(props, 'metal_esquiva_bonus', metalFallback(props, 'esquiva')),
        percepcaoVisual: resolvedProp(
            props,
            'metal_percepcao_visual_bonus',
            metalFallback(props, 'percepcaoVisual')
        ),
        danoFixo: resolvedProp(props, 'metal_dano_bonus', metalFallback(props, 'danoFixo')),
        iniciativa: resolvedProp(
            props,
            'metal_iniciativa_bonus',
            metalFallback(props, 'iniciativa')
        ),
        pdrMaximo: resolvedProp(props, 'metal_slayer_pdr_bonus', metalFallback(props, 'pdrMaximo')),
    };
    for (const [channel, value] of Object.entries(metalValues)) {
        add({ channel, value, label: 'Metal / Cor', origin: 'Metal' });
    }

    const poison = resolvedProp(
        props,
        'metal_dano_veneno',
        String(props.metal_escolhido ?? '').toLowerCase() === 'metal_roxa' ? 3 : 0
    );
    if (poison) {
        const source = {
            channel: 'danoTipado',
            value: poison,
            label: 'Metal Roxo',
            origin: 'Metal',
            types: ['envenenamento'],
        };
        typedDamage.push(source);
        allSources.push(source);
    }

    const poisonDefensePenalty = parseNumber(props.slayer_veneno_penalidade_defesa);
    if (poisonDefensePenalty) {
        add({ channel: 'esquiva', value: poisonDefensePenalty, label: 'Ferida Tóxica', origin: 'Veneno' });
        add({ channel: 'bloqueio', value: poisonDefensePenalty, label: 'Ferida Tóxica', origin: 'Veneno' });
    }

    const kakushiBuffChoice = String(props.slayer_class_kakushi_amparar_buff_choice ?? '');
    if (kakushiBuffChoice === 'esquiva') {
        add({ channel: 'esquiva', value: 1, label: 'Amparar Aprimorado', origin: 'Kakushi' });
    } else if (kakushiBuffChoice === 'bloqueio') {
        add({ channel: 'bloqueio', value: 1, label: 'Amparar Aprimorado', origin: 'Kakushi' });
    }

    for (const runtime of context.runtimeSources ?? []) {
        if (!runtime || runtime.channel === 'danoTipado') {
            const value = parseNumber(runtime?.value);
            if (value) {
                const source = {
                    channel: 'danoTipado',
                    value,
                    label: runtime.label ?? 'Efeito temporário',
                    origin: runtime.origin ?? 'Temporário',
                    types: [...(runtime.types ?? [])],
                };
                typedDamage.push(source);
                allSources.push(source);
            }
            continue;
        }
        add({
            ...runtime,
            label: runtime.label ?? 'Efeito temporário',
            origin: runtime.origin ?? 'Temporário',
        });
    }

    return { channels, typedDamage, allSources };
}

/** @param {string} test @param {string} [modality] @returns {string|null} */
export function derivedChannelForTest(test, modality = '') {
    const normalized = `${test} ${modality}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    if (normalized.includes('acerto')) return 'acerto';
    if (normalized.includes('bloqueio')) return 'bloqueio';
    if (normalized.includes('esquiva')) return 'esquiva';
    if (normalized.includes('percepc') && normalized.includes('audit')) return 'percepcaoAuditiva';
    if (normalized.includes('percepc')) return 'percepcaoVisual';
    return null;
}

/** @param {ReturnType<typeof resolveSlayerDerivedBonuses>} resolved @returns {string} */
export function derivedBonusSummary(resolved) {
    const labels = [
        ['Acerto', 'acerto'],
        ['Bloqueio', 'bloqueio'],
        ['Esquiva', 'esquiva'],
        ['Percepção visual', 'percepcaoVisual'],
        ['Percepção auditiva', 'percepcaoAuditiva'],
        ['Dano', 'danoFixo'],
    ];
    return labels
        .map(
            ([label, key]) =>
                `${label} ${resolved.channels[key].total >= 0 ? '+' : ''}${resolved.channels[key].total}`
        )
        .join(' · ');
}

function escapeHtml(value) {
    const escape = globalThis.foundry?.utils?.escapeHTML;
    if (typeof escape === 'function') return escape(String(value ?? ''));
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

async function resolveActor(options = {}) {
    if (options.actor?.system?.props) return options.actor;
    if (options.actorUuid && typeof globalThis.fromUuid === 'function') {
        const document = await fromUuid(options.actorUuid);
        return document?.actor ?? document ?? null;
    }
    return (
        globalThis.canvas?.tokens?.controlled?.[0]?.actor ??
        globalThis.game?.user?.character ??
        null
    );
}

/** Abre a auditoria detalhada somente para GM. */
export async function openDerivedBonusAudit(options = {}) {
    if (!globalThis.game?.user?.isGM)
        return globalThis.ui?.notifications?.warn?.('Somente o GM pode auditar bônus derivados.');
    const actor = await resolveActor(options);
    if (!actor)
        return globalThis.ui?.notifications?.warn?.(
            'Nenhum Actor encontrado para auditoria de bônus.'
        );
    const resolved = resolveSlayerDerivedBonuses(actor.system?.props ?? {});
    const rows = resolved.allSources.length
        ? resolved.allSources
              .map(
                  (source) =>
                      `<tr><td>${escapeHtml(source.origin)}</td><td>${escapeHtml(source.label)}</td><td>${escapeHtml(source.channel)}</td><td>${source.value > 0 ? '+' : ''}${source.value}${source.types.length ? ` (${escapeHtml(source.types.join(', '))})` : ''}</td></tr>`
              )
              .join('')
        : '<tr><td colspan="4">Nenhum bônus derivado ativo.</td></tr>';
    const content = `<div class="na-derived-audit"><p><strong>${escapeHtml(actor.name)}</strong></p><p>${escapeHtml(derivedBonusSummary(resolved))}</p><table><thead><tr><th>Origem</th><th>Fonte</th><th>Canal</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    return foundry.applications.api.DialogV2.wait({
        window: { title: `Auditar bônus ${actor.name}` },
        content,
        buttons: [{ action: 'close', label: 'Fechar', default: true, callback: () => resolved }],
        rejectClose: false,
    });
}
