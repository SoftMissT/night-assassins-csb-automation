/**
 * @fileoverview Serviço de execução de técnicas de Respiração (formas).
 *
 * Cada item CSB do tipo "Respiração - Forma" contém props padronizadas
 * que este serviço lê para executar a técnica:
 *
 * Props do item:
 *   nome_forma     (string)  Nome em português
 *   nome_jp        (string)  Nome em japonês
 *   respiracao_nome(string)  Nome da respiração (Água, Sol, Trovão...)
 *   tipo_manobra   (string)  Única | Ataque | Especial | Completa | Reação
 *   nivel_req      (number)  Nível mínimo de respiração
 *   descricao      (string)  Descrição narrativa
 *   tem_requisito  (number)  1 se tem requisito especial
 *   requisito_texto(string)  Texto do requisito
 *
 *   Para cada nível N (1-4):
 *   tem_nvl_N      (number)  1 se o nível está disponível
 *   nvl_N_custo    (number)  Custo em PDR
 *   nvl_N_dano     (string)  Fórmula de dano (ex: "1d6", "2d6 + DEX")
 *   nvl_N_efeito   (string)  Descrição do efeito
 *   nvl_N_status   (string)  Status aplicado (vazio = nenhum)
 *   nvl_N_buff     (string)  Buff aplicado ao self (vazio = nenhum)
 *   nvl_N_tipos_dano(string) Tipos de dano (ex: "cortante,impacto"; vazio = catálogo)
 *   tipo_dano_base (string)  Tipos padrão da forma (fallback quando nvl_N_tipos_dano vazio)
 */

import { MODULE_ID, TIPOS_ACAO } from './constants.mjs';
import { resolveAttributeRefs } from './damage-formula.mjs';
import { openDamagePresetManager } from './dialogs/damage-preset-manager.mjs';
import { parseLevel, parseNumber } from './parsing.mjs';
import { breathingPdrInfo, breathingResourceKeys } from './actor-resources.mjs';
import { combatPassiveBonuses, passiveExecutionId, recordBreathingPassiveEvent } from './breathing-combat-passives.mjs';
import { chosenBreathing } from './breathing-choice.mjs';
import { getDamageStatusEffects } from './status-effects.mjs';
import { consumeOniActions, consumeSlayerActions } from './action-service.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import {
    applyChosenDamageToPatch,
    CHOSEN_DAMAGE_BREATHINGS,
    resolveChosenDamage,
} from './breath-damage-choice.mjs';
import { resolveWaterDamageTypes, waterFormById } from './water-breathing-data.mjs';
import { flameFormById } from './flame-breathing-data.mjs';
import { mistFormById } from './mist-breathing-data.mjs';
import { metalFormById } from './metal-breathing-data.mjs';
import { snowFormById } from './snow-breathing-data.mjs';
import { windFormById, WIND_SYNERGY_BREATHINGS } from './wind-breathing-data.mjs';
import {
    buildFlameBreathingPlan,
    clearFlameBreathingState,
    flameStatePatch,
    flameTurnKey,
    parseFlameBreathingState,
    resolveFlameRengokuAllies,
    FLAME_HEAT_FLAG,
    FLAME_SYNERGY_DAMAGE_PER_ALLY,
    FLAME_SYNERGY_PDR_COST,
    tickFlameBreathing,
} from './flame-breathing-service.mjs';
import { clearStoneBreathingState, tickStoneBreathing } from './stone-breathing-service.mjs';
import {
    buildMistBreathingPlan,
    clearMistBreathingState,
    mistStatePatch,
    parseMistBreathingState,
    resolveEightLayersResult,
    resolveMistFormula,
    tickMistBreathing,
} from './mist-breathing-service.mjs';
import {
    buildMetalBreathingPlan,
    clearMetalBreathingState,
    metalStatePatch,
    parseMetalBreathingState,
    resolveMetalMagnetism,
    tickMetalBreathing,
} from './metal-breathing-service.mjs';
import {
    buildSnowBreathingPlan,
    clearSnowBreathingState,
    grantBlizzardStealth,
    parseSnowBreathingState,
    resolveSnowRestrictionEscape,
    releaseSnowRestriction,
    snowEffectiveBreathLevel,
    snowStatePatch,
    snowTickPatchWithExhaustion,
} from './snow-breathing-service.mjs';
import {
    buildWindBreathingPlan,
    clearWindBreathingState,
    parseWindBreathingState,
    tickWindBreathing,
    windStatePatch,
} from './wind-breathing-service.mjs';
import { applySlayerDamage, reapplyFiniteStatusEffect } from './status-engine.mjs';
import { formatStatusSummary, parseStatusState, statusKeysForProps } from './status-service.mjs';
import { actorKind } from './actor-kind.mjs';
import {
    actorWeapons,
    clearStonePassiveState,
    isPassiveItem,
    parseBreathPassiveState,
    passiveStatePatch,
} from './breath-passives.mjs';
import { canonicalBreathing, isMigrated, resolveForm } from './breathing-contract.mjs';
import { activeCombatBuffs, BUFFS_FLAG } from './breathing-buffs.mjs';
import { runCanonicalBreathingForm } from './breathing-pipeline.mjs';
import { secondaryBreathingForActor, secondaryBreathingUse } from './slayer/dual-breathing-service.mjs';
import { canManageDualBreathingPosture, openDualBreathingComposite, openDualBreathingPosture, planPostureTechniqueUse } from './slayer/dual-breathing-posture.mjs';
import { ruleVariant } from './rules-profile.mjs';

const secondaryFormsInFlight = new WeakSet();

const MANOBRA_MAP = {
    unica: 'unica',
    'acao unica': 'unica',
    u00fanica: 'unica',
    ataque: 'ataque',
    'acao de ataque': 'ataque',
    especial: 'especial',
    'acao especial': 'especial',
    completa: 'completa',
    'acao completa': 'completa',
    livre: 'livre',
    'acao livre': 'livre',
    reaka: 'reacao',
    reacao: 'reacao',
    'reakatilde;o': 'reacao',
    reação: 'reacao',
    'rea\\u00e7\\u00e3o': 'reacao',
};

function normalizeManobra(raw) {
    if (!raw) return null;
    const key = String(raw)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    return MANOBRA_MAP[key] ?? null;
}

function parseDamageTypes(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return [];
    return value
        .split(',')
        .map((type) => type.trim().toLowerCase())
        .filter(Boolean);
}

function getFormData(item) {
    const props = item?.system?.props ?? {};
    const numericProp = (value) => {
        if (value && typeof value === 'object') {
            return value.value ?? value.current ?? value.raw ?? value;
        }
        return value;
    };
    const catalog =
        waterFormById(String(props.forma_id ?? '')) ??
        flameFormById(String(props.forma_id ?? ''), ruleVariant('respiracao')) ??
        mistFormById(String(props.forma_id ?? '')) ??
        metalFormById(String(props.forma_id ?? '')) ??
        snowFormById(String(props.forma_id ?? ''));
    const baseTypes = parseDamageTypes(props.tipo_dano_base);
    const homebrew = ruleVariant('respiracao') === 'homebrew';
    const homebrewForged = props.forma_id === 'metal_06' && homebrew;
    const currentDescription = {
        chamas_03: homebrew
            ? 'Aquece a arma em 9. Contra o inimigo acertado, aplica 6 Brasas adicionais e soma dano de Fogo ao dano da arma. O Acerto bem-sucedido é crítico.'
            : 'Aquece a arma em 3. Contra o inimigo acertado, aplica 2 pontos adicionais de Esquentar. O Acerto bem-sucedido é crítico.',
        chamas_07: 'Prepara o próximo Ataque Padrão do turno. A arma ganha 3 pontos de Esquentar. No acerto, o alvo recebe 2 pontos adicionais e faz um teste de VIT para evitar Derrubado.',
        chamas_08: homebrew
            ? 'Aquece a arma em 8. Por 3 turnos, sofre 5 de dano por turno e soma 2d8 de Concussão no nível 3 ou 4d8 no nível 4 aos golpes ofensivos.'
            : 'Aquece a arma em 8. Por 3 turnos, sofre 5 de dano por turno e soma 5 de Fogo no nível 3 ou 8 no nível 4 aos golpes ofensivos.',
    }[catalog?.id];
    const sequence = props.forma_id === 'sonhos_10' ? resolveForm('Sonhos', props.forma_id) : null;
    const levels = [];
    for (let i = 1; i <= 4; i++) {
        const disponivel =
            parseNumber(numericProp(props[`tem_nvl${i}`])) === 1 ||
            props[`tem_nvl${i}`] === true ||
            props[`tem_nvl${i}`] === 'true';
        const sequenceLevel = sequence?.niveis[i - 1];
        if (sequence ? !sequenceLevel : !disponivel) continue;
        levels.push({
            level: i,
            custo: sequenceLevel?.custo ?? parseNumber(numericProp(props[`nvl${i}_custo`])),
            dano: sequenceLevel?.dano ?? String(props[`nvl${i}_dano`] ?? '').trim(),
            efeito: String(props[`nvl${i}_efeito`] ?? '').trim(),
            status: String(props[`nvl${i}_status`] ?? '').trim(),
            buff: String(props[`nvl${i}_buff`] ?? '').trim(),
            tiposDano: parseDamageTypes(props[`nvl${i}_tipos_dano`]),
        });
    }
    return {
        id: String(props.forma_id ?? catalog?.id ?? ''),
        nome: String(catalog?.name ?? (props.nome_jp || props.nome_forma || item?.name || 'Forma')),
        jp: String(catalog?.ptName ?? (props.nome_jp ? props.nome_forma ?? '' : '')),
        respiracao: String(props.respiracao_nome ?? ''),
        tipo: homebrewForged
            ? 'especial'
            : String(catalog?.action ?? catalog?.actions?.[0] ?? props.tipo_manobra ?? ''),
        nivelReq: parseNumber(props.nivel_req),
        descricao: currentDescription ?? (homebrewForged
              ? 'Gasta a Ação Especial e 4 PDR para ativar o Forjado. Faça o Ataque Padrão usando sua Ação de Ataque. Cada acerto com a Nichirin aumenta o estágio por até 8 turnos.'
              : String(props.descricao ?? '')),
        temRequisito: catalog?.id !== 'chamas_07' && parseNumber(props.tem_requisito) === 1,
        requisito: String(props.requisito_texto ?? ''),
        baseTypes,
        levels:
            catalog?.levels
                ?.map((level, index) =>
                    level
                        ? {
                              level: index + 1,
                              custo: level.cost,
                              dano: level.damage ?? '',
                              efeito: catalog.id === 'chamas_07'
                                  ? `Avanço de até ${level.advance.toLocaleString('pt-BR')} m no próximo Ataque Padrão. Não gasta Movimento. Respeite obstáculos e Ataques de Oportunidade.`
                                  : (homebrewForged || ['chamas_03', 'chamas_08'].includes(catalog.id))
                                    ? '' : (props[`nvl${index + 1}_efeito`] ?? ''),
                              status: '',
                              buff: '',
                              tiposDano: baseTypes,
                          }
                        : null
                )
                .filter(Boolean) ?? levels,
    };
}

// Keys de recurso gravadas pelas Formas: o NPC tem as suas (npc_pdr_*, npc_pdv_*).
function slayerPdrInfo(props = {}) {
    return breathingPdrInfo(props);
}

/**
 * Coleta aliados dispostos a contribuir com a sinergia do Rengoku
 * (Amor/Vento/Magma/Sol: 2 PDR cada → +5 de dano por contribuição).
 * @param {Actor} actor Usuário da Respiração das Chamas.
 * @param {{id: string}} form Forma sendo usada.
 * @param {object} props Props atuais do ator.
 * @returns {Promise<object>} `{ rengokuAllies: [{uuid, name}] }` ou `{}` .
 */
