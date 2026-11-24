import { resolveActorLoose } from '../actor-resolution.mjs';
import { parseWindBreathingState, setWindScars } from '../wind-breathing-service.mjs';

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * Correção rápida de Cicatrizes no meio da mesa, sem reimportar a ficha.
 * Grava o campo manual e o estado do Vento no mesmo valor.
 */
export async function openWindScarsDialog({ actorUuid, actor } = {}) {
    actor = await resolveActorLoose({ actor, actorUuid });
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM)) {
        globalThis.ui?.notifications?.warn?.('Escolha uma ficha que você possa editar.');
        return null;
    }
    const state = parseWindBreathingState(actor.system?.props?.resp_vento_estado);
    const current = Math.max(
        0,
        Math.trunc(Number(actor.system?.props?.resp_vento_cicatrizes) || 0),
        Math.trunc(Number(state.scars) || 0)
    );
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Cicatrizes do Vento' },
        content: `<div class="na-hit-setup">
            <p><strong>${escapeHtml(actor.name)}</strong></p>
            <label class="na-hit-field"><span>Quantidade de Cicatrizes</span>
                <input type="number" name="value" min="0" step="1" value="${current}" autofocus>
            </label>
            <p><small>Vale +1 CAR por Cicatriz, máximo +4. As Cicatrizes também escalam as Formas do Vento.</small></p>
        </div>`,
        buttons: [
            {
                action: 'save',
                label: 'Salvar',
                default: true,
                callback: (_event, button) =>
                    Math.max(0, Math.trunc(Number(button.form.elements.value.value) || 0)),
            },
            { action: 'cancel', label: 'Cancelar', callback: () => false },
        ],
        rejectClose: false,
    });
    // DialogV2 resolve com o action do botão quando o callback devolve null;
    // false/`cancel` também são cancelamento, e 0 é um valor válido.
    if (result === false || result === 'cancel' || result === null || result === undefined) return null;
    try {
        const scars = await setWindScars(actor, result);
        globalThis.ui?.notifications?.info?.(`Cicatrizes de ${actor.name}: ${scars}.`);
        return scars;
    } catch (error) {
        globalThis.ui?.notifications?.error?.(
            `Não foi possível gravar as Cicatrizes: ${error?.message ?? error}`
        );
        return null;
    }
}
