/**
 * @fileoverview Serviço de rolagem de dano com aplicação atômica.
 */

import { ATTRIBUTES, TIPOS_ACAO, TIPOS_DANO, MODULE_ID } from './constants.mjs';
import { parseAttributeValue, parseNumber } from './parsing.mjs';
import { breathingPdrInfo, breathingPdvInfo, breathingResourceKeys } from './actor-resources.mjs';
import { PASSIVE_DAMAGE_KEY, pendingPassiveDamage, recordBreathingPassiveEvent } from './breathing-combat-passives.mjs';
import { windCurrentBonuses } from './wind-current-passive.mjs';
import { maximizeDamageDice } from './combat-passive-execution.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import { openDamageDialog } from './dialogs/damage-dialog.mjs';
import {
    DAMAGE_PRESETS_KEY,
    parseDamagePresets,
    presetGroupKey,
} from './damage-preset-service.mjs';
import { deleteDamagePreset, saveDamagePreset } from './dialogs/damage-preset-manager.mjs';
import { itemDamageProfileFromProps } from './item-damage-profile.mjs';
import { applyOniDamage, applySlayerDamageAuto } from './damage-relay.mjs';
import { getDamageStatusEffects, isReactionBlocked } from './status-effects.mjs';
import { consumeOniActions, consumeSlayerActions } from './action-service.mjs';
import {
    applyBreathingStatus,
    applyStackingBreathingStatus,
    parseWaterBreathingState,
} from './breath-service.mjs';
import { parseStatusState } from './status-service.mjs';
import { actorKind, isSlayerActor } from './actor-kind.mjs';
import { classRankAtLevel, selectedSlayerClassKey } from './slayer/class-contracts.mjs';
import { mbDamageBonus } from './slayer/class-runtime.mjs';
import { masterBattleBenefits, masterBattleCriticalPlan } from './slayer/master-battle-rules.mjs';
import { pendingCompanionInterception } from './slayer/companion-oni-service.mjs';
import { ruleVariant, vanillaRuleSelection } from './rules-profile.mjs';
import {
    applyUserPoison,
    USER_POISON_STATE_KEY,
    userPoisonStatePatch,
} from './slayer/poison-user-service.mjs';
import {
    ensureWeaponUsageMode,
    isWeaponProficient,
    weaponAmmoPatch,
    weaponAmmoState,
    weaponProfilesForActor,
} from './weapon-service.mjs';
import {
    applySpecialWeaponHitEffects,
    clearSpecialWeaponPending,
    specialWeaponPendingForAttack,
} from './special-weapon-service.mjs';
import { flameWeaponTier } from './flame-breathing-data.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import {
    consumeFlameInterception,
    consumeFlamePending,
    FLAME_HEAT_FLAG,
    flameStatePatch,
    flameWeaponHeat,
    parseFlameBreathingState,
} from './flame-breathing-service.mjs';
import { applyStonePassiveAfterDamage } from './stone-breathing-service.mjs';
import {
    consumeMistPending,
    mistStatePatch,
    parseMistBreathingState,
    resolveMistFormula,
    resolveMistStigmaStunOnHit,
} from './mist-breathing-service.mjs';
import {
    canApplyMetalChain,
    consumeMetalHammerPending,
    consumeMetalSteelDefense,
    metalStatePatch,
    parseMetalBreathingState,
    registerMetalChainApplication,
} from './metal-breathing-service.mjs';
import {
    releaseSnowRestriction,
    consumeSnowPending,
    parseSnowBreathingState,
    resolveSnowAvalancheSynergy,
    resolveSnowFreezeGain,
    resolveSnowKekkijutsuGuard,
    snowStatePatch,
} from './snow-breathing-service.mjs';
import { resolveBreathingDefense } from './breathing-defense.mjs';
import {
    consumeCombatManeuverPending,
    resolveCombatManeuverBonuses,
} from './combat-maneuver-service.mjs';
import {
    consumeWindPending,
    parseWindBreathingState,
    windStatePatch,
} from './wind-breathing-service.mjs';
import { WIND_SYNERGY_BREATHINGS } from './wind-breathing-data.mjs';
import { parseBreathPassiveState, passiveStatePatch } from './breath-passives.mjs';
import { openAttackBuilder } from './items/attack-builder.mjs';
import { metalHammerSynergyAllies, spendMetalHammerSynergyPdr } from './metal-runtime.mjs';
import { resolveSlayerDerivedBonuses, sheetBonusValue } from './derived-bonus-service.mjs';
import { actorBuffSources } from './breathing-buffs.mjs';
import { buildEntryFormula, isValidDamageFormula, resolveMessageMode } from './damage-formula.mjs';

function markDamageFormula(props, entries) {
    if (parseNumber(props.marca_ativa) !== 1) return '';
    const dice = Math.max(0, Math.trunc(parseNumber(props.marca_dano_dados)));
    const faces = Math.max(0, Math.trunc(parseNumber(props.marca_dano_faces)));
    if (dice < 1 || faces < 2) return '';
    const continuous = new Set(['sangramento', 'envenenamento']);
    const directAttack = entries.some((entry) => {
        const damageTypes = Array.isArray(entry.selTiposDano) ? entry.selTiposDano : [];
        return (
            entry.tipoAcao === 'ataque' &&
            (damageTypes.length === 0 || damageTypes.some((type) => !continuous.has(type)))
        );
    });
    return directAttack ? `${dice}d${faces}` : '';
}

export async function waitForDamageRolls3d(message) {
    const wait = game.dice3d?.waitFor3DAnimationByMessageID;
    if (!message?.id || typeof wait !== 'function') return false;
    await wait.call(game.dice3d, message.id);
    return true;
}

async function resolveActor(options) {
    if (options.actor && typeof options.actor.update === 'function') return options.actor;
    if (options.actorUuid) {
        const doc = await fromUuid(options.actorUuid);
        return doc?.actor ?? doc ?? null;
    }
    const controlled = canvas?.tokens?.controlled;
    if (controlled?.length > 0) return controlled[0].actor;
    return game?.user?.character ?? null;
}

function weaponProfileEntry(
    profile,
    attrValues,
    { includeAttributes = true, attackIndex = 0 } = {}
) {
    const attributeRules = Array.isArray(profile?.atributos) ? profile.atributos : [];
    const usableRules = includeAttributes
        ? attributeRules
        : attributeRules.filter(
              (rule) => !['FOR', 'DEX'].includes(String(rule?.key ?? '').toUpperCase())
          );
    const choiceRules = usableRules.filter((rule) => rule?.escolha === true);
    const additiveRules = usableRules.filter((rule) => rule?.escolha !== true);
    const selected =
        choiceRules.length > 0
            ? choiceRules.reduce(
                  (best, rule) => {
                      const key = String(rule?.key ?? '').toLowerCase();
                      const value = Math.floor(
                          (attrValues[key] ?? 0) * Number(rule?.multiplicador ?? 1)
                      );
                      return value > best.value ? { key, value } : best;
                  },
                  { key: '', value: 0 }
              )
            : null;
    const additiveTotal = additiveRules.reduce((total, rule) => {
        const key = String(rule?.key ?? '').toLowerCase();
        return total + Math.floor((attrValues[key] ?? 0) * Number(rule?.multiplicador ?? 1));
    }, 0);
    const attributeTotal = (selected?.value ?? 0) + additiveTotal;
    return {
        tipoAcao: 'ataque',
        dado: String(profile?.dano_dados ?? ''),
        fixo: Math.trunc(parseNumber(profile?.dano_fixo)) + attributeTotal,
        attrs: [],
        tiposDano: Array.isArray(profile?.tipos_dano) ? profile.tipos_dano : [],
        attackIndex,
    };
}

function criticalChainEntry(profile, attrValues, attackIndex) {
    const chain = profile?.cadeia_critica;
    const keys = Array.isArray(chain?.atributo_inteiro) ? chain.atributo_inteiro : [];
    const best = keys.reduce(
        (maximum, key) => Math.max(maximum, attrValues[String(key).toLowerCase()] ?? 0),
        0
    );
    return {
        tipoAcao: 'ataque',
        dado: '',
        fixo: Math.trunc(parseNumber(chain?.dano_fixo)) + best,
        attrs: [],
        tiposDano: Array.isArray(profile?.tipos_dano) ? profile.tipos_dano : [],
        attackIndex,
    };
}

export function weaponProfileEntries(profile, attrValues, { attackIndex = null } = {}) {
    const count = Math.max(1, Math.trunc(Number(profile?.ataques) || 1));
    const regularAttacks = count + Number(profile?.golpe_secundario_pago === true);
    const entryFor = (index) => {
        if (index >= regularAttacks && profile?.cadeia_critica?.ativa === true)
            return criticalChainEntry(profile, attrValues, index);
        const includeAttributes =
            index === 0 || String(profile?.dano_segundo_golpe ?? 'normal') === 'normal';
        return weaponProfileEntry(profile, attrValues, { includeAttributes, attackIndex: index });
    };
    if (Number.isInteger(attackIndex) && attackIndex >= 0) return [entryFor(attackIndex)];
    return Array.from({ length: count }, (_unused, index) => entryFor(index));
}

const WEAPON_TEMPLATE_IDS = new Set(['NAWeaponTpl00001', 'NASpecialWeaponTpl00001']);

function isWeaponItem(item) {
    const props = item?.system?.props ?? {};
    return (
        WEAPON_TEMPLATE_IDS.has(item?.system?.template) ||
        props.arma_critico !== undefined ||
        Boolean(
            props.arma_nome &&
            (props.arma_dano_fixo !== undefined ||
                props.arma_dano_atributo !== undefined ||
                props.arma_tipos_dano !== undefined)
        )
    );
}

/**
 * Catálogo de dano das armas do Actor (perfil → entradas prontas para o diálogo).
 * @param {Actor} actor
 * @returns {{id:string,label:string,entries:object[]}[]}
 */
export function buildWeaponDamageCatalog(actor) {
    const actorProps = actor?.system?.props ?? {};
    const attrValues = {};
    for (const { key } of ATTRIBUTES)
        attrValues[key] = resolveSheetAttribute(actor, key) ?? 0;
    const catalog = [];
    for (const item of actor?.items ?? []) {
        if (!isWeaponItem(item)) continue;
        const props = item?.system?.props ?? {};
        const profiles = weaponProfilesForActor(props, actorProps);
        profiles.forEach((profile, index) => {
            const entries = weaponProfileEntries(profile, attrValues);
            if (entries.length === 0) return;
            catalog.push({
                id: `${item.uuid ?? item.id ?? item.name}::${index}`,
                label: `${props.arma_nome || item.name || 'Arma'} — ${profile.nome || `Perfil ${index + 1}`}`,
                entries,
            });
        });
    }
    return catalog;
}

/**
 * Catálogo de dano disponível para o diálogo: perfis das armas do Actor.
 * O "+ Respiração" saiu em 2026-10-25: o dano de Forma entra pela fórmula livre.
 * @param {Actor} actor
 * @returns {Promise<{weaponCatalog:object[]}>}
 */
export async function buildDamageCatalogs(actor) {
    return { weaponCatalog: buildWeaponDamageCatalog(actor) };
}

