/**
 * @fileoverview Entry point do módulo Night Assassins CSB Automation.
 */

import { MODULE_ID, ATTRIBUTES } from './constants.mjs';
import { handleActorUpdate } from './trigger-router.mjs';
import { rollTest } from './roll-service.mjs';
import { rollHit } from './hit-service.mjs';
import { reloadWeaponItem, rollDamage, rollWeaponItem } from './damage-service.mjs';
import {
    createLevelOneValues,
    processLevelGain,
    processOniLevelGain,
    runAttributeSnapshot,
} from './level-service.mjs';
import { applyInitialMark, upgradeMarkAtLevelSix } from './ability-service.mjs';
import { applyOniDamage, registerDamageRelay } from './damage-relay.mjs';
import { healActor, registerHealRelay } from './heal-relay.mjs';
import {
    parseNumber,
    currentConfigValues,
    latestValues,
    changedProp,
    isDestinyMark,
    normalizeAbilityKey,
} from './parsing.mjs';
import { registerSettings, SETTINGS } from './settings.mjs';
import { openGmDashboard } from './gm-dashboard.mjs';
import { syncCanonicalMacros } from './macro-sync.mjs';
import { openResistanceManager } from './resistance-service.mjs';
import { openStatusManager } from './status-service.mjs';
import {
    getRollStatusEffects,
    getDamageStatusEffects,
    getStatusCapabilities,
    mergeRollMode,
    isReactionBlocked,
} from './status-effects.mjs';
import {
    applySlayerDamage,
    movementBlocked,
    processActorStatusTiming,
    reconcileSlayerExhaustion,
    registerStatusEngine,
    resolveSlayerHealing,
} from './status-engine.mjs';
import {
    consumeOniActions,
    consumeSlayerActions,
    openActionManager,
    parseActionState,
    recoverSlayerFolego,
    registerActionEngine,
    resetOniActions,
    resetSlayerActions,
    slayerMovementMeters,
} from './action-service.mjs';
import {
    openRestManager,
    registerRestEngine,
    resolveRestTier,
    restEligibleStatuses,
} from './rest-service.mjs';
import {
    attemptSnowRestrictionEscape,
    registerBreathingEngine,
    triggerSnowOpportunityAttack,
    useBreathForm,
} from './breath-service.mjs';
import {
    openLifeDeathManager,
    parseLifeDeathState,
    processDeathTest,
    registerLifeDeathEngine,
    slayerCurrentPdv,
    slayerMaxPdv,
    stabilizeSlayer,
} from './life-death-service.mjs';
import {
    openAdvancedStatesManager,
    registerAdvancedStatesEngine,
} from './slayer/advanced-states.mjs';
import { executeInterludeActivity, openInterludeManager } from './interlude-service.mjs';
import { createCombatContext, validateCombatContext } from './core/combat-context.mjs';
import { createActorTransaction } from './core/actor-transaction.mjs';
import {
    normalizeTechniqueDefinition,
    splitDamageTotal,
    validateTechniqueDefinition,
} from './core/technique-definition.mjs';
import { repairSlayerWeaponItems } from './weapon-migration.mjs';
import { repairBreathingItems } from './breath-migration.mjs';
import {
    normalizeBreathingTechnique,
    normalizeWeaponTechnique,
} from './items/item-technique-normalizers.mjs';
import * as slayerProgression from './slayer/progression-service.mjs';
import * as slayerOrigins from './slayer/origin-contracts.mjs';
import * as slayerClasses from './slayer/class-contracts.mjs';
import * as slayerAdvancedStates from './slayer/advanced-states.mjs';
import * as oniProgression from './oni/progression-service.mjs';
import { oniReadyCatchUp, registerOniProgressionEngine } from './oni/progression-engine.mjs';
import { actorKind } from './actor-kind.mjs';
import { repairOniActors } from './oni/repair-service.mjs';
import { useKekkijutsuItem } from './oni/kekkijutsu-use-service.mjs';
import {
    registerOniRegenerationEngine,
    useOniRegeneration,
} from './oni/regeneration-runtime.mjs';
import { registerWeaponModeEngine } from './weapon-service.mjs';
import {
    derivedBonusSummary,
    openDerivedBonusAudit,
    resolveSlayerDerivedBonuses,
} from './derived-bonus-service.mjs';
import {
    exportDiagnosticJournal,
    openDiagnosticJournal,
    openDiagnosticManager,
    openDiagnosticReportDialog,
    registerDiagnosticCollector,
} from './diagnostic-journal.mjs';

