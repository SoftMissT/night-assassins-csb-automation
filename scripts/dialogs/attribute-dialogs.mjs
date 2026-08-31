/**
 * @fileoverview DialogV2 para criação e progressão de atributos.
 */

import { ATTRIBUTES, ONI_BODY_ATTRIBUTES, STANDARD_POOL } from '../constants.mjs';
import { parseNumber, poolMatches } from '../parsing.mjs';

export function discordPoolCounter(raw = '') {
    const count = String(raw)
        .split(/[;,\s]+/)
        .filter(Boolean).length;
    if (count === 7) return { count, text: '7 de 7 pronto', color: '#3ddc84' };

    if (count < 7) {
        const remaining = 7 - count;

        return {
            count,
            text: `${remaining} ${remaining === 1 ? 'valor restante' : 'valores restantes'}`,
            color: '#ff8c1a',
        };
    }

    const exceeded = count - 7;

    return {
        count,
        text: `${exceeded} ${exceeded === 1 ? 'valor excedente' : 'valores excedentes'}`,
        color: '#ff2638',
    };
}

function dialogRoot(element) {
    return element?.querySelector ? element : element?.[0];
}

function watchDialog(selector, bind) {
    const hookApi = globalThis.Hooks;

    const hookId = hookApi?.on?.('renderDialogV2', (_dialog, element) => {
        const root = dialogRoot(element);

        if (!root?.querySelector?.(selector)) return;

        bind(root);
    });

    return () => {
        if (hookId !== undefined) {
            hookApi?.off?.('renderDialogV2', hookId);
        }
    };
}

function bindDiscordCounter(root) {
    const input = root.querySelector('#na-discord-pool');
    const counter = root.querySelector('[data-na-discord-counter]');

    if (!input || !counter || input.dataset.naCounterBound === 'true') return;

    input.dataset.naCounterBound = 'true';

    const update = () => {
        const state = discordPoolCounter(input.value);

        counter.textContent = state.text;
        counter.style.color = state.color;
    };

    input.addEventListener('input', update);

    update();
}

function bindPoolUsage(root) {
    const selects = [...root.querySelectorAll('select[data-na-pool-select]')];

    if (!selects.length || root.dataset.naPoolBound === 'true') return;

    root.dataset.naPoolBound = 'true';

    const update = () => {
        const selected = selects.map((entry) => entry.value).filter(Boolean);

        const counts = {};

        for (const value of selected) {
            counts[value] = (counts[value] ?? 0) + 1;
        }

        const seen = {};

        for (const chip of root.querySelectorAll('[data-na-pool-chip]')) {
            const value = chip.dataset.value;

            seen[value] = (seen[value] ?? 0) + 1;

            const used = seen[value] <= (counts[value] ?? 0);

            chip.dataset.used = used ? 'true' : 'false';
            chip.style.background = used ? '#3a3028' : '#171411';
            chip.style.color = used ? '#777' : '#fff';
            chip.style.textDecoration = used ? 'line-through' : 'none';
        }

        const remaining = root.querySelector('[data-na-pool-remaining]');
        const count = 7 - selected.length;

        remaining.textContent =
            count === 0
                ? 'Todos os resultados escolhidos'
                : `${count} ${count === 1 ? 'resultado restante' : 'resultados restantes'}`;

        remaining.style.color = count === 0 ? '#3ddc84' : '#ff8c1a';
    };

    for (const select of selects) {
        select.addEventListener('change', update);
    }

    update();
}

/**
 * Pergunta o método de geração dos atributos no nível 1.
 * @returns {Promise<"standard"|"roll"|"discord"|null>}
 */