async function chooseWeaponProfile(profiles) {
    if (profiles.length === 1) return profiles[0];
    const options = profiles
        .map(
            (profile, index) =>
                `<option value="${index}">${profile.nome || `Perfil ${index + 1}`}${profile.alcance ? ` ${profile.alcance}` : ''}</option>`
        )
        .join('');
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Escolher ataque da arma' },
        content: `<label>Perfil de ataque</label><select name="weaponProfile">${options}</select>`,
        modal: true,
        rejectClose: false,
        buttons: [
            {
                action: 'select',
                label: 'Continuar',
                callback: (_event, button) => Number(button.form.elements.weaponProfile.value),
            },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    return Number.isInteger(result) ? (profiles[result] ?? null) : null;
}

async function chooseMetalHammerSynergy(attacker) {
    const combatActors = [...(game?.combat?.combatants ?? [])]
        .map((combatant) => combatant.actor)
        .filter(Boolean);
    const allies = metalHammerSynergyAllies(attacker, combatActors, {
        isAlly: (candidate) => ['slayer', 'npc'].includes(actorKind(candidate)),
    });
    if (allies.length === 0) return null;
    const options = [
        '<option value="">Sem sinergia metade do dano</option>',
        ...allies.map(
            (entry) =>
                `<option value="${entry.uuid}">${entry.name} ${entry.breathing} (1 PDR; dano integral)</option>`
        ),
    ].join('');
    const chosenUuid = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Sinergia Martelo do Julgamento' },
        content: `<div class="na-csb-automation"><p>Um aliado de Chamas, Pedra ou Magma pode gastar 1 PDR para elevar o ataque adicional ao dano integral.</p><select name="ally">${options}</select></div>`,
        modal: true,
        rejectClose: false,
        buttons: [
            {
                action: 'continue',
                label: 'Continuar',
                callback: (_event, button) => String(button.form.elements.ally.value ?? ''),
            },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (chosenUuid === null) return { canceled: true, ally: null };
    return { canceled: false, ally: allies.find((entry) => entry.uuid === chosenUuid) ?? null };
}

async function chooseMasterBattleCritical(profile, attributes) {
    const homebrew = profile === 'homebrew';
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Crítico Brutal' },
        content: `<label>Sangramento <select name="attribute">
            <option value="FOR">FOR · ${Math.max(0, Math.ceil(attributes.for / 2))} turno(s)</option>
            <option value="DEX">DEX · ${Math.max(0, Math.ceil(attributes.dex / 2))} turno(s)</option>
        </select></label>${homebrew ? `<label>Ferimento Tático <select name="injury">
            <option value="tendon">Tendão Rompido · −1,5 m</option>
            <option value="open-guard">Guarda Aberta · −1 Esquiva/Bloqueio</option>
            <option value="deep-impact">Impacto Profundo · +2 dano</option>
        </select></label>` : ''}`,
        modal: true,
        rejectClose: false,
        buttons: [
            { action: 'confirm', label: 'Confirmar', default: true, callback: (_event, button) => ({
                attribute: button.form.elements.attribute.value,
                injury: button.form.elements.injury?.value,
            }) },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!['FOR', 'DEX'].includes(choice?.attribute)) return null;
    if (homebrew && !['tendon', 'open-guard', 'deep-impact'].includes(choice.injury)) return null;
    return { attribute: choice.attribute, injury: homebrew ? choice.injury : null };
}

/**
 * API pública: rolagem de dano.
 * @param {object} options
 * @param {Actor} [options.actor]
 * @param {string} [options.actorUuid]
 * @param {string} [options.nome]
 * @param {Array} [options.entradas]
 * @param {number} [options.pdrCusto]
 * @param {string} [options.tipoAcao]
 * @param {string} [options.formulaBase]
 * @param {number} [options.fixo]
 * @param {string[]} [options.attrs]
 * @param {string} [options.attr]
 * @param {string[]} [options.tiposDano]
 * @param {string} [options.tipoDano]
 * @returns {Promise<void>}
 */
export async function rollDamage(options = {}) {
    const actor = await resolveActor(options);
    if (!actor) {
        ui.notifications?.warn?.('Nenhum Actor encontrado para dano.');
        return;
    }

    const props = actor.system?.props ?? {};
    const actionId = String(
        options.actionId ??
            globalThis.foundry?.utils?.randomID?.() ??
            globalThis.crypto?.randomUUID?.() ??
            Date.now()
    );
    const attackerKind = actorKind(actor) ?? 'slayer';
    const breathingActor = attackerKind === 'slayer' || attackerKind === 'npc';
    const resourceKey = attackerKind === 'oni'
        ? 'pdk_oni_gasto_valor'
        : attackerKind === 'npc' ? 'npc_pdr_gasto_valor' : 'pdr_slayer_gasto_valor';
    const statusEffects = getDamageStatusEffects(props);
    if (statusEffects.blocked)
        return ui.notifications?.warn?.(
            'Este personagem está incapacitado e não pode causar dano.'
        );
    const attrValues = {};
    for (const { key } of ATTRIBUTES) {
        attrValues[key] = resolveSheetAttribute(actor, key) ?? 0;
    }

    const hasExplicitDamage =
        (Array.isArray(options.entradas) && options.entradas.length > 0) ||
        (Array.isArray(options.weaponProfiles) && options.weaponProfiles.length > 0) ||
        Boolean(options.formulaBase) ||
        parseNumber(options.fixo) !== 0 ||
        (Array.isArray(options.attrs) && options.attrs.length > 0) ||
        Boolean(options.attr);
    let formCost = 0;
    if (!hasExplicitDamage && options.builder === true) {
        const selection = await openAttackBuilder(actor);
        if (!selection || selection.cancelled) return;
        if (!selection.manual) {
            formCost = parseNumber(selection.resourceCost);
            options = {
                ...options,
                nome: selection.nome || options.nome,
                entradas: selection.entradas,
                weaponItem: selection.weaponItem ?? options.weaponItem,
                pdrCusto: parseNumber(options.pdrCusto) + formCost,
            };
        }
    }

    const weaponProfiles = Array.isArray(options.weaponProfiles)
        ? options.weaponProfiles.filter((profile) => profile && typeof profile === 'object')
        : [];
    let selectedWeaponProfile = null;
    let weaponAmmo = null;
    if (weaponProfiles.length > 0) {
        selectedWeaponProfile = await chooseWeaponProfile(weaponProfiles);
        if (!selectedWeaponProfile) return;
        weaponAmmo = weaponAmmoState(
            options.weaponItem?.system?.props ?? {},
            selectedWeaponProfile
        );
        if (weaponAmmo.required && weaponAmmo.current < weaponAmmo.shots) {
            return ui.notifications?.warn?.(
                `Munição insuficiente: são necessários ${weaponAmmo.shots} disparo(s), mas restam ${weaponAmmo.current}.`
            );
        }
        options = {
            ...options,
            entradas: weaponProfileEntries(selectedWeaponProfile, attrValues, {
                attackIndex: options.weaponAttackIndex,
            }),
        };
    }

    // Compatibilidade de entradas
    let preEntradas = options.entradas;
    if (!Array.isArray(preEntradas) || preEntradas.length === 0) {
        preEntradas = [
            {
                tipoAcao: options.tipoAcao ?? '',
                dado: options.formulaBase ?? '',
                fixo: Number.isFinite(Number(options.fixo)) ? Number(options.fixo) : 0,
                attrs: Array.isArray(options.attrs)
                    ? options.attrs
                    : options.attr
                      ? [options.attr]
                      : [],
                tiposDano: Array.isArray(options.tiposDano)
                    ? options.tiposDano
                    : options.tipoDano
                      ? [options.tipoDano]
                      : [],
            },
        ];
    }

    const presetStore = parseDamagePresets(props[DAMAGE_PRESETS_KEY]);
    const breathingContext = String(options.breathing ?? '').trim();
    const { weaponCatalog } = await buildDamageCatalogs(actor);
    const dialogResult = await openDamageDialog({
        actor,
        nome: options.nome ?? '',
        entradas: preEntradas,
        pdrCusto: options.pdrCusto ?? 0,
        resourceLabel: attackerKind === 'oni' ? 'PDK' : 'PDR',
        resourceKey,
        critical: options.critical === true,
        presets: presetStore.presets,
        breathing: breathingContext,
        weaponLabel: options.weaponLabel ?? '',
        weaponCatalog,
        onSavePreset: async ({ name, group, breathing, resourceCost, entries }) => {
            const saved = await saveDamagePreset(actor, {
                name,
                group: presetGroupKey(group || breathing || breathingContext),
                breathing: breathing || breathingContext,
                resourceCost,
                entries,
            });
            if (!saved.ok) ui.notifications?.warn?.(saved.reason);
            else ui.notifications?.info?.(`Preset "${saved.preset?.name ?? name}" salvo.`);
        },
        onDeletePreset: async (id) => {
            const deleted = await deleteDamagePreset(actor, id);
            if (!deleted.ok) ui.notifications?.warn?.(deleted.reason);
            else ui.notifications?.info?.(`Preset "${deleted.preset.name}" excluído.`);
            return deleted.ok;
        },
    });
    if (!dialogResult) return;

    const nome = dialogResult.nome ?? 'Dano';
    const entradas = Array.isArray(dialogResult.entradas) ? dialogResult.entradas : [];
    let critical = dialogResult.critical === true;
    const splitTargets = dialogResult.splitTargets === true;
    if (critical && !statusEffects.criticalAllowed) {
        critical = false;
        ui.notifications?.warn?.(
            'Fadiga Corporal impede Acertos Críticos. O dano será rolado normalmente.'
        );
    }
    const criticalWeapon = actor.items?.get?.(options.weaponItem?.id);
    const masterBattleAttack = critical && options.critical === true && options.classBasicAttack === true &&
        attackerKind === 'slayer' && !breathingContext && !options.sourceFamily && !options.passiveFormId &&
        !options.passivePlan?.noContactEffects &&
        criticalWeapon?.id && isWeaponItem(criticalWeapon) && isWeaponProficient(criticalWeapon.system.props, props);
    const masterBattle = masterBattleAttack ? masterBattleBenefits(props) : null;
    let masterBattleCritical = null;
    let masterBattleChoice = null;
    if (masterBattle?.criticalBleed) {
        const choice = await chooseMasterBattleCritical(masterBattle.profile, attrValues);
        if (!choice) return;
        masterBattleCritical = masterBattleCriticalPlan(masterBattle, {
            ...choice, attributeValue: Math.trunc(attrValues[choice.attribute.toLowerCase()]),
            isBasic: true, isProficient: true, isCritical: true,
        });
        if (masterBattleCritical) masterBattleChoice = { ...choice, weaponId: criticalWeapon.id };
    }
    const pdrGastoBase = Math.max(formCost, parseNumber(dialogResult.pdrGasto));
    const pdrGasto = options.passivePlan?.skipResourceConsumption ? 0 :
        pdrGastoBase > 0 ? pdrGastoBase + statusEffects.pdrSurcharge : 0;
    if (formCost > 0) {
        const current = breathingPdrInfo(props).pdrCurrent;
        if (pdrGasto > current)
            return ui.notifications?.warn?.(`PDR insuficiente: ${current} disponível, ${pdrGasto} necessário.`);
    }
    if (entradas.length === 0) {
        ui.notifications?.warn?.('Adicione ao menos uma entrada de dano.');
        return;
    }
    if (entradas.some((entry) => entry.tipoAcao === 'reacao') && isReactionBlocked(props)) {
        return ui.notifications?.warn?.('Os status atuais impedem o uso de Reações.');
    }
    const actionTypes = [...new Set(entradas.map((entry) => entry.tipoAcao).filter(Boolean))];
    const actionResult =
        options.skipActionConsumption === true
            ? { ok: true, patch: {} }
            : attackerKind === 'oni' || attackerKind === 'oni_minion'
              ? await consumeOniActions(actor, actionTypes, { update: false })
              : await consumeSlayerActions(actor, actionTypes, { update: false });
    if (!actionResult.ok) return ui.notifications?.warn?.(actionResult.reason);

    const formulaParts = entradas.map((e) =>
        buildEntryFormula(e.dado, e.fixo, e.selAttrs, attrValues)
    );
    const invalidIndex = formulaParts.findIndex((formula) => !isValidDamageFormula(formula));
    if (invalidIndex >= 0)
        return ui.notifications?.warn?.(
            `Entrada ${invalidIndex + 1}: fórmula inválida "${formulaParts[invalidIndex]}". Use dados e atributos (ex.: 2d6 + @for).`
        );
    let specs = entradas
        .map((entry, index) => ({
            label:
                TIPOS_ACAO.find((type) => type.key === entry.tipoAcao)?.label ??
                `Dano ${index + 1}`,
            types: entry.selTiposDano,
            formula: formulaParts[index],
        }))
        .filter((spec) => spec.formula !== '0');
    const passiveExecutionId = String(options.passiveExecutionId ?? '');
    const passiveDamage = passiveExecutionId ? pendingPassiveDamage(props, passiveExecutionId) : [];
    let maximizeCount = options.passivePlan?.maximizeWeaponDice ? Infinity :
        Math.max(0, ...passiveDamage.map(entry => Number(entry.maxDamageDice) || 0));
    if (maximizeCount > 0) for (const spec of specs) {
        const count = [...spec.formula.matchAll(/\b(\d*)d\d+/g)].reduce((sum, match) => sum + Number(match[1] || 1), 0);
        spec.formula = maximizeDamageDice(spec.formula, maximizeCount);
        maximizeCount -= Math.min(count, maximizeCount);
    }
    if (typeof options.passivePlan?.extraDamage === 'string')
        specs.push({ label: 'A Última Mentira é a Verdade', types: ['cortante'], formula: options.passivePlan.extraDamage });
    const markFormula = breathingActor && !options.passivePlan?.noContactEffects
        ? markDamageFormula(props, entradas) : '';
    if (markFormula)
        specs.push({ label: 'Marca do Caçador', types: ['ferida'], formula: markFormula });
    const breathingState = parseWaterBreathingState(
        breathingActor ? props.resp_agua_estado : ''
    );
    const breathingDamage = breathingState.pendingDamage;
    const hasAttackDamage =
        options.forceAttackDamage === true ||
        entradas.some(
            (entry) =>
                entry.tipoAcao === 'ataque' ||
                entry.tipoAcao === 'especial' ||
                entry.tipoAcao === 'completa'
        );
    const classProfile = ruleVariant('classes');
    const selectedClass = attackerKind === 'slayer' ? selectedSlayerClassKey(props, classProfile) : null;
    const selectedClassRank = selectedClass ? classRankAtLevel(props.nvl_num ?? props.nvl_pj, classProfile) : null;
    if (selectedClass === 'classe_mb' && options.classBasicAttack === true &&
        (classProfile === 'vanilla' || selectedWeaponProfile?.proficiente !== false)) {
        const bonus = mbDamageBonus(selectedClassRank);
        if (bonus) specs.push({ label: 'Ataque Dilacerador', types: [], formula: String(bonus) });
    }
    if (breathingActor && hasAttackDamage) {
        const derivedBonuses = resolveSlayerDerivedBonuses(props, {
            runtimeSources: actorBuffSources(actor),
        });
        const fixedDamage = derivedBonuses.channels.danoFixo.total;
        if (fixedDamage)
            specs.push({
                label: 'Bônus Derivado',
                types: [],
                formula: String(fixedDamage),
                derived: true,
            });
        for (const typed of derivedBonuses.typedDamage) {
            specs.push({
                label: typed.label,
                types: typed.types,
                formula: String(typed.value),
                derived: true,
            });
        }
    }
    // "Bônus Fixos" da ficha: soma em todo dano, de qualquer tipo de ficha.
    const sheetDamage = breathingActor && hasAttackDamage ? 0 : sheetBonusValue(props, 'dano');
    if (sheetDamage)
        specs.push({
            label: 'Bônus da ficha',
            types: [],
            formula: String(sheetDamage),
            derived: true,
        });
    const injectBreathing = options.skipBreathingInjection !== true && options.passivePlan?.noContactEffects !== true;
    if (injectBreathing && breathingDamage?.critical && hasAttackDamage) critical = true;
    if (injectBreathing && breathingDamage?.formula && hasAttackDamage) {
        const formula = String(breathingDamage.formula).replace(/@([a-z_]+)/gi, (_, key) =>
            String(attrValues[key.toLowerCase()] ?? 0)
        );
        const types = Array.isArray(breathingDamage.types) ? breathingDamage.types : [];
        specs.push({ label: 'Respiração da Água', types, formula, breathing: true });
    }
    const flameState = parseFlameBreathingState(
        ['slayer', 'npc'].includes(attackerKind) ? props.resp_chamas_estado : ''
    );
    const hasFlameBreathing =
        hasBreathingPassive(props, 'Chamas') ||
        Boolean(props.resp_chamas_estado) ||
        [...(actor.items ?? [])].some((item) => item.system?.props?.respiracao_nome === 'Chamas');
    const flameDamage = flameState.pendingDamage;
    const universe = options.flamingUniverse;
    const flameWeaponId = options.weaponItem?.id ?? flameState.synchronizedWeapon?.id ?? '';
    const wrongLegacyFlameWeapon = options.weaponItem?.id && flameState.synchronizedWeapon?.id &&
        options.weaponItem.id !== flameState.synchronizedWeapon.id &&
        !Object.hasOwn(flameState.weaponHeatById ?? {}, options.weaponItem.id);
    const flameTier = flameWeaponTier(wrongLegacyFlameWeapon ? 0 : flameWeaponHeat(flameState, flameWeaponId));
    const flameTechnique = hasAttackDamage && Boolean(flameDamage?.technique || universe ||
        options.isTechnique || options.breathing || breathingDamage ||
        parseMistBreathingState(props.resp_nevoa_estado).pendingDamage ||
        parseMetalBreathingState(props.resp_metal_estado).pendingDamage ||
        parseSnowBreathingState(props.resp_neve_estado).pendingDamage ||
        parseWindBreathingState(props.resp_vento_estado).pendingDamage);
    if (universe)
        specs.push({
            label: 'Universo Flamejante',
            types: ['cortante'],
            formula: universe.formula,
            flame: true,
        });
    if (flameDamage?.critical === true && hasAttackDamage) critical = true;
    if (injectBreathing && flameDamage?.formula && hasAttackDamage)
        specs.push({
            label: 'Respiração das Chamas',
            types: [flameDamage.source === 'chamas_03' ? 'fogo' : 'cortante'],
            formula: String(flameDamage.formula).replace(/@([a-z_]+)/gi, (_, key) =>
                String(attrValues[key.toLowerCase()] ?? 0)),
            flame: true,
        });
    if (injectBreathing && flameDamage?.comboRider?.formula && hasAttackDamage)
        specs.push({
            label: 'Respiração das Chamas (1ª Forma)',
            types: ['cortante'],
            formula: String(flameDamage.comboRider.formula),
            flame: true,
        });
    if (flameTechnique && flameTier.techniqueDie)
        specs.push({
            label: 'Fogo Fátuo',
            types: ['fogo'],
            formula: flameTier.techniqueDie,
            flame: true,
        });
    if (flameState.ignition?.damageBonus && hasAttackDamage)
        specs.push({
            label: 'Ignição',
            types: [flameState.ignition.damageType ?? 'fogo'],
            formula: String(flameState.ignition.damageBonus),
            flame: true,
        });
    const rengokuAllies = Math.max(0, Math.trunc(Number(flameDamage?.rengokuAllies) || 0));
    if (flameDamage?.rengoku && rengokuAllies > 0 && hasAttackDamage) {
        specs.push({
            label: `Sinergia de Aliados (${rengokuAllies}×5)`,
            types: ['fogo'],
            formula: String(rengokuAllies * 5),
            flame: true,
        });
    }
    if (flameTier.weaponDamage > 0 && hasAttackDamage)
        specs.push({
            label: 'Fogo Fátuo Arma',
            types: [],
            formula: String(flameTier.weaponDamage),
            flame: true,
        });
    const mistState = parseMistBreathingState(
        breathingActor ? props.resp_nevoa_estado : ''
    );
    const mistDamage = mistState.pendingDamage;
    if (injectBreathing && mistDamage?.formula && hasAttackDamage) {
        if (mistDamage.replaceWeaponDamage)
            specs = specs.filter((spec) => spec.breathing || spec.flame);
        specs.push({
            label: 'Respiração da Névoa',
            types: ['cortante'],
            formula: resolveMistFormula(mistDamage.formula, props),
            mist: true,
        });
        if (critical && mistDamage.criticalFormula)
            specs.push({
                label: 'Colapso da Névoa crítico',
                types: ['cortante'],
                formula: resolveMistFormula(mistDamage.criticalFormula, props),
                mist: true,
            });
    }
    const metalState = parseMetalBreathingState(
        breathingActor ? props.resp_metal_estado : ''
    );
    const metalChain = metalState.chainReaction;
    const metalChainApplies =
        canApplyMetalChain(metalState, actionId) &&
        hasAttackDamage &&
        specs.some((spec) => spec.types?.some((type) => ['cortante', 'perfurante'].includes(type)));
    if (metalChainApplies) {
        specs.push({
            label: 'Respiração do Metal Reação em Cadeia',
            types: [],
            formula: String(metalChain.damageBonus || 0),
            metal: true,
        });
    }
    const snowState = parseSnowBreathingState(
        breathingActor ? props.resp_neve_estado : ''
    );
    const snowDamage = snowState.pendingDamage;
    if (injectBreathing && snowDamage?.formula && hasAttackDamage) {
        specs.push({
            label: 'Respiração da Neve',
            types: ['congelante'],
            formula: String(snowDamage.formula),
            snow: true,
        });
    }
    if (snowState.belowZero?.fdvDamageBonus && hasAttackDamage) {
        specs.push({
            label: 'Abaixo de Zero',
            types: ['congelante'],
            formula: String(snowState.belowZero.fdvDamageBonus),
            snow: true,
        });
    }
    // Respiração do Vento contrato pendingDamage (P0 dano fantasma corrigido)
    const windState = parseWindBreathingState(
        breathingActor ? props.resp_vento_estado : ''
    );
    const windDamage = windState.pendingDamage;
    const passiveFormId = String(options.passiveFormId ?? windDamage?.source ?? '');
    const windExecutionId = passiveExecutionId || actionId;
    const windForm = hasAttackDamage && passiveFormId.startsWith('vento_') && !options.passivePlan?.noContactEffects;
    const windDice = windForm ? windCurrentBonuses(props, {
        executionId: windExecutionId, formId: passiveFormId,
    }).damageDice : 0;
    let garrasApplied = false;
    if (windDamage?.garras && hasAttackDamage && specs.length > 0 && !garrasApplied) {
        // Garras do Vento Puro: transforma o PRIMEIRO spec (dano da arma):
        // N2/N3 → arma ×N · N4 → (arma + DEX) ×N
        const weaponSpec = specs.find(
            (spec) => !spec.breathing && !spec.flame && !spec.mist && !spec.snow
        );
        if (weaponSpec) {
            const { multiplier, addDex } = windDamage.garras;
            weaponSpec.formula = addDex
                ? `((${weaponSpec.formula}) + ${attrValues.dex ?? 0}) * ${multiplier}`
                : `(${weaponSpec.formula}) * ${multiplier}`;
            weaponSpec.label = `${weaponSpec.label} (Garras ×${multiplier})`;
            garrasApplied = true;
        }
    }
    if (injectBreathing && windDamage?.formula && hasAttackDamage) {
        specs.push({
            label: 'Respiração do Vento',
            types: Array.isArray(windDamage.types) ? windDamage.types : [],
            formula: String(windDamage.formula).replace(/@(dex|fdv|for)\b/giu, (_m, key) =>
                String(attrValues[String(key).toLowerCase()] ?? 0)
            ),
            wind: true,
        });
    }
    for (const entry of passiveDamage) if (entry.formula)
        specs.push({ label: entry.source ?? 'Passiva de Respiração', types: entry.types ?? [], formula: entry.formula });
    if (specs.length === 0)
        return ui.notifications?.warn?.(
            'Informe ao menos um dado, valor fixo ou atributo no dano.'
        );

    if (windDice > 0) {
        const result = await recordBreathingPassiveEvent(actor, {
            type: 'consumeDamageBonus', dice: windDice, executionId: windExecutionId,
            formId: passiveFormId, isTechnique: true,
        });
        if (result.effects?.some(effect => effect.damageDice === windDice))
            specs.push({ label: 'Corrente do Vendaval', types: ['cortante'], formula: `${windDice}d6` });
    }
    let rolls;
    try {
        rolls = await Promise.all(specs.map((spec) => Roll.create(spec.formula).evaluate()));
    } catch (_) {
        ui.notifications?.error?.(
            `Fórmula inválida: ${specs.map((spec) => spec.formula).join(' + ')}`
        );
        return;
    }
    if (weaponAmmo?.required && hasAttackDamage && options.weaponItem?.update) {
        const patch = weaponAmmoPatch(
            options.weaponItem.system?.props ?? {},
            weaponAmmo.current - weaponAmmo.shots
        );
        if (patch) {
            try {
                await options.weaponItem.update(patch, { naCsbAutomation: true });
            } catch (error) {
                console.warn?.(`[${MODULE_ID}] Falha ao consumir munição`, error);
                return ui.notifications?.warn?.(
                    'A arma não pôde atualizar a munição; o dano foi cancelado.'
                );
            }
        }
    }
    const components = specs.map((spec, index) => ({
        label: spec.label,
        types: spec.types,
        subtotal: Math.max(0, Math.trunc(Number(rolls[index].total) || 0)),
    }));
    const snowPenalty = actor.getFlag?.(MODULE_ID, 'snowPenalty');
    let penalty = Math.max(
        0,
        -Math.trunc(statusEffects.modifier || 0) +
            Math.max(0, -(Number(snowPenalty?.damagePenalty) || 0))
    );
    for (const component of components) {
        if (penalty <= 0) break;
        const reduction = Math.min(component.subtotal, penalty);
        component.subtotal -= reduction;
        penalty -= reduction;
    }
    const subtotalDamage = components.reduce((total, component) => total + component.subtotal, 0);
    let damageBeforeCritical =
        flameTier.multiplier > 1 && hasAttackDamage
            ? Math.floor(subtotalDamage * flameTier.multiplier)
            : subtotalDamage;
    if (damageBeforeCritical > subtotalDamage)
        components.push(...components.map(component => ({
            label: `Fogo Fátuo 60 +100% · ${component.label}`,
            types: [...component.types],
            subtotal: component.subtotal,
        })));
    let finalDamage = critical ? damageBeforeCritical * 2 : damageBeforeCritical;
    if (critical && damageBeforeCritical > 0) {
        const criticalBonus = components.map((component) => ({
            label: `Crítico ×2 · ${component.label}`,
            types: [...component.types],
            subtotal: component.subtotal,
        }));
        components.push(...criticalBonus);
    }
    if (masterBattleCritical?.damageBonus && finalDamage > 0) {
        components.push({ label: 'Impacto Profundo', types: components[0]?.types ?? [], subtotal: masterBattleCritical.damageBonus });
        finalDamage += masterBattleCritical.damageBonus;
    }
    const impact = attackerKind === 'oni' && options.oniTitanImpactEligible && finalDamage > 0
        ? await (await import('./oni/specialization-runtime.mjs')).chooseTitanImpact(actor, pdrGasto) : 0;
    if (impact > 0) {
        components.push({ label: 'Impacto · Titan', types: components[0]?.types ?? [], subtotal: impact });
        finalDamage += impact;
        damageBeforeCritical += impact;
    }
    if (options.passivePlan?.halfDamage) {
        const half = value => options.passivePlan.roundHalfUp ? Math.ceil(value / 2) : Math.floor(value / 2);
        damageBeforeCritical = half(damageBeforeCritical);
        finalDamage = half(finalDamage);
        let counted = 0;
        for (const component of components) {
            const original = component.subtotal;
            component.subtotal = half(counted + original) - half(counted);
            counted += original;
        }
    }
    const damageTypes = [...new Set(components.flatMap((component) => component.types))];

    // Agrupar atualizações por Actor
    const updatesByActor = new Map();

    if (Object.keys(actionResult.patch ?? {}).length > 0) {
        updatesByActor.set(actor.uuid, { actor, changes: { ...actionResult.patch } });
    }
    if (passiveDamage.length) {
        const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        existing.changes[`system.props.${PASSIVE_DAMAGE_KEY}`] = '';
        updatesByActor.set(actor.uuid, existing);
    }

    if (!options.passivePlan?.noContactEffects && breathingDamage && hasAttackDamage) {
        const nextState = { ...breathingState };
        const remaining = Math.max(0, Math.trunc(parseNumber(breathingDamage.uses)) - 1);
        if (remaining > 0) nextState.pendingDamage = { ...breathingDamage, uses: remaining };
        else delete nextState.pendingDamage;
        const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        existing.changes['system.props.resp_agua_estado'] = JSON.stringify(nextState);
        existing.changes['system.props.resp_bonus_dano_dados'] =
            remaining > 0 ? (breathingDamage.formula ?? '') : '';
        existing.changes['system.props.resp_efeito_flag'] =
            remaining > 0 ? (props.resp_efeito_flag ?? '') : '';
        if (breathingDamage.exhaustion) {
            existing.changes['system.props.status_slayer_exaustao'] = Math.min(
                8,
                parseNumber(props.status_slayer_exaustao) + parseNumber(breathingDamage.exhaustion)
            );
        }
        updatesByActor.set(actor.uuid, existing);
    }
    if (flameDamage && hasAttackDamage) {
        const nextState = consumeFlamePending(flameState, { damage: true });
        const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        Object.assign(existing.changes, flameStatePatch(nextState));
        updatesByActor.set(actor.uuid, existing);
    }
    if (!options.passivePlan?.noContactEffects && mistDamage && hasAttackDamage) {
        const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        Object.assign(
            existing.changes,
            mistStatePatch(consumeMistPending(mistState, { damage: true }))
        );
        updatesByActor.set(actor.uuid, existing);
    }
    if (!options.passivePlan?.noContactEffects && snowDamage && hasAttackDamage) {
        const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        Object.assign(
            existing.changes,
            snowStatePatch(consumeSnowPending(snowState, { damage: true }))
        );
        updatesByActor.set(actor.uuid, existing);
    }
    if (!options.passivePlan?.noContactEffects && windDamage && hasAttackDamage && windDamage.formula !== '') {
        const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        Object.assign(
            existing.changes,
            windStatePatch(consumeWindPending(windState, { damage: true }))
        );
        updatesByActor.set(actor.uuid, existing);
    }
    if (metalChainApplies) {
        const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        Object.assign(existing.changes, registerMetalChainApplication(metalState, actionId).patch);
        updatesByActor.set(actor.uuid, existing);
    }

    if (pdrGasto > 0 || impact > 0) {
        const pdrAtual = parseNumber(actor.system?.props?.[resourceKey]);
        const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        existing.changes[`system.props.${resourceKey}`] = pdrAtual + pdrGasto + impact;
        updatesByActor.set(actor.uuid, existing);
    }

    const damageRequests = [];
    const targets = universe ? new Set([universe.target]) : options.targets ?? game?.user?.targets;
    // Estigma da Névoa: "ao acertar qualquer ataque, pode atordoar o inimigo
    // por 1 turno" benefício único por ataque bem-sucedido (não por alvo em
    // AOE), consumido aqui porque este é o ponto em que um acerto com dano
    // real contra um alvo é confirmado. `earned` nunca é apagado.
    let stigmaStunApplied = false;
    let cycloneAttackRoll = null;
    let cycloneAttackRolledMessage = false;
    let windSuppressResistances = false;
    const windVentaniaTargets = new Set();
    let windTufaoHealPending = false;
    const attackerToken =
        actor.getActiveTokens?.()[0] ??
        canvas?.tokens?.controlled?.find((token) => token.actor?.uuid === actor.uuid) ??
        null;
    if (targets && targets.size > 0 && finalDamage > 0) {
        const targetList = [...targets];
        for (const [targetIndex, targetToken] of targetList.entries()) {
            if (flameDamage?.areaMeters && attackerToken && canvas?.grid?.measurePath) {
                const distance =
                    Number(
                        canvas.grid.measurePath([attackerToken.center, targetToken.center])
                            ?.distance
                    ) || 0;
                if (distance > Number(flameDamage.areaMeters)) {
                    ui.notifications?.warn?.(
                        `${targetToken.name} está fora dos ${flameDamage.areaMeters}m de Roku no Kata Hono Arashi.`
                    );
                    continue;
                }
            }
            const protectedActor = targetToken.actor;
            if (!protectedActor) continue;
            const hostile = protectedActor.uuid !== actor.uuid && !(
                attackerToken?.document?.disposition && attackerToken.document.disposition === targetToken.document?.disposition
            );
            const companion = !options.passivePlan?.cannotDodge && !flameDamage?.areaMeters &&
                pendingCompanionInterception(protectedActor, { isAttack: true, hostile,
                    sourceActorUuid: actor.uuid, attackTotal: options.attackTotal });
            const interceptionFlag = protectedActor.getFlag?.(MODULE_ID, 'flameInterception');
            const interception = !companion && consumeFlameInterception(interceptionFlag, protectedActor.uuid);
            const interceptorDocument = interception?.intercepted
                ? await fromUuid(interception.interceptorUuid)
                : null;
            const interceptorActor = interceptorDocument?.actor ?? interceptorDocument;
            const targetActor = companion?.oni ??
                (interceptorActor?.documentName === 'Actor' ? interceptorActor : protectedActor);
            const intercepted = !companion && targetActor.uuid !== protectedActor.uuid;
            const maneuverBonuses =
                attackerKind === 'slayer'
                    ? resolveCombatManeuverBonuses(actor, {
                          targetUuid: targetActor.uuid,
                          channel: 'dano',
                      })
                    : {
                          damageBonus: 0,
                          maxDamage: false,
                      };
            const heatMap = targetActor.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG) ?? {};
            const heatBefore = Number(heatMap?.[actor.id]?.heat) || 0;
            let rengokuBonus = 0;
            let amount = splitTargets
                ? splitAmongTargets(finalDamage, targetList.length, targetIndex)
                : finalDamage;
            let targetComponents = components.map((component) => ({
                ...component,
                subtotal: splitTargets
                    ? splitAmongTargets(component.subtotal, targetList.length, targetIndex)
                    : component.subtotal,
                types: [...component.types],
            }));
            if (maneuverBonuses.damageBonus) {
                amount += maneuverBonuses.damageBonus;
                targetComponents.push({
                    label: 'Manobra',
                    types: [],
                    subtotal: maneuverBonuses.damageBonus,
                });
            }
            const targetMist = parseMistBreathingState(
                targetActor.system?.props?.resp_nevoa_estado
            );
            let effectiveCritical = critical;
            if (targetMist.dazzle?.criticalImmunity && critical) {
                targetComponents = components
                    .filter((component) => !component.label.startsWith('Crítico ×2 · ') && component.label !== 'Impacto Profundo')
                    .map((component) => ({ ...component, types: [...component.types] }));
                amount = damageBeforeCritical;
                effectiveCritical = false;
            }
            const blizzardStealth = actor.getFlag?.(MODULE_ID, 'snowBlizzardStealth');
            if (blizzardStealth?.sourceActorUuid) {
                const sourceDocument = await fromUuid(blizzardStealth.sourceActorUuid);
                const snowSource = sourceDocument?.actor ?? sourceDocument;
                const synergy = resolveSnowAvalancheSynergy(
                    snowSource?.system?.props?.resp_neve_estado,
                    { targetUuid: targetActor.uuid, allyStealthed: true }
                );
                if (synergy.applies) {
                    const bonusRoll = await Roll.create(synergy.formula).evaluate();
                    await bonusRoll.toMessage({
                        speaker: ChatMessage.getSpeaker({ actor }),
                        flavor: '<strong>Avalanche Negativa</strong> sinergia com Nevasca',
                    });
                    const bonus = Math.max(0, Math.trunc(Number(bonusRoll.total) || 0));
                    amount += bonus;
                    targetComponents.push({
                        label: 'Avalanche Negativa aliado furtivo',
                        types: ['congelante'],
                        subtotal: bonus,
                    });
                    await targetActor.setFlag(MODULE_ID, 'snowMovementPenalty', {
                        value: bonus,
                        turns: synergy.movementTurns,
                        sourceActorUuid: snowSource?.uuid ?? '',
                    });
                }
            }
            if (options.sourceFamily === 'kekkijutsu') {
                const guardSourceFlag = targetActor.getFlag?.(
                    MODULE_ID,
                    'snowKekkijutsuGuardSource'
                );
                const guardDocument = guardSourceFlag?.sourceActorUuid
                    ? await fromUuid(guardSourceFlag.sourceActorUuid)
                    : targetActor;
                const guardActor = guardDocument?.actor ?? guardDocument;
                const resolvedGuard = resolveSnowKekkijutsuGuard(
                    guardActor?.system?.props?.resp_neve_estado,
                    { enemyUuid: actor.uuid }
                );
                if (
                    resolvedGuard.active &&
                    (!resolvedGuard.protectedUuid ||
                        resolvedGuard.protectedUuid === targetActor.uuid)
                ) {
                    amount = Math.floor(amount * resolvedGuard.damageMultiplier);
                    targetComponents = targetComponents.map((component) => ({
                        ...component,
                        subtotal: Math.floor(component.subtotal * resolvedGuard.damageMultiplier),
                    }));
                    let nextGuardState = resolvedGuard.state;
                    if (resolvedGuard.freeze > 0)
                        nextGuardState = resolveSnowFreezeGain(
                            nextGuardState,
                            actor.uuid,
                            resolvedGuard.freeze
                        ).state;
                    await guardActor.update(snowStatePatch(nextGuardState), {
                        naCsbAutomation: true,
                        naBreathing: true,
                    });
                    if (guardSourceFlag)
                        await targetActor.unsetFlag(MODULE_ID, 'snowKekkijutsuGuardSource');
                    if (resolvedGuard.opportunityAttack)
                        await guardActor.setFlag(MODULE_ID, 'snowOpportunityAttack', {
                            enemyUuid: actor.uuid,
                            available: true,
                        });
                    if (resolvedGuard.negateEffects)
                        ui.notifications?.info?.(
                            'A Canção de um Dia Frio anulou os efeitos negativos do Kekkijutsu.'
                        );
                }
            }
            const heatAfterHit = Math.min(60, heatBefore + (hasFlameBreathing && hasAttackDamage
                ? 1 + Math.max(0, Number(universe?.enemyHeat ?? flameState.activeForm?.enemyHeat) || 0) : 0));
            if (flameDamage?.damagePerEnemyHeat && heatAfterHit > 0) {
                const heatRoll = await Roll.create(`${heatAfterHit}d8`).evaluate();
                await heatRoll.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    flavor: `<strong>Roku no Kata Hono Arashi</strong> ${heatAfterHit}d8 pelas Brasas do alvo`,
                });
                amount += Math.max(0, Math.trunc(Number(heatRoll.total) || 0));
            }
            if (flameDamage?.evasionDc) {
                const dex = parseAttributeValue(targetActor.system?.props?.dex_display);
                const save = await Roll.create(`1d20 + ${dex}`).evaluate();
                await save.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                    flavor: `<strong>Roku no Kata Hono Arashi</strong> Esquiva CD ${flameDamage.evasionDc}`,
                });
                if (save.total >= flameDamage.evasionDc) amount = Math.floor(amount / 2);
            }
            if (flameDamage?.rengoku && flameDamage.saveDc) {
                const fdv = parseAttributeValue(targetActor.system?.props?.fdv_display);
                const save = await Roll.create(`1d20 + ${fdv}`).evaluate();
                await save.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                    flavor: `<strong>Ku no Kata Rengoku</strong> FDV CD ${flameDamage.saveDc}`,
                });
                if (save.total < flameDamage.saveDc) {
                    // Vulnerável ao Rengoku: +1 dano por ponto de Fogo Fátuo da arma;
                    // com 60+ Brasas Ardentes NAQUELE alvo, acrescenta FDV × FOR.
                    rengokuBonus =
                        flameWeaponHeat(flameState) +
                        (heatAfterHit >= 60
                            ? Math.max(0, Math.trunc(attrValues.fdv * attrValues.for))
                            : 0);
                    amount += rengokuBonus;
                }
            }
            // ─── Respiração do Vento ───────────────────────────────────────────
            if (windDamage?.cycloneOpposed && hasAttackDamage) {
                // DECISÃO PENDENTE documentada: usa UMA rolagem ofensiva compartilhada
                // comparada à Esquiva individual de cada alvo.
                cycloneAttackRoll ??= await Roll.create(
                    `1d20 + ${parseAttributeValue(props.dex_display)} + ${parseNumber(props.hab_acerto_bonus)}`
                ).evaluate();
                if (!cycloneAttackRolledMessage) {
                    await cycloneAttackRoll.toMessage({
                        speaker: ChatMessage.getSpeaker({ actor }),
                        flavor: '<strong>Ciclone Penetrante</strong> Acerto padrão',
                    });
                    cycloneAttackRolledMessage = true;
                }
                const esquivaTarget =
                    parseAttributeValue(targetActor.system?.props?.dex_display) +
                    parseNumber(targetActor.system?.props?.hab_esquiva_bonus);
                if (cycloneAttackRoll.total < esquivaTarget) amount = Math.floor(amount / 2);
            }
            if (windDamage?.ignoreResistance && hasAttackDamage) windSuppressResistances = true;
            if (windDamage?.disablesHealing && hasAttackDamage && amount > 0) {
                await targetActor.setFlag(MODULE_ID, 'windHealBlock', {
                    sourceActorUuid: actor.uuid,
                    kekkijutsuSurcharge: Number(windDamage.kekkijutsuSurcharge) || 0,
                    untilRound: (game.combat?.round ?? 0) + 1,
                });
                ui.notifications?.info?.(
                    `Shi no Kata Shōjō Sajinran: ${targetActor.name} não pode curar PDV até o próximo turno do usuário.`
                );
            }
            if (windDamage?.critBlocksRegenerationTurns && effectiveCritical && hasAttackDamage) {
                await targetActor.setFlag(MODULE_ID, 'windRegenBlock', {
                    turns: windDamage.critBlocksRegenerationTurns,
                    sourceName: 'Roku no Kata Seiran Fuju',
                });
            }
            if (windDamage?.tufao && hasAttackDamage && amount > 0) {
                const vit = parseAttributeValue(targetActor.system?.props?.vit_display);
                const bleedSave = await Roll.create(`1d20 + ${vit}`).evaluate();
                await bleedSave.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                    flavor: `<strong>Ku no Kata Idaten Taifu</strong> Sangramento VIT CD ${windDamage.tufao.bleedSaveDc}`,
                });
                if (bleedSave.total < windDamage.tufao.bleedSaveDc) {
                    await applyBreathingStatus(targetActor, 'sangramento', {
                        damageFormula: String(parseNumber(props.for_display)),
                        remainingTurns: 3,
                        sourceName: 'Ku no Kata Idaten Taifu',
                        tick: 'start',
                        stacks: 1,
                    });
                }
            }
            const targetSnowPenalty = targetActor.getFlag?.(MODULE_ID, 'snowPenalty');
            if (targetSnowPenalty?.vulnerabilities?.some((type) => damageTypes.includes(type))) {
                amount *= 2;
                targetComponents = targetComponents.map((component) =>
                    component.types.some((type) => targetSnowPenalty.vulnerabilities.includes(type))
                        ? { ...component, subtotal: component.subtotal * 2 }
                        : component
                );
            }
            const existingSuppression = targetActor.getFlag?.(
                MODULE_ID,
                'mistResistanceSuppression'
            );
            const newSuppressionTurns = Math.max(
                0,
                Number(mistDamage?.suppressResistanceTurns) || 0
            );
            if (newSuppressionTurns > 0)
                await targetActor.setFlag(MODULE_ID, 'mistResistanceSuppression', {
                    turns: newSuppressionTurns,
                    sourceActorUuid: actor.uuid,
                });
            const suppressResistances = options.passivePlan?.ignoreResistance === true ||
                newSuppressionTurns > 0 ||
                Number(existingSuppression?.turns) > 0 ||
                windSuppressResistances;
            const defense = resolveBreathingDefense({
                amount,
                components: targetComponents,
                damageTypes,
                props: targetActor.system?.props ?? {},
                suppressResistances,
            });
            amount = defense.amount;
            targetComponents = defense.components;
            const targetPatch = { ...defense.patches };
            if (targetMist.incomingReduction?.formula && amount > 0) {
                const sourceToken = actor.getActiveTokens?.()[0];
                const targetActiveToken = targetActor.getActiveTokens?.()[0];
                const distance =
                    sourceToken && targetActiveToken
                        ? canvas?.grid?.measurePath?.([
                              sourceToken.center,
                              targetActiveToken.center,
                          ])?.distance
                        : null;
                const ranged = Number.isFinite(Number(distance)) && Number(distance) > 2;
                if (!targetMist.incomingReduction.rangedOnly || ranged) {
                    const reduction = await Roll.create(
                        targetMist.incomingReduction.formula
                    ).evaluate();
                    await reduction.toMessage({
                        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                        flavor: '<strong>Expansão de Névoa</strong> redução de dano',
                    });
                    amount = Math.max(
                        0,
                        amount - Math.max(0, Math.trunc(Number(reduction.total) || 0))
                    );
                    delete targetMist.incomingReduction;
                    Object.assign(targetPatch, mistStatePatch(targetMist));
                }
            }
            if (targetMist.incomingHalfOnFailedSave && amount > 0) {
                const dcParts =
                    String(targetMist.incomingHalfOnFailedSave.saveDc ?? '').match(/\d+/g) ?? [];
                const dc = dcParts.map(Number).reduce((total, value) => total + value, 0);
                const sab = parseAttributeValue(actor.system?.props?.sab_display);
                const save = await Roll.create(`1d20 + ${sab}`).evaluate();
                await save.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    flavor: `<strong>Go no Kata Kaun no Umi</strong> SAB contra CD ${dc}`,
                });
                if (save.total < dc) amount = Math.floor(amount / 2);
                delete targetMist.incomingHalfOnFailedSave;
                Object.assign(targetPatch, mistStatePatch(targetMist));
            }
            if (
                !stigmaStunApplied &&
                amount > 0 &&
                breathingActor &&
                targetActor.uuid !== actor.uuid
            ) {
                const existingAttacker = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
                const attackerMistNow = existingAttacker.changes['system.props.resp_nevoa_estado']
                    ? parseMistBreathingState(
                          existingAttacker.changes['system.props.resp_nevoa_estado']
                      )
                    : mistState;
                const stunResult = resolveMistStigmaStunOnHit(attackerMistNow);
                if (stunResult.applied) {
                    stigmaStunApplied = true;
                    Object.assign(existingAttacker.changes, mistStatePatch(stunResult.state));
                    updatesByActor.set(actor.uuid, existingAttacker);
                    await applyBreathingStatus(targetActor, 'atordoamento', stunResult.effect);
                }
            }
            damageRequests.push({
                actor: targetActor,
                protectedActor,
                intercepted,
                companionSlayerUuid: companion ? protectedActor.uuid : '',
                amount,
                rengokuBonus,
                heatBefore,
                components: targetComponents,
                patch: targetPatch,
                negated: defense.negated,
                counterAttackAvailable: defense.counterAttackAvailable === true,
                critical: effectiveCritical,
                suppressResistances,
                hostile,
            });
        }
    }

    // Dano-ou-Cura: apenas quando um Slayer é quem rola o Dano (é a ficha
    // Slayer que carrega Formas de Respiração com efeitos de cura) e a
    // chamada é o gatilho direto do jogador (promptHealOrDamage !== false).
    // Fluxos automáticos/encadeados (Formas, dano de queda, Martelo, etc.)
    // passam promptHealOrDamage:false explicitamente e nunca são
    // interrompidos por um diálogo o fallback seguro é sempre "Dano".
    const offerHealChoice = attackerKind === 'slayer' && options.promptHealOrDamage === true;
    let healChoices = null;
    if (offerHealChoice && damageRequests.some((request) => request.amount > 0)) {
        const { openDamageOrHealDialog } = await import('./dialogs/damage-heal-dialog.mjs');
        healChoices = new Map();
        for (const request of damageRequests) {
            if (!(request.amount > 0)) continue;
            const choice = await openDamageOrHealDialog({
                targetName: request.actor?.name,
                amount: request.amount,
            });
            healChoices.set(request.actor, choice);
        }
    }

    const pending = [...updatesByActor.values()];
    const results = await Promise.allSettled([
        ...pending.map(async (up) => {
            await up.actor.update(up.changes, { naCsbAutomation: true });
        }),
        ...damageRequests.map(
            async ({
                actor: targetActor,
                amount,
                components: targetComponents,
                patch: targetPatch,
                negated,
                critical: targetCritical,
                suppressResistances,
                hostile,
                companionSlayerUuid,
            }) => {
                if (Object.keys(targetPatch ?? {}).length)
                    await targetActor.update(targetPatch, {
                        naCsbAutomation: true,
                        naBreathing: true,
                    });
                if (amount <= 0 && !companionSlayerUuid)
                    return { ok: true, appliedDamage: 0, woundDamage: 0, negated };
                // Nunca assumir Cura silenciosamente: só desvia para o relay de cura
                // quando o jogador escolheu "cura" explicitamente no diálogo.
                if (healChoices?.get(targetActor) === 'cura') {
                    const { healActor } = await import('./heal-relay.mjs');
                    const healed = await healActor(targetActor, amount, {
                        attackName: nome,
                        source: actor.uuid,
                    });
                    return {
                        ok: true,
                        appliedDamage: 0,
                        woundDamage: 0,
                        negated,
                        healed: healed.appliedHeal,
                        healTotal: healed.total,
                    };
                }
                // Normalização no boundary: pendingDamage ausente (ataque padrão sem
                // técnica armada) NÃO pode crashar contrato neutro = zeros.
                const flameContext =
                    hasFlameBreathing && hasAttackDamage && !options.passivePlan?.noContactEffects
                        ? {
                              sourceId: actor.id,
                              heat: 1 + Math.max(0, Number(universe?.enemyHeat ?? flameState.activeForm?.enemyHeat) || 0),
                              knockdownDc: universe?.knockdownDc,
                              blockPenalty: Number(flameDamage?.blockPenalty) || 0,
                              blockPenaltyTurns: Number(flameDamage?.blockPenaltyTurns) || 0,
                              exhaustionOnHit: Number(flameDamage?.exhaustionOnHit) || 0,
                              exhaustionOverDamage: Number(flameDamage?.exhaustionOverDamage) || 0,
                          }
                        : null;
                const targetKind = actorKind(targetActor);
                const passiveContext = {
                    sourceActorUuid: actor.uuid,
                    hostile,
                    oniToxicUnarmedCritical: attackerKind === 'oni' && options.oniToxicUnarmedCritical === true && targetCritical,
                    companionSlayerUuid,
                    attackTotal: options.attackTotal,
                    cannotDodge: options.passivePlan?.cannotDodge === true,
                    ignoreResistance: suppressResistances,
                    masterBattleCritical: targetCritical && hostile ? masterBattleChoice : null,
                };
                if (targetKind === 'slayer')
                    return applySlayerDamageAuto(targetActor, amount, {
                        ...passiveContext,
                        isAttack: true,
                        attackName: nome,
                        critical: targetCritical,
                        damageTypes,
                        components: targetComponents,
                        flame: flameContext,
                    }).then(async (result) => {
                        if (attackerKind === 'slayer')
                            await consumeCombatManeuverPending(actor, {
                                targetUuid: targetActor.uuid,
                                part: 'damage',
                            });
                        return result;
                    });
                // Oni completo, Oni Minion e NPC compartilham o mesmo relay de dano
                // (chaves distintas resolvidas dentro do relay por tipo de ator).
                if (targetKind === 'oni' || targetKind === 'oni_minion' || targetKind === 'npc')
                    return applyOniDamage(targetActor, amount, {
                        ...passiveContext,
                        attackName: nome,
                        critical: targetCritical,
                        rolledTotal: amount,
                        damageTypes,
                        components: targetComponents,
                        requireApproval: true,
                        flame: flameContext,
                    }).then(async (result) => {
                        if (attackerKind === 'slayer')
                            await consumeCombatManeuverPending(actor, {
                                targetUuid: targetActor.uuid,
                                part: 'damage',
                            });
                        return result;
                    });
                return Promise.reject(
                    new Error(
                        `Alvo sem identidade Slayer/Oni (${targetKind ?? 'desconhecido'}): ${targetActor?.name ?? ''}.`
                    )
                );
            }
        ),
    ]);
    const failedDamage = results
        .slice(pending.length)
        .filter((result) => result.status === 'rejected');
    if (failedDamage.length > 0) {
        const reason = failedDamage[0]?.reason?.message ?? 'Falha desconhecida no relay de dano.';
        ui.notifications?.error?.(`O dano não foi aplicado ao alvo: ${reason}`);
        console.error?.(`[${MODULE_ID}] Falha ao aplicar dano em alvo`, failedDamage[0].reason);
    }

    const poisonRank = selectedClass === 'classe_usuario_de_veneno' ? selectedClassRank : null;
    const validPoisonAttack =
        Boolean(poisonRank) &&
        !options.passivePlan?.noContactEffects &&
        (classProfile === 'vanilla'
            ? hasAttackDamage && Boolean(passiveExecutionId)
            : options.classBasicAttack === true && selectedWeaponProfile?.proficiente !== false);
    if (validPoisonAttack) {
        const contactDamageBonus = ruleVariant('metal') === 'vanilla'
            ? vanillaRuleSelection(props, 'metal')?.contactDamage ?? 0 : 0;
        const damageResults = results.slice(pending.length);
        for (let index = 0; index < damageRequests.length; index += 1) {
            const outcome = damageResults[index];
            const request = damageRequests[index];
            const appliedDamage = Number(
                outcome?.value?.appliedDamage ?? outcome?.value?.totalDamage ?? request?.amount ?? 0
            );
            if (outcome?.status !== 'fulfilled' || !(appliedDamage > 0)) continue;
            const targetProps = request.actor?.system?.props ?? {};
            const immunityText = [
                targetProps.imunidades,
                targetProps.imunidade,
                targetProps.resistencias,
            ]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase('pt-BR');
            const poison = applyUserPoison(targetProps[USER_POISON_STATE_KEY], {
                profile: classProfile,
                sourceActorUuid: actor.uuid,
                rank: poisonRank,
                carisma: attrValues.car,
                contactDamageBonus,
                actionId,
                contactLimit: selectedWeaponProfile?.efeitos_contato_por_acao,
                attackIndex: options.weaponAttackIndex,
                immune: /imune?[^,;]*veneno|veneno[^,;]*imune?/u.test(immunityText),
            });
            if (poison.applied)
                await request.actor.update(userPoisonStatePatch(poison.state), {
                    naCsbAutomation: true,
                    naUserPoison: true,
                });
        }
    }

    // ─── Respiração do Vento pós-dano ─────────────────────────────────
    let windDamageDealt = 0;
    for (const [index, request] of damageRequests.entries()) {
        const outcome = results[pending.length + index];
        const appliedDamage = Number(outcome?.value?.appliedDamage ?? 0);
        if (outcome?.status !== 'fulfilled' || outcome.value?.ok === false || !(appliedDamage > 0)) continue;
        if (request.hostile) {
            const pdvLost = Number(outcome.value?.pdvLost) || 0;
            if (windForm) windDamageDealt += pdvLost;
            if (passiveDamage.some(entry => entry.requiem) && pdvLost > 0 &&
                breathingPdvInfo(request.actor.system?.props).pdvCurrent <= 0)
                await recordBreathingPassiveEvent(actor, {
                    type: 'damageDealt', targetUuid: request.actor.uuid, defeated: true,
                    executionId: passiveExecutionId, requiem: true, amount: pdvLost,
                });
        }
        // 7º Estilo: inimigos atingidos neste turno testam VIT (uma vez por alvo/turno)
        if (windDamage?.ventania && hasAttackDamage) {
            windVentaniaTargets.add(request.actor);
        }
        // 9º Estilo: cura 5 PDV se dano líquido >= 10% do PDV máximo do alvo
        if (windDamage?.tufao && !windTufaoHealPending) {
            const maxPdv =
                breathingPdvInfo(request.actor.system?.props).pdvMax ||
                parseNumber(request.actor.system?.props?.pdv_slayer_maximo_num) ||
                parseNumber(request.actor.system?.props?.pdv_oni_maximo_num) ||
                parseNumber(request.actor.system?.props?.pdv_oni_total_conta) ||
                0;
            const thresholdPdv = Number(windDamage.tufao.healThresholdPercent ?? 10);
            if (maxPdv > 0 && appliedDamage >= Math.ceil((maxPdv * thresholdPdv) / 100))
                windTufaoHealPending = true;
        }
    }
    if (windDamageDealt > 0 && !options.deferWindDamageDealt) await recordBreathingPassiveEvent(actor, {
        type: 'damageDealt', formId: passiveFormId, executionId: windExecutionId,
        isTechnique: true, direct: true, hostile: true, amount: windDamageDealt,
    });
    for (const targetActor of windVentaniaTargets) {
        const round = game.combat?.round ?? 0;
        const turn = game.combat?.turn ?? 0;
        const saveKey = `windVentaniaSave`;
        const saves = targetActor.getFlag?.(MODULE_ID, saveKey) ?? {};
        if (saves[`${round}:${turn}`]) continue;
        const dcTotal = (await Roll.create(windDamage.ventania.dcFormula).evaluate()).total;
        const vit = parseAttributeValue(targetActor.system?.props?.vit_display);
        const save = await Roll.create(`1d20 + ${vit}`).evaluate();
        await save.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            flavor: `<strong>Shichi no Kata Keifū · Tengu Kaze</strong> VIT CD ${dcTotal}`,
        });
        await targetActor.setFlag(MODULE_ID, saveKey, { ...saves, [`${round}:${turn}`]: true });
        if (save.total < dcTotal) {
            const fallRoll = await Roll.create(windDamage.ventania.fallDamage).evaluate();
            await fallRoll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                flavor: '<strong>Ventania</strong> dano de queda',
            });
            const kind = actorKind(targetActor);
            if (kind === 'slayer')
                await applySlayerDamageAuto(targetActor, fallRoll.total, {
                    isAttack: false,
                    attackName: 'Ventania queda',
                    damageTypes: ['concussao'],
                });
            else if (kind === 'oni')
                await applyOniDamage(targetActor, fallRoll.total, {
                    attackName: 'Ventania queda',
                    rolledTotal: fallRoll.total,
                    damageTypes: ['concussao'],
                });
            await targetActor.setFlag(MODULE_ID, 'windProne', {
                sourceActorUuid: actor.uuid,
                untilRound: round + 1,
                message: 'Levantar exige gastar uma Ação Especial no próximo turno.',
            });
        }
    }
    if (
        windTufaoHealPending &&
        Number(windDamage?.tufao?.healOnBigHit ?? 0) > 0 &&
        breathingActor
    ) {
        const { pdvHealed } = breathingResourceKeys(props);
        const healed = parseNumber(actor.system?.props?.[pdvHealed]) + Number(windDamage.tufao.healOnBigHit);
        await actor.update(
            { [`system.props.${pdvHealed}`]: healed },
            { naCsbAutomation: true, naBreathing: true }
        );
        ui.notifications?.info?.(
            `Ku no Kata Idaten Taifu: você recupera ${windDamage.tufao.healOnBigHit} PDV.`
        );
    }

    // ─── Respiração do Metal Duro como Aço N4: contra-ataque pós-anulação ──
    // O ataque inimigo já foi anulado (defense.negated) em resolveBreathingDefense;
    // steelDefense.counterAttack foi consumido ali junto (não sobrevive no
    // targetPatch), então o sinal chega aqui só por counterAttackAvailable.
    for (const request of damageRequests) {
        if (!request.negated || !request.counterAttackAvailable) continue;
        const useMetalCounter = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Shi no Kata Hagane no Yō ni Katai Contra-ataque' },
            content: `<p>${request.actor?.name ?? 'O defensor'} anulou completamente o ataque. Realizar agora o ataque padrão de contra-ataque?</p>`,
            yes: { label: 'Contra-atacar' },
            no: { label: 'Recusar' },
            rejectClose: false,
        });
        if (useMetalCounter) {
            const { rollHit } = await import('./hit-service.mjs');
            await rollHit({
                actor: request.actor,
                actorUuid: request.actor.uuid,
                autoDamage: true,
                skipActionConsumption: true,
            });
        }
    }

    const appliedTargets = [];
    for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
            if (index >= pending.length) {
                const request = damageRequests[index - pending.length];
                const targetActor = request?.actor;
                const applied = result.value;
                if (targetActor && applied?.ok !== false) {
                    if (request.intercepted) {
                        await request.protectedActor.unsetFlag(MODULE_ID, 'flameInterception');
                        await ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                            content: `<p><strong>Ondulação da Chama Fluorescente</strong> ${targetActor.name} interceptou o dano destinado a ${request.protectedActor.name}.</p>`,
                        });
                    }
                    const amount = Math.max(0, Math.trunc(Number(applied?.appliedDamage) || 0));
                    const wound = Math.max(0, Math.trunc(Number(applied?.woundDamage) || 0));
                    if (amount > 0) {
                        await releaseSnowRestriction(targetActor);
                    }
                    appliedTargets.push({
                        actor: targetActor,
                        name: targetActor.name,
                        amount,
                        wound,
                        concussionDamage: Number(applied?.concussionDamage) || 0,
                    });
                    // `appliedDamage` já inclui a Ferida; exibir a parte normal
                    // separada evita a leitura de "dano + Ferida" em dobro.
                    const normal = Math.max(0, amount - wound);
                    ui.notifications?.info?.(
                        `${targetActor.name} recebeu ${normal} de dano${wound > 0 ? ` e ${wound} de Ferida` : ''}.`
                    );

                    // Água 5 (Chuva Misericordiosa): finalizar o alvo recupera PDR igual
                    // ao Nível de Respiração do usuário (regra do .md "Se finalizar").
                    const killRecovery = Math.max(
                        0,
                        Math.trunc(parseNumber(breathingDamage?.recoverPdrOnKill))
                    );
                    if (
                        killRecovery > 0 &&
                        targetActor.system?.props &&
                        breathingPdvInfo(targetActor.system.props).pdvCurrent <= 0
                    ) {
                        const { pdrSpent } = breathingResourceKeys(actor.system.props);
                        const pdrGastoAtual = parseNumber(actor.system.props[pdrSpent]);
                        await actor.update(
                            {
                                [`system.props.${pdrSpent}`]: Math.max(
                                    0,
                                    pdrGastoAtual - killRecovery
                                ),
                            },
                            { naCsbAutomation: true, naBreathing: true }
                        );
                        ui.notifications?.info?.(
                            `Chuva Misericordiosa: ${actor.name} recuperou ${killRecovery} PDR ao finalizar ${targetActor.name}.`
                        );
                    }
                }
            }
            continue;
        }
        const targetName =
            index < pending.length
                ? pending[index].actor.name
                : (damageRequests[index - pending.length]?.actor?.name ?? 'alvo');
        console.warn?.(`[${MODULE_ID}] Falha ao atualizar ${targetName}`, result.reason);
        ui.notifications?.warn?.(`Não foi possível atualizar ${targetName}.`);
    }

    // Jamongan Sōkyoku (dano confirmado) + Quebra por ação (no máximo uma,
    // mesmo quando a ação contém dois ataques ou vários alvos) vivem no
    // módulo da passiva da Pedra.
    await applyStonePassiveAfterDamage({
        actor,
        appliedTargets,
        actionId,
        strength: attrValues.for,
        hasAttackDamage: !options.passivePlan?.noContactEffects && hasAttackDamage,
        weaponId: options.weaponItem?.id ?? '',
    });

    if (finalDamage > 0 && (!targets || targets.size === 0))
        ui.notifications?.warn?.(
            'Nenhum alvo marcado. O dano foi rolado, mas nenhuma ficha foi atualizada.'
        );

    const passiveAfterDamage = parseBreathPassiveState(actor.system?.props?.resp_passivas_estado);
    if (
        breathingActor &&
        critical && options.classBasicAttack === true && !options.passivePlan?.noContactEffects &&
        passiveAfterDamage.metal?.hammerPending &&
        appliedTargets.some(target => target.amount > 0)
    ) {
        const target = appliedTargets.find(entry => entry.amount > 0);
        const hammer = consumeMetalHammerPending(passiveAfterDamage, {
            breathingLevel: parseNumber(props.nvl_respiracao_num ?? props.nvl_respiracao),
        });
        if (hammer.ok) await actor.update(passiveStatePatch(hammer.state), {
            naCsbAutomation: true, naBreathing: true,
        });
        const useHammer = hammer.ok && await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Martelo do Julgamento' },
            content: '<p>Fazer um novo Ataque Padrão? Se acertar, role o dano da arma. O ataque causa metade desse dano, arredondada para cima, e ignora Resistência.</p>',
            rejectClose: false,
        });
        if (useHammer) {
            const targetToken = [...(targets ?? [])].find(token => token.actor?.uuid === target.actor.uuid)
                ?? { actor: target.actor };
            const hammerTargets = new Set([targetToken]);
            const { rollHit } = await import('./hit-service.mjs');
            const hit = await rollHit({
                actor,
                targets: hammerTargets,
                autoDamage: false,
                skipActionConsumption: true,
                forceActionType: 'ataque',
                forceRollCount: 1,
                requiredWeaponId: options.weaponItem?.id ?? '',
                noContactEffects: true,
                noPassiveGeneration: true,
            });
            const extraHit = hit?.attempts?.find(attempt => attempt.hit);
            const item = hit?.weapon ? actor.items?.get?.(hit.weapon.id) ?? options.weaponItem : null;
            if (extraHit && item) {
                const synergyChoice = await chooseMetalHammerSynergy(actor);
                const ally = synergyChoice?.ally?.actor;
                const allySpend = ally ? spendMetalHammerSynergyPdr(ally, 1) : null;
                if (allySpend && !allySpend.ok)
                    ui.notifications?.warn?.(`${allySpend.reason} O Martelo seguirá sem a sinergia.`);
                const paid = allySpend?.ok === true && (ally.isOwner || game.user?.isGM);
                if (paid) await ally.update(allySpend.patch, { naCsbAutomation: true, naBreathing: true });
                let completed = false;
                try {
                    const followUp = await rollWeaponItem({
                        actor,
                        item,
                        targets: hammerTargets,
                        weaponProfileIndex: hit.weapon.profileIndex ?? 0,
                        weaponAttackIndex: 0,
                        critical: extraHit.critical === true,
                        skipActionConsumption: true,
                        forceAttackDamage: true,
                        damageOnly: true,
                        passivePlan: { ignoreResistance: true, skipResourceConsumption: true,
                            halfDamage: !paid, roundHalfUp: true, noContactEffects: true },
                    });
                    completed = followUp?.appliedTargets?.some(entry => entry.amount > 0) === true;
                } finally {
                    if (paid && !completed) {
                        const { pdrSpent } = breathingResourceKeys(ally.system?.props);
                        const spent = parseNumber(ally.system?.props?.[pdrSpent]);
                        if (spent === allySpend.patch[`system.props.${pdrSpent}`]) await ally.update({
                            [`system.props.${pdrSpent}`]: Math.max(0, spent - allySpend.cost),
                        }, { naCsbAutomation: true, naBreathing: true });
                    }
                }
            }
        }
    }
    const flavor = buildDamageFlavor({
        nome, breathing: dialogResult.breathing || breathingContext,
        critical, pdrGasto, reasons: statusEffects.reasons,
        components, finalDamage, appliedTargets, damageRequests,
    });
    const chatData = {
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor,
        rolls,
    };
    // v14: a visibilidade só vale como opção de criação (ChatMessage#_preCreate).
    const message = await ChatMessage.create(chatData, {
        messageMode: resolveMessageMode(dialogResult.messageMode),
    });
    await waitForDamageRolls3d(message);
    return { executed: true, message, actionId, finalDamage, components, appliedTargets, damageRequests, windDamageDealt };
}