async function collectFlameChoices(actor, form, props = {}) {
    const distinctWeapons = [
        ...new Map(actorWeapons(actor).map((weapon) => [weapon.id, weapon])).values(),
    ];
    if (distinctWeapons.length === 0) {
        return {
            cancelled: true,
            reason: 'A Respiração das Chamas exige uma arma sincronizada no inventário.',
        };
    }
    const flameState = parseFlameBreathingState(props.resp_chamas_estado);
    const currentId = String(flameState.synchronizedWeapon?.id ?? '');
    let synchronizedWeapon =
        distinctWeapons.find((weapon) => weapon.id === currentId) ?? distinctWeapons[0];
    if (distinctWeapons.length > 1) {
        const options = distinctWeapons
            .map(
                (weapon) =>
                    `<option value="${weapon.id}" ${weapon.id === synchronizedWeapon.id ? 'selected' : ''}>${weapon.name}</option>`
            )
            .join('');
        const selectedId = await foundry.applications.api.DialogV2.wait({
            window: { title: 'Honō no Kokyū arma sincronizada' },
            content: `<div class="na-csb-automation"><p>Esquentar e o crítico pertencem à arma sincronizada.</p><label>Arma</label><select name="weaponId">${options}</select></div>`,
            modal: true,
            rejectClose: false,
            buttons: [
                {
                    action: 'confirmar',
                    label: 'Sincronizar',
                    default: true,
                    callback: (_event, button) => button.form.elements.weaponId.value,
                },
                { action: 'cancelar', label: 'Cancelar', callback: () => '' },
            ],
        });
        if (!selectedId) return { cancelled: true };
        synchronizedWeapon =
            distinctWeapons.find((weapon) => weapon.id === selectedId) ?? synchronizedWeapon;
    }
    const baseChoices = { synchronizedWeapon };
    if (form.id !== 'chamas_09') return baseChoices;
    const candidates = [];
    const seen = new Set([actor.uuid]);
    const combatants = [...(game.combat?.combatants?.contents ?? game.combat?.combatants ?? [])];
    for (const combatant of combatants) {
        const doc = combatant?.actor;
        if (!doc || seen.has(doc.uuid)) continue;
        seen.add(doc.uuid);
        if (!['slayer', 'npc'].includes(actorKind(doc))) continue;
        const respiracoes = [...(doc.items ?? [])]
            .map((item) => String(item.system?.props?.respiracao_nome ?? ''))
            .filter(Boolean);
        const { pdrCurrent } = slayerPdrInfo(doc.system?.props ?? {});
        candidates.push({
            uuid: doc.uuid,
            name: doc.name ?? '',
            respiracoes,
            pdrAvailable: pdrCurrent,
        });
    }
    const eligible = resolveFlameRengokuAllies(candidates, actor.uuid);
    if (!eligible.length) return { ...baseChoices, rengokuAllies: [] };
    const checkboxes = eligible
        .map(
            (ally, index) => `
    <label style="display:flex;gap:6px;align-items:center">
      <input type="checkbox" data-index="${index}">
      <span>${ally.name} PDR disponível: ${ally.pdrAvailable} (custa ${FLAME_SYNERGY_PDR_COST})</span>
    </label>`
        )
        .join('');
    const chosenIndexes = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Ku no Kata Rengoku Sinergia' },
        content: `<div class="na-csb-automation"><p>Aliados de Koi no Kokyū, Kaze no Kokyū, Yōgan no Kokyū ou Hi no Kokyū podem gastar ${FLAME_SYNERGY_PDR_COST} PDR para somar +${FLAME_SYNERGY_DAMAGE_PER_ALLY} de dano ao Rengoku (somente se o ataque acertar).</p>${checkboxes}</div>`,
        modal: true,
        rejectClose: false,
        buttons: [
            {
                action: 'confirmar',
                label: 'Confirmar',
                callback: (_event, _button, dialog) =>
                    [...dialog.element.querySelectorAll('input[data-index]:checked')].map((input) =>
                        Number(input.dataset.index)
                    ),
            },
            { action: 'sem_sinergia', label: 'Sem sinergia', callback: () => [] },
        ],
    });
    return {
        ...baseChoices,
        rengokuAllies: (Array.isArray(chosenIndexes) ? chosenIndexes : [])
            .map((index) => eligible[index])
            .filter(Boolean),
    };
}

export function getBreathLevel(props = {}) {
    const numericProp = (value) =>
        value && typeof value === 'object'
            ? (value.value ?? value.current ?? value.raw ?? value)
            : value;
    const candidates = [
        ['nvl_respiracao_num', numericProp(props.nvl_respiracao_num)],
        ['respiracao_nivel', numericProp(props.respiracao_nivel)],
        ['nivel_respiracao', numericProp(props.nivel_respiracao)],
        ['nvl_respiracao', numericProp(props.nvl_respiracao)],
    ];

    for (const [key, raw] of candidates) {
        if (raw === undefined || raw === null || raw === '') continue;
        const val = Math.trunc(parseNumber(raw));
        // Nível de Respiração válido é 1–4. Qualquer valor acima disso
        // provavelmente é nível de personagem vazando para a key errada.
        if (val >= 1 && val <= 4) return val;
        console.warn(
            `[NA Breath] Ignorando ${key}=${raw}; nível de respiração deve estar entre 1 e 4.`
        );
    }

    return 1;
}

async function resolveActorFromItem(item, fallbackUuid) {
    if (item?.parent?.system?.props) return item.parent;
    if (item?.actor?.system?.props) return item.actor;
    if (fallbackUuid) {
        const doc = await fromUuid(fallbackUuid);
        if (doc?.system?.props) return doc;
        if (doc?.actor?.system?.props) return doc.actor;
    }
    const controlled = canvas?.tokens?.controlled;
    if (controlled?.length > 0) return controlled[0].actor;
    return game?.user?.character ?? null;
}

const escapeAttr = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

/** O jogador escolhe o dano quando a Respiração está na lista e algum nível tem dano. */
function offersDamageChoice(form, levels) {
    return !form.dualVariation && form.id !== 'chamas_07' &&
        CHOSEN_DAMAGE_BREATHINGS.has(form.respiracao) && levels.some((level) => level.dano);
}

function buildDialogHtml(form, pdrCurrent, breathLevel, secondaryCost) {
    const richText = form.id.startsWith('custom_') ? escapeAttr : (value) => value;
    const allowed = form.levels.filter((level) => level.level <= breathLevel);
    const levelOptions = allowed
        .map((l) => {
            const danoTxt = l.dano ? ` · Dano: ${escapeAttr(l.dano)}` : '';
            const statusTxt = l.status ? ` · Status: ${richText(l.status)}` : '';
            const buffTxt = l.buff ? ` · Buff: ${richText(l.buff)}` : '';
            const cost = `${l.custo + (secondaryCost?.pdr ?? 0)} PDR${secondaryCost?.pdv ? ` + ${secondaryCost.pdv} PDV` : ''}`;
            return `<option value="${l.level}" data-dano="${escapeAttr(l.dano)}">Nível ${l.level} ${cost}${danoTxt}${statusTxt}${buffTxt}</option>`;
        })
        .join('');
    const damageHtml = offersDamageChoice(form, allowed)
        ? `<div style="margin-bottom:8px;">
        <label style="font-size:13px;">Dano da Forma (fica guardado para este nível):</label>
        <input type="text" name="na-breath-damage" value="${escapeAttr(allowed[0]?.dano)}" placeholder="ex.: 2d6 + @for" style="width:100%;margin-top:4px;font-family:'JetBrains Mono',monospace;">
        <div style="font-size:11px;color:#888;margin-top:2px;">Bônus de Respiração, Marca e derivados continuam somando à parte.</div>
      </div>`
        : '';

    const reqHtml = form.temRequisito
        ? `<div class="na-breath-req" style="color:#FF2B4A;font-size:12px;margin-bottom:6px;">⚠ Requisito: ${richText(form.requisito)}</div>`
        : '';

    const lvlReqHtml =
        form.nivelReq > 1
            ? `<div style="color:#FF9100;font-size:12px;margin-bottom:6px;">Requer Nível de Respiração ${form.nivelReq} (atual: ${breathLevel})</div>`
            : '';

    return `
    <div class="na-breath-dialog">
      <div style="margin-bottom:8px;">
        <strong style="font-size:15px;">${escapeAttr(form.nome)}</strong>
        ${form.jp ? `<div style="font-size:12px;color:#888;">${escapeAttr(form.jp)}</div>` : ''}
        <div style="font-size:12px;color:#aaa;">${escapeAttr(form.respiracao)} · ${escapeAttr(form.tipo)}</div>
      </div>
      ${reqHtml}
      ${lvlReqHtml}
      <div style="font-size:12px;color:#888;margin-bottom:8px;line-height:1.4;">${richText(form.descricao)}</div>
      ${form.dualVariation ? `<p><strong>Variação aprovada.</strong> A automação usa o efeito da base. Aplique na mesa: ${escapeAttr(form.dualVariation.effect)}. Limitação: ${escapeAttr(form.dualVariation.limitation)}.</p>` : ''}
      <div style="margin-bottom:8px;">
        <label style="font-size:13px;">Escolha o nível:</label>
        <select name="na-breath-level" style="width:100%;margin-top:4px;">${levelOptions}</select>
      </div>
      ${damageHtml}
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#888;">
        <span>PDR disponível: <strong>${pdrCurrent}</strong></span>
      </div>
    </div>
  `;
}

export function parseWaterBreathingState(raw) {
    if (raw && typeof raw === 'object') return { version: 1, ...raw };
    try {
        const parsed = JSON.parse(String(raw || '{}'));
        return parsed && typeof parsed === 'object' ? { version: 1, ...parsed } : { version: 1 };
    } catch (_) {
        return { version: 1 };
    }
}

function statePatch(state, overrides = {}) {
    return {
        'system.props.resp_agua_estado': JSON.stringify({ version: 1, ...state }),
        ...overrides,
    };
}

export function buildWaterBreathingPlan(formId, level, props = {}, choices = {}) {
    const form = waterFormById(formId);
    const selected = form?.levels?.[level - 1];
    if (!form || !selected) return { ok: false, reason: 'Forma ou nível indisponível.' };
    const damageTypes = resolveWaterDamageTypes(form, selected);
    const state = parseWaterBreathingState(props.resp_agua_estado);
    const int = parseNumber(props.int_display);
    const dex = parseNumber(props.dex_display);
    const base = {
        ok: true,
        form,
        selected,
        action:
            form.action === 'ataque_especial'
                ? choices.special
                    ? 'especial'
                    : 'ataque'
                : form.action,
        cost: selected.cost,
        patch: {},
        state,
    };
    if (formId === 'agua_01') {
        Object.assign(
            base.patch,
            statePatch(
                {
                    ...state,
                    pendingDamage: {
                        source: formId,
                        formula: selected.damage,
                        uses: 1,
                        types: damageTypes,
                    },
                },
                {
                    'system.props.resp_bonus_dano_dados': selected.damage,
                    'system.props.resp_efeito_flag': 'Água 1: próximo ataque',
                    'system.props.resp_efeito_duracao': 0,
                }
            )
        );
    } else if (formId === 'agua_02') {
        if (!choices.jumpPassed && !choices.water9Active)
            return { ok: false, noCost: true, reason: 'Falha no teste de DEX CD 12.' };
        if (choices.special && !choices.comboWater1) base.cost += 1;
        Object.assign(
            base.patch,
            statePatch(
                {
                    ...state,
                    pendingDamage: {
                        source: formId,
                        formula: selected.damage,
                        uses: 1,
                        halfOnDefense: true,
                        types: damageTypes,
                    },
                    nextHit: { advantage: true, source: formId },
                },
                {
                    'system.props.resp_bonus_dano_dados': selected.damage,
                    'system.props.resp_bonus_acerto_temp': 0,
                    'system.props.resp_efeito_flag': 'Água 2: Vantagem e metade na Defesa',
                }
            )
        );
    } else if (formId === 'agua_03') {
        const bonus = level < 2 ? 0 : int + (level >= 3 ? level - 2 : 0);
        Object.assign(
            base.patch,
            statePatch(
                {
                    ...state,
                    pendingDamage: {
                        source: formId,
                        formula: selected.damage,
                        uses: 3,
                        types: damageTypes,
                    },
                    nextHit: { count: 3, bonus, distinctTargets: true, source: formId },
                },
                {
                    'system.props.resp_bonus_dano_dados': selected.damage,
                    'system.props.resp_bonus_acerto_temp': bonus,
                    'system.props.resp_efeito_flag': 'Água 3: até 3 alvos distintos',
                }
            )
        );
    } else if (formId === 'agua_04') {
        if (!choices.triggerConfirmed)
            return {
                ok: false,
                noCost: true,
                reason: 'A Forma exige finalização ou Acerto Crítico.',
            };
        Object.assign(
            base.patch,
            statePatch(
                {
                    ...state,
                    nextHit: {
                        source: formId,
                        immediate: true,
                        range: parseNumber(props.deslocamento_slayer),
                    },
                },
                { 'system.props.resp_efeito_flag': 'Água 4: ataque imediato' }
            )
        );
    } else if (formId === 'agua_05') {
        if (!choices.targetIncapacitated)
            return {
                ok: false,
                noCost: true,
                reason: 'O alvo precisa estar rendido ou atordoado.',
            };
        Object.assign(
            base.patch,
            statePatch(
                {
                    ...state,
                    pendingDamage: {
                        source: formId,
                        critical: true,
                        uses: 1,
                        recoverPdrOnKill: level,
                        types: damageTypes,
                    },
                },
                { 'system.props.resp_efeito_flag': 'Água 5: crítico automático' }
            )
        );
    } else if (formId === 'agua_06') {
        const hitBonus = choices.submerged ? 3 : 0;
        // Combo com a 7ª Forma (Nível 3-4): metade do custo de PDR o combo é
        // consumido nesta ativação, não persiste para usos futuros.
        const comboActive = Boolean(state.block?.comboWater6);
        if (comboActive) base.cost = Math.ceil(base.cost / 2);
        const nextBlock = comboActive ? undefined : state.block;
        Object.assign(
            base.patch,
            statePatch(
                {
                    ...state,
                    block: nextBlock,
                    pendingDamage: {
                        source: formId,
                        formula: selected.damage,
                        uses: 1,
                        area: true,
                        allyDefenseBonus: dex,
                        types: damageTypes,
                    },
                    nextHit: { bonus: hitBonus, source: formId },
                },
                {
                    'system.props.resp_bonus_dano_dados': selected.damage,
                    'system.props.resp_bonus_acerto_temp': hitBonus,
                    'system.props.resp_efeito_flag': comboActive
                        ? `Água 6: área (combo Água 7, metade do custo); aliados +${dex} Defesa`
                        : `Água 6: área; aliados +${dex} Defesa`,
                }
            )
        );
    } else if (formId === 'agua_07') {
        Object.assign(
            base.patch,
            statePatch(
                { ...state, block: { bonus: int, comboWater6: level >= 3, source: formId } },
                {
                    'system.props.resp_bonus_bloqueio_temp': int,
                    'system.props.resp_efeito_flag':
                        level >= 3 ? 'Água 7: Bloqueio + combo Água 6' : 'Água 7: Bloqueio da ação',
                }
            )
        );
    } else if (formId === 'agua_08') {
        if (parseNumber(props.resp_agua_08_recarga_turno) > 0)
            return { ok: false, noCost: true, reason: 'A 8ª Forma ainda está em recarga.' };
        Object.assign(
            base.patch,
            statePatch(
                {
                    ...state,
                    pendingDamage: {
                        source: formId,
                        formula: selected.damage,
                        uses: 1,
                        suppressResistanceTurns: 2,
                        vitCheck: level >= 2,
                        criticalDiceInt: level >= 3,
                        types: damageTypes,
                    },
                    nextHit: { advantage: level >= 4, source: formId },
                },
                {
                    'system.props.resp_bonus_dano_dados': selected.damage,
                    'system.props.resp_agua_08_recarga_turno': 3,
                    'system.props.resp_efeito_flag': 'Água 8: resistência suprimida por 2 turnos',
                }
            )
        );
    } else if (formId === 'agua_09') {
        const evade = level <= 2 ? 1 : 3;
        Object.assign(
            base.patch,
            statePatch(
                { ...state, water9: { turns: 2, evasion: evade, movement: level, source: formId } },
                {
                    'system.props.resp_bonus_esquiva_temp': evade,
                    'system.props.resp_efeito_duracao': 2,
                    'system.props.resp_efeito_flag': `Água 9: +${evade} Esquiva, +${level}m`,
                }
            )
        );
    } else if (formId === 'agua_10') {
        const charges = Math.max(
            0,
            Math.trunc(parseNumber(choices.charges ?? state.water10?.charges))
        );
        if (choices.release) {
            if (charges < 1)
                return {
                    ok: false,
                    noCost: true,
                    reason: 'A 10ª Forma exige ao menos um turno carregado.',
                };
            const formula = Array.from({ length: charges }, () => `(${selected.damage})`).join(
                ' + '
            );
            Object.assign(
                base.patch,
                statePatch(
                    {
                        ...state,
                        water10: null,
                        pendingDamage: {
                            source: formId,
                            formula,
                            uses: 1,
                            charges,
                            exhaustion: charges > 1 ? 2 : 0,
                            types: damageTypes,
                        },
                    },
                    {
                        'system.props.resp_bonus_dano_dados': formula,
                        'system.props.resp_carga_acumulada': 0,
                        'system.props.resp_efeito_flag': `Água 10: liberar ${charges} carga(s)`,
                    }
                )
            );
        } else {
            base.cost = 0;
            Object.assign(
                base.patch,
                statePatch(
                    {
                        ...state,
                        water10: {
                            level,
                            charges: 0,
                            active: true,
                            comboWater9: Boolean(state.water9?.turns),
                        },
                    },
                    {
                        'system.props.resp_carga_acumulada': 0,
                        'system.props.resp_efeito_flag': 'Água 10: carregando',
                    }
                )
            );
        }
    } else if (formId === 'agua_11') {
        const maximum = Math.max(0, level - 1);
        const used = Math.max(0, Math.trunc(parseNumber(props.resp_agua_11_usos_hoje)));
        if (used >= maximum)
            return { ok: false, noCost: true, reason: 'Nenhum uso diário de Calmaria disponível.' };
        Object.assign(
            base.patch,
            statePatch(
                { ...state, calm: { negateNextAttack: true, source: formId } },
                {
                    'system.props.resp_agua_11_usos_hoje': used + 1,
                    'system.props.resp_efeito_flag': 'Água 11: próximo ataque anulado',
                }
            )
        );
    }
    return base;
}