export async function chooseCreationMethod() {
    return foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Criar atributos Nível 1',
        },

        content: `
      <div class="na-csb-automation" style="padding:5px 0;">
        <p>Escolha como gerar os sete atributos.</p>
        <p><strong>Padrão:</strong> 4 · 3 · 2 · 2 · 1 · 1 · 1</p>
        <p><strong>Rolagem:</strong> até três tentativas de 7d4.</p>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'standard',
                label: 'Valores padrão',
                callback: () => 'standard',
            },
            {
                action: 'roll',
                label: 'Rolar 7d4',
                callback: () => 'roll',
            },
            {
                action: 'discord',
                label: 'Inserir do Discord',
                callback: () => 'discord',
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });
}

/**
 * Envia uma rolagem 7d4 ao chat e retorna os resultados.
 * @param {Actor} actor
 * @param {number} attempt
 * @returns {Promise<number[]>}
 */
export async function rollPool(actor, attempt) {
    const roll = await Roll.create('7d4').evaluate();

    await roll.toMessage({
        flavor: `Atributos ${attempt}ª rolagem de 7d4`,
        speaker: ChatMessage.getSpeaker({ actor }),
    });

    return roll.dice[0].results.filter((r) => r.active !== false).map((r) => Number(r.result));
}

/**
 * Escolha entre rolagens já feitas.
 * @param {Actor} actor
 * @param {number[]} first
 * @returns {Promise<number[]|null>}
 */
export async function chooseRolledPool(actor, first) {
    const afterFirst = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Atributos 1ª rolagem',
        },

        content: `
      <div class="na-csb-automation">
        <p>
          Resultado:
          <strong>${first.join(' · ')}</strong>
        </p>

        <p>
          Você pode usar esta rolagem ou tentar novamente.
        </p>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'use-first',
                label: 'Usar 1ª rolagem',
                callback: () => 'first',
            },
            {
                action: 'roll-second',
                label: 'Rolar novamente',
                callback: () => 'second',
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });

    if (!afterFirst) return null;

    if (afterFirst === 'first') {
        return first;
    }

    const second = await rollPool(actor, 2);

    const afterSecond = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Atributos escolha entre as rolagens',
        },

        content: `
      <div class="na-csb-automation">
        <p>
          1ª:
          <strong>${first.join(' · ')}</strong>
        </p>

        <p>
          2ª:
          <strong>${second.join(' · ')}</strong>
        </p>

        <p>
          Se fizer a terceira rolagem, será obrigado a usá-la.
        </p>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'use-first',
                label: 'Usar 1ª',
                callback: () => 'first',
            },
            {
                action: 'use-second',
                label: 'Usar 2ª',
                callback: () => 'second',
            },
            {
                action: 'roll-third',
                label: 'Fazer 3ª obrigatória',
                callback: () => 'third',
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });

    if (!afterSecond) return null;

    if (afterSecond === 'first') {
        return first;
    }

    if (afterSecond === 'second') {
        return second;
    }

    const third = await rollPool(actor, 3);

    await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Atributos 3ª rolagem obrigatória',
        },

        content: `
      <div class="na-csb-automation">
        <p>
          Resultado obrigatório:
          <strong>${third.join(' · ')}</strong>
        </p>
      </div>`,

        modal: true,
        rejectClose: true,

        buttons: [
            {
                action: 'distribute-third',
                label: 'Distribuir 3ª rolagem',
                callback: () => true,
            },
        ],
    });

    return third;
}

/**
 * Lê sete valores inseridos manualmente (Discord).
 * @returns {Promise<number[]|null>}
 */
export async function readDiscordPool() {
    while (true) {
        const stopWatching = watchDialog('#na-discord-pool', bindDiscordCounter);

        let result;

        try {
            result = await foundry.applications.api.DialogV2.wait({
                window: {
                    title: 'Atributos resultados do Discord',
                },

                content: `
        <div class="na-csb-automation" style="padding:6px 0;">
          <p>
            Digite os sete resultados separados por vírgula.
          </p>

          <div style="display:flex;align-items:center;gap:8px;">
            <input
              id="na-discord-pool"
              name="na-discord-pool"
              type="text"
              placeholder="4, 3, 2, 2, 1, 1, 1"
              style="width:100%;"
            />

            <strong
              data-na-discord-counter
              style="min-width:132px;color:#ff8c1a;text-align:right;"
            >
              7 valores restantes
            </strong>
          </div>
        </div>`,

                modal: true,
                rejectClose: false,

                buttons: [
                    {
                        action: 'use-discord-results',
                        label: 'Usar resultados',
                        callback: (event, button) =>
                            String(button.form.elements['na-discord-pool']?.value ?? ''),
                    },
                    {
                        action: 'cancel',
                        label: 'Cancelar',
                        callback: () => null,
                    },
                ],
            });
        } finally {
            stopWatching();
        }

        if (result === null || result === undefined || result === 'cancel') {
            return null;
        }

        const pool = result
            .split(/[;,\s]+/)
            .filter(Boolean)
            .map(parseNumber);

        if (pool.length === 7 && pool.every((v) => Number.isFinite(v) && v >= 1)) {
            return pool;
        }

        ui.notifications?.warn?.('Informe exatamente sete valores numéricos.');
    }
}

/**
 * Distribui um pool de sete valores nos sete atributos.
 * @param {number[]} pool
 * @param {number} level
 * @param {Record<string,number>} currentValues
 * @returns {Promise<Record<string,number>|null>}
 */
export async function distributePool(pool, level, currentValues) {
    while (true) {
        const chips = pool
            .map(
                (value, index) => `
          <span
            data-na-pool-chip
            data-value="${value}"
            data-used="false"
            style="
              display:inline-grid;
              place-items:center;
              min-width:32px;
              height:32px;
              border:1px solid #6a5748;
              border-radius:4px;
              background:#171411;
              color:#fff;
              font-weight:800;
              transition:color .15s,background .15s;
            "
          >
            ${value}

            <small style="font-size:8px;opacity:.65;">
              #${index + 1}
            </small>
          </span>`
            )
            .join('');

        const fields = ATTRIBUTES.map((attribute) => {
            const options = [1, 2, 3, 4]
                .map((value) => `<option value="${value}">${value}</option>`)
                .join('');

            return `
        <label
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            background:#171411;
            border-left:3px solid ${attribute.color};
            padding:7px 9px;
          "
        >
          <span
            style="
              display:flex;
              flex-direction:column;
              gap:2px;
              color:${attribute.color};
              font-weight:700;
            "
          >
            <span>
              ${attribute.label} · ${attribute.name}
            </span>

            <small
              style="
                color:#a99f93;
                font-size:10px;
                font-weight:500;
              "
            >
              Atual: ${currentValues[attribute.key]}
            </small>
          </span>

          <select
            id="na-distribute-${attribute.key}"
            name="na-distribute-${attribute.key}"
            data-na-pool-select
            style="width:92px;"
          >
            <option value="">Escolha</option>
            ${options}
          </select>
        </label>`;
        }).join('');

        const stopWatching = watchDialog('[data-na-pool-select]', bindPoolUsage);

        let selected;

        try {
            selected = await foundry.applications.api.DialogV2.wait({
                window: {
                    title: `Distribuir atributos Nível ${level}`,
                },

                content: `
        <div
          class="na-csb-automation"
          style="display:grid;gap:7px;padding:4px 0;"
        >
          <p style="margin:0;">
            Distribua os resultados rolados.
            Cada ocorrência pode ser usada uma vez.
          </p>

          <div
            style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
              flex-wrap:wrap;
              background:#100e0c;
              padding:8px;
              border:1px solid #493b31;
              border-radius:4px;
            "
          >
            <div style="display:flex;gap:5px;flex-wrap:wrap;">
              ${chips}
            </div>

            <strong
              data-na-pool-remaining
              style="color:#ff8c1a;"
            >
              7 resultados restantes
            </strong>
          </div>

          ${fields}
        </div>`,

                modal: true,
                rejectClose: false,

                buttons: [
                    {
                        action: 'save-distribution',
                        label: 'Salvar atributos',

                        callback: (event, button) =>
                            ATTRIBUTES.map((attribute) =>
                                String(
                                    button.form.elements[`na-distribute-${attribute.key}`]?.value ??
                                        ''
                                )
                            ),
                    },
                    {
                        action: 'cancel',
                        label: 'Cancelar',
                        callback: () => null,
                    },
                ],
            });
        } finally {
            stopWatching();
        }

        if (!Array.isArray(selected)) {
            return null;
        }

        const values = selected.map(parseNumber);

        if (poolMatches(values, pool)) {
            return Object.fromEntries(
                ATTRIBUTES.map((attribute, index) => [attribute.key, values[index]])
            );
        }

        ui.notifications?.warn?.('Cada resultado precisa ser usado uma única vez.');
    }
}

/**
 * Diálogo de ganho de +1 permanente nos níveis 3 e 7.
 * @param {Record<string,number>} values
 * @param {number} level
 * @returns {Promise<Record<string,number>|null>}
 */
export async function applyAttributeGain(values, level) {
    const cards = ATTRIBUTES.map(
        (attribute) => `
    <div
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        background:#171411;
        border-left:3px solid ${attribute.color};
        border-radius:3px;
        padding:7px 9px;
      "
    >
      <span
        style="
          color:${attribute.color};
          font-weight:700;
        "
      >
        ${attribute.label} · ${attribute.name}
      </span>

      <span
        style="
          white-space:nowrap;
          color:#ddd;
        "
      >
        ${values[attribute.key]}

        <strong style="color:${attribute.color};">
          → ${values[attribute.key] + 1}
        </strong>
      </span>
    </div>`
    ).join('');

    const options = ATTRIBUTES.map(
        (attribute) =>
            `<option value="${attribute.key}">${attribute.label} · ${attribute.name} (${values[attribute.key]} → ${values[attribute.key] + 1})</option>`
    ).join('');

    const chosen = await foundry.applications.api.DialogV2.wait({
        window: {
            title: `Nível ${level} aumento de atributo`,
        },

        content: `
      <div
        class="na-csb-automation"
        style="display:grid;gap:8px;padding:4px 0;"
      >
        <p style="margin:0;">
          Neste nível, escolha
          <strong>um atributo base</strong>
          para receber
          <strong>+1 permanente</strong>.
        </p>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:5px;
          "
        >
          ${cards}
        </div>

        <label
          style="
            display:grid;
            gap:4px;
            margin-top:4px;
          "
        >
          <strong>
            Atributo escolhido
          </strong>

          <select
            id="na-gain-attribute"
            name="na-gain-attribute"
            style="width:100%;"
          >
            ${options}
          </select>
        </label>

        <small style="color:#a99f93;">
          Bônus de Marca, Respiração, habilidade ou treinamento
          não entram neste aumento.
        </small>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'confirm-gain',
                label: 'Aplicar +1 permanente',

                callback: (event, button) =>
                    String(button.form.elements['na-gain-attribute']?.value ?? ''),
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });

    if (!ATTRIBUTES.some((attribute) => attribute.key === chosen)) {
        return null;
    }

    return {
        ...values,
        [chosen]: values[chosen] + 1,
    };
}