/** Regra de mesa: dividir o total igualmente entre os alvos; sobra para os primeiros. */
export function splitAmongTargets(total, count, index) {
    const value = Math.max(0, Math.trunc(Number(total) || 0));
    const parts = Math.max(1, Math.trunc(Number(count) || 1));
    const base = Math.floor(value / parts);
    return base + (index < value % parts ? 1 : 0);
}

export const DAMAGE_TYPE_COLORS = Object.freeze({
    cortante: '#ff5b6e', perfurante: '#ffb35c', concussao: '#d9d24a', trovejante: '#ffe45c',
    sonoro: '#9b8cff', solar: '#ffcf6b', fogo: '#ff7a2f', congelante: '#6fd8ff',
    acido: '#a6e34a', eletrico: '#ffe95c', impacto: '#ff9a55', mental: '#c58cff',
    venenoso: '#8fd14f', necrotico: '#b15cff', ferida: '#ff4d4d',
    sangramento: '#e04343', envenenamento: '#7fbf3f',
});

export function damageTypeLabel(key) {
    const label = TIPOS_DANO.find((type) => type.key === key)?.label ?? String(key ?? 'Sem tipo');
    const color = DAMAGE_TYPE_COLORS[key] ?? '#d9c7a3';
    return `<span style="color:${color};font-weight:700">${label}</span>`;
}

