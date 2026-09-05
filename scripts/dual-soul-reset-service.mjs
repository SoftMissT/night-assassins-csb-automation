import { MODULE_ID } from './constants.mjs';
import { parseDualSoulJson, dualSoulCeremonyCompleted } from './dual-soul-ceremony-core.mjs';

const RESET_FLAG = 'dualSoulBondResetHistory';

function assertResettable(item) {
    if (!globalThis.game?.user?.isGM) throw new Error('Somente o GM pode resetar o vínculo.');
    if (!item?.update || item.pack || item.parent?.documentName !== 'Actor')
        throw new Error('Selecione uma arma do portador, não um template ou Compendium.');
    const props = item.system?.props ?? {};
    if (!dualSoulCeremonyCompleted(props.dupla_alma_cerimonia_json))
        throw new Error('Esta arma não possui vínculo concluído para resetar.');
    const awakening = parseDualSoulJson(props.arma_especial_despertar_runtime_json, {});
    const resistance = parseDualSoulJson(props.dupla_alma_despertar_runtime_json, {});
    const state = String(props.arma_especial_estado_atual ?? '').toLocaleLowerCase('pt-BR');
    if ((state && !state.startsWith('selad')) || awakening.state === 'Primeiro Despertar' ||
        resistance.pending || (resistance.consequence &&
            !['consumed', 'expired', 'complete'].includes(resistance.consequence.state)))
        throw new Error('Encerre o despertar e resolva as consequências pendentes antes de resetar o vínculo.');
    return props;
}

export async function resetDualSoulBond(item) {
    assertResettable(item);
    // Escape the document name; never interpolate editable Item text as markup.
    const name = String(item.name ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'GM — Resetar vínculo desta arma' },
        content: `<p>Resetar os três resultados da Cerimônia de <strong>${name}</strong>?</p><p>O vínculo anterior será arquivado nesta arma. Marcas, integração, PDV e uso por combate serão preservados. Não haverá nova rolagem automática.</p>`,
        defaultYes: false,
        modal: true,
        rejectClose: false,
    });
    if (!confirmed) return null;
    const props = assertResettable(item);
    const ceremony = parseDualSoulJson(props.dupla_alma_cerimonia_json, {});
    const link = parseDualSoulJson(props.dupla_alma_vinculo_json, {});
    const { runtime: previousRuntime, ...definition } = ceremony;
    const { runtime: previousLink, intensidade: previousIntensity, valor: previousValue, ...linkDefinition } = link;
    const history = item.getFlag?.(MODULE_ID, RESET_FLAG) ?? [];
    if (!Array.isArray(history)) throw new Error('Histórico de reset inválido; nada foi alterado.');
    const snapshot = {
        at: new Date().toISOString(), userId: game.user.id, itemUuid: item.uuid,
        ceremony, link,
        resistance: props.dupla_alma_despertar_runtime_json ?? '{}',
        dominance: props.arma_lado_dominante,
        intensity: props.arma_vinculo_intensidade,
        value: props.arma_vinculo_valor,
        trigger: props.arma_gatilho_despertar,
    };
    await item.update({
        [`flags.${MODULE_ID}.${RESET_FLAG}`]: [...history, snapshot],
        'system.props.dupla_alma_cerimonia_json': JSON.stringify(definition),
        'system.props.dupla_alma_vinculo_json': JSON.stringify(linkDefinition),
        'system.props.dupla_alma_despertar_runtime_json': '{}',
        'system.props.arma_lado_dominante': 'Não definido — Cerimônia pendente',
        'system.props.arma_vinculo_intensidade': '',
        'system.props.arma_vinculo_valor': 0,
        'system.props.arma_gatilho_despertar': '',
    }, { naCsbAutomation: true, naSpecialWeapon: true, naDualSoulCeremony: true });
    ui.notifications?.info?.(`${item.name}: vínculo resetado pelo GM. Execute a Cerimônia novamente quando desejar.`);
    return { ok: true, reset: true };
}