/**
 * Nível 12 Oni: +1 em dois atributos distintos.
 * @param {Record<string,number>} values
 * @param {number} level
 * @returns {Promise<Record<string,number>|null>}
 */
export async function applyAttributeGainTwo(values, level) {
    const options = ATTRIBUTES.map(
        (attribute) =>
            `<option value="${attribute.key}">${attribute.label} · ${attribute.name} (${values[attribute.key]} → ${values[attribute.key] + 1})</option>`
    ).join('');

    const chosen = await foundry.applications.api.DialogV2.wait({
        window: {
            title: `Nível ${level} Aprimoramento Amplo`,
        },

        content: `
      <div
        class="na-csb-automation"
        style="display:grid;gap:8px;padding:4px 0;"
      >
        <p style="margin:0;">
          Escolha
          <strong>dois atributos diferentes</strong>
          para receber
          <strong>+1 permanente</strong>
          cada.
        </p>

        <label style="display:grid;gap:4px;">
          <strong>
            Primeiro atributo
          </strong>

          <select
            name="na-gain-attribute-a"
            style="width:100%;"
          >
            ${options}
          </select>
        </label>

        <label style="display:grid;gap:4px;">
          <strong>
            Segundo atributo
          </strong>

          <select
            name="na-gain-attribute-b"
            style="width:100%;"
          >
            ${options}
          </select>
        </label>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'confirm-gain-two',
                label: 'Aplicar +1 em dois',

                callback: (event, button) => [
                    String(button.form.elements['na-gain-attribute-a']?.value ?? ''),
                    String(button.form.elements['na-gain-attribute-b']?.value ?? ''),
                ],
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });

    if (!Array.isArray(chosen)) {
        return null;
    }

    const [first, second] = chosen;

    if (first === second) {
        ui.notifications?.warn?.('Escolha dois atributos diferentes.');

        return null;
    }

    if (!ATTRIBUTES.some((attribute) => attribute.key === first)) {
        return null;
    }

    if (!ATTRIBUTES.some((attribute) => attribute.key === second)) {
        return null;
    }

    return {
        ...values,
        [first]: values[first] + 1,
        [second]: values[second] + 1,
    };
}

/**
 * Nível 13 Oni: +2 VIT/FOR/DEX ou +1 em dois desses.
 * @param {Record<string,number>} values
 * @returns {Promise<Record<string,number>|null>}
 */
export async function applyCorpoDemoniaco(values) {
    const mode = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Nível 13 Aumento de Corpo Demoníaco',
        },

        content: `
      <div class="na-csb-automation">
        <p>
          Escolha o modo do aumento corporal.
        </p>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'plus2',
                label: '+2 em um (VIT/FOR/DEX)',
                callback: () => 'plus2',
            },
            {
                action: 'split',
                label: '+1 em dois (VIT/FOR/DEX)',
                callback: () => 'split',
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });

    if (mode !== 'plus2' && mode !== 'split') {
        return null;
    }

    const body = ATTRIBUTES.filter((attribute) => ONI_BODY_ATTRIBUTES.includes(attribute.key));

    const options = body
        .map(
            (attribute) =>
                `<option value="${attribute.key}">${attribute.label} · ${attribute.name} (${values[attribute.key]})</option>`
        )
        .join('');

    if (mode === 'plus2') {
        const chosen = await foundry.applications.api.DialogV2.wait({
            window: {
                title: 'Corpo Demoníaco +2',
            },

            content: `
        <div
          class="na-csb-automation"
          style="display:grid;gap:8px;"
        >
          <p>
            Escolha
            <strong>um</strong>
            atributo corporal para
            <strong>+2</strong>.
          </p>

          <select
            name="na-corpo-attr"
            style="width:100%;"
          >
            ${options}
          </select>
        </div>`,

            modal: true,
            rejectClose: false,

            buttons: [
                {
                    action: 'confirm-corpo-plus2',
                    label: 'Aplicar +2',

                    callback: (event, button) =>
                        String(button.form.elements['na-corpo-attr']?.value ?? ''),
                },
                {
                    action: 'cancel',
                    label: 'Cancelar',
                    callback: () => null,
                },
            ],
        });

        if (!ONI_BODY_ATTRIBUTES.includes(chosen)) {
            return null;
        }

        return {
            ...values,
            [chosen]: values[chosen] + 2,
        };
    }

    const chosen = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Corpo Demoníaco +1 em dois',
        },

        content: `
      <div
        class="na-csb-automation"
        style="display:grid;gap:8px;"
      >
        <p>
          Escolha
          <strong>dois atributos corporais diferentes</strong>
          para
          <strong>+1</strong>
          cada.
        </p>

        <select
          name="na-corpo-attr-a"
          style="width:100%;"
        >
          ${options}
        </select>

        <select
          name="na-corpo-attr-b"
          style="width:100%;"
        >
          ${options}
        </select>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'confirm-corpo-split',
                label: 'Aplicar +1 em dois',

                callback: (event, button) => [
                    String(button.form.elements['na-corpo-attr-a']?.value ?? ''),
                    String(button.form.elements['na-corpo-attr-b']?.value ?? ''),
                ],
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });

    if (!Array.isArray(chosen)) {
        return null;
    }

    const [first, second] = chosen;

    if (first === second) {
        ui.notifications?.warn?.('Escolha dois atributos corporais diferentes.');

        return null;
    }

    if (!ONI_BODY_ATTRIBUTES.includes(first) || !ONI_BODY_ATTRIBUTES.includes(second)) {
        return null;
    }

    return {
        ...values,
        [first]: values[first] + 1,
        [second]: values[second] + 1,
    };
}

/**
 * Diálogo de confirmação final de snapshot.
 * @param {Record<string,number>} values
 * @param {Record<string,number>} currentValues
 * @param {number} level
 * @returns {Promise<boolean>}
 */
export async function confirmSnapshot(values, currentValues, level) {
    const cards = ATTRIBUTES.map(
        (attribute) => `
    <div
      style="
        background:#171411;
        border:1px solid ${attribute.color}66;
        border-radius:5px;
        padding:8px 6px;
        text-align:center;
      "
    >
      <div
        style="
          color:${attribute.color};
          font-weight:700;
          letter-spacing:.1em;
        "
      >
        ${attribute.label}
      </div>

      <div
        style="
          color:#fff;
          font-size:22px;
          font-weight:700;
        "
      >
        ${values[attribute.key]}
      </div>

      <div
        style="
          color:#a99f93;
          font-size:9px;
        "
      >
        Atual: ${currentValues[attribute.key]}
      </div>
    </div>`
    ).join('');

    return foundry.applications.api.DialogV2.wait({
        window: {
            title: `Confirmar atributos Nível ${level}`,
        },

        content: `
      <div class="na-csb-automation">
        <div
          style="
            display:grid;
            grid-template-columns:repeat(4,1fr);
            gap:6px;
          "
        >
          ${cards}
        </div>

        <p>
          Confirme para atualizar os atributos da ficha.
        </p>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'confirm-save',
                label: 'Confirmar e salvar',
                callback: () => true,
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => false,
            },
        ],
    });
}