export const BREATHING_CHAT_COLORS = Object.freeze({
    Água: '#6fd8ff', Chamas: '#ff7a2f', Eclipse: '#b15cff', Metal: '#d9d24a',
    Neve: '#a9e6ff', Névoa: '#9b8cff', Pedra: '#c2a25c', Raposa: '#ffb35c',
    Som: '#ffcf6b', Sonhos: '#c58cff', Vento: '#8fd14f',
});

/** Tipos coloridos, cabeçalho da respiração e banner de crítico no chat de dano. */
export function buildDamageFlavor({ nome, breathing = '', critical, pdrGasto, reasons = [], components = [], finalDamage, appliedTargets = [], damageRequests = [] }) {
    const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const breathingLine = breathing
        ? `<div style="font-weight:800;letter-spacing:.06em;color:${BREATHING_CHAT_COLORS[breathing] ?? '#d9c7a3'}">${escape(breathing)}</div>`
        : '';
    const labels = (types) => (types ?? []).map(damageTypeLabel).join(' · ') || 'Sem tipo';
    // Uma linha por entrada. A antiga divisão por tipo (5 → Cortante 3 · Perfurante 2)
    // só rachava o mesmo número e foi retirada a pedido do operador (2026-11-22).
    const componentLines = components
        .map((component) => `<div><strong>${component.label}</strong> ${labels(component.types)}: <strong>${component.subtotal}</strong></div>`)
        .join('');
    const targetLine = appliedTargets.length
        ? `<div>Aplicado em: ${appliedTargets.map((target) => `${target.name} (${Math.max(0, target.amount - target.wound)}${target.wound ? ` de dano + ${target.wound} de Ferida` : ''})`).join(', ')}</div>`
        : damageRequests.length
          ? '<div>Alvo solicitado, mas a ficha não foi atualizada.</div>'
          : '<div>Sem alvo marcado: nenhuma ficha foi atualizada.</div>';
    const critBanner = critical
        ? '<div style="font-size:22px;font-weight:900;letter-spacing:.12em;color:#ffe08a;text-shadow:0 0 14px #ff7a00;margin:6px 0;">⚔ CRÍTICO ⚔</div>'
        : '';
    const totalStyle = critical ? 'font-size:18px;font-weight:900;color:#ffe08a;' : '';
    // `na-damage-chat`: o CSS do módulo esconde as caixas de rolagem do core nesta mensagem
    // (o cartão já mostra cada entrada e o total; com dano fixo elas só repetiam o número).
    return `<div class="na-damage-chat">${breathingLine}<div><strong>${nome}</strong>${pdrGasto ? ` · −${pdrGasto} PDR` : ''}</div>${reasons.length ? `<div>Status: ${reasons.join(' · ')}</div>` : ''}${componentLines}${critBanner}<hr><div style="${totalStyle}"><strong>Total: ${finalDamage}</strong></div>${targetLine}</div>`;
}

