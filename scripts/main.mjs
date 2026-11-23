/**
 * @fileoverview Entry point do módulo Night Assassins CSB Automation.
 */
import { MODULE_ID, ATTRIBUTES } from './constants.mjs';
import { handleActorUpdate } from './trigger-router.mjs';
import { rollTest } from './roll-service.mjs';
import { rollHit } from './hit-service.mjs';
import { openKakushiManager } from './slayer/kakushi-service.mjs';
import { registerDualBreathingPostureEngine } from './slayer/dual-breathing-posture.mjs';
import { openCompanionOniManager } from './slayer/companion-oni-service.mjs';
import { useOniSpecialization } from './oni/specialization-runtime.mjs';
import { fillMissingSheetAttributes } from './sheet-attributes.mjs';
import { reloadWeaponItem, rollDamage, rollWeaponItem } from './damage-service.mjs';
import { openDamagePresetManager } from './dialogs/damage-preset-manager.mjs';
import { openNpcVitals } from './npc-vitals-service.mjs';
import { registerDreamPassiveEngine } from './dream-passive-service.mjs';
import { registerCombatPassiveEngine, openBreathingPassiveManager } from './breathing-combat-passives.mjs';
import { recognizeNpcBreathing } from './npc-breathing-recognition.mjs';
import { backfillPassiveSummaries, injectPassiveSummary, refreshPassiveSummaryForItem } from './passive-summary-service.mjs';
import { promptTemplateSyncAfterUpdate, syncWorldTemplates } from './template-sync-service.mjs';
import { guardVanillaChoices } from './vanilla-choice-guard.mjs';
import {
    migrateRulesSelection,
    openRulesProfileManager,
    openRulesTableManager,
    preserveVanillaSelectionsOnTemplateReload,
    sheetRuleFlags,
} from './rules-profile.mjs';
import { tagItemSheet } from './item-sheet-skin.mjs';
import { attachItemSheetHud, openItemDamageProfileEditor } from './item-sheet-hud.mjs';
import { saveItemDamageProfile } from './item-damage-profile.mjs';
import {
    createGenericItem,
    createSpecialWeapon,
    genericItemData,
    openGenericItemCreator,
    openItemCreator,
    openSpecialWeaponCreator,
    specialWeaponData,
} from './item-creator.mjs';
import { openFormCreator } from './form-creator.mjs';
import {
    createLevelOneValues,
    processLevelGain,
    processOniLevelGain,
    runAttributeSnapshot,
} from './level-service.mjs';
import { applyInitialMark, upgradeMarkAtLevelSix } from './ability-service.mjs';
import * as huntersMark from './slayer/hunter-mark.mjs';
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
    openRecoveryManager,
    attemptLastChance,
    recoveryBreathingLevel,
    hasRecoveryBreathing,
    recoveryFormDefinition,
    registerRecoveryBreathingEngine,
} from './recovery-breathing-service.mjs';
import {
    attemptSnowRestrictionEscape,
    registerBreathingEngine,
    triggerSnowOpportunityAttack,
    useBreathForm,
    openBreathingManager,
} from './breath-service.mjs';
import { launchBreathForm } from './breath-form-launcher.mjs';
import { openHuntersMarkDialog } from './slayer/hunter-mark-dialog.mjs';
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
import {
    registerWeaponSynchronizationEngine,
    repairSlayerWeaponItems,
} from './weapon-migration.mjs';
import { repairBreathingItems } from './breath-migration.mjs';
import {
    normalizeBreathingTechnique,
    normalizeWeaponTechnique,
} from './items/item-technique-normalizers.mjs';
import * as slayerProgression from './slayer/progression-service.mjs';
import * as slayerOrigins from './slayer/origin-contracts.mjs';
import * as slayerClasses from './slayer/class-contracts.mjs';
import * as slayerClassRuntime from './slayer/class-runtime.mjs';
import * as slayerAdvancedStates from './slayer/advanced-states.mjs';
import * as oniProgression from './oni/progression-service.mjs';
import { oniReadyCatchUp, registerOniProgressionEngine } from './oni/progression-engine.mjs';
import { actorKind } from './actor-kind.mjs';
import { repairOniActors } from './oni/repair-service.mjs';
import { useKekkijutsuItem } from './oni/kekkijutsu-use-service.mjs';
import { registerOniRegenerationEngine, useOniRegeneration } from './oni/regeneration-runtime.mjs';
import { registerWeaponModeEngine } from './weapon-service.mjs';
import { registerWeaponCreationAudit } from './weapon-creation-audit.mjs';
import {
    openSpecialWeaponAbilities,
    registerSpecialWeaponRuntime,
    rollSpecialWeaponItem,
    useSpecialWeaponAbility,
} from './special-weapon-service.mjs';
import {
    dualSoulCeremonyCompleted,
    getDualSoulCeremonyState,
    isDualSoulWeapon,
    openDualSoulCeremony,
} from './dual-soul-ceremony-service.mjs';
import {
    dualSoulAwakeningPending,
    getDualSoulAwakeningRuntime,
    openDualSoulAwakeningResistance,
} from './dual-soul-awakening-resistance-service.mjs';
import {
    finalizeDualSoulPossession,
    getDualSoulConsequenceState,
    openDualSoulConsequenceManager,
    recordDualSoulLoanUse,
    registerDualSoulConsequenceRuntime,
    routePendingDualSoulConsequence,
} from './dual-soul-consequence-service.mjs';
import {
    awakenSpecialWeapon,
    awakenYamato,
    openSpecialWeaponAwakeningManager,
    registerSpecialWeaponAwakeningRuntime,
} from './special-weapon-awakening-service.mjs';
import {
    derivedBonusSummary,
    openDerivedBonusAudit,
    resolveSlayerDerivedBonuses,
} from './derived-bonus-service.mjs';
import {
    openCombatManeuverManager,
    registerCombatManeuverEngine,
    resolveCombatManeuverBonuses,
    useCombatManeuver,
} from './combat-maneuver-service.mjs';
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
    return rollDamage({
        promptHealOrDamage: true,
        ...options,
    });
}
async function rollWeaponItemPublic(options = {}) {
    return rollWeaponItem({
        promptHealOrDamage: true,
        ...options,
    });
}
Hooks.once('init', () => {
    registerSettings();
    registerOniProgressionEngine();
    Hooks.on('preUpdateActor', preserveVanillaSelectionsOnTemplateReload);
    Hooks.on('preUpdateActor', guardVanillaChoices);
});
/**
 * Marca fichas Night Assassins com a classe de skin `.na-sheet`.
 * @param {Application} app
 * @param {JQuery|HTMLElement} html
 * @returns {void}
 */