/**
 * Diálogo para escolher o atributo marcado pela Marca do Destino.
 * @param {Record<string,number>} values
 * @param {number} bonus
 * @returns {Promise<string|null>}
 */
export async function chooseMarkedAttribute(values, bonus) {
    const options = ATTRIBUTES.map(
        (attribute) =>
            `<option value="${attribute.key}">${attribute.label} · ${attribute.name} (${values[attribute.key]} → ${values[attribute.key] + bonus})</option>`
    ).join('');

    const chosen = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Marca do Destino atributo marcado',
        },

        content: `
      <div
        class="na-csb-automation"
        style="display:grid;gap:8px;padding:4px 0;"
      >
        <p style="margin:0;">
          Escolha o atributo que receberá
          <strong>+${bonus} permanente</strong>.
        </p>

        <label
          style="
            display:grid;
            gap:4px;
          "
        >
          <strong>
            Atributo marcado
          </strong>

          <select
            id="na-destiny-mark-attribute"
            name="na-destiny-mark-attribute"
            style="width:100%;"
          >
            ${options}
          </select>
        </label>

        <small style="color:#a99f93;">
          No nível 6, este bônus subirá automaticamente
          de +2 para +3.
        </small>
      </div>`,

        modal: true,
        rejectClose: false,

        buttons: [
            {
                action: 'confirm-mark',
                label: `Aplicar +${bonus}`,

                callback: (event, button) =>
                    String(button.form.elements['na-destiny-mark-attribute']?.value ?? ''),
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => null,
            },
        ],
    });

    return ATTRIBUTES.some((attribute) => attribute.key === chosen) ? chosen : null;
}