/**
 * Rola uma arma embutida usando o Rank e os atributos finais do Actor portador.
 * @param {object} options
 * @param {string} [options.itemUuid]
 * @param {string} [options.actorUuid]
 * @returns {Promise<void>}
 */
export async function rollWeaponItem(options = {}) {
    const directItem = options.item?.documentName === 'Actor' ? null : options.item;
    const resolvedUuid = options.itemUuid ? await fromUuid(options.itemUuid) : null;
    const item = directItem ?? (resolvedUuid?.documentName === 'Actor' ? null : resolvedUuid);
    if (!item) return ui.notifications?.warn?.('Item de arma não encontrado.');
    const actor = item.parent?.documentName === 'Actor' ? item.parent : await resolveActor(options);
    if (!actor)
        return ui.notifications?.warn?.(
            'A arma precisa estar vinculada a um Caçador para calcular o dano.'
        );

    const selectedMode = await ensureWeaponUsageMode(item);
    const availableModes = weaponProfilesForActor(
        item.system?.props ?? {},
        actor.system?.props ?? {}
    );
    const specialWeaponItem =
        String(item.system?.props?.arma_categoria ?? '').toLocaleLowerCase('pt-BR') === 'especial';
    if (!selectedMode && availableModes.length > 1 && !specialWeaponItem) return;

    if (options.startWithHit === true && options.damageOnly !== true) {
        const specialPending = specialWeaponPendingForAttack(actor, item);
        if (specialPending) {
            const { rollSpecialWeaponItem } = await import('./special-weapon-service.mjs');
            return rollSpecialWeaponItem({ ...options, item, actor });
        }
        const { rollHit } = await import('./hit-service.mjs');
        return rollHit({
            actor,
            requiredWeaponId: item.id,
            autoDamage: true,
        });
    }

    const itemProps = item.system?.props ?? {};
    let profiles = weaponProfilesForActor(itemProps, actor.system?.props ?? {});
    if (profiles.length === 0)
        return ui.notifications?.warn?.('Esta arma não possui perfil de ataque configurado.');
    if (Number.isInteger(options.weaponProfileIndex) && profiles[options.weaponProfileIndex]) {
        profiles = [profiles[options.weaponProfileIndex]];
    }

    const specialPending = specialWeaponPendingForAttack(actor, item);
    if (specialPending && Number(specialPending.damageBonus) !== 0) {
        profiles = profiles.map((profile) => ({
            ...profile,
            dano_fixo: (Number(profile.dano_fixo) || 0) + (Number(specialPending.damageBonus) || 0),
        }));
    }

    const savedProfile = !specialWeaponItem ? itemDamageProfileFromProps(itemProps) : null;
    const result = await rollDamage({
        actor,
        nome: itemProps.arma_nome || item.name,
        ...(savedProfile
            ? {
                  entradas: savedProfile.entries,
                  builder: false,
              }
            : {
                  weaponProfiles: profiles,
                  weaponAttackIndex: Number.isInteger(options.weaponAttackIndex)
                      ? options.weaponAttackIndex
                      : null,
              }),
        weaponItem: item,
        tipoAcao: 'ataque',
        critical: options.critical === true,
        actionId: options.actionId,
        passiveExecutionId: options.passiveExecutionId,
        passiveFormId: options.passiveFormId,
        attackTotal: options.attackTotal,
        deferWindDamageDealt: options.deferWindDamageDealt,
        passivePlan: options.passivePlan,
        targets: options.targets,
        skipActionConsumption: options.skipActionConsumption === true,
        forceAttackDamage: options.forceAttackDamage === true,
        promptHealOrDamage: options.promptHealOrDamage === true,
        classBasicAttack: options.classBasicAttack === true,
        oniTitanImpactEligible: options.oniTitanImpactEligible === true,
        ...(options.flamingUniverse ? { flamingUniverse: options.flamingUniverse } : {}),
    });

    if (specialPending) {
        await applySpecialWeaponHitEffects({ actor, item, pending: specialPending });
        await clearSpecialWeaponPending(actor, specialPending);
    }
    return result;
}