/**
 * Wrapper público de rollDamage exposto em module.api ponto de entrada
 * real do botão "Dano" da ficha. Só aqui o diálogo "Dano ou Cura?" é
 * oferecido por padrão (promptHealOrDamage:true); chamadas internas
 * (Formas de Respiração, encadeamento pós-Acerto, dano de queda, Martelo
 * do Julgamento) continuam importando rollDamage/rollWeaponItem
 * diretamente de damage-service.mjs, sem o diálogo, preservando o
 * fallback seguro "Dano" nos fluxos 100% automáticos.
 */
async function rollDamagePublic(options = {}) {
    return rollDamage({ promptHealOrDamage: true, ...options });
}

async function rollWeaponItemPublic(options = {}) {
    return rollWeaponItem({ promptHealOrDamage: true, ...options });
}

Hooks.once('init', () => {
    registerSettings();
    registerOniProgressionEngine();
});

/**
 * Marca fichas Night Assassins com a classe de skin `.na-sheet`.
 * @param {Application} app
 * @param {JQuery|HTMLElement} html
 * @returns {void}
 */
function tagNightAssassinsSheet(app, html) {
    const actor = app?.actor;
    if (!actor?.system?.props) return;

    // Detecção robusta via actorKind() (template id/flags/props), nunca por nome
    // do Actor evita que uma ficha Oni chamada "Slayer X" (ou vice-versa)
    // receba a paleta errada.
    const kind = actorKind(actor);
    if (!kind) return;

    const root = html?.[0] ?? html;
    const el = root instanceof HTMLElement ? root : null;
    const appEl =
        app?.element instanceof HTMLElement
            ? app.element
            : (el?.closest?.('.app, .application') ?? el);
    const kindClass = `na-${kind.replaceAll('_', '-')}-sheet`;
    for (const target of [appEl, el]) {
        target?.classList?.add('na-sheet');
        target?.classList?.add(kindClass);
    }
}

