/**
 * @fileoverview DialogV2 "Dano ou Cura?" pergunta, para cada alvo de uma
 * rolagem de Dano do Slayer, se o valor calculado deve ser aplicado como
 * dano (padrão) ou redirecionado como cura via heal-relay.mjs.
 *
 * Nunca decide silenciosamente: se o diálogo não puder ser respondido (sem
 * DialogV2 disponível, fechado sem escolha, ou qualquer resultado que não
 * seja explicitamente "cura"), o retorno é sempre "dano" o fallback
 * seguro pedido pelo operador (nunca curar um inimigo por engano).
 */

/**
 * @param {object} options
 * @param {string} options.targetName
 * @param {number} options.amount
 * @param {boolean} [options.suggestHeal] - pré-seleciona "Cura" quando a Forma em uso já sinaliza um efeito de cura, sem impedir o jogador de escolher Dano.
 * @returns {Promise<"dano"|"cura">}
 */
export async function openDamageOrHealDialog({ targetName, amount, suggestHeal = false } = {}) {
    const DialogV2 = foundry.applications?.api?.DialogV2;
    if (!DialogV2?.wait) return 'dano';

    const content = `
    <div class="na-csb-automation na-damage-heal">
      <p>Aplicar <strong>${Math.max(0, Math.trunc(Number(amount) || 0))}</strong> em <strong>${String(targetName ?? 'alvo')}</strong> como:</p>
      ${suggestHeal ? '<p class="hint">A técnica em uso sinaliza um efeito de cura Cura vem pré-selecionada, mas você pode escolher Dano normalmente.</p>' : ''}
    </div>
  `;

    const result = await DialogV2.wait({
        window: { title: 'Dano ou Cura?' },
        content,
        modal: true,
        rejectClose: false,
        buttons: [
            {
                action: 'cura',
                label: 'Cura',
                default: suggestHeal === true,
                callback: () => 'cura',
            },
            {
                action: 'dano',
                label: 'Dano',
                default: suggestHeal !== true,
                callback: () => 'dano',
            },
        ],
    });

    return result === 'cura' ? 'cura' : 'dano';
}