export async function reloadWeaponItem(options = {}) {
    const directItem = options.item?.documentName === 'Actor' ? null : options.item;
    const resolvedUuid = options.itemUuid ? await fromUuid(options.itemUuid) : null;
    const item = directItem ?? (resolvedUuid?.documentName === 'Actor' ? null : resolvedUuid);
    if (!item) return ui.notifications?.warn?.('Item de arma não encontrado.');
    const actor = item.parent?.documentName === 'Actor' ? item.parent : await resolveActor(options);
    if (!actor)
        return ui.notifications?.warn?.(
            'A arma precisa estar vinculada a um Slayer para recarregar.'
        );

    const props = item.system?.props ?? {};
    const capacity = Math.max(0, Math.trunc(parseNumber(props.arma_municao_capacidade)));
    if (capacity <= 0)
        return ui.notifications?.warn?.('Esta arma não possui capacidade de munição configurada.');
    const current = Math.max(
        0,
        Math.min(capacity, Math.trunc(parseNumber(props.arma_municao_atual ?? capacity)))
    );
    if (current >= capacity) return ui.notifications?.info?.('A arma já está com a munição cheia.');

    const actionResult = await consumeSlayerActions(actor, ['unica'], { update: false });
    if (!actionResult.ok) return ui.notifications?.warn?.(actionResult.reason);
    const itemPatch = weaponAmmoPatch(props, capacity);
    try {
        await Promise.all([
            actor.update(actionResult.patch, { naCsbAutomation: true, naActionEconomy: true }),
            item.update(itemPatch, { naCsbAutomation: true }),
        ]);
    } catch (error) {
        console.warn?.(`[${MODULE_ID}] Falha ao recarregar arma`, error);
        return ui.notifications?.warn?.('Não foi possível concluir a recarga da arma.');
    }
    return ui.notifications?.info?.(`${item.name || 'Arma'} recarregada: ${capacity}/${capacity}.`);
}