/**
 * Nível 14 Slayer Hashira de Elite.
 *
 * Escolha permanente e obrigatória entre:
 * - PDV + VIT × 3
 * - PDR + FDV × 2
 *
 * Mostra a comparação completa antes da decisão:
 * - valor atual
 * - bônus recebido
 * - valor final
 *
 * A função NÃO altera PDV/PDR diretamente.
 * Apenas retorna a opção escolhida.
 *
 * @param {Record<string, unknown>} props
 * @returns {Promise<"pdv_vit3"|"pdr_fdv2">}
 */
export async function chooseHashiraEliteBonus(props = {}) {
    const vit = Math.max(0, parseNumber(props.atr_vit_valor_config));

    const fdv = Math.max(0, parseNumber(props.atr_fdv_valor_config));

    /*
     * Valores utilizados pelas fórmulas hidden
     * oficiais do Slayer.
     */
    const pdvTotalConta = parseNumber(props.pdv_slayer_total_conta);

    const pdvDanoFerida = parseNumber(props.pdv_slayer_dano_ferida);

    const pdrTotalConta = parseNumber(props.pdr_slayer_total_conta);

    const metalPdrBonus = parseNumber(props.metal_slayer_pdr_bonus);

    /*
     * Bônus de Hashira de Elite.
     */
    const pdvBonus = vit * 3;
    const pdrBonus = fdv * 2;

    /*
     * PDV atual:
     *
     * ${pdv_slayer_total_conta-pdv_slayer_dano_ferida}$
     */
    const pdvAtual = pdvTotalConta - pdvDanoFerida;

    /*
     * PDV com a opção A:
     *
     * ${(pdv_slayer_total_conta+
     * (atr_vit_valor_config*3))
     * -pdv_slayer_dano_ferida}$
     */
    const pdvComBonus = pdvTotalConta + pdvBonus - pdvDanoFerida;

    /*
     * PDR atual:
     *
     * ${pdr_slayer_total_conta+
     * metal_slayer_pdr_bonus}$
     */
    const pdrAtual = pdrTotalConta + metalPdrBonus;

    /*
     * PDR com a opção B:
     *
     * ${pdr_slayer_total_conta+
     * metal_slayer_pdr_bonus+
     * (atr_fdv_valor_config*2)}$
     */
    const pdrComBonus = pdrTotalConta + metalPdrBonus + pdrBonus;

    const choice = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Nível 14 Hashira de Elite',
        },

        content: `
      <div
        class="na-csb-automation"
        style="
          display:grid;
          gap:12px;
          padding:6px 0;
        "
      >
        <p style="margin:0;">
          Você alcançou
          <strong>Nível 14 Hashira de Elite</strong>.
        </p>

        <p style="margin:0;">
          Compare os dois benefícios antes de fazer sua
          <strong>escolha permanente</strong>.
        </p>

        <!-- ========================= -->
        <!-- OPÇÃO A PDV             -->
        <!-- ========================= -->

        <div
          style="
            display:grid;
            gap:6px;
            padding:12px;
            background:#171411;
            border:1px solid #5d2929;
            border-left:4px solid #c94b4b;
            border-radius:5px;
          "
        >
          <strong
            style="
              color:#ff7676;
              font-size:16px;
            "
          >
            Opção A PDV + VIT × 3
          </strong>

          <div>
            VIT atual:
            <strong>${vit}</strong>
          </div>

          <div>
            Bônus:

            ${vit} × 3 =

            <strong style="color:#ff7676;">
              +${pdvBonus} PDV
            </strong>
          </div>

          <hr
            style="
              width:100%;
              border:0;
              border-top:1px solid #493b31;
            "
          >

          <div>
            PDV sem Hashira:

            <strong>
              ${pdvAtual}
            </strong>
          </div>

          <div style="font-size:16px;">
            PDV após escolher esta opção:

            <strong style="color:#ff7676;">
              ${pdvAtual}
              +
              ${pdvBonus}
              =
              ${pdvComBonus}
            </strong>
          </div>

          <small style="color:#a99f93;">
            Fórmula:
            (${pdvTotalConta} + (${vit} × 3))
            - ${pdvDanoFerida}
            =
            ${pdvComBonus}
          </small>
        </div>

        <!-- ========================= -->
        <!-- OPÇÃO B PDR             -->
        <!-- ========================= -->

        <div
          style="
            display:grid;
            gap:6px;
            padding:12px;
            background:#171411;
            border:1px solid #254b68;
            border-left:4px solid #4d9de0;
            border-radius:5px;
          "
        >
          <strong
            style="
              color:#72b7ed;
              font-size:16px;
            "
          >
            Opção B PDR + FDV × 2
          </strong>

          <div>
            FDV atual:
            <strong>${fdv}</strong>
          </div>

          <div>
            Bônus:

            ${fdv} × 2 =

            <strong style="color:#72b7ed;">
              +${pdrBonus} PDR
            </strong>
          </div>

          <hr
            style="
              width:100%;
              border:0;
              border-top:1px solid #493b31;
            "
          >

          <div>
            PDR sem Hashira:

            <strong>
              ${pdrAtual}
            </strong>
          </div>

          <div style="font-size:16px;">
            PDR após escolher esta opção:

            <strong style="color:#72b7ed;">
              ${pdrAtual}
              +
              ${pdrBonus}
              =
              ${pdrComBonus}
            </strong>
          </div>

          <small style="color:#a99f93;">
            Fórmula:
            ${pdrTotalConta}
            +
            ${metalPdrBonus}
            +
            (${fdv} × 2)
            =
            ${pdrComBonus}
          </small>
        </div>

        <div
          style="
            padding:9px;
            background:#100e0c;
            border:1px solid #6a5748;
            border-radius:4px;
          "
        >
          <strong>
            Atenção:
          </strong>

          depois de confirmar uma opção,
          a escolha será permanente.
        </div>
      </div>`,

        /*
         * Não pode fechar com Esc,
         * clicar fora ou cancelar.
         *
         * A decisão só termina quando
         * uma das duas opções for escolhida.
         */
        modal: true,
        rejectClose: true,

        buttons: [
            {
                action: 'pdv_vit3',

                label: `Escolher PDV: ${pdvAtual} → ${pdvComBonus}`,

                callback: () => 'pdv_vit3',
            },

            {
                action: 'pdr_fdv2',

                label: `Escolher PDR: ${pdrAtual} → ${pdrComBonus}`,

                callback: () => 'pdr_fdv2',
            },
        ],
    });

    /*
     * Validação defensiva.
     */
    if (choice !== 'pdv_vit3' && choice !== 'pdr_fdv2') {
        throw new Error('[Night Assassins] Escolha inválida no Nível 14 Hashira de Elite.');
    }

    return choice;
}