export function buildGenericBreathingPlan(form, selected) {
    if (!form || !selected) return { ok: false, reason: 'Forma ou nível indisponível.' };
    return {
        ok: true,
        action: normalizeManobra(form.tipo),
        cost: Math.max(0, parseNumber(selected.custo)),
        patch: {},
    };
}

function resolveGenericDamageFormula(formula, props = {}) {
    return String(formula ?? '')
        .replace(/@(vit|dex|for|car|fdv|int|sab)\b/giu, (_match, key) =>
            String(parseNumber(props[`${String(key).toLowerCase()}_display`]))
        )
        .trim();
}

export function tickWaterBreathing(props = {}) {
    const state = parseWaterBreathingState(props.resp_agua_estado);
    const patch = {};
    const cooldown = Math.max(0, Math.trunc(parseNumber(props.resp_agua_08_recarga_turno)) - 1);
    patch['system.props.resp_agua_08_recarga_turno'] = cooldown;
    if (state.water9?.turns > 0) {
        state.water9.turns -= 1;
        patch['system.props.resp_efeito_duracao'] = state.water9.turns;
        if (state.water9.turns === 0) {
            state.water9 = null;
            patch['system.props.resp_bonus_esquiva_temp'] = 0;
        }
    }
    if (state.water10?.active) {
        state.water10.charges = Math.max(0, Math.trunc(parseNumber(state.water10.charges)) + 1);
        patch['system.props.resp_carga_acumulada'] = state.water10.charges;
    }
    return statePatch(state, patch);
}

async function openBreathDialog({ form, pdrCurrent, breathLevel, secondaryCost }) {
    const allowedLevels = form.levels.filter((level) => level.level <= breathLevel);
    if (allowedLevels.length === 0) {
        ui.notifications?.warn?.(
            `Nenhum nível disponível para ${form.nome}. Respiração atual: ${breathLevel}; requisito: ${form.nivelReq}.`
        );
        return null;
    }
    const html = buildDialogHtml({ ...form, levels: allowedLevels }, pdrCurrent, breathLevel, secondaryCost);
    // Trocar o nível traz o dano guardado daquele nível, até o jogador digitar o seu.
    const render = (_event, dialog) => {
        const select = dialog.element?.querySelector('[name="na-breath-level"]');
        const input = dialog.element?.querySelector('[name="na-breath-damage"]');
        if (!select || !input) return;
        let edited = false;
        input.addEventListener('input', () => (edited = true));
        select.addEventListener('change', () => {
            if (!edited) input.value = select.selectedOptions[0]?.dataset.dano ?? '';
        });
    };
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: `Respiração da ${form.respiracao} ${form.nome}` },
        content: html,
        render,
        buttons: [
            {
                action: 'usar',
                label: 'Usar Forma',
                callback: (_event, _button, dialog) => {
                    const level = Number(
                        dialog.element.querySelector('[name="na-breath-level"]')?.value ?? 1
                    );
                    const damage = dialog.element.querySelector('[name="na-breath-damage"]')?.value;
                    return { level, damage: damage ?? null };
                },
            },
            { action: 'close', label: 'Cancelar', default: true, callback: () => null },
        ],
    });
    return result;
}

async function confirmRule(title, content) {
    return foundry.applications.api.DialogV2.confirm({
        window: { title },
        content: `<div class="na-csb-automation"><p>${content}</p></div>`,
        yes: { label: 'Confirmar' },
        no: { label: 'Cancelar' },
        defaultYes: false,
        modal: true,
    });
}

async function collectWaterChoices(actor, form, level, props) {
    const state = parseWaterBreathingState(props.resp_agua_estado);
    if (form.id === 'agua_02') {
        const special = await confirmRule(
            "Roda D'Água",
            'Usar como Ação Especial? Sem combo com a 1ª Forma, isso custa +1 PDR.'
        );
        let jumpPassed = Boolean(state.water9?.turns);
        if (!jumpPassed) {
            const dex = parseNumber(props.dex_display);
            const roll = await Roll.create(`1d20 + ${dex}`).evaluate();
            await roll.toMessage({
                flavor: "Roda D'Água · Teste de pulo (DEX CD 12)",
                speaker: ChatMessage.getSpeaker({ actor }),
            });
            jumpPassed = roll.total >= 12;
        }
        return {
            special,
            jumpPassed,
            water9Active: Boolean(state.water9?.turns),
            comboWater1: state.pendingDamage?.source === 'agua_01',
        };
    }
    if (form.id === 'agua_04')
        return {
            triggerConfirmed: await confirmRule(
                'Maré Impressionante',
                'Você finalizou um inimigo ou obteve um Acerto Crítico?'
            ),
        };
    if (form.id === 'agua_05') {
        const targets = [...(game.user?.targets ?? [])].filter(token => token.actor);
        if (targets.length !== 1 || targets[0].actor.uuid === actor.uuid)
            return { cancelled: true, reason: 'Marque um único inimigo rendido ou Atordoado.' };
        return {
            target: targets[0],
            targetIncapacitated: await confirmRule(
                'Chuva Misericordiosa',
                'O alvo está rendido ou Atordoado?'
            ),
        };
    }
    if (form.id === 'agua_06')
        return {
            submerged: await confirmRule(
                'Torção de Hidromassagem',
                'O personagem está submerso em água?'
            ),
        };
    if (form.id === 'agua_10')
        return { release: Boolean(state.water10?.active), charges: state.water10?.charges ?? 0 };
    return {};
}

async function askNumber(title, label, { value = 0, min = 0, max = 99 } = {}) {
    return foundry.applications.api.DialogV2.wait({
        window: { title },
        content: `<div class="form-group"><label>${label}</label><input type="number" name="value" value="${value}" min="${min}" max="${max}" step="1"></div>`,
        buttons: [
            {
                action: 'ok',
                label: 'Confirmar',
                default: true,
                callback: (_event, button) =>
                    Math.max(
                        min,
                        Math.min(max, Math.trunc(Number(button.form.elements.value.value) || 0))
                    ),
            },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
        rejectClose: false,
    });
}

async function collectWindChoices(actor, form, level, props) {
    if (form.id === 'vento_02') {
        const dex = parseNumber(props.dex_display);
        const maxPdr = Math.trunc(2 * dex);
        const pdrInvested = await askNumber(
            'Ichi no Kata Jin Senpū Sogi',
            'PDR a investir (dano escala junto)',
            { min: 1, max: Math.max(1, maxPdr) }
        );
        return pdrInvested === null ? { cancelled: true } : { pdrInvested };
    }
    if (form.id === 'vento_04') {
        const secondUse = await confirmRule(
            'San no Kata Kokufū Enran',
            'Este é o 2º uso (Reação/contra-ataque)?'
        );
        return { secondUse };
    }
    return {};
}

async function collectCuratedChoices(actor, form, level, props) {
    const targetActor = [...(game.user?.targets ?? [])][0]?.actor ?? null;
    // Ciclone da Névoa: "durante qualquer momento de seu próximo turno, pode
    // conjurar qualquer técnica da Névoa sem gastar PDR". Pergunta-se uma vez,
    // para qualquer Forma da Névoa, se o benefício ainda estiver disponível.
    let mistCyclone = {};
    if (mistFormById(form.id)) {
        const mistState = parseMistBreathingState(props.resp_nevoa_estado);
        if (mistState.patterns.cyclone.benefitAvailable) {
            mistCyclone = {
                useCycloneFree: await confirmRule(
                    'Ciclone da Névoa',
                    'Usar o benefício gratuito do Ciclone (isenta o custo BASE desta técnica)?'
                ),
            };
        }
    }
    if (form.id === 'nevoa_03') {
        return {
            ...mistCyclone,
            kekkijutsuReduced: await confirmRule(
                'Expansão de Névoa',
                'Este uso diminuiu ou anulou com sucesso o dano de um Kekkijutsu?'
            ),
        };
    }
    if (form.id === 'nevoa_04') {
        const advantageAttack = await confirmRule(
            'Corte de Advecção',
            'Este uso parte de uma rolagem de Acerto que JÁ tem Vantagem (não é a Forma quem concede a Vantagem)?'
        );
        if (!advantageAttack) return { ...mistCyclone, advantageAttack: false };
        const suppressResistance = await confirmRule(
            'Corte de Advecção',
            'Pagar +1 PDR extra para aplicar Anulação de Resistências no alvo (Sinergia Água/Vento/Sonhos)?'
        );
        const suppressAttribute =
            suppressResistance &&
            (await confirmRule(
                'Corte de Advecção',
                'Usar DEX para definir a duração? (Cancelar usa FOR)'
            ))
                ? 'dex'
                : 'for';
        return { ...mistCyclone, advantageAttack, suppressResistance, suppressAttribute };
    }
    if (form.id === 'nevoa_05') {
        return {
            ...mistCyclone,
            doubleCost: await confirmRule(
                'Mar de Nuvens',
                'Pagar o dobro do PDR total para obter Reflexão da Névoa?'
            ),
            targetUuid: targetActor?.uuid ?? '',
        };
    }
    if (form.id === 'nevoa_06') {
        const dex = parseNumber(props.dex_display);
        const check = await Roll.create(`1d20 + ${dex}`).evaluate();
        const message = await check.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: '<strong>Névoa sob o Luar</strong> DEX CD 12',
        });
        await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
        // Nota: os 2 PDR de declaração são cobrados pelo chamador independente
        // do resultado deste teste (custo por DECLARAÇÃO, não por sucesso).
        if (check.total < 12) return { ...mistCyclone, dexCheckPassed: false, extraAttacks: 0 };
        const available = Math.max(
            0,
            Math.min(19, Math.floor(slayerPdrInfo(props).pdrCurrent) - 2)
        );
        const extraAttacks = await askNumber(
            'Névoa sob o Luar',
            'Máximo de ataques adicionais (+1 PDR cada)',
            { max: available }
        );
        return extraAttacks === null
            ? { cancelled: true }
            : { ...mistCyclone, dexCheckPassed: true, extraAttacks };
    }
    if (form.id === 'nevoa_07') {
        if (!targetActor)
            return { cancelled: true, reason: 'Marque o inimigo do teste oposto de SAB.' };
        const ownSab = parseNumber(props.sab_display);
        const enemySab = parseNumber(targetActor.system?.props?.sab_display);
        const [own, enemy] = await Promise.all([
            Roll.create(`2d20kh1 + ${ownSab}`).evaluate(),
            Roll.create(`1d20 + ${enemySab}`).evaluate(),
        ]);
        await Promise.all([
            own.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: '<strong>Neblina</strong> SAB com Vantagem',
            }),
            enemy.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                flavor: '<strong>Neblina</strong> SAB do alvo',
            }),
        ]);
        return {
            ...mistCyclone,
            opposedPassed: own.total > enemy.total,
            targetUuid: targetActor.uuid,
        };
    }
    if (form.id === 'nevoa_08') {
        if (!targetActor) return { cancelled: true, reason: 'Marque o inimigo que será ofuscado.' };
        const allyToken =
            [...(game.user?.targets ?? [])].find(
                (token) => token.actor?.uuid !== targetActor.uuid
            ) ?? canvas?.tokens?.controlled?.find((token) => token.actor?.uuid !== actor.uuid);
        return {
            ...mistCyclone,
            targetUuid: targetActor.uuid,
            allyUuid: allyToken?.actor?.uuid ?? actor.uuid,
        };
    }
    if (mistFormById(form.id)) return { ...mistCyclone };
    if (form.id === 'metal_07') {
        const targets = [...(game.user?.targets ?? [])].filter(token => token.actor);
        if (targets.length !== 1 || targets[0].actor.uuid === actor.uuid)
            return { cancelled: true, reason: 'Marque um único inimigo para a Batida de Martelo.' };
        return { hammerTarget: targets[0] };
    }
    if (form.id === 'metal_06') {
        const magnetismEligible = resolveMetalMagnetism(props).eligible;
        if (magnetismEligible && !targetActor)
            return { cancelled: true, reason: 'Marque o inimigo afetado por Magnetismo.' };
        return { targetUuid: magnetismEligible ? targetActor.uuid : '' };
    }
    if (form.id === 'neve_03')
        return {
            ownerUuid: actor.uuid,
            allyUuid: targetActor?.uuid ?? '',
            allyBreathing: String(targetActor?.system?.props?.respiracao_escolhida ?? ''),
        };
    if (form.id === 'neve_05') return { targetUuid: targetActor?.uuid ?? '' };
    if (form.id === 'neve_07')
        return {
            ownerUuid: actor.uuid,
            protectedUuid: targetActor?.uuid ?? actor.uuid,
            allyBreathing: String(targetActor?.system?.props?.respiracao_escolhida ?? ''),
        };
    return {};
}

