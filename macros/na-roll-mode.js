// UUID no Foundry: Macro.wjMm5abpGoLhTwg7
// Integração CSB: %{return await game.macros.get('wjMm5abpGoLhTwg7').execute({actorUuid:entity.uuid,test:'Presença',attr:'CAR',color:'#FF9100'});}%
(async () => {
    // Foundry V13 executa macros via AsyncFunction("scope", script).
    // Arrow IIFEs NÃO capturam 'arguments' de forma confiável dentro de AsyncFunction.
    // Sempre use 'scope' diretamente.
    const args = typeof scope !== 'undefined' ? scope || {} : {};

    // Labels calculadas do CSB podem entregar o valor final dentro de HTML.
    function parseAttributeValue(raw) {
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

        const text = String(raw ?? '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .trim()
            .replace(',', '.');
        const match = text.match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : 0;
    }

    const test = args.test ?? 'Teste';
    const attr = args.attr ?? '';
    const color = args.color ?? '';

    // ── Leitura de Atributos do Ator ───────────────────────────────────────
    const actor = args.actorUuid
        ? await fromUuid(args.actorUuid)
        : (canvas.tokens.controlled[0]?.actor ?? game.user?.character);
    if (!actor) return ui.notifications?.error('Sem personagem ativo.');
    const props = actor?.system?.props ?? {};
    const automationApi = game.modules.get('night-assassins-csb-automation')?.api;
    const statusEffects = automationApi?.getRollStatusEffects?.(props, {
        test,
        attr,
        kind: ['Bloqueio', 'Esquiva'].includes(test) ? 'defense' : 'test',
    }) ?? { blocked: false, mode: 'normal', modifier: 0, reasons: [] };
    if (statusEffects.blocked)
        return ui.notifications?.warn(
            'Este personagem está incapacitado e não pode realizar a rolagem.'
        );
    if (statusEffects.autoFail)
        return ui.notifications?.warn(
            'Paralisia: falha automática em testes de FOR ou DEX que não sejam Defesa.'
        );

    const ATTR_KEYS = ['vit', 'for', 'dex', 'fdv', 'car', 'int', 'sab'];
    const ATTR_NAMES = {
        vit: 'VIT',
        for: 'FOR',
        dex: 'DEX',
        fdv: 'FDV',
        car: 'CAR',
        int: 'INT',
        sab: 'SAB',
    };

    function readDisplayAttribute(key) {
        const propKey = `${key}_display`;
        if (!Object.prototype.hasOwnProperty.call(props, propKey)) {
            throw new Error(`A ficha não possui a key ${propKey}.`);
        }
        return parseAttributeValue(props[propKey]);
    }

    // Monta mapa exclusivamente com os valores finais *_display da ficha.
    const attrValues = {};
    try {
        for (const k of ATTR_KEYS) attrValues[k] = readDisplayAttribute(k);
    } catch (error) {
        return ui.notifications?.error(error.message);
    }

    // Atributos disponíveis como secundários (exclui o primário se houver)
    const primaryKey = attr ? attr.toLowerCase() : '';
    const val = ATTR_KEYS.includes(primaryKey) ? attrValues[primaryKey] : 0;
    const secondaryOptions = [{ key: '', label: 'Nenhum', val: 0 }];
    for (const k of ATTR_KEYS) {
        if (k !== primaryKey) {
            secondaryOptions.push({ key: k, label: ATTR_NAMES[k], val: attrValues[k] });
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    function getDice(mode) {
        if (mode === 'advantage') return '2d20kh1';
        if (mode === 'disadvantage') return '2d20kl1';
        return '1d20';
    }

    function getModeLabel(mode) {
        if (mode === 'advantage') return 'Vantagem';
        if (mode === 'disadvantage') return 'Desvantagem';
        return 'Normal';
    }

    function parseBonus(raw) {
        const s = (raw || '').trim();
        if (!s) return { extra: '', display: '' };
        const clean = s.replace(/^\+/, '');
        return { extra: clean ? `+ ${clean}` : '', display: s };
    }

    function buildFormula(mode, secVal, bonusExtra) {
        const dice = getDice(mode);
        let base = `${dice} + ${val}`;
        if (secVal) base += ` + ${secVal}`;
        if (statusEffects.modifier)
            base +=
                statusEffects.modifier > 0
                    ? ` + ${statusEffects.modifier}`
                    : ` - ${Math.abs(statusEffects.modifier)}`;
        return bonusExtra ? `${base} ${bonusExtra}` : base;
    }

    async function doRoll(mode, rollMode, secVal, bonusRaw, cdVal) {
        mode = automationApi?.mergeRollMode?.(mode, statusEffects.mode) ?? mode;
        const { extra, display } = parseBonus(bonusRaw);
        const formula = buildFormula(mode, secVal, extra);

        let roll;
        try {
            roll = await Roll.create(formula).evaluate();
        } catch (err) {
            ui.notifications?.error(`Erro na fórmula: ${formula}`);
            return;
        }

        const modeLabel = getModeLabel(mode);
        const attrLine = attr ? `${ATTR_NAMES[primaryKey] ?? attr} = ${val}` : '';
        const secLine = secVal
            ? ` + ${ATTR_NAMES[secondaryOptions.find((o) => o.val === secVal)?.key] || '?'} = ${secVal}`
            : '';
        const bonusLine = display ? ` | Bônus: ${display}` : '';
        const statusLine = statusEffects.reasons.length
            ? ` | Status: ${statusEffects.reasons.join(', ')}`
            : '';

        let cdLine = '';
        if (cdVal > 0) {
            const passou = roll.total >= cdVal;
            const resultado = passou ? '✅ Sucesso!' : '❌ Falha!';
            cdLine = ` | CD ${cdVal} → ${resultado}`;
        }

        await roll.toMessage({
            flavor: `<strong>${test}</strong> (${modeLabel})${attrLine ? ' ' + attrLine : ''}${secLine}${bonusLine}${statusLine}${cdLine}`,
            speaker: ChatMessage.getSpeaker(),
            rollMode,
        });
    }

    // ── Dialog Content (estilos inline mínimos, look nativo Foundry) ───────
    const secOptionsHtml = secondaryOptions
        .map(
            (o) =>
                `<option value="${o.val}" data-key="${o.key}">${o.label}${o.val ? ` = ${o.val}` : ''}</option>`
        )
        .join('');

    const content = `
    <div style="margin-bottom:12px;">
      ${attr ? `<div style="font-size:13px;color:${color || '#666'};margin-bottom:4px;font-weight:600;">${attr} = ${val}</div>` : ''}
      <div id="na-rm-formula" style="font-family:monospace;font-size:14px;background:#120f14;color:#f7f7f7;padding:6px 8px;border-radius:3px;border:1px solid #4a3a2a;">1d20 + ${val}</div>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Atributo Secundário (até 1)</label>
      <select id="na-rm-secattr" style="width:100%;padding:4px;box-sizing:border-box;">
        ${secOptionsHtml}
      </select>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Bônus Situacional?</label>
      <input type="text" id="na-rm-bonus" placeholder="ex: 1d4, +2, 5" style="width:100%;padding:4px;box-sizing:border-box;" />
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">CD do Teste (opcional)</label>
      <input type="number" id="na-rm-cd" min="0" placeholder="ex: 15" style="width:100%;padding:4px;box-sizing:border-box;" />
    </div>
    <div style="margin-bottom:6px;">
      <label style="font-weight:bold;font-size:13px;display:block;margin-bottom:4px;">Modo de Rolagem</label>
      <select id="na-rm-rollmode" style="width:100%;padding:4px;box-sizing:border-box;">
        <option value="publicroll">Rolar Público</option>
        <option value="gmroll">Rolar Privado (GM)</option>
        <option value="blindroll">Rolar Cego (GM)</option>
        <option value="selfroll">Rolar Para Si</option>
      </select>
    </div>
  `;

    // ── DialogV2 (ApplicationV2) ────────────────────────────────────────────
    const hookApi = globalThis.Hooks;
    const renderHook = hookApi?.on?.('renderDialogV2', (_dialog, element) => {
        const root = element?.querySelector ? element : element?.[0];
        if (!root?.querySelector?.('#na-rm-formula')) return;

        const bonusInput = root.querySelector('#na-rm-bonus');
        const secAttrSelect = root.querySelector('#na-rm-secattr');
        const formulaDisplay = root.querySelector('#na-rm-formula');

        const updateFormula = () => {
            const { extra } = parseBonus(bonusInput?.value ?? '');
            const secVal = Number(secAttrSelect?.value) || 0;
            if (formulaDisplay) formulaDisplay.textContent = buildFormula('normal', secVal, extra);
        };

        bonusInput?.addEventListener('input', updateFormula);
        secAttrSelect?.addEventListener('change', updateFormula);
    });

    const readInputs = (button) => {
        const form = button.form;
        return {
            bonusRaw: form?.querySelector('#na-rm-bonus')?.value ?? '',
            rollMode: form?.querySelector('#na-rm-rollmode')?.value ?? 'publicroll',
            secVal: Number(form?.querySelector('#na-rm-secattr')?.value) || 0,
            cdVal: Number(form?.querySelector('#na-rm-cd')?.value) || 0,
        };
    };

    try {
        await foundry.applications.api.DialogV2.wait({
            window: { title: test },
            content,
            modal: true,
            rejectClose: false,
            buttons: [
                {
                    action: 'advantage',
                    label: 'Vantagem',
                    callback: async (_event, button) => {
                        const i = readInputs(button);
                        await doRoll('advantage', i.rollMode, i.secVal, i.bonusRaw, i.cdVal);
                        return i;
                    },
                },
                {
                    action: 'normal',
                    label: 'Normal',
                    default: true,
                    callback: async (_event, button) => {
                        const i = readInputs(button);
                        await doRoll('normal', i.rollMode, i.secVal, i.bonusRaw, i.cdVal);
                        return i;
                    },
                },
                {
                    action: 'disadvantage',
                    label: 'Desvantagem',
                    callback: async (_event, button) => {
                        const i = readInputs(button);
                        await doRoll('disadvantage', i.rollMode, i.secVal, i.bonusRaw, i.cdVal);
                        return i;
                    },
                },
                { action: 'cancel', label: 'Cancelar', callback: () => null },
            ],
        });
    } finally {
        if (renderHook !== undefined) hookApi?.off?.('renderDialogV2', renderHook);
    }
})();