const rulesProfileSync = new WeakSet();

async function syncSheetRulesProfile(actor) {
    const props = actor?.system?.props;
    if (!props || !actor.update || !actor.isOwner || !['npc', 'slayer', 'oni'].includes(actorKind(actor))) return;
    if (rulesProfileSync.has(actor)) return;
    const update = Object.fromEntries(Object.entries(sheetRuleFlags())
        .filter(([key, value]) => Number(props[key] ?? 0) !== value)
        .map(([key, value]) => [`system.props.${key}`, value]));
    if (!Object.keys(update).length) return;
    rulesProfileSync.add(actor);
    try {
        await actor.update(update, { naCsbAutomation: true, naRulesProfile: true });
    } finally { rulesProfileSync.delete(actor); }
}

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
    if (el) fillMissingSheetAttributes(el, actor);
    void syncSheetRulesProfile(actor).catch(error => ui.notifications.error(error.message));
}
Hooks.once('ready', async () => {
    if (game.system.id !== 'custom-system-builder') {
        console.warn?.(
            `[${MODULE_ID}] Sistema incompatível: ${game.system.id}. Módulo desativado.`
        );
        return;
    }
    if (game.user?.isGM) {
        const primary = [...(game.users ?? [])].filter(user => user.active && user.isGM)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
        if (!primary || primary.id === game.user.id) {
            try { await migrateRulesSelection(); }
            catch (error) { console.warn(`[${MODULE_ID}] Seleção legada de regras não migrada`, error.message); }
        }
    }
    registerDiagnosticCollector();
    registerStatusEngine();
    registerActionEngine();
    registerRecoveryBreathingEngine();
    registerDreamPassiveEngine();
    registerCombatPassiveEngine();
    Hooks.on('preUpdateActor', injectPassiveSummary);
    for (const hook of ['createItem', 'deleteItem'])
        Hooks.on(hook, (item, _options, userId) => {
            if (userId !== game.user.id) return; // só quem mexeu grava o resumo
            void (async () => {
                if (hook === 'createItem') await recognizeNpcBreathing(item);
                await refreshPassiveSummaryForItem(item);
            })().catch(error => console.warn(`[${MODULE_ID}] Acúmulos`, error.message));
        });
    Hooks.on('createActor', actor => void syncSheetRulesProfile(actor).catch(error => ui.notifications.error(error.message)));
    registerCombatManeuverEngine();
    registerRestEngine();
    registerBreathingEngine();
    registerDualBreathingPostureEngine();
    registerOniRegenerationEngine();
    if (game.settings.get(MODULE_ID, SETTINGS.enableLifeDeathEngine)) {
        registerLifeDeathEngine();
    } else {
        console.warn(
            `[${MODULE_ID}] Motor Vida e Morte NÃO registrado (desabilitado nas configurações).`
        );
    }
    registerAdvancedStatesEngine();
    registerWeaponSynchronizationEngine();
    registerWeaponModeEngine();
    registerWeaponCreationAudit();
    registerSpecialWeaponRuntime();
    registerSpecialWeaponAwakeningRuntime();
    registerDualSoulConsequenceRuntime();
    // A pele do Actor volta a ser aplicada; o gate visual é a ficha aberta no
    // Foundry 14.367 (se quebrar, este par de hooks é o ponto de rollback).
    Hooks.on('renderActorSheet', tagNightAssassinsSheet);
    Hooks.on('renderActorSheetV2', tagNightAssassinsSheet);
    Hooks.on('renderApplicationV2', (app, element) => {
        // ItemSheetV2 também expõe `actor` (o dono): item nunca leva a pele do Actor.
        if (app?.document?.documentName === 'Item') {
            tagItemSheet(app, element);
            return attachItemSheetHud(app, element);
        }
        if (app?.actor) tagNightAssassinsSheet(app, element);
    });
    // Ficha de item do CSB 6.1 é ApplicationV1 (`EquippableItemSheet`).
    Hooks.on('renderItemSheet', (app, element) => {
        tagItemSheet(app, element);
        attachItemSheetHud(app, element);
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
    // Sincroniza os atalhos do GM. As macros das fichas vêm do Compêndio.
    if (game.user.isGM) {
        const primary = [...(game.users ?? [])].filter(user => user.active && user.isGM)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
        if (!primary || primary.id === game.user.id) {
            const tokenActors = Array.from(game.scenes ?? []).flatMap(scene =>
                [...(scene.tokens ?? [])].filter(token => !token.actorLink).map(token => token.actor)
            );
            const actors = [...(game.actors ?? []), ...tokenActors];
            for (const actor of actors) {
                try { await syncSheetRulesProfile(actor); }
                catch (error) { console.warn(`[${MODULE_ID}] Perfil da ficha não sincronizado`, actor?.id, error.message); }
            }
            try { await backfillPassiveSummaries([...(game.actors ?? [])].filter(actor => ['npc', 'slayer'].includes(actorKind(actor)))); }
            catch (error) { console.warn(`[${MODULE_ID}] Resumo de acúmulos não recalculado`, error.message); }
            // Sem await: o diálogo de confirmação não pode travar o resto do `ready`.
            void promptTemplateSyncAfterUpdate()
                .catch(error => ui.notifications.error(`Atualização de templates falhou: ${error.message}`));
        }
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
            syncWorldTemplates,
            rollTest,
            rollHit,
            rollDamage: rollDamagePublic,
            rollWeaponItem: rollWeaponItemPublic,
            rollSpecialWeaponItem,
            openSpecialWeaponAbilities,
            useSpecialWeaponAbility,
            openDualSoulCeremony,
            getDualSoulCeremonyState,
            dualSoulCeremonyCompleted,
            isDualSoulWeapon,
            openDualSoulAwakeningResistance,
            getDualSoulAwakeningRuntime,
            dualSoulAwakeningPending,
            openDualSoulConsequenceManager,
            getDualSoulConsequenceState,
            routePendingDualSoulConsequence,
            recordDualSoulLoanUse,
            finalizeDualSoulPossession,
            awakenYamato,
            awakenSpecialWeapon,
            openSpecialWeaponAwakeningManager,
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
            huntersMark,
            openHuntersMarkDialog,
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
            openRecoveryManager,
            openNpcVitals,
            attemptLastChance,
            openCombatManeuverManager,
            useCombatManeuver,
            resolveCombatManeuverBonuses,
            recoveryBreathingLevel,
            hasRecoveryBreathing,
            recoveryFormDefinition,
            useBreathForm,
            launchBreathForm,
            openBreathingManager,
            openBreathingPassiveManager,
            openRulesProfileManager,
            openRulesTableManager,
            openDamagePresetManager,
            openItemDamageProfileEditor,
            saveItemDamageProfile,
            openItemCreator,
            createGenericItem,
            genericItemData,
            openGenericItemCreator,
            createSpecialWeapon,
            specialWeaponData,
            openSpecialWeaponCreator,
            openFormCreator,
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
                runtime: slayerClassRuntime,
                openKakushiManager,
                openCompanionOniManager,
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
                specialization: useOniSpecialization,
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
    if (!actor)
        return {
            ok: false,
            reason: 'Actor não fornecido.',
        };
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
