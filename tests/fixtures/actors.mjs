/**
 * Fixtures de Actor representativas para a matriz Slayer/Oni/Minion/NPC.
 * Contrato do Blueprint 02 (Baseline e contratos).
 * Cada fixture simula o `system.props` que o CSB produz em runtime.
 */

const SEVEN_ATTRS = ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'];

function slayerProps(overrides = {}) {
    return {
        nome_slayer: 'Kwon Jisoo',
        nvl_num: 5,
        pdv_slayer_total_valor: 24,
        pdv_slayer_dano_tomado: 6,
        pdv_slayer_dano_ferida: 2,
        pdv_slayer_atual_valor_display: 16,
        pdr_slayer_total_valor: 12,
        pdr_slayer_gasto_valor: 3,
        pdr_slayer_atual_valor_display: 9,
        status_slayer_dados: '{}',
        status_slayer_resumo: '',
        status_slayer_exaustao: 0,
        atr_vit_valor: 4,
        vit_display: 6,
        atr_dex_valor: 3,
        dex_display: 5,
        atr_for_valor: 3,
        for_display: 5,
        atr_car_valor: 2,
        car_display: 4,
        atr_fdv_valor: 3,
        fdv_display: 5,
        atr_int_valor: 2,
        int_display: 4,
        atr_sab_valor: 2,
        sab_display: 4,
        ...overrides,
    };
}

function oniProps(overrides = {}) {
    return {
        nome_oni: 'Yokai Onryo',
        nvl_num: 5,
        classe_oni_escolha: 'Onryo',
        rank_oni_display: 'C',
        pdv_oni_total_valor: 40,
        pdv_oni_total_conta: 40,
        pdv_oni_dano_tomado: 10,
        pdv_oni_dano_ferida: 4,
        pdv_oni_atual_valor_display: 26,
        pdk_oni_total_valor: 8,
        pdk_oni_total_conta: 8,
        pdk_oni_gasto_valor: 2,
        pdk_oni_atual_valor_display: 6,
        status_oni_display: '',
        status_oni_resistencias_display: '',
        atr_vit_valor: 5,
        vit_display: 7,
        atr_dex_valor: 3,
        dex_display: 5,
        atr_for_valor: 4,
        for_display: 6,
        atr_car_valor: 1,
        car_display: 3,
        atr_fdv_valor: 3,
        fdv_display: 5,
        atr_int_valor: 2,
        int_display: 4,
        atr_sab_valor: 2,
        sab_display: 4,
        ...overrides,
    };
}

function oniMinionProps(overrides = {}) {
    const rapido = { vit: 1, dex: 4, for: 1, car: 0, fdv: 2, int: 0, sab: 3 };
    const nivel = 1;
    const base = rapido;
    const pdv = 8 + nivel + base.vit;
    const pdk = 2 + base.fdv;
    const props = {
        oni_minion_nome: 'Lacaio Rapido',
        oni_minion_tipo: 'Fraco',
        oni_minion_nivel: nivel,
        oni_minion_pacote: 'Rapido',
        oni_minion_pdv_base: pdv,
        oni_minion_pdv_dano: 3,
        oni_minion_pdv_curado: 0,
        oni_minion_pdv_total_label: String(pdv),
        oni_minion_pdk_base: pdk,
        oni_minion_pdk_gasto: 1,
        oni_minion_pdk_recuperado: 0,
        oni_minion_pdk_total_label: String(pdk),
    };
    for (const attr of SEVEN_ATTRS) {
        props[`oni_minion_${attr}_base`] = base[attr];
        props[`oni_minion_${attr}_display_label`] = String(base[attr]);
    }
    return { ...props, ...overrides };
}

function npcProps(overrides = {}) {
    return {
        nome_npc: 'Taverneiro',
        biografia_npc: 'Um humano comum sem recursos de combate.',
        ...overrides,
    };
}

export function makeSlayerActor(overrides = {}) {
    return {
        id: 'slayer-test-01',
        name: 'Kwon Jisoo',
        system: { template: 'Slayer_template_atual', props: slayerProps(overrides) },
    };
}

export function makeOniActor(overrides = {}) {
    return {
        id: 'oni-test-01',
        name: 'Yokai Onryo',
        system: { template: 'oni_template', props: oniProps(overrides) },
    };
}

export function makeOniMinionActor(overrides = {}) {
    return {
        id: 'minion-test-01',
        name: 'Lacaio Rapido',
        system: { template: 'oni_minion_template', props: oniMinionProps(overrides) },
    };
}

export function makeNpcActor(overrides = {}) {
    return {
        id: 'npc-test-01',
        name: 'Taverneiro',
        system: { template: 'npc_template', props: npcProps(overrides) },
    };
}

export const SEVEN_ATTRIBUTES = SEVEN_ATTRS;

export const EXPECTED = {
    slayer: {
        kind: 'slayer',
        resourcePrimary: 'pdv_slayer_total_valor',
        resourceSecondary: 'pdr_slayer_total_valor',
        namespace: 'slayer',
    },
    oni: {
        kind: 'oni',
        resourcePrimary: 'pdv_oni_total_valor',
        resourceSecondary: 'pdk_oni_total_valor',
        namespace: 'oni',
    },
    oni_minion: {
        kind: 'oni_minion',
        resourcePrimary: 'oni_minion_pdv_base',
        resourceSecondary: 'oni_minion_pdk_base',
        namespace: 'oni_minion',
    },
};