const BREATH_CHAT_COLORS = Object.freeze({
    Água: '#6fd8ff', Chamas: '#ff7a2f', Eclipse: '#b15cff', Metal: '#d9d24a', Neve: '#a9e6ff',
    Névoa: '#9b8cff', Pedra: '#c2a25c', Raposa: '#ffb35c', Som: '#ffcf6b', Sonhos: '#c58cff', Vento: '#8fd14f',
});

/** Texto curto e sem HTML para status/buff no chat (a descrição completa fica na Forma). */
function chatSnippet(value, max = 140) {
    const text = String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Cartão de uso de Forma: só o que a mesa precisa (nome, Respiração, nível, custo, dano,
 * status e buff curtos). A descrição inteira com tabela saiu do chat (pedido do operador, 2026-11-22).
 */
export function buildBreathChatFlavor({ form, selected, damageTotal = null }) {
    const color = BREATH_CHAT_COLORS[form.respiracao] ?? '#28D7FF';
    const cost = `${selected.custo} PDR${selected.pdv ? ` + ${selected.pdv} PDV` : ''}`;
    const rows = [
        damageTotal !== null && damageTotal !== undefined
            ? `<div class="na-breath-chat-row"><span>Dano</span><strong>${damageTotal}</strong></div>` : '',
        selected.status ? `<div class="na-breath-chat-row"><span>Status</span>${escapeAttr(chatSnippet(selected.status))}</div>` : '',
        selected.buff ? `<div class="na-breath-chat-row"><span>Buff</span>${escapeAttr(chatSnippet(selected.buff))}</div>` : '',
    ].join('');
    return `<div class="na-breath-chat" style="--na-breath-color:${color};">
      <div class="na-breath-chat-title"><strong>${escapeAttr(form.nome)}</strong>${form.jp ? ` <em>${escapeAttr(form.jp)}</em>` : ''}</div>
      <div class="na-breath-chat-meta">${escapeAttr(form.respiracao)} · ${escapeAttr(form.tipo)} · Nível ${selected.level} · <strong>−${cost}</strong></div>
      ${rows}
    </div>`;
}

/**
 * Mensagem de dano gerada por este uso de Forma: mesmo ator, depois da mensagem `afterId`
 * (a última do chat quando a Forma começou; id, não relógio, por causa de clientes remotos)
 * e ainda sem cartão de Forma. Pura para teste.
 */
export function pickDamageMessageForForm(messages = [], actorId, afterId) {
    const list = [...messages];
    const start = afterId ? list.findIndex((message) => message.id === afterId) + 1 : 0;
    return list.slice(start).reverse().find((message) =>
        message.speaker?.actor === actorId &&
        /class="na-damage-chat"/.test(message.flavor ?? '') &&
        !/class="na-breath-chat"/.test(message.flavor ?? '')
    ) ?? null;
}

async function postBreathChat({ actor, form, selected, damageRoll, since = null }) {
    const flavor = buildBreathChatFlavor({ form, selected, damageTotal: damageRoll?.total ?? null });
    // Forma com dano: o cartão entra na própria mensagem de dano, numa mensagem só (pedido do
    // operador, 2026-11-22). Sem dano (errou/cancelou), o cartão sai sozinho como antes.
    if (since !== null && !damageRoll) {
        const damageMessage = pickDamageMessageForForm(game.messages?.contents ?? [], actor.id, since);
        if (damageMessage?.isOwner) {
            await damageMessage.update({ flavor: `${flavor}${damageMessage.flavor}` });
            return;
        }
    }

    const chatData = {
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor,
    };
    if (damageRoll) {
        chatData.rolls = [damageRoll];
    }
    // v14: visibilidade só vale como opção de criação (ChatMessage#_preCreate).
    await ChatMessage.create(chatData, {
        messageMode: game.settings?.get?.('core', 'messageMode') || 'public',
    });
}

export async function applyBreathingStatus(targetActor, key, effect, { source, eventId } = {}) {
    const kind = actorKind(targetActor);
    if (!kind) return;
    const statusKind = kind === 'oni' || kind === 'oni_minion' ? 'oni' : 'slayer';
    const dataKey = `status_${statusKind}_dados`;
    const summaryKey = `status_${statusKind}_resumo`;
    const exhaustionKey = `status_${statusKind}_exaustao`;
    const props = targetActor.system?.props ?? {};
    const metal = combatPassiveBonuses(props).metal;
    if (effect?.physical !== false && metal.physicalImmunities.includes(key)) return false;
    const fox = source && combatPassiveBonuses(source.system?.props ?? {}).fox;
    if (key === 'desorientado' && fox?.desorientedTurns && effect?.remainingTurns === undefined)
        effect = { ...effect, remainingTurns: fox.desorientedTurns };
    const storedStatus = targetActor.toObject?.()?.system?.props?.[dataKey];
    const state = parseStatusState(storedStatus ?? props[dataKey]);
    if (!state.active.includes(key)) state.active.push(key);
    state.effects[key] = effect;
    await targetActor.update(
        {
            [`system.props.${dataKey}`]: JSON.stringify(state),
            [`system.props.${summaryKey}`]: formatStatusSummary(state.active, state.exhaustion),
            [`system.props.${exhaustionKey}`]: state.exhaustion,
        },
        { naCsbAutomation: true, naBreathing: true }
    );
    if (source && source.uuid !== targetActor.uuid && ['distraido', 'desorientado'].includes(key))
        await recordBreathingPassiveEvent(source, { type: 'statusApplied', condition: key, targetUuid: targetActor.uuid,
            success: true, eventId: eventId ?? passiveExecutionId(source) });
    if (['atordoamento', 'inconsciente', 'inconsciencia'].includes(key))
        await recordBreathingPassiveEvent(targetActor, { type: 'statusApplied', condition: key });
    return true;
}

async function grantActiveSnowBlizzard(actor, targetActor) {
    if (!targetActor) return { ok: false, reason: 'Marque o aliado que receberá Furtividade.' };
    const granted = grantBlizzardStealth(actor.system?.props?.resp_neve_estado, {
        allyUuid: targetActor.uuid,
        allyBreathing: chosenBreathing(targetActor.system?.props),
        currentRound: game.combat?.round ?? 0,
    });
    if (!granted.ok) return granted;
    await actor.update(snowStatePatch(granted.state), { naCsbAutomation: true, naBreathing: true });
    await applyBreathingStatus(targetActor, 'invisivel_inalvejavel', {
        remainingTurns: 1,
        sourceName: 'San no Kata: Burizado',
        tick: 'start',
        stacks: 1,
    });
    await targetActor.setFlag(MODULE_ID, 'snowBlizzardStealth', {
        sourceActorUuid: actor.uuid,
        round: game.combat?.round ?? 0,
    });
    if (granted.pdrRecovery > 0 && ['slayer', 'npc'].includes(actorKind(targetActor))) {
        const { pdrSpent } = breathingResourceKeys(targetActor.system?.props);
        const spent = parseNumber(targetActor.system?.props?.[pdrSpent]);
        await targetActor.update(
            { [`system.props.${pdrSpent}`]: Math.max(0, spent - granted.pdrRecovery) },
            { naCsbAutomation: true, naBreathing: true }
        );
    }
    return granted;
}

export async function attemptSnowRestrictionEscape({ actorUuid } = {}) {
    const document = actorUuid ? await fromUuid(actorUuid) : null;
    const actor =
        document?.actor ??
        document ??
        canvas?.tokens?.controlled?.[0]?.actor ??
        game.user?.character;
    if (!actor) return ui.notifications?.warn?.('Nenhum Actor encontrado para tentar escapar.');
    const flag = actor.getFlag?.(MODULE_ID, 'snowRestriction');
    if (!flag)
        return ui.notifications?.info?.('Este personagem não está restringido por Congelar.');
    const consume = ['oni', 'oni_minion'].includes(actorKind(actor)) ? consumeOniActions : consumeSlayerActions;
    const action = await consume(actor, ['ataque'], { update: false });
    if (!action.ok) return ui.notifications?.warn?.(action.reason);
    const roll = await Roll.create(
        `1d20 + ${resolveSheetAttribute(actor, 'FOR') ?? 0}`
    ).evaluate();
    const message = await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<strong>Congelar</strong> FOR contra CD ${flag.escapeDc}`,
    });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    const outcome = resolveSnowRestrictionEscape(flag, roll.total);
    await actor.update(action.patch, { naCsbAutomation: true, naBreathing: true });
    if (!outcome.escaped)
        return ui.notifications?.warn?.(`${actor.name} não conseguiu escapar de Congelar.`);
    await releaseSnowRestriction(actor);
    ui.notifications?.info?.(`${actor.name} escapou da restrição de Congelar.`);
    return outcome;
}

/**
 * A Canção de um Dia Frio (Nível 3+): quando protege um aliado com Água/Vento/
 * Cristal, esse aliado ganha um Ataque de Oportunidade real contra o inimigo
 * que conjurou o Kekkijutsu (não é dano automático o aliado precisa rolar
 * Acerto normalmente pelo pipeline padrão, sem consumir a economia de ações
 * porque é um ataque concedido, não uma Ação de Ataque comum).
 */
export async function triggerSnowOpportunityAttack({ actorUuid } = {}) {
    const document = actorUuid ? await fromUuid(actorUuid) : null;
    const actor =
        document?.actor ??
        document ??
        canvas?.tokens?.controlled?.[0]?.actor ??
        game.user?.character;
    if (!actor)
        return ui.notifications?.warn?.('Nenhum Actor encontrado para o Ataque de Oportunidade.');
    const flag = actor.getFlag?.(MODULE_ID, 'snowOpportunityAttack');
    if (!flag?.available) {
        ui.notifications?.info?.(
            'Nenhum Ataque de Oportunidade da Canção de um Dia Frio disponível.'
        );
        return { ok: false, reason: 'Nenhum Ataque de Oportunidade disponível.' };
    }
    await actor.unsetFlag(MODULE_ID, 'snowOpportunityAttack');
    const enemyDocument = flag.enemyUuid ? await fromUuid(flag.enemyUuid) : null;
    const enemyActor = enemyDocument?.actor ?? enemyDocument;
    const enemyToken = enemyActor?.getActiveTokens?.()[0];
    if (enemyToken) enemyToken.setTarget(true, { user: game.user, releaseOthers: true });
    ui.notifications?.info?.(
        `${actor.name} ganhou um Ataque de Oportunidade (Canção de um Dia Frio) contra ${enemyActor?.name ?? 'o conjurador do Kekkijutsu'}. Role o Acerto normalmente; este ataque não consome a economia de ações.`
    );
    const { rollHit } = await import('./hit-service.mjs');
    return rollHit({ actor, actorUuid: actor.uuid, skipActionConsumption: true });
}

/**
 * Extrai as fórmulas de dano das técnicas armadas (pendingDamage das sete
 * Respirações) como entradas editáveis para pré-popular o modal de dano.
 */
function breathingTechniqueEntradas(actor) {
    const props = actor?.system?.props ?? {};
    const entradas = [];
    const push = (formula, types) => {
        if (!formula) return;
        entradas.push({
            tipoAcao: 'ataque',
            dado: String(formula),
            fixo: 0,
            attrs: [],
            tiposDano: Array.isArray(types) ? types : [],
        });
    };
    const water = parseWaterBreathingState(props.resp_agua_estado).pendingDamage;
    if (water?.formula) push(water.formula, water.types);
    const flame = parseFlameBreathingState(props.resp_chamas_estado).pendingDamage;
    if (flame?.formula) push(flame.formula, flame.types ?? ['fogo']);
    if (flame?.comboRider?.formula)
        push(flame.comboRider.formula, flame.comboRider.types ?? ['fogo']);
    const mist = parseMistBreathingState(props.resp_nevoa_estado).pendingDamage;
    if (mist?.formula) push(resolveMistFormula(mist.formula, props), ['cortante']);
    const snow = parseSnowBreathingState(props.resp_neve_estado).pendingDamage;
    if (snow?.formula) push(snow.formula, ['congelante']);
    const wind = parseWindBreathingState(props.resp_vento_estado).pendingDamage;
    if (wind?.formula)
        push(
            String(wind.formula).replace(/@(dex|fdv|for)\b/giu, (_m, key) =>
                String(props[`${key.toLowerCase()}_display`] ?? 0)
            ),
            wind.types
        );
    return entradas;
}

/**
 * Resolve o dano de uma Forma já confirmada no Acerto.
 *
 * A maioria das Formas segue o caminho genérico compartilhado com ataques
 * de arma "crus" (`resolveAutoDamage` em attack-follow-up.mjs, que também
 * cobre o fallback de arma quando a técnica não tem dado de dano próprio —
 * ex.: Céu em Chamas Ascendentes, 2ª Forma das Chamas). `nevoa_02` (Oito
 * Camadas) é a única com uma resolução de dano própria (fórmula fixa
 * derivada da contagem de acertos), então continua tratada aqui antes do
 * caminho genérico.
 */
async function rollConfirmedBreathDamage({ actor, form, hitResult, rollDamage, metalHammer }) {
    const successful = hitResult.attempts.filter((attempt) => attempt.hit);
    const nome = form ? `${form.respiracao} ${form.nome}` : 'Ataque';
    if (metalHammer) {
        const { target, mechanics, level, formula } = metalHammer;
        const enemy = target.actor;
        const enemyProps = enemy.toObject?.()?.system?.props ?? enemy.system.props;
        const prone = parseStatusState(enemyProps[statusKeysForProps(enemyProps).data])
            .active.includes('derrubado');
        const damage = prone && mechanics.proneBonus ? `${formula} + ${mechanics.proneBonus}d8` : formula;
        const damageResult = await rollDamage({
            actor, nome: form.nome, breathing: form.respiracao,
            entradas: [{ tipoAcao: 'ataque', dado: damage, fixo: 0, attrs: [], tiposDano: ['concussao'] }],
            targets: new Set([target]),
            critical: successful[0]?.critical === true,
            attackTotal: successful[0]?.roll?.total,
            passiveExecutionId: hitResult.executionId,
            passiveFormId: form.id,
            skipActionConsumption: true, forceAttackDamage: true, skipBreathingInjection: true,
        });
        if (!damageResult?.executed) return;
        const dc = 10 + (resolveSheetAttribute(actor, 'for') ?? 0);
        const vit = resolveSheetAttribute(enemy, 'vit') ?? 0;
        const save = await Roll.create(`1d20 + (${vit})`).evaluate();
        await save.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: enemy }),
            flavor: `Batida de Martelo · VIT CD ${dc} · ${save.total < dc ? 'Falha' : 'Sucesso'}`,
        });
        if (save.total < dc) {
            const stun = level === 4 && prone;
            if (enemy.isOwner || game.user?.isGM) {
                await applyBreathingStatus(enemy, mechanics.condition, { sourceName: form.nome });
                if (stun)
                    await applyBreathingStatus(enemy, 'atordoamento', { remainingTurns: 1, sourceName: form.nome });
            } else {
                const status = level === 1 ? 'Desequilibrado' : 'Derrubado';
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: enemy }),
                    content: `Batida de Martelo · O alvo recebe ${status}${stun ? ' e Atordoamento por 1 turno' : ''}. Aplique na ficha do alvo.`,
                });
            }
        }
        return;
    }
    if (form?.id === 'nevoa_02') {
        const mistState = parseMistBreathingState(actor.system?.props?.resp_nevoa_estado);
        const resolved = resolveEightLayersResult(mistState, successful.length);
        await actor.update(mistStatePatch(resolved.state), {
            naCsbAutomation: true,
            naBreathing: true,
        });
        if (resolved.mode === 'fixed' && resolved.formula) {
            const actionId = foundry.utils.randomID();
            await rollDamage({
                actor,
                nome,
                breathing: form?.respiracao,
                entradas: [
                    {
                        tipoAcao: 'ataque',
                        dado: resolved.formula,
                        fixo: 0,
                        attrs: [],
                        tiposDano: ['cortante'],
                    },
                ],
                actionId,
                skipActionConsumption: true,
                forceAttackDamage: true,
            });
            return;
        }
    }
    const { resolveAutoDamage } = await import('./attack-follow-up.mjs');
    await resolveAutoDamage({
        actor,
        hitResult,
        techniqueLabel: nome,
        breathing: form?.respiracao,
        techniqueEntradas: breathingTechniqueEntradas(actor),
    });
}

async function clearResolvedTechniqueQueue(actor, formId) {
    const props = actor.system?.props ?? {};
    if (formId.startsWith('chamas_')) {
        const state = parseFlameBreathingState(props.resp_chamas_estado);
        delete state.nextHit;
        delete state.pendingDamage;
        await actor.update(flameStatePatch(state), { naCsbAutomation: true, naBreathing: true });
    } else if (formId.startsWith('nevoa_')) {
        const state = parseMistBreathingState(props.resp_nevoa_estado);
        delete state.nextHit;
        delete state.pendingDamage;
        delete state.eightLayers;
        await actor.update(mistStatePatch(state), { naCsbAutomation: true, naBreathing: true });
    } else if (formId.startsWith('neve_')) {
        const state = parseSnowBreathingState(props.resp_neve_estado);
        delete state.nextHit;
        delete state.pendingDamage;
        delete state.pendingTargetEffect;
        await actor.update(snowStatePatch(state), { naCsbAutomation: true, naBreathing: true });
    } else if (formId === 'vento_06') {
        const state = parseWindBreathingState(props.resp_vento_estado);
        if (state.nextHit?.source === formId) delete state.nextHit;
        if (state.pendingDamage?.source === formId) delete state.pendingDamage;
        await actor.update(windStatePatch(state), { naCsbAutomation: true, naBreathing: true });
    }
}

function snapshotActorPatch(actor, patch) {
    return Object.fromEntries(
        Object.keys(patch).map((key) => [
            key,
            foundry.utils.deepClone(foundry.utils.getProperty(actor, key) ?? (key.startsWith('flags.') ? null : undefined)),
        ])
    );
}

function normalizedBreathingName(value) {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR');
}

export function breathingItemsForActor(actor, breathingName) {
    const wanted = normalizedBreathingName(breathingName);
    if (!wanted) return [];
    return [...(actor?.items ?? [])]
        .filter((item) => {
            const props = item?.system?.props ?? {};
            return (
                normalizedBreathingName(props.respiracao_nome) === wanted && Boolean(props.forma_id)
            );
        })
        .sort(
            (left, right) =>
                parseNumber(left.system?.props?.forma_ordem) -
                parseNumber(right.system?.props?.forma_ordem)
        );
}

/** Abre o painel próprio de uma Respiração e reutiliza o pipeline canônico da Forma. */
export async function openBreathingManager({ actorUuid, breathingName } = {}) {
    const doc = actorUuid ? await fromUuid(actorUuid) : null;
    const actor =
        doc?.actor ?? doc ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character;
    if (!actor) return ui.notifications?.warn?.('Nenhum personagem ativo.');
    if (!actor.isOwner && !game.user?.isGM)
        return ui.notifications?.error?.('Você não pode usar técnicas com este personagem.');

    const vanilla = ruleVariant('respiracao') === 'vanilla';
    const visibleForms = () => breathingItemsForActor(actor, breathingName).filter(item => {
        const id = String(item.system?.props?.forma_id ?? '');
        return !id.startsWith('hub_') && (!vanilla || !metalFormById(id)?.homebrewOnly);
    });
    let forms = visibleForms();
    const missingHammer = !vanilla && canonicalBreathing(breathingName) === 'Metal'
        && !forms.some(item => item.system?.props?.forma_id === 'metal_07');
    if (forms.length === 0 || missingHammer) {
        // Importa uma vez do espelho interno para a
        // ficha, para o uuid valer no encadeamento de ataque.
        const { importBreathingForms } = await import('./breathing-catalog.mjs');
        const imported = await importBreathingForms(actor, breathingName, {
            ...(forms.length ? { formIds: ['metal_07'] } : {}),
        });
        if (!imported.ok) ui.notifications?.warn?.(imported.reason);
        if (imported.created?.length)
            ui.notifications?.info?.(
                `${imported.created.length} Forma(s) da Respiração ${breathingName} adicionada(s) à ficha.`
            );
        forms = visibleForms();
    }
    if (forms.length === 0)
        return ui.notifications?.warn?.(
            `Nenhuma Forma da Respiração ${breathingName} foi encontrada.`
        );

    const { dualBreathingCompositeCatalog, dualBreathingVariations, openDualBreathingRegistry } = await import('./slayer/dual-breathing-registry.mjs');
    const variations = dualBreathingVariations(actor).filter(entry => forms.some(item => item.id === entry.baseItemId));
    const primaryLevel = () => getBreathLevel(actor.system.props);
    const options = forms
        .map((item) => {
            const props = item.system?.props ?? {};
            const label = String(props.nome_forma ?? item.name ?? 'Forma');
            return `<option value="${escapeAttr(item.uuid)}">${escapeAttr(label)}</option>`;
        })
        .join('');
    const itemUuid = await foundry.applications.api.DialogV2.wait({
        window: { title: `Respiração ${breathingName}` },
        modal: true,
        rejectClose: false,
        content: `<p>Escolha a Forma que deseja usar.</p><select name="form" style="width:100%">${options}${variations.map(entry => `<option value="variation:${escapeAttr(entry.id)}">${escapeAttr(entry.name)} · Variação</option>`).join('')}</select>`,
        buttons: [
            {
                action: 'use',
                label: 'Usar Forma',
                default: true,
                callback: (_event, button) => button.form.elements.form.value,
            },
            {
                action: 'presets',
                label: 'Presets de dano',
                callback: () => '__damage_presets__',
            },
            { action: 'passives', label: 'Passivas', callback: () => '__combat_passives__' },
            ...(game.user?.isGM && ruleVariant('classes') === 'homebrew' && secondaryBreathingForActor(actor)
                ? [{ action: 'variations', label: 'Registrar Variação', callback: () => '__dual_variations__' }]
                : []),
            ...(canManageDualBreathingPosture(actor)
                ? [{ action: 'posture', label: 'Forma Intermediária', callback: () => '__dual_posture__' }] : []),
            ...(dualBreathingCompositeCatalog(actor, primaryLevel())
                ? [{ action: 'composite', label: 'Forma Composta', callback: () => '__dual_composite__' }] : []),
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!itemUuid) return null;
    if (itemUuid === '__combat_passives__') {
        const { openBreathingPassiveManager } = await import('./breathing-combat-passives.mjs');
        return openBreathingPassiveManager({ actor });
    }
    if (itemUuid === '__damage_presets__')
        return openDamagePresetManager({ actorUuid: actor.uuid, group: breathingName });
    if (itemUuid === '__dual_variations__') return openDualBreathingRegistry(actor);
    if (itemUuid === '__dual_posture__') return openDualBreathingPosture(actor);
    if (itemUuid === '__dual_composite__') return openDualBreathingComposite(actor, primaryLevel);
    if (itemUuid.startsWith('variation:')) {
        const found = variations.find(entry => entry.id === itemUuid.slice('variation:'.length));
        const item = forms.find(entry => entry.id === found?.baseItemId);
        if (!item) return null;
        return useBreathForm({ actorUuid: actor.uuid, itemUuid: item.uuid, variationId: found.id });
    }
    return useBreathForm({ actorUuid: actor.uuid, itemUuid });
}

/**
 * Runtime injetado no pipeline canônico com o ambiente real do Foundry.
 * O pipeline não importa os serviços diretamente (evita ciclo); tudo que ele
 * consome entra por aqui — trocável por um fake nos testes.
 */
function actorAttributeValues(target, fallbackProps) {
    const source = target?.system?.props ?? fallbackProps ?? {};
    return Object.fromEntries(
        ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'].map((key) => [
            key,
            parseNumber(source[`${key}_display`]),
        ])
    );
}

function buildCanonicalRuntime(actor, props, secondary, recheckSecondary, getPostureUse) {
    const executionId = passiveExecutionId(actor);
    return {
        attrValue: (target, key) => actorAttributeValues(target, props)[String(key).toLowerCase()] ?? 0,
        resolveFormula: (target, formula) =>
            resolveAttributeRefs(formula, actorAttributeValues(target, props)),
        getRound: () => (game.combat?.started ? (game.combat.round ?? null) : null),
        notify: ui.notifications,
        consumeActions: (target, types) => consumeSlayerActions(target, types, { update: false }),
        applyPatch: (target, patch) =>
            target.update(patch, { naCsbAutomation: true, naBreathing: true }),
        getProps: (target) => target.system?.props ?? props,
        getPdrCurrent: () => slayerPdrInfo(actor.system?.props ?? props).pdrCurrent,
        pdrSpentKey: breathingResourceKeys(actor.system?.props ?? props).pdrSpent,
        getBreathLevel: () => secondary?.level ?? getBreathLevel(actor.system?.props ?? props),
        getSecondaryUse: recheckSecondary,
        getPostureUse,
        resolveCardTargets: () =>
            [...(game.user?.targets ?? [])].map((token) => token.actor).filter(Boolean),
        roll: (formula) => Roll.create(formula).evaluate(),
        applyStatus: (target, key, effect) => applyBreathingStatus(target, key, effect, { source: actor, eventId: executionId }),
        applyStackingStatus: (target, key, effect) =>
            applyStackingBreathingStatus(target, key, effect),
        applyHeal: async (target, amount, meta) => {
            const { healActor } = await import('./heal-relay.mjs');
            const result = await healActor(target, amount, meta);
            if (target.uuid !== actor.uuid && result?.appliedHeal > 0)
                await recordBreathingPassiveEvent(actor, { type: 'healAlly', success: true, isTechnique: true,
                    targetUuid: target.uuid, amount: result.appliedHeal, eventId: executionId });
            return result;
        },
        checkBuff: (target, buff) => {
            if (!game.combat?.started || !Number.isInteger(game.combat.round))
                return 'O efeito dura turnos. Ative esta Forma em combate.';
            if (activeCombatBuffs(target).some(entry => entry.id === buff.id))
                return `${buff.label} já está ativo.`;
            return '';
        },
        setBuffs: (target, buff) => target.setFlag(MODULE_ID, BUFFS_FLAG, [
            ...activeCombatBuffs(target).filter(entry => entry.id !== buff.id),
            { ...buff, combatId: game.combat.uuid ?? game.combat.id },
        ]),
        rollHit: async (options) => {
            const { rollHit } = await import('./hit-service.mjs');
            return rollHit(options);
        },
        rollDamage: async (options) => {
            const { rollDamage } = await import('./damage-service.mjs');
            return rollDamage(options);
        },
        weaponEntriesFor: async (target, weapon) => {
            const weaponItem = target.items?.get?.(weapon?.id) ?? null;
            if (!weaponItem) return [];
            const { buildWeaponDamageCatalog } = await import('./damage-service.mjs');
            const key = String(weaponItem.uuid ?? weaponItem.id ?? weaponItem.name);
            const profileIndex = Number.isInteger(weapon?.profileIndex) ? weapon.profileIndex : 0;
            return (
                buildWeaponDamageCatalog(target).find(
                    (entry) => entry.id === `${key}::${profileIndex}`
                )?.entries ?? []
            );
        },
        getPdrSurcharge: () =>
            getDamageStatusEffects(actor.system?.props ?? props).pdrSurcharge ?? 0,
        postUsage: ({ actor: user, form, level, custo, pdv, dados, displayName }) => {
            const estilo = form.estilo ? `[${form.estilo}º Estilo] ` : '';
            const texto = dados?.texto
                ? `<div style="font-size:12px;color:#aaa;margin-top:4px;">${dados.texto}</div>`
                : '';
            const feeds = Object.entries(form.feedsUsar ?? {})
                .filter(([, value]) => Number(value) > 0)
                .map(([key, value]) => `${key} ${value}`)
                .join(', ');
            const feedsLine = feeds
                ? `<div style="font-size:12px;color:#888;">feeds: ${feeds}</div>`
                : '';
            return ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: user }),
                content: `<div class="na-breath-chat" style="border-left:3px solid #28D7FF;padding:8px 12px;"><strong>${estilo}${escapeAttr(displayName || form.ptName || form.nome)}</strong><div style="font-size:12px;color:#888;">${form.respiracao} · Nível ${level} · −${custo} PDR${pdv ? ` e −${pdv} PDV` : ''}</div>${texto}${feedsLine}</div>`,
            });
        },
    };
}

/**
 * API pública: executa uma forma de respiração a partir de um item CSB.
 * @param {object} options
 * @param {string} options.itemUuid - UUID do item (forma de respiração)
 * @param {string} [options.actorUuid] - UUID do actor (fallback)
 * @returns {Promise<void>}
 */
export async function useBreathForm({ itemUuid, actorUuid, variationId } = {}) {
    if (!itemUuid) {
        ui.notifications?.warn?.('UUID do item não fornecido.');
        return;
    }

    const item = await fromUuid(itemUuid);
    if (!item) {
        ui.notifications?.warn?.('Item não encontrado.');
        return;
    }

    const actor = await resolveActorFromItem(item, actorUuid);
    if (!actor) {
        ui.notifications?.warn?.('Nenhum personagem encontrado para usar a respiração.');
        return;
    }

    if (!actor.isOwner) {
        ui.notifications?.error?.('Você não pode usar técnicas com este personagem.');
        return;
    }

    const form = getFormData(item);
    const handlesPosture = canManageDualBreathingPosture(actor);
    const secondaryUse = breathing => secondaryBreathingUse(actor, breathing, game.combat, { deferTurnLimit: handlesPosture });
    let getUse = () => secondaryUse(form.respiracao);
    if (variationId) {
        const { dualBreathingVariations } = await import('./slayer/dual-breathing-registry.mjs');
        const currentVariation = () => dualBreathingVariations(actor).find(entry => entry.id === variationId);
        const approved = currentVariation();
        if (!approved || [...(actor.items ?? [])].find(entry => entry.id === approved.baseItemId)?.uuid !== item.uuid)
            return ui.notifications?.warn?.('A Variação não está aprovada para esta Forma e ficha.');
        form.dualVariation = approved;
        form.nome = approved.name;
        const fingerprint = JSON.stringify(approved);
        getUse = () => {
            if (JSON.stringify(currentVariation()) !== fingerprint)
                return { ok: false, reason: 'O registro da Variação mudou. Abra a Forma novamente.' };
            const secondaryBreathing = secondaryBreathingForActor(actor);
            const usage = secondaryUse(secondaryBreathing);
            if (!usage?.ok) return usage ?? { ok: false, reason: 'Respiração Secundária indisponível.' };
            return {
                ...usage,
                level: canonicalBreathing(form.respiracao) === secondaryBreathing ? usage.level : null,
                cost: { ...usage.cost, pdr: usage.cost.pdr + approved.extraPdr + Number(approved.kind === 'derived') },
            };
        };
    }
    if (metalFormById(form.id)?.homebrewOnly && ruleVariant('respiracao') !== 'homebrew')
        return ui.notifications?.warn?.('Esta Forma pertence à Respiração do Metal Homebrew.');
    if (form.levels.length === 0) {
        ui.notifications?.warn?.('Nenhum nível disponível para esta forma.');
        return;
    }

    const props = actor.system?.props ?? {};
    if (
        form.id === 'neve_03' &&
        parseSnowBreathingState(props.resp_neve_estado).blizzard?.turns > 0
    ) {
        const targetActor = [...(game.user?.targets ?? [])][0]?.actor ?? null;
        const granted = await grantActiveSnowBlizzard(actor, targetActor);
        if (!granted.ok) ui.notifications?.warn?.(granted.reason);
        return;
    }
    // Passiva declarada no dado canônico (Troca Equivalente, Olhos Escarlate...): sem ação nem PDR.
    if (isMigrated(form.respiracao) && resolveForm(form.respiracao, form.id)?.passiva) {
        ui.notifications?.info?.(
            `${form.nome ?? form.id} é uma passiva: não gasta ação nem PDR. Leia a descrição na Forma.`
        );
        return;
    }
    if (isPassiveItem(form.id)) {
        const passiveName = form.id === 'metal_05' ? 'Martelo do Julgamento' : 'Congelar';
        ui.notifications?.info?.(
            `${passiveName} é uma passiva automática e não gasta ação ou PDR.`
        );
        return;
    }
    if (form.id === 'chamas_01') return executeBreathForm(actor, item, form);
    const secondary = getUse();
    if (!secondary && !handlesPosture) return executeBreathForm(actor, item, form);
    if (secondary && !secondary.ok) return ui.notifications?.warn?.(secondary.reason);
    if (secondaryFormsInFlight.has(actor))
        return ui.notifications?.warn?.('Já existe uma Forma da Respiração Secundária em andamento.');
    secondaryFormsInFlight.add(actor);
    try {
        return await executeBreathForm(actor, item, form, secondary, getUse, handlesPosture);
    } finally {
        secondaryFormsInFlight.delete(actor);
    }
}

async function executeBreathForm(actor, item, form, secondary, getUse, handlesPosture = false) {
    // Última mensagem antes deste uso: o dano que vier depois recebe o cartão da Forma.
    const chatSince = game.messages?.contents?.at(-1)?.id ?? '';
    const props = actor.system?.props ?? {};
    const postureTurn = handlesPosture ? flameTurnKey(game.combat) : null;
    const recheckSecondary = secondary ? () => {
        const current = getUse();
        if (current && !current.ok) return current;
        if (!current || current.level !== secondary.level || current.turnKey !== secondary.turnKey ||
            current.primary !== secondary.primary ||
            current.cost.pdr !== secondary.cost.pdr || current.cost.pdv !== secondary.cost.pdv)
            return { ok: false, reason: 'A Respiração Secundária mudou enquanto a Forma estava aberta. Abra a Forma novamente.' };
        return current;
    } : undefined;
    const getPostureUse = handlesPosture ? (actions, pdrCost, pdvCost = 0, reservedPdr = 0) => {
        if (flameTurnKey(game.combat) !== postureTurn || !canManageDualBreathingPosture(actor))
            return { ok: false, reason: 'As condições da Forma Intermediária mudaram.' };
        const plan = planPostureTechniqueUse(actor, { breathing: form.respiracao, variation: form.dualVariation,
            actions, pdrCost, pdvCost, reservedPdr });
        if (plan?.ok && plan.extraPdv) {
            const live = actor.system.props;
            const key = actorKind(actor) === 'npc' ? 'npc_pdv_dano' : 'pdv_slayer_dano_tomado';
            plan.patch[`system.props.${key}`] = parseNumber(live[key]) + pdvCost + plan.extraPdv;
        }
        return plan;
    } : undefined;
    const { pdrCurrent } = slayerPdrInfo(props);
    const baseBreathLevel = secondary?.level ?? getBreathLevel(props);
    const breathLevel = !secondary && snowFormById(form.id)
        ? snowEffectiveBreathLevel(baseBreathLevel, props.resp_neve_estado)
        : baseBreathLevel;

    if (breathLevel < form.nivelReq) {
        ui.notifications?.warn?.(
            `Requer Nível de Respiração ${form.nivelReq}. Atual: ${breathLevel}.`
        );
        return;
    }

    const statusEffects = getDamageStatusEffects(props);
    if (statusEffects.blocked) {
        ui.notifications?.warn?.('Este personagem está incapacitado e não pode usar técnicas.');
        return;
    }

    if (form.id === 'chamas_01') {
        const selected = form.levels.find((level) => level.level <= breathLevel) ?? form.levels[0];
        await postBreathChat({ since: chatSince,
            actor,
            form,
            selected: { ...selected, custo: 0 },
            damageRoll: null,
        });
        ui.notifications?.info?.(
            'Esquentar é uma passiva: o módulo controla Fogo Fátuo e Brasas Ardentes automaticamente.'
        );
        return;
    }

    const dialogResult = await openBreathDialog({ form, pdrCurrent, breathLevel, secondaryCost: secondary?.cost });
    if (!dialogResult) return;

    const selected = form.levels.find((l) => l.level === dialogResult.level);
    if (!selected || selected.level > breathLevel) {
        ui.notifications?.warn?.('Nível selecionado inválido.');
        return;
    }

    // Dano escolhido pelo jogador: valida antes de gastar qualquer recurso e guarda no Item.
    let damageChoice = null;
    if (offersDamageChoice(form, [selected]) && dialogResult.damage !== null) {
        const attrValues = Object.fromEntries(
            ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'].map((key) => [
                key,
                parseNumber(props[`${key}_display`]),
            ])
        );
        const chosen = resolveChosenDamage(dialogResult.damage, selected.dano, attrValues);
        if (!chosen.ok) {
            ui.notifications?.warn?.(chosen.reason);
            return;
        }
        if (chosen.formula && chosen.formula !== selected.dano)
            await item.update({ [`system.props.nvl${selected.level}_dano`]: chosen.formula });
        const tableForm =
            flameFormById(form.id, ruleVariant('respiracao')) ?? windFormById(form.id) ?? snowFormById(form.id) ?? null;
        damageChoice = {
            formId: form.id,
            // O plano escreve o dano da tabela; é ele que o escolhido substitui.
            base: String(tableForm?.levels?.[selected.level - 1]?.damage ?? selected.dano ?? ''),
            chosen: chosen.formula,
        };
        // Formas sem Acerto rolam direto de `selected.dano`: passa a valer o escolhido.
        if (chosen.formula) selected.dano = chosen.formula;
    }

    // Respiração migrada: o dado canônico assume daqui (rota legada abaixo
    // permanece para as demais até a leva de cada uma).
    if (isMigrated(form.respiracao) && !form.id.startsWith('custom_')) {
        const runtime = buildCanonicalRuntime(actor, props, secondary, recheckSecondary, getPostureUse);
        return runCanonicalBreathingForm({
            actor,
            respiracao: form.respiracao,
            // forma_id é do item; `props` aqui é a ficha do ator.
            formaId: item.system?.props?.forma_id,
            level: selected.level,
            runtime,
            damageOverride: damageChoice?.chosen || null,
            displayName: form.dualVariation?.name,
        });
    }

    const isWaterForm = Boolean(waterFormById(form.id));
    const isFlameForm = Boolean(flameFormById(form.id));
    const isMistForm = Boolean(mistFormById(form.id));
    const isMetalForm = Boolean(metalFormById(form.id));
    const isSnowForm = Boolean(snowFormById(form.id));
    const isWindForm = Boolean(windFormById(form.id));
    const choices = isWaterForm
        ? await collectWaterChoices(actor, form, selected.level, props)
        : isFlameForm
          ? await collectFlameChoices(actor, form, props)
          : isWindForm
            ? await collectWindChoices(actor, form, selected.level, props)
            : await collectCuratedChoices(actor, form, selected.level, props);
    if (choices?.cancelled) {
        if (choices.reason) ui.notifications?.warn?.(choices.reason);
        return;
    }
    if (form.id === 'chamas_07') {
        const combat = game.combat;
        const turnKey = flameTurnKey(combat);
        if (!turnKey || combat.combatant?.actor?.uuid !== actor.uuid) {
            ui.notifications?.warn?.('Universo Flamejante deve ser preparado no seu turno.');
            return;
        }
        choices.turnKey = turnKey;
    }
    const plan = isWaterForm
        ? buildWaterBreathingPlan(form.id, selected.level, props, choices)
        : isFlameForm
          ? buildFlameBreathingPlan(form.id, selected.level, props, choices)
          : isMistForm
            ? buildMistBreathingPlan(form.id, selected.level, props, choices)
            : isMetalForm
              ? buildMetalBreathingPlan(form.id, selected.level, props, choices)
              : isSnowForm
                ? buildSnowBreathingPlan(form.id, selected.level, props, choices)
                : isWindForm
                  ? buildWindBreathingPlan(form.id, selected.level, props, choices)
                  : buildGenericBreathingPlan(form, selected);
    if (!plan.ok) {
        ui.notifications?.warn?.(plan.reason);
        return;
    }

    const dualBreathingPair = ruleVariant('classes') === 'vanilla' &&
        parseLevel(props.nvl_num ?? props.npc_nivel ?? props.nvl_pj) >= 2
        ? [chosenBreathing(props), secondaryBreathingForActor(actor)]
        : [];
    const waterSnowStateKey = form.id === 'agua_01' ? 'system.props.resp_agua_estado'
        : form.id === 'neve_01' ? 'system.props.resp_neve_estado' : null;
    const canUseWaterSnowSynergy = waterSnowStateKey && plan.patch[waterSnowStateKey] &&
        dualBreathingPair.includes('Água') && dualBreathingPair.includes('Neve');
    const useWaterSnowSynergy = canUseWaterSnowSynergy &&
        await confirmRule('Sinergia Água e Neve', 'Pagar +1 PDR para somar INT ao dano desta Forma?');
    const useStoneMetalSynergy = form.id === 'metal_01' &&
        dualBreathingPair.includes('Pedra') && dualBreathingPair.includes('Metal') &&
        await confirmRule('Sinergia Pedra e Metal', 'Pagar +1 PDR para reduzir o dano de ataques em VIT enquanto Metalizado durar?');
    const synergyCost = useWaterSnowSynergy || useStoneMetalSynergy ? 1 : 0;

    const secondaryPayment = recheckSecondary?.();
    if (secondaryPayment && !secondaryPayment.ok) {
        ui.notifications?.warn?.(secondaryPayment.reason);
        return;
    }
    const usesLiveResources = Boolean(secondaryPayment || synergyCost);
    const paymentProps = usesLiveResources ? actor.system.props : props;
    const pdrAvailable = usesLiveResources ? slayerPdrInfo(paymentProps).pdrCurrent : pdrCurrent;
    let custoFinal = plan.cost + (secondaryPayment?.cost.pdr ?? 0) + synergyCost;
    if (statusEffects.pdrSurcharge > 0 && custoFinal > 0) {
        custoFinal += statusEffects.pdrSurcharge;
        ui.notifications?.info?.(
            `Fadiga Espiritual: +${statusEffects.pdrSurcharge} PDR (custo total: ${custoFinal}).`
        );
    }

    if (custoFinal > pdrAvailable) {
        ui.notifications?.warn?.(
            `PDR insuficiente! Disponível: ${pdrAvailable}, necessário: ${custoFinal}.`
        );
        return;
    }

    const tiposManobra = (plan.actions ?? [plan.action])
        .filter(Boolean)
        .map((action) => normalizeManobra(action) ?? action);
    const postureUse = getPostureUse?.(tiposManobra, custoFinal, secondaryPayment?.cost.pdv);
    if (postureUse && !postureUse.ok) return ui.notifications?.warn?.(postureUse.reason);
    const tipoManobra = tiposManobra[0] ?? null;
    const flameNeedsAttackResolution =
        isFlameForm && form.id !== 'chamas_07' && Boolean(plan.state?.nextHit || plan.state?.pendingDamage);
    const mistNeedsAttackResolution =
        isMistForm && ['nevoa_01', 'nevoa_02', 'nevoa_04', 'nevoa_06'].includes(form.id) && !plan.state?.dexFailed;
    const metalNeedsAttackResolution = isMetalForm && ['metal_06', 'metal_07'].includes(form.id)
        && plan.action === 'ataque';
    const snowNeedsAttackResolution =
        isSnowForm && ['neve_01', 'neve_02', 'neve_05'].includes(form.id);
    const windNeedsAttackResolution = isWindForm && form.id === 'vento_06';
    const needsAttackResolution = flameNeedsAttackResolution || mistNeedsAttackResolution ||
        metalNeedsAttackResolution || snowNeedsAttackResolution || windNeedsAttackResolution;
    const patch = { ...plan.patch };
    // Pagar PDV só após o Acerto evita iniciar Vida e Morte ao cancelar o diálogo.
    if (!needsAttackResolution) Object.assign(patch, secondaryPayment?.patch, postureUse?.patch);
    const costForChat = { custo: custoFinal, pdv: (secondaryPayment?.cost.pdv ?? 0) + (postureUse?.extraPdv ?? 0) };
    if (damageChoice) Object.assign(patch, applyChosenDamageToPatch(patch, damageChoice));
    if (useWaterSnowSynergy) {
        const state = JSON.parse(patch[waterSnowStateKey]);
        const intelligence = resolveSheetAttribute(actor, 'int') ?? 0;
        state.pendingDamage.formula = `(${state.pendingDamage.formula}) + (${intelligence})`;
        patch[waterSnowStateKey] = JSON.stringify(state);
        if (form.id === 'agua_01') patch['system.props.resp_bonus_dano_dados'] = state.pendingDamage.formula;
    }
    if (useStoneMetalSynergy) {
        const state = parseMetalBreathingState(patch['system.props.resp_metal_estado']);
        state.metalized.stoneSynergyReduction = Math.max(0, resolveSheetAttribute(actor, 'vit') ?? 0);
        Object.assign(patch, metalStatePatch(state));
    }
    const actionResult = { ok: true };

    if (tiposManobra.length) {
        if (isMetalForm && form.id === 'metal_06' && plan.action === 'especial') {
            const standardAttack = await consumeSlayerActions(actor, ['ataque'], { update: false });
            if (!standardAttack.ok) return ui.notifications?.warn?.(standardAttack.reason);
        }
        const res = await consumeSlayerActions(actor, tiposManobra, { update: false });
        if (!res.ok) {
            ui.notifications?.warn?.(res.reason);
            return;
        }
        actionResult.ok = true;
        if (res.patch && Object.keys(res.patch).length > 0) {
            Object.assign(patch, res.patch);
        }
    }

    if (custoFinal > 0) {
        const { pdrSpent } = breathingResourceKeys(props);
        patch[`system.props.${pdrSpent}`] = parseNumber(paymentProps[pdrSpent]) + custoFinal;
    }

    let rollbackPatch = null;
    if (tipoManobra === 'reacao')
        patch['system.props.resp_passivas_defesa_forma'] = JSON.stringify({ formId: form.id,
            combatId: String(game.combat?.uuid ?? game.combat?.id ?? '') });
    if (Object.keys(patch).length > 0) {
        rollbackPatch = snapshotActorPatch(actor, patch);
        await actor.update(patch, { naCsbAutomation: true, naBreathForm: true });
    }
    if (
        isFlameForm &&
        form.id === 'chamas_09' &&
        Array.isArray(plan.state?.rengokuAllies) &&
        plan.state.rengokuAllies.length
    ) {
        for (const allyUuid of plan.state.rengokuAllies) {
            const allyDocument = await fromUuid(allyUuid);
            const allyActor = allyDocument?.actor ?? allyDocument;
            if (!allyActor?.system?.props) continue;
            const { pdrSpent } = breathingResourceKeys(allyActor.system.props);
            const gasto = parseNumber(allyActor.system.props[pdrSpent]);
            await allyActor.update(
                { [`system.props.${pdrSpent}`]: gasto + FLAME_SYNERGY_PDR_COST },
                { naCsbAutomation: true }
            );
        }
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: '<strong>Rengoku Sinergia de Aliados</strong>',
            content: `${plan.state.rengokuAllies.length} aliado(s) gastaram ${FLAME_SYNERGY_PDR_COST} PDR cada: +${plan.state.rengokuAllies.length * FLAME_SYNERGY_DAMAGE_PER_ALLY} de dano se o ataque acertar.`,
        });
    }
    if (isSnowForm && form.id === 'neve_03' && choices.allyUuid) {
        const allyDocument = await fromUuid(choices.allyUuid);
        const allyActor = allyDocument?.actor ?? allyDocument;
        const granted = await grantActiveSnowBlizzard(actor, allyActor);
        if (!granted.ok) ui.notifications?.warn?.(granted.reason);
    }
    if (
        isSnowForm &&
        form.id === 'neve_07' &&
        plan.state.kekkijutsuGuard?.canProtectAlly &&
        plan.state.kekkijutsuGuard.protectedUuid &&
        plan.state.kekkijutsuGuard.protectedUuid !== actor.uuid
    ) {
        const protectedDocument = await fromUuid(plan.state.kekkijutsuGuard.protectedUuid);
        const protectedActor = protectedDocument?.actor ?? protectedDocument;
        if (protectedActor?.setFlag)
            await protectedActor.setFlag(MODULE_ID, 'snowKekkijutsuGuardSource', {
                sourceActorUuid: actor.uuid,
            });
    }
    if (isMistForm && form.id === 'nevoa_08' && plan.state?.dazzle?.allyUuid) {
        const allyDocument = await fromUuid(plan.state.dazzle.allyUuid);
        const allyActor = allyDocument?.actor ?? allyDocument;
        if (allyActor?.update && allyActor.uuid !== actor.uuid) {
            const allyState = parseMistBreathingState(allyActor.system?.props?.resp_nevoa_estado);
            allyState.dazzle = { ...plan.state.dazzle, sourceActorUuid: actor.uuid };
            await allyActor.update(mistStatePatch(allyState), {
                naCsbAutomation: true,
                naBreathing: true,
            });
            const ownerState = parseMistBreathingState(actor.system?.props?.resp_nevoa_estado);
            delete ownerState.dazzle;
            await actor.update(mistStatePatch(ownerState), {
                naCsbAutomation: true,
                naBreathing: true,
            });
        }
    }

    if (isMistForm && form.id === 'nevoa_06' && plan.state?.dexFailed) {
        // Névoa sob o Luar: o custo de DECLARAÇÃO (2 PDR) já foi cobrado acima,
        // mesmo com o teste de DEX falho. A Forma não entra em funcionamento —
        // sem SAB nos ataques, sem cadeia, sem Colapso e nenhum dano é criado.
        await postBreathChat({ since: chatSince,
            actor,
            form,
            selected: { ...selected, ...costForChat },
            damageRoll: null,
        });
        ui.notifications?.info?.(
            'Névoa sob o Luar: falhou no teste de DEX CD 12. O custo de declaração já foi pago, mas a técnica não teve efeito.'
        );
        return { ok: true };
    }

    if (needsAttackResolution) {
        const [{ rollHit }, { rollDamage }] = await Promise.all([
            import('./hit-service.mjs'),
            import('./damage-service.mjs'),
        ]);
        // autoDamage:false este fluxo de Forma resolve seu próprio dano
        // abaixo (encadeamento opcional + resolução específica da técnica), o
        // rollHit padrão NÃO deve disparar o dano sozinho aqui.
        const hitResult = await rollHit({
            actor,
            actorUuid: actor.uuid,
            isTechnique: true,
            formId: form.id,
            autoDamage: false,
            skipActionConsumption: true,
            requiredWeaponId: isFlameForm ? plan.state?.synchronizedWeapon?.id : '',
            ...(form.id === 'chamas_03' ? { forceRollCount: 1, forceActionType: 'ataque' } : {}),
            ...(windNeedsAttackResolution ? { forceRollCount: plan.state.nextHit.count, forceActionType: 'ataque' } : {}),
            ...(choices.hammerTarget ? { targets: new Set([choices.hammerTarget]), forceRollCount: 1, forceActionType: 'ataque' } : {}),
        });
        const finalPayment = hitResult?.attempts?.length ? recheckSecondary?.() : null;
        const finalPostureUse = hitResult?.attempts?.length
            ? getPostureUse?.(tiposManobra, custoFinal, finalPayment?.cost.pdv, custoFinal) : null;
        if (!hitResult?.attempts?.length || (finalPayment && !finalPayment.ok) || (finalPostureUse && !finalPostureUse.ok)) {
            if (rollbackPatch && Object.keys(rollbackPatch).length > 0) {
                await actor.update(rollbackPatch, {
                    naCsbAutomation: true,
                    naBreathRollback: true,
                });
            }
            const refusal = finalPayment?.reason ?? finalPostureUse?.reason;
            if (refusal) ui.notifications?.warn?.(refusal);
            return;
        }
        const pendingCharge = { ...finalPayment?.patch, ...finalPostureUse?.patch };
        if (Object.keys(pendingCharge).length)
            await actor.update(pendingCharge, { naCsbAutomation: true, naBreathForm: true });
        costForChat.pdv = (finalPayment?.cost.pdv ?? 0) + (finalPostureUse?.extraPdv ?? 0);
        if (hitResult.hits < 1) {
            await clearResolvedTechniqueQueue(actor, form.id);
            await postBreathChat({ since: chatSince,
                actor,
                form,
                selected: { ...selected, ...costForChat },
                damageRoll: null,
            });
            return { ok: true };
        }

        if (isSnowForm && form.id === 'neve_02' && plan.state?.pendingTargetEffect) {
            // Inverno Sombrio é uma Forma em Área (raio 5m): todo inimigo marcado
            // como alvo do usuário recebe a mesma penalidade de Nível, não apenas
            // o primeiro alvo selecionado.
            const areaTargets = [...(game.user?.targets ?? [])]
                .map((token) => token.actor)
                .filter(Boolean);
            for (const enemyActor of areaTargets) {
                await enemyActor.setFlag(MODULE_ID, 'snowPenalty', plan.state.pendingTargetEffect);
            }
        }
        if (!(isSnowForm && form.id === 'neve_02')) {
            // Ponto de decisão pós-Acerto: pergunta se o jogador quer encadear
            // outra Forma antes do dano (nunca trava "Não"/diálogo fechado
            // segue direto para o dano desta técnica).
            const { confirmChainedForma } = await import('./attack-follow-up.mjs');
            const chained = !choices.hammerTarget && await confirmChainedForma(actor, { excludeItemUuid: item.uuid });
            if (!chained)
                await rollConfirmedBreathDamage({
                    actor,
                    form,
                    hitResult,
                    rollDamage,
                    metalHammer: choices.hammerTarget ? {
                        target: choices.hammerTarget, mechanics: plan.selected, level: selected.level,
                        formula: resolveGenericDamageFormula(selected.dano, props),
                    } : null,
                });
        }
        await clearResolvedTechniqueQueue(actor, form.id);
        await postBreathChat({ since: chatSince,
            actor,
            form,
            selected: { ...selected, ...costForChat },
            damageRoll: null,
        });
        return { ok: true };
    }

    if (form.id === 'agua_05') {
        const { resolveAutoDamage } = await import('./attack-follow-up.mjs');
        await resolveAutoDamage({
            actor, techniqueLabel: form.nome, breathing: form.respiracao,
            hitResult: { attempts: [{ hit: true, critical: true }], formId: form.id,
                isTechnique: true, executionId: passiveExecutionId(actor) },
            targets: new Set([choices.target]),
        });
    }
    // Vento com fórmula própria no pendingDamage (cicatrizes, DEX): o dano sai no Acerto pelo
    // damage-service (injeção de windDamage). Rolar selected.dano aqui somava o texto errado do
    // catálogo ("10d10 + 2") ao dano certo, sem os termos de cicatriz e DEX.
    const windDamageOnHit = isWindForm && !windNeedsAttackResolution &&
        Boolean(parseWindBreathingState(plan.patch?.['system.props.resp_vento_estado']).pendingDamage?.formula);
    const genericFormula =
        isWaterForm || isFlameForm || windDamageOnHit ? '' : resolveGenericDamageFormula(selected.dano, props);
    const damageRoll = genericFormula ? await new Roll(genericFormula).evaluate() : null;
    if (damageRoll && game.dice3d?.showForRoll)
        await game.dice3d.showForRoll(damageRoll, game.user, true);
    await postBreathChat({ since: chatSince, actor, form, selected: { ...selected, ...costForChat }, damageRoll });
    return { ok: true };
}

function primaryActiveGm() {
    return (
        game.users
            ?.filter((user) => user.active && user.isGM)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null
    );
}

export function registerBreathingEngine() {
    const flameTurnProcessing = new Set();
    const clearCombatFlames = async (combat) => {
        if (!game.user?.isGM || primaryActiveGm()?.id !== game.user.id) return;
        const tasks = [];
        for (const combatant of combat.combatants ?? []) {
            const actor = combatant.actor;
            if (actor?.system?.props?.resp_chamas_estado)
                tasks.push(
                    actor.update(clearFlameBreathingState(), {
                        naCsbAutomation: true,
                        naBreathing: true,
                    })
                );
            const stonePassive = parseBreathPassiveState(
                actor?.system?.props?.resp_passivas_estado
            );
            if (actor?.system?.props?.resp_pedra_estado || stonePassive.stone)
                tasks.push(
                    actor.update(
                        {
                            ...(actor?.system?.props?.resp_pedra_estado
                                ? clearStoneBreathingState(actor.system.props.resp_pedra_estado)
                                : {}),
                            ...passiveStatePatch(clearStonePassiveState(stonePassive)),
                        },
                        { naCsbAutomation: true, naBreathing: true }
                    )
                );
            if (actor?.system?.props?.resp_nevoa_estado)
                tasks.push(
                    actor.update(clearMistBreathingState(actor.system.props.resp_nevoa_estado), {
                        naCsbAutomation: true,
                        naBreathing: true,
                    })
                );
            if (actor?.system?.props?.resp_metal_estado)
                tasks.push(
                    actor.update(clearMetalBreathingState(actor.system.props.resp_metal_estado), {
                        naCsbAutomation: true,
                        naBreathing: true,
                    })
                );
            if (actor?.system?.props?.resp_neve_estado)
                tasks.push(
                    actor.update(clearSnowBreathingState(actor.system.props.resp_neve_estado), {
                        naCsbAutomation: true,
                        naBreathing: true,
                    })
                );
            if (actor?.getFlag?.(MODULE_ID, 'flameHeat'))
                tasks.push(actor.unsetFlag(MODULE_ID, 'flameHeat'));
            if (actor?.getFlag?.(MODULE_ID, 'flameBlockPenalty'))
                tasks.push(actor.unsetFlag(MODULE_ID, 'flameBlockPenalty'));
            for (const flag of ['flameEmberTurn', 'flameSelfTurn', 'flameInterception'])
                if (actor?.getFlag?.(MODULE_ID, flag)) tasks.push(actor.unsetFlag(MODULE_ID, flag));
        }
        await Promise.allSettled(tasks);
    };
    Hooks.on('updateCombat', (combat, changes) => {
        if (
            !game.user?.isGM ||
            primaryActiveGm()?.id !== game.user.id ||
            (!Object.hasOwn(changes, 'turn') && !Object.hasOwn(changes, 'round'))
        )
            return;
        const actor = combat?.combatant?.actor;
        if (!actor?.system?.props) return;
        const flameBlock = actor.getFlag?.(MODULE_ID, 'flameBlockPenalty');
        if (Number(flameBlock?.turns) > 0) {
            const turns = Number(flameBlock.turns) - 1;
            if (turns > 0)
                void actor.setFlag(MODULE_ID, 'flameBlockPenalty', { ...flameBlock, turns });
            else void actor.unsetFlag(MODULE_ID, 'flameBlockPenalty');
        }
        const snowPenalty = actor.getFlag?.(MODULE_ID, 'snowPenalty');
        if (Number(snowPenalty?.turns) > 0) {
            const turns = Number(snowPenalty.turns) - 1;
            if (turns > 0) void actor.setFlag(MODULE_ID, 'snowPenalty', { ...snowPenalty, turns });
            else void actor.unsetFlag(MODULE_ID, 'snowPenalty');
        }
        const snowMovementPenalty = actor.getFlag?.(MODULE_ID, 'snowMovementPenalty');
        if (Number(snowMovementPenalty?.turns) > 0) {
            const turns = Number(snowMovementPenalty.turns) - 1;
            if (turns > 0)
                void actor.setFlag(MODULE_ID, 'snowMovementPenalty', {
                    ...snowMovementPenalty,
                    turns,
                });
            else void actor.unsetFlag(MODULE_ID, 'snowMovementPenalty');
        }
        const mistSuppression = actor.getFlag?.(MODULE_ID, 'mistResistanceSuppression');
        if (Number(mistSuppression?.turns) > 0) {
            const turns = Number(mistSuppression.turns) - 1;
            if (turns > 0)
                void actor.setFlag(MODULE_ID, 'mistResistanceSuppression', {
                    ...mistSuppression,
                    turns,
                });
            else void actor.unsetFlag(MODULE_ID, 'mistResistanceSuppression');
        }
        if (actor.system.props.resp_agua_estado)
            void actor.update(tickWaterBreathing(actor.system.props), {
                naCsbAutomation: true,
                naBreathing: true,
            });
        if (actor.system.props.resp_pedra_estado)
            void actor.update(tickStoneBreathing(actor.system.props.resp_pedra_estado).patch, {
                naCsbAutomation: true,
                naBreathing: true,
            });
        if (actor.system.props.resp_nevoa_estado)
            void actor.update(tickMistBreathing(actor.system.props.resp_nevoa_estado), {
                naCsbAutomation: true,
                naBreathing: true,
            });
        if (actor.system.props.resp_metal_estado)
            void actor.update(tickMetalBreathing(actor.system.props.resp_metal_estado).patch, {
                naCsbAutomation: true,
                naBreathing: true,
            });
        if (actor.system.props.resp_neve_estado) {
            const tick = snowTickPatchWithExhaustion(
                actor.system.props.resp_neve_estado,
                actor.system.props.status_slayer_exaustao
            );
            void actor.update(tick.patch, { naCsbAutomation: true, naBreathing: true });
        }
        if (actor.system.props.resp_chamas_estado) {
            const turnKey = `${combat.uuid ?? combat.id}:${combat.round}:${combat.turn}`;
            const pendingKey = `${actor.uuid ?? actor.id}:${turnKey}`;
            if (flameTurnProcessing.has(pendingKey) || actor.getFlag?.(MODULE_ID, 'flameSelfTurn') === turnKey) return;
            flameTurnProcessing.add(pendingKey);
            const tick = tickFlameBreathing(actor.system.props.resp_chamas_estado);
            void (async () => {
                try {
                    for (const event of tick.events) {
                        const context = { isAttack: false, source: event.source, attackName: event.source,
                            damageTypes: [event.damageType],
                            components: [{ label: event.source, types: [event.damageType], subtotal: event.amount }] };
                        if (actorKind(actor) === 'npc') {
                            const { applyOniDamage } = await import('./damage-relay.mjs');
                            await applyOniDamage(actor, event.amount, context);
                        } else await applySlayerDamage(actor, event.amount, context);
                    }
                    await actor.update(tick.patch, { naCsbAutomation: true, naBreathing: true });
                    await actor.setFlag(MODULE_ID, 'flameSelfTurn', turnKey);
                } finally { flameTurnProcessing.delete(pendingKey); }
            })();
        }
    });
    Hooks.on('combatTurnChange', (combat, prior) => {
        if (!game.user?.isGM || primaryActiveGm()?.id !== game.user.id) return;
        if (!prior?.combatantId) return;
        const actor = combat.combatants.get(prior.combatantId)?.actor;
        if (!actor?.system?.props?.resp_chamas_estado) return;
        const state = parseFlameBreathingState(actor.system.props.resp_chamas_estado);
        if (!state.flamingUniverse || state.flamingUniverse.turnKey === flameTurnKey(combat)) return;
        delete state.flamingUniverse;
        void actor.update(flameStatePatch(state), { naCsbAutomation: true, naBreathing: true });
    });
    Hooks.on('combatEnd', clearCombatFlames);
    Hooks.on('deleteCombat', clearCombatFlames);
}

export async function applyStackingBreathingStatus(targetActor, key, effect) {
    const kind = actorKind(targetActor);
    if (!kind) return;
    const statusKind = kind === 'oni' || kind === 'oni_minion' ? 'oni' : 'slayer';
    const dataKey = `status_${statusKind}_dados`;
    const summaryKey = `status_${statusKind}_resumo`;
    const exhaustionKey = `status_${statusKind}_exaustao`;
    const props = targetActor.system?.props ?? {};
    const state = parseStatusState(props[dataKey]);
    if (!state.active.includes(key)) state.active.push(key);
    state.effects[key] = state.effects[key]
        ? reapplyFiniteStatusEffect(state.effects[key], effect)
        : effect;
    await targetActor.update(
        {
            [`system.props.${dataKey}`]: JSON.stringify(state),
            [`system.props.${summaryKey}`]: formatStatusSummary(state.active, state.exhaustion),
            [`system.props.${exhaustionKey}`]: state.exhaustion,
        },
        { naCsbAutomation: true, naBreathing: true }
    );
}