Hooks.once('ready', async () => {
    if (game.system.id !== 'custom-system-builder') {
        console.warn?.(
            `[${MODULE_ID}] Sistema incompatível: ${game.system.id}. Módulo desativado.`
        );
        return;
    }
    registerDiagnosticCollector();
    registerStatusEngine();
    registerActionEngine();
    registerRestEngine();
    registerBreathingEngine();
    registerOniRegenerationEngine();
    if (game.settings.get(MODULE_ID, SETTINGS.enableLifeDeathEngine)) {
        registerLifeDeathEngine();
    } else {
        console.warn(
            `[${MODULE_ID}] Motor Vida e Morte NÃO registrado (desabilitado nas configurações).`
        );
    }
    registerAdvancedStatesEngine();
    registerWeaponModeEngine();

    // Manutenções mundiais nunca rodam no boot. Elas atualizam Actors/Items e
    // cada escrita força o CSB a recomputar a ficha inteira. Permanecem
    // disponíveis na API para execução manual e consciente pelo GM.
    Hooks.on('renderActorSheet', tagNightAssassinsSheet);
    Hooks.on('renderActorSheetV2', tagNightAssassinsSheet);
    Hooks.on('renderApplicationV2', (app, element) => {
        if (app?.actor) tagNightAssassinsSheet(app, element);
    });

    if (game.settings.get(MODULE_ID, SETTINGS.enableSheetAutomation)) {
        Hooks.on('updateActor', handleActorUpdate);
        console.log(`[${MODULE_ID}] Hook updateActor REGISTRADO.`);
    } else {
        console.warn(
            `[${MODULE_ID}] Hook updateActor NÃO registrado (desabilitado nas configurações).`
        );
    }

    if (game.settings.get(MODULE_ID, SETTINGS.enableDamageRelay)) {
        registerDamageRelay();
        registerHealRelay();
    }

    // Macros can be synchronized automatically: this touches only o pequeno
    // Compendium de macros e não percorre/regrava Actors ou Items do mundo.
    if (game.user.isGM) {
        void syncCanonicalMacros()
            .then(({ created, updated }) => {
                if (created > 0 || updated > 0)
                    ui.notifications.info(
                        `Macros Night Assassins sincronizadas: ${created} adicionadas, ${updated} atualizadas.`
                    );
            })
            .catch((error) =>
                ui.notifications.error(`Falha ao carregar macros Night Assassins: ${error.message}`)
            );
    }

    const module = game.modules.get(MODULE_ID);
    if (module) {
        module.api = {
            rollTest,
            rollHit,
            rollDamage: rollDamagePublic,
            rollWeaponItem: rollWeaponItemPublic,
            useKekkijutsuItem,
            reloadWeaponItem,
            repairBreathingItems,
            applyOniDamage,
            healActor,
            openGmDashboard,
            openResistanceManager,
            openStatusManager,
            openDerivedBonusAudit,
            resolveSlayerDerivedBonuses,
            derivedBonusSummary,
            getRollStatusEffects,
            getDamageStatusEffects,
            mergeRollMode,
            isReactionBlocked,
            getStatusCapabilities,
            applySlayerDamage,
            movementBlocked,
            processActorStatusTiming,
            reconcileSlayerExhaustion,
            resolveSlayerHealing,
            consumeSlayerActions,
            resetSlayerActions,
            parseActionState,
            openActionManager,
            slayerMovementMeters,
            recoverSlayerFolego,
            openRestManager,
            resolveRestTier,
            restEligibleStatuses,
            useBreathForm,
            attemptSnowRestrictionEscape,
            triggerSnowOpportunityAttack,
            openLifeDeathManager,
            parseLifeDeathState,
            processDeathTest,
            slayerCurrentPdv,
            slayerMaxPdv,
            stabilizeSlayer,
            openInterludeManager,
            executeInterludeActivity,
            core: {
                createCombatContext,
                validateCombatContext,
                createActorTransaction,
                normalizeTechniqueDefinition,
                validateTechniqueDefinition,
                splitDamageTotal,
            },
            items: {
                normalizeWeaponTechnique,
                normalizeBreathingTechnique,
            },
            slayer: {
                progression: slayerProgression,
                origins: slayerOrigins,
                classes: slayerClasses,
                advancedStates: slayerAdvancedStates,
                openAdvancedStatesManager,
            },
            oni: {
                progression: oniProgression,
                ensureProgression: oniProgression.ensureOniProgression,
                rollPdvGain: oniProgression.rollOniPdvGain,
                catchUp: oniReadyCatchUp,
                repairActor: repairOniActors,
                processLevel: processOniLevelGain,
                consumeActions: consumeOniActions,
                resetActions: resetOniActions,
                regenerate: useOniRegeneration,
            },
            actorKind,
            exportDiagnosticJournal,
            openDiagnosticJournal,
            openDiagnosticManager,
            openDiagnosticReportDialog,
            syncMacros: syncCanonicalMacros,
            openLevelOne: createLevelOneValues,
            processLevel: processLevelGain,
            processOniLevel: processOniLevelGain,
            runAttributeSnapshot,
            processAbility: applyInitialMark,
            upgradeMark: upgradeMarkAtLevelSix,
            diagnoseActor,
            repairSlayerWeaponItems,
            repairBreathingItems,
        };
    }

    console.log?.(`[${MODULE_ID}] Módulo ativado.`);
});

/**
 * Diagnostica um Actor retornando estado legível.
 * @param {Actor} actor
 * @returns {object}
 */
function diagnoseActor(actor) {
    if (!actor) return { ok: false, reason: 'Actor não fornecido.' };
    const props = actor.system?.props ?? {};
    const issues = [];

    const hasLevel1 = ATTRIBUTES.some(
        (a) =>
            props[`${a.key}_nvl1`] !== undefined &&
            props[`${a.key}_nvl1`] !== null &&
            props[`${a.key}_nvl1`] !== ''
    );
    if (!hasLevel1) issues.push('Nível 1 incompleto.');

    const level = parseNumber(props.nvl_pj);
    const markBonus = parseNumber(props.hab_marca_destino_bonus);
    const markAttr = props.hab_marca_destino_atributo;
    const ability = normalizeAbilityKey(props.hab_escolhida);

    if (ability === 'hab_escolhida_marca_destino' && markBonus < 2 && hasLevel1) {
        issues.push('Marca do Destino pendente: bônus +2 não aplicado.');
    }
    if (level >= 6 && markBonus === 2 && ability === 'hab_escolhida_marca_destino') {
        issues.push('Marca do Destino pendente no nível 6: evolução para +3 não aplicada.');
    }

    return {
        ok: issues.length === 0,
        actor: actor.name,
        uuid: actor.uuid,
        level,
        ability,
        markBonus,
        markAttr,
        issues,
        config: currentConfigValues(props),
        latest: latestValues(props, level || 1),
    };
}
