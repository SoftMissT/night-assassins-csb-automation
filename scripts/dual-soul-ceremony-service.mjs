/**
 * Runtime genérico da Cerimônia de Vínculo.
 *
 * Este serviço trabalha por contrato de dados.
 * Nenhuma arma ou espírito nominal é conhecido pelo Core.
 */

import {
    buildDualSoulCeremonyResult,
    dualSoulDominance,
    dualSoulIntensity,
    dualSoulTrigger,
    dualSoulCeremonyCompleted as ceremonyCompletedValue,
    dualSoulCeremonyRuntime,
    parseDualSoulJson,
} from './dual-soul-ceremony-core.mjs';

import {
    hydrateSpecialWeaponItem,
} from './special-weapon-service.mjs';
import { resetDualSoulBond } from './dual-soul-reset-service.mjs';
import { bloodPactPayment } from './blood-pact-core.mjs';

function normalizeText(value = '') {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(
            /[\u0300-\u036f]/gu,
            ''
        );
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function ceremonyBloodHtml(item, payment, ritual = {}) {
    const steps = Array.isArray(ritual.passos)
        ? `<ol>${ritual.passos.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
        : '';
    const pact = String(ritual.pacto_completo ?? '').trim();

    return `
        <div class="na-csb-automation na-dual-soul-panel na-blood-pact-panel">
            <span class="na-dual-soul-kicker">Oferta de Sangue</span>
            <h2>Romper o selo de ${escapeHtml(item.name)}</h2>

            <div class="na-dual-soul-summary">
                <span>Ritual da arma</span>
                <strong>${escapeHtml(ritual.nome ?? 'Cerimônia de Vínculo')}</strong>
            </div>

            <div class="na-dual-soul-ritual-copy">
                ${steps}
                ${pact ? `<h3>Pacto de Acordar</h3><p>${escapeHtml(pact)}</p>` : ''}
            </div>

            <p>
                Concluir a Cerimônia de Vínculo exige
                <strong>90% do PDV atual</strong> do portador.
                O sangue rompe o selo e desperta o vínculo desta arma.
            </p>

            <div class="na-blood-pact-ledger" aria-label="Custo da Cerimônia de Vínculo">
                <div><span>PDV atual</span><strong>${payment.current}</strong></div>
                <i aria-hidden="true">→</i>
                <div><span>Após a Cerimônia</span><strong>${payment.remaining}</strong></div>
                <div class="na-blood-pact-cost"><span>Dano tomado</span><strong>+${payment.cost}</strong></div>
            </div>

            <p class="na-dual-soul-warning">
                Confirmar soma ${payment.cost} em Dano Tomado. A ficha recalcula
                o PDV atual para ${payment.remaining}. O custo não será cobrado
                novamente ao ativar o Primeiro Despertar.
            </p>
        </div>
    `;
}

function actorItems(actor) {
    if (!actor?.items) {
        return [];
    }

    if (
        Array.isArray(
            actor.items.contents
        )
    ) {
        return actor.items.contents;
    }

    try {
        return [...actor.items];
    } catch {
        return [];
    }
}

export function isDualSoulWeapon(item) {
    const props =
        item?.system?.props ?? {};

    const category =
        normalizeText(
            props.arma_categoria
        );

    if (category !== 'especial') {
        return false;
    }

    const hasSides =
        Boolean(
            String(
                props.arma_entidade ??
                ''
            ).trim()
        ) &&
        Boolean(
            String(
                props.arma_demonio ??
                ''
            ).trim()
        );

    const hasCeremony =
        Boolean(
            props.dupla_alma_cerimonia_json
        );

    return (
        hasSides ||
        hasCeremony
    );
}

async function resolveActor(
    options = {}
) {
    if (
        options.actor
            ?.documentName === 'Actor'
    ) {
        return options.actor;
    }

    if (options.actorUuid) {
        const document =
            await fromUuid(
                options.actorUuid
            );

        const actor =
            document?.actor ??
            document;

        if (
            actor
                ?.documentName === 'Actor'
        ) {
            return actor;
        }
    }

    return (
        canvas
            ?.tokens
            ?.controlled
            ?.[0]
            ?.actor ??
        game.user?.character ??
        null
    );
}

async function resolveExplicitItem(
    options = {}
) {
    if (
        options.item &&
        options.item.documentName !== 'Actor'
    ) {
        return options.item;
    }

    if (options.itemUuid) {
        const document =
            await fromUuid(
                options.itemUuid
            );

        if (
            document &&
            document.documentName !== 'Actor'
        ) {
            return document;
        }
    }

    return null;
}

async function chooseDualSoulWeapon(
    actor,
    options = {}
) {
    const explicit =
        await resolveExplicitItem(
            options
        );

    if (explicit) {
        return isDualSoulWeapon(explicit)
            ? explicit
            : null;
    }

    const weapons =
        actorItems(actor)
            .filter(
                isDualSoulWeapon
            );

    if (weapons.length === 0) {
        return null;
    }

    if (weapons.length === 1) {
        return weapons[0];
    }

    const buttons =
        weapons.map(
            (weapon, index) => ({
                action:
                    `weapon-${index}`,

                label:
                    weapon.name,

                callback:
                    () => (
                        weapon.uuid ??
                        weapon.id
                    ),
            })
        );

    buttons.push({
        action: 'cancel',
        label: 'Cancelar',
        callback: () => null,
    });

    const selected =
        await foundry
            .applications
            .api
            .DialogV2
            .wait({
                window: {
                    title:
                        'Cerimônia de Vínculo',
                },

                content: `
                    <div class="na-csb-automation">
                        <p>
                            Escolha a Arma de Dupla Alma
                            que receberá a Cerimônia.
                        </p>
                    </div>
                `,

                modal: true,
                rejectClose: false,
                buttons,
            });

    if (!selected) {
        return null;
    }

    return (
        weapons.find(
            (weapon) =>
                (
                    weapon.uuid ??
                    weapon.id
                ) === selected
        ) ??
        null
    );
}

function staticCeremonyDefinition(
    canonicalProps = {},
    localProps = {}
) {
    const canonical =
        parseDualSoulJson(
            canonicalProps
                .dupla_alma_cerimonia_json,
            {}
        );

    const local =
        parseDualSoulJson(
            localProps
                .dupla_alma_cerimonia_json,
            {}
        );

    const source =
        Object.keys(canonical).length > 0
            ? canonical
            : local;

    const {
        runtime: _runtime,
        ...definition
    } = source;

    return definition;
}

function validCeremonyDefinition(
    definition
) {
    return Boolean(
        definition &&
        typeof definition === 'object' &&
        !Array.isArray(definition) &&

        definition
            .teste_1_lado_dominante &&
        typeof definition
            .teste_1_lado_dominante ===
            'object' &&

        definition
            .teste_2_intensidade_vinculo &&
        typeof definition
            .teste_2_intensidade_vinculo ===
            'object' &&

        definition
            .teste_3_gatilho_lado_adormecido &&
        typeof definition
            .teste_3_gatilho_lado_adormecido ===
            'object' &&

        definition
            .teste_de_despertar &&
        typeof definition
            .teste_de_despertar ===
            'object'
    );
}

async function ceremonyRoll(
    actor,
    formula,
    flavor
) {
    const roll =
        new Roll(
            formula,
            actor?.getRollData?.() ?? {}
        );

    await roll.evaluate();

    const message = await roll.toMessage(
        {
            speaker:
                ChatMessage
                    .getSpeaker({
                        actor,
                    }),

            flavor,
        },
        {
            rollMode:
                game.settings.get(
                    'core',
                    'rollMode'
                ),
        }
    );

    if (
        message?.id &&
        game.dice3d?.waitFor3DAnimationByMessageID
    ) {
        await game.dice3d.waitFor3DAnimationByMessageID(message.id);
    }

    return roll;
}

async function showCeremonyStage({
    item,
    number,
    title,
    formula,
    description,
    entityName,
    demonName,
}) {
    return foundry.applications.api.DialogV2.wait({
        classes: ['na-dual-soul-dialog'],
        window: { title: `Cerimônia de Vínculo — ${number}/3` },
        content: `
            <div class="na-csb-automation na-dual-soul-ceremony">
                <header class="na-dual-soul-hero">
                    <span class="na-dual-soul-step">ATO ${number} DE III</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p>${escapeHtml(description)}</p>
                </header>

                <div
                    class="na-blood-offering na-blood-offering-${number}"
                    style="--na-blood-level: ${(number / 3) * 100}%; --na-blood-from: ${((number - 1) / 3) * 100}%"
                    role="img"
                    aria-label="O recipiente ritual está ${number === 3 ? 'cheio' : `preenchido em ${number} de 3 partes`}"
                >
                    <div class="na-blood-source" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <div class="na-blood-vessel" aria-hidden="true">
                        <div class="na-blood-liquid"><i class="na-blood-ripple"></i></div>
                    </div>
                    <span class="na-blood-caption">SANGUE DO VÍNCULO · ${number}/3</span>
                </div>

                <div class="na-dual-soul-bond" aria-label="As duas almas da arma">
                    <div class="na-dual-soul-side na-dual-soul-entity">
                        <span>ENTIDADE</span>
                        <strong>${escapeHtml(entityName)}</strong>
                    </div>
                    <div class="na-dual-soul-thread" aria-hidden="true"><i></i></div>
                    <div class="na-dual-soul-side na-dual-soul-demon">
                        <span>DEMÔNIO</span>
                        <strong>${escapeHtml(demonName)}</strong>
                    </div>
                </div>

                <div class="na-dual-soul-formula">
                    <span>ROLAGEM</span>
                    <strong>${escapeHtml(formula)}</strong>
                </div>

                <footer>${escapeHtml(item.name)} · resultado permanente ao concluir os três atos</footer>
            </div>
        `,
        modal: true,
        rejectClose: false,
        buttons: [
            { action: 'roll', label: `Rolar ${formula}`, default: true, callback: () => true },
            { action: 'cancel', label: 'Cancelar cerimônia', callback: () => null },
        ],
    });
}

async function revealCeremonyResult({
    number,
    title,
    total,
    result,
    detail = '',
}) {
    return foundry.applications.api.DialogV2.wait({
        classes: ['na-dual-soul-dialog'],
        window: { title: `Cerimônia — Resultado ${number}/3` },
        content: `
            <div class="na-csb-automation na-dual-soul-ceremony na-dual-soul-reveal">
                <span class="na-dual-soul-step">${escapeHtml(title)}</span>
                <div class="na-dual-soul-result-number">${escapeHtml(total)}</div>
                <h2>${escapeHtml(result)}</h2>
                ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
                <div class="na-dual-soul-seal-line" aria-hidden="true"></div>
            </div>
        `,
        modal: true,
        rejectClose: false,
        buttons: [
            { action: 'continue', label: number === 3 ? 'Gravar vínculo permanente' : 'Continuar cerimônia', default: true, callback: () => true },
        ],
    });
}

export function getDualSoulCeremonyState(
    item
) {
    return dualSoulCeremonyRuntime(
        item
            ?.system
            ?.props
            ?.dupla_alma_cerimonia_json
    );
}

export function dualSoulCeremonyCompleted(
    item
) {
    return ceremonyCompletedValue(
        item
            ?.system
            ?.props
            ?.dupla_alma_cerimonia_json
    );
}

async function showCompletedCeremony(
    item,
    runtime
) {
    const dominance =
        escapeHtml(
            runtime
                ?.dominance
                ?.display ??
            'Registrado'
        );

    const intensity =
        escapeHtml(
            runtime
                ?.intensity
                ?.name ??
            'Registrada'
        );

    const trigger =
        escapeHtml(
            runtime
                ?.trigger
                ?.publicText ??
            'Registrado'
        );

    const cd =
        runtime
            ?.intensity
            ?.awakeningCd;

    const choice = await foundry
        .applications
        .api
        .DialogV2
        .wait({
            classes: ['na-dual-soul-dialog', 'na-dual-soul-completed-dialog'],
            window: {
                title:
                    `Cerimônia — ${item.name}`,
            },

            content: `
                <div class="na-csb-automation na-dual-soul-panel na-dual-soul-completed">
                    <span class="na-dual-soul-kicker">Vínculo permanente</span>
                    <h2>
                        Cerimônia já concluída
                    </h2>

                    <div class="na-dual-soul-facts">
                        <p><span>Lado dominante</span><strong>${dominance}</strong></p>
                        <p><span>Intensidade</span><strong>${intensity}</strong></p>
                        <p><span>Gatilho</span><strong>${trigger}</strong></p>
                        <p><span>CD base de Despertar</span><strong>${
                            cd === null ||
                            cd === undefined
                                ? '—'
                                : escapeHtml(cd)
                        }</strong></p>
                    </div>

                    <div class="na-dual-soul-reset-note">
                        <strong>O Sangue de Pacto já foi oferecido.</strong>
                        <span>Esta Cerimônia consumiu 90% do PDV que o portador possuía ao concluí-la. O Primeiro Despertar não cobra esse custo novamente.</span>
                    </div>

                    <p class="na-dual-soul-footnote">${game.user?.isGM
                        ? 'O reset administrativo não devolve sangue. Ao concluir uma nova Cerimônia, 90% do PDV atual será oferecido novamente.'
                        : 'A Cerimônia não pode ser rerrolada pelo jogador.'}</p>
                </div>
            `,

            modal: true,
            rejectClose: false,

            buttons: [
                ...(game.user?.isGM ? [{
                    action: 'reset',
                    label: 'GM — Resetar vínculo desta arma',
                    callback: () => 'reset',
                }] : []),
                {
                    action: 'close',
                    label: 'Fechar',
                    callback: () => true,
                },
            ],
        });
    if (choice === 'reset') {
        try {
            return await resetDualSoulBond(item);
        } catch (error) {
            ui.notifications?.warn?.(error.message);
        }
    }
}

export async function openDualSoulCeremony(
    options = {}
) {
    const actor =
        await resolveActor(
            options
        );

    if (!actor) {
        return ui.notifications
            ?.warn?.(
                'Selecione o portador da Arma de Dupla Alma.'
            );
    }

    const item =
        await chooseDualSoulWeapon(
            actor,
            options
        );

    if (!item) {
        return ui.notifications
            ?.warn?.(
                'Nenhuma Arma de Dupla Alma válida foi encontrada.'
            );
    }

    const hydration =
        await hydrateSpecialWeaponItem(
            item
        );

    if (!hydration?.ok) {
        return ui.notifications
            ?.error?.(
                hydration?.reason ??
                'Não foi possível hidratar os dados canônicos da arma.'
            );
    }

    const localProps =
        item.system?.props ?? {};

    const canonicalProps =
        hydration
            ?.canonical
            ?.system
            ?.props ??
        {};

    if (
        dualSoulCeremonyCompleted(
            item
        )
    ) {
        const runtime =
            getDualSoulCeremonyState(
                item
            );

        const completedAction = await showCompletedCeremony(
            item,
            runtime
        );
        if (completedAction?.reset) return completedAction;

        return {
            ok: true,
            alreadyCompleted: true,
            actor,
            item,
            runtime,
        };
    }

    const entityName =
        String(
            localProps.arma_entidade ??
            canonicalProps.arma_entidade ??
            ''
        ).trim();

    const demonName =
        String(
            localProps.arma_demonio ??
            canonicalProps.arma_demonio ??
            ''
        ).trim();

    if (
        !entityName ||
        !demonName
    ) {
        return ui.notifications
            ?.error?.(
                `${item.name} não possui Entidade e Demônio definidos.`
            );
    }

    const definition =
        staticCeremonyDefinition(
            canonicalProps,
            localProps
        );

    const canonicalRitual = parseDualSoulJson(
        canonicalProps.arma_ritual,
        {}
    );
    const localRitual = parseDualSoulJson(
        localProps.arma_ritual,
        {}
    );
    const ritual = Object.keys(localRitual).length > 0
        ? localRitual
        : canonicalRitual;

    if (
        !validCeremonyDefinition(
            definition
        )
    ) {
        return ui.notifications
            ?.error?.(
                `${item.name} não possui a Cerimônia canônica completa.`
            );
    }

    const confirmed =
        await foundry
            .applications
            .api
            .DialogV2
            .confirm({
                window: {
                    title:
                        'Cerimônia de Vínculo — IRREVERSÍVEL',
                },

                classes: ['na-dual-soul-dialog', 'na-blood-pact-dialog'],

                content: `
                    <div class="na-csb-automation na-dual-soul-panel">
                        <h2>
                            ${escapeHtml(item.name)}
                        </h2>

                        <p>
                            Entidade:
                            <strong>
                                ${escapeHtml(entityName)}
                            </strong>
                        </p>

                        <p>
                            Demônio:
                            <strong>
                                ${escapeHtml(demonName)}
                            </strong>
                        </p>

                        <hr>

                        <p>
                            A Cerimônia acontece
                            <strong>uma única vez</strong>.
                        </p>

                        <p>
                            Teste 1:
                            Lado Dominante.
                        </p>

                        <p>
                            Teste 2:
                            Intensidade do Vínculo.
                        </p>

                        <p>
                            Teste 3:
                            Gatilho do lado adormecido.
                        </p>

                        <p>
                            Os resultados serão gravados
                            permanentemente nesta arma.
                        </p>

                        <p class="na-dual-soul-warning">
                            Ao concluir os três testes, a Cerimônia exigirá 90%
                            do PDV atual para romper o selo da arma.
                        </p>
                    </div>
                `,

                modal: true,
                rejectClose: false,
            });

    if (!confirmed) {
        return null;
    }

    const test1Formula = '1d20';

    const test1Ready = await showCeremonyStage({
        item,
        number: 1,
        title: 'Lado Dominante',
        formula: test1Formula,
        description: 'Decide qual alma liderará a arma pelo resto da campanha.',
        entityName,
        demonName,
    });
    if (!test1Ready) return null;

    const test1 =
        await ceremonyRoll(
            actor,
            test1Formula,
            `${item.name} — Cerimônia · Teste 1 · Lado Dominante`
        );

    const dominancePreview = dualSoulDominance(test1.total, {
        formula: test1Formula,
        entityName,
        demonName,
    });
    await revealCeremonyResult({
        number: 1,
        title: 'Lado Dominante',
        total: test1.total,
        result: dominancePreview.display,
        detail: dominancePreview.sleepingName
            ? `${dominancePreview.sleepingName} permanece como lado adormecido.`
            : 'Nenhum lado domina. A disputa permanece em equilíbrio instável.',
    });

    const test2Ready = await showCeremonyStage({
        item,
        number: 2,
        title: 'Intensidade do Vínculo',
        formula: '3d20',
        description: 'Mede quanto poder o portador consegue puxar do vínculo.',
        entityName,
        demonName,
    });
    if (!test2Ready) return null;

    const test2 =
        await ceremonyRoll(
            actor,
            '3d20',
            `${item.name} — Cerimônia · Teste 2 · Intensidade do Vínculo`
        );

    const intensityPreview = dualSoulIntensity(test2.total);
    await revealCeremonyResult({
        number: 2,
        title: 'Intensidade do Vínculo',
        total: test2.total,
        result: intensityPreview.name,
        detail: `Eixo do lado dominante: +${intensityPreview.value}.`,
    });

    const test3Ready = await showCeremonyStage({
        item,
        number: 3,
        title: 'Gatilho de Despertar',
        formula: '3d20',
        description: 'Define quando o lado adormecido poderá tentar despertar.',
        entityName,
        demonName,
    });
    if (!test3Ready) return null;

    const test3 =
        await ceremonyRoll(
            actor,
            '3d20',
            `${item.name} — Cerimônia · Teste 3 · Gatilho do Lado Adormecido`
        );

    const result =
        buildDualSoulCeremonyResult({
            test1Total:
                test1.total,

            test1Formula,

            test2Total:
                test2.total,

            test3Total:
                test3.total,

            entityName,
            demonName,

            tests:
                definition,
        });

    const triggerPreview = dualSoulTrigger(test3.total);
    await revealCeremonyResult({
        number: 3,
        title: 'Gatilho de Despertar',
        total: test3.total,
        result: result.trigger.publicText,
        detail: `${triggerPreview.label} · CD base ${result.intensity.awakeningCd ?? 'não definida'}.`,
    });

    const runtime = {
        ...result,

        completed: true,

        completedAt:
            new Date()
                .toISOString(),

        actorUuid:
            actor.uuid ?? null,

        itemUuid:
            item.uuid ?? null,
    };

    const ceremonyStored = {
        ...definition,
        runtime,
    };

    const canonicalLink =
        parseDualSoulJson(
            canonicalProps
                .dupla_alma_vinculo_json,
            {}
        );

    const localLink =
        parseDualSoulJson(
            localProps
                .dupla_alma_vinculo_json,
            {}
        );

    const linkStored = {
        ...canonicalLink,
        ...localLink,

        entidade:
            entityName,

        demonio:
            demonName,

        intensidade:
            result
                .intensity
                .name,

        valor:
            result
                .intensity
                .value,

        runtime: {
            dominantKind:
                result
                    .dominance
                    .dominantKind,

            dominantName:
                result
                    .dominance
                    .dominantName,

            sleepingKind:
                result
                    .dominance
                    .sleepingKind,

            sleepingName:
                result
                    .dominance
                    .sleepingName,

            deepSleep:
                result
                    .dominance
                    .deepSleep,

            awakeningCd:
                result
                    .intensity
                    .awakeningCd,
        },
    };

    let payment;
    try {
        payment = bloodPactPayment(
            actor.system?.props ?? {}
        );
    } catch (error) {
        return ui.notifications
            ?.warn?.(error.message);
    }

    const bloodConfirmed = await foundry
        .applications
        .api
        .DialogV2
        .confirm({
            classes: ['na-dual-soul-dialog', 'na-blood-pact-dialog'],
            window: {
                title: `Cerimônia — Oferta de Sangue · ${item.name}`,
            },
            content: ceremonyBloodHtml(item, payment, ritual),
            defaultYes: false,
            modal: true,
            rejectClose: false,
        });

    if (!bloodConfirmed) {
        return null;
    }

    let latestPayment;
    try {
        latestPayment = bloodPactPayment(
            actor.system?.props ?? {}
        );
    } catch (error) {
        return ui.notifications
            ?.warn?.(error.message);
    }

    if (
        latestPayment.current !== payment.current ||
        latestPayment.damageBefore !== payment.damageBefore
    ) {
        return ui.notifications
            ?.warn?.(
                'O PDV mudou durante a confirmação. Abra a Cerimônia novamente para conferir a oferta de sangue.'
            );
    }

    runtime.bloodPact = {
        currentBefore: payment.current,
        remainingAfter: payment.remaining,
        cost: payment.cost,
        damageBefore: payment.damageBefore,
        damageAfter: payment.damageAfter,
    };

    await actor.update(
        {
            'system.props.pdv_slayer_dano_tomado':
                payment.damageAfter,
        },
        {
            naCsbAutomation: true,
            naSpecialWeapon: true,
            naDualSoulCeremony: true,
            naLifeDeath: true,
            naBloodPact: true,
        }
    );

    const persistedDamage = Number(
        actor.system?.props?.pdv_slayer_dano_tomado
    );

    if (
        !Number.isFinite(persistedDamage) ||
        persistedDamage !== payment.damageAfter
    ) {
        throw new Error(
            'O Sangue de Pacto não foi persistido em Dano Tomado. A Cerimônia não foi gravada.'
        );
    }

    try {
        await item.update(
            {
            'system.props.arma_lado_dominante':
                result
                    .dominance
                    .display,

            'system.props.arma_vinculo_intensidade':
                result
                    .intensity
                    .name,

            'system.props.arma_vinculo_valor':
                result
                    .intensity
                    .value,

            'system.props.arma_gatilho_despertar':
                result
                    .trigger
                    .publicText,

            'system.props.dupla_alma_cerimonia_json':
                JSON.stringify(
                    ceremonyStored
                ),

            'system.props.dupla_alma_vinculo_json':
                JSON.stringify(
                    linkStored
                ),
            },
            {
                naCsbAutomation: true,
                naSpecialWeapon: true,
                naDualSoulCeremony: true,
                naBloodPact: true,
            }
        );
    } catch (error) {
        try {
            await actor.update(
                {
                    'system.props.pdv_slayer_dano_tomado':
                        payment.damageBefore,
                },
                {
                    naCsbAutomation: true,
                    naSpecialWeapon: true,
                    naDualSoulCeremony: true,
                    naLifeDeath: true,
                    naBloodPactRollback: true,
                }
            );
        } catch {
            ui.notifications?.error?.(
                'Falha crítica: o vínculo não foi gravado e o Sangue de Pacto não pôde ser estornado automaticamente.'
            );
        }

        throw error;
    }

    const cd =
        result
            .intensity
            .awakeningCd;

    await ChatMessage.create({
        speaker:
            ChatMessage
                .getSpeaker({
                    actor,
                }),

        content: `
            <div class="na-csb-automation na-dual-soul-chat">
                <h2>
                    🔗 Cerimônia de Vínculo
                </h2>

                <p>
                    <strong>
                        ${escapeHtml(actor.name)}
                    </strong>
                    vinculou-se a
                    <strong>
                        ${escapeHtml(item.name)}
                    </strong>.
                </p>

                <hr>

                <p>
                    <strong>Teste 1:</strong>
                    ${escapeHtml(test1.total)}
                    →
                    ${escapeHtml(
                        result
                            .dominance
                            .display
                    )}
                </p>

                <p>
                    <strong>Teste 2:</strong>
                    ${escapeHtml(test2.total)}
                    →
                    ${escapeHtml(
                        result
                            .intensity
                            .name
                    )}
                    (+${escapeHtml(
                        result
                            .intensity
                            .value
                    )})
                </p>

                <p>
                    <strong>Teste 3:</strong>
                    ${escapeHtml(test3.total)}
                    →
                    ${escapeHtml(
                        result
                            .trigger
                            .publicText
                    )}
                </p>

                <p>
                    <strong>CD base:</strong>
                    ${
                        cd === null
                            ? '—'
                            : escapeHtml(cd)
                    }
                </p>

                <p>
                    <strong>Oferta de Sangue:</strong>
                    ${payment.current} →
                    <strong>${payment.remaining} PDV</strong>
                    · Dano Tomado +${payment.cost}
                </p>

                <p>
                    <strong>Ritual:</strong>
                    ${escapeHtml(ritual.nome ?? 'Cerimônia de Vínculo')}
                </p>

                <hr>

                <p>
                    Estes resultados são permanentes. O selo foi rompido pela
                    Cerimônia de Vínculo.
                </p>
            </div>
        `,
    });

    ui.notifications
        ?.info?.(
            `${item.name}: vínculo concluído e selo rompido. PDV ${payment.current} → ${payment.remaining}.`
        );

    return {
        ok: true,
        actor,
        item,
        runtime,
        pdv: payment,
    };
}
