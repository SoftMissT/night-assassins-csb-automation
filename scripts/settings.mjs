import { MODULE_ID } from './constants.mjs';

export const SETTINGS = Object.freeze({
    enableSheetAutomation: 'enableSheetAutomation',
    enableDamageRelay: 'enableDamageRelay',
    enableLifeDeathEngine: 'enableLifeDeathEngine',
    rulesSelection: 'rulesSelection',
    dualBreathingVariations: 'dualBreathingVariations',
    rulesProfile: 'rulesProfile',
    criticalFloor: 'stoneCriticalFloor',
    stoneCriticalFloor: 'stoneCriticalFloor',
});

export function registerSettings() {
    class RulesTableMenu extends foundry.applications.api.ApplicationV2 {
        render() {
            import('./rules-profile.mjs').then(({ openRulesTableManager }) => openRulesTableManager());
            return this;
        }
    }
    game.settings.registerMenu(MODULE_ID, 'rulesTableMenu', {
        name: 'Regras da Mesa',
        label: 'Configurar regras',
        hint: 'Escolha Vanilla ou Homebrew para Metal da Nichirin, habilidades, origens e demais grupos.',
        icon: 'fa-solid fa-book-open',
        type: RulesTableMenu,
        restricted: true,
    });
    game.settings.register(MODULE_ID, SETTINGS.rulesSelection, {
        name: 'Regras da Mesa',
        hint: 'Seleção granular das variantes e regras adicionais da mesa.',
        scope: 'world',
        config: false,
        type: String,
        default: '',
        requiresReload: true,
    });

    // Mantém a chave antiga registrada, mas oculta, até migrar mundos existentes.
    game.settings.register(MODULE_ID, SETTINGS.rulesProfile, {
        name: 'Versão das regras (legado)',
        hint: 'Migrada para Regras da Mesa.',
        scope: 'world',
        config: false,
        type: String,
        choices: { vanilla: 'Vanilla · livros oficiais', homebrew: 'Homebrew · regras da mesa' },
        default: 'homebrew',
        requiresReload: true,
    });

    game.settings.register(MODULE_ID, SETTINGS.enableSheetAutomation, {
        name: 'Ativar automação da ficha',
        hint: 'Aplica as automações de atributos e progressão nas fichas.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
    });

    game.settings.register(MODULE_ID, SETTINGS.enableDamageRelay, {
        name: 'Ativar relay de dano do GM',
        hint: 'Permite solicitar ao GM a aplicação de dano em inimigos.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
    });

    game.settings.register(MODULE_ID, SETTINGS.enableLifeDeathEngine, {
        name: 'Ativar motor de Vida e Morte',
        hint: 'Monitora PDV, feridas, cura e estado de Vida e Morte.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
    });

    game.settings.register(MODULE_ID, SETTINGS.criticalFloor, {
        name: 'Limite mundial mínimo do crítico',
        hint: 'Menor resultado natural permitido para o crítico de uma arma.',
        scope: 'world',
        config: true,
        type: Number,
        default: 1,
        range: { min: 1, max: 20, step: 1 },
        requiresReload: false,
    });

    game.settings.register(MODULE_ID, SETTINGS.dualBreathingVariations, {
        scope: 'world',
        config: false,
        type: Object,
        default: {},
    });
}
