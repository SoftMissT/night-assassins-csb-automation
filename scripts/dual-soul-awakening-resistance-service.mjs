/**
 * @fileoverview
 * Teste genérico de Resistência ao Despertar.
 *
 * O serviço:
 * - lê a Cerimônia;
 * - determina challengerKind;
 * - permite FOR ou VIT;
 * - rola contra a CD;
 * - persiste SOMENTE o evento de resistência.
 *
 * Não executa a consequência da falha.
 */

import {
    buildDualSoulResistanceEvent,
    hasPendingDualSoulResistance,
    isUnstableDualSoulCeremony,
    parseDualSoulResistanceRuntime,
    resolveDualSoulChallenge,
} from './dual-soul-awakening-resistance-core.mjs';

import {
    dualSoulCeremonyCompleted,
    getDualSoulCeremonyState,
    isDualSoulWeapon,
} from './dual-soul-ceremony-service.mjs';

import {
    parseAttributeValue,
} from './parsing.mjs';

import {
    hydrateSpecialWeaponItem,
} from './special-weapon-service.mjs';

const RUNTIME_KEY =
    'dupla_alma_despertar_runtime_json';

function escapeHtml(
    value = ''
) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
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

function currentRollMode() {
    try {
        return (
            game.settings.get(
                'core',
                'rollMode'
            ) ??
            'publicroll'
        );
    } catch {
        return 'publicroll';
    }
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

    const controlled =
        canvas
            ?.tokens
            ?.controlled ??
        [];

    if (
        controlled.length === 1
    ) {
        return (
            controlled[0]
                ?.actor ??
            null
        );
    }

    if (
        controlled.length > 1
    ) {
        return null;
    }

    return (
        game.user?.character ??
        null
    );
}

async function explicitItem(
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
        await explicitItem(
            options
        );

    if (explicit) {
        return isDualSoulWeapon(
            explicit
        )
            ? explicit
            : null;
    }

    const weapons =
        actorItems(actor)
            .filter(
                isDualSoulWeapon
            );

    if (
        weapons.length === 0
    ) {
        return null;
    }

    if (
        weapons.length === 1
    ) {
        return weapons[0];
    }

    const selected =
        await foundry
            .applications
            .api
            .DialogV2
            .wait({
                window: {
                    title:
                        'Resistência ao Despertar',
                },

                content: `
                    <div class="na-csb-automation">
                        <p>
                            Escolha a Arma de Dupla Alma
                            cujo gatilho ocorreu.
                        </p>
                    </div>
                `,

                modal: true,
                rejectClose: false,

                buttons: [
                    ...weapons.map(
                        (
                            weapon,
                            index
                        ) => ({
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
                    ),

                    {
                        action: 'cancel',
                        label: 'Cancelar',
                        callback: () => null,
                    },
                ],
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

function attributeValue(
    actor,
    attribute
) {
    const key =
        attribute === 'FOR'
            ? 'for_display'
            : 'vit_display';

    const props =
        actor?.system?.props ??
        {};

    if (
        !Object.prototype
            .hasOwnProperty
            .call(
                props,
                key
            )
    ) {
        throw new Error(
            `A ficha não possui a key ${key}.`
        );
    }

    return parseAttributeValue(
        props[key]
    );
}

function soulName(
    kind,
    props = {}
) {
    if (kind === 'entidade') {
        return (
            String(
                props.arma_entidade ??
                ''
            ).trim() ||
            'Entidade'
        );
    }

    if (kind === 'demonio') {
        return (
            String(
                props.arma_demonio ??
                ''
            ).trim() ||
            'Demônio'
        );
    }

    return '—';
}

async function mechanicalRoll({
    actor,
    formula,
    flavor,
} = {}) {
    const roll =
        Roll.create(
            formula,
            actor?.getRollData?.() ??
            {}
        );

    await roll.evaluate();

    await roll.toMessage({
        speaker:
            ChatMessage
                .getSpeaker({
                    actor,
                }),

        flavor,

        rollMode:
            currentRollMode(),
    });

    return roll;
}

async function chooseAttribute({
    actor,
    challengerName,
    dc,
} = {}) {
    let forValue;
    let vitValue;

    try {
        forValue =
            attributeValue(
                actor,
                'FOR'
            );

        vitValue =
            attributeValue(
                actor,
                'VIT'
            );
    } catch (error) {
        ui.notifications
            ?.error?.(
                error.message
            );

        return null;
    }

    return foundry
        .applications
        .api
        .DialogV2
        .wait({
            window: {
                title:
                    'Resistência ao Despertar',
            },

            content: `
                <div class="na-csb-automation">
                    <p>
                        <strong>
                            ${escapeHtml(
                                challengerName
                            )}
                        </strong>
                        está tentando assumir.
                    </p>

                    <p>
                        CD:
                        <strong>
                            ${escapeHtml(dc)}
                        </strong>
                    </p>

                    <hr>

                    <p>
                        Escolha FOR ou VIT.
                    </p>

                    <p>
                        FOR:
                        <strong>
                            ${escapeHtml(
                                forValue
                            )}
                        </strong>
                        ·
                        VIT:
                        <strong>
                            ${escapeHtml(
                                vitValue
                            )}
                        </strong>
                    </p>
                </div>
            `,

            modal: true,
            rejectClose: false,

            buttons: [
                {
                    action: 'FOR',
                    label:
                        `FOR (${forValue})`,

                    callback:
                        () => 'FOR',
                },

                {
                    action: 'VIT',
                    label:
                        `VIT (${vitValue})`,

                    callback:
                        () => 'VIT',
                },

                {
                    action: 'cancel',
                    label: 'Cancelar',
                    callback: () => null,
                },
            ],
        });
}

export function getDualSoulAwakeningRuntime(
    item
) {
    return parseDualSoulResistanceRuntime(
        item
            ?.system
            ?.props
            ?.[RUNTIME_KEY],
        {}
    );
}

export function dualSoulAwakeningPending(
    item
) {
    return hasPendingDualSoulResistance(
        item
            ?.system
            ?.props
            ?.[RUNTIME_KEY]
    );
}

export async function openDualSoulAwakeningResistance(
    options = {}
) {
    const controlled =
        canvas
            ?.tokens
            ?.controlled ??
        [];

    if (
        !options.actor &&
        !options.actorUuid &&
        controlled.length > 1
    ) {
        return ui.notifications
            ?.warn?.(
                'Selecione somente um token para o Teste de Resistência.'
            );
    }

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

    if (
        !game.user?.isGM &&
        actor.isOwner === false
    ) {
        return ui.notifications
            ?.warn?.(
                'Você não possui permissão para realizar este teste com o Actor.'
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

    if (
        item.parent
            ?.documentName !== 'Actor' ||
        item.parent?.uuid !==
            actor.uuid
    ) {
        return ui.notifications
            ?.warn?.(
                'O Teste de Resistência deve ser realizado com uma arma vinculada ao Actor.'
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
                'Falha ao hidratar a arma.'
            );
    }

    if (
        !dualSoulCeremonyCompleted(
            item
        )
    ) {
        return ui.notifications
            ?.warn?.(
                'Esta arma ainda não concluiu a Cerimônia de Vínculo.'
            );
    }

    if (
        dualSoulAwakeningPending(
            item
        )
    ) {
        const pending =
            getDualSoulAwakeningRuntime(
                item
            );

        return ui.notifications
            ?.warn?.(
                `Já existe uma falha de Resistência pendente (${pending.challengerKind ?? 'lado desconhecido'}). Ela precisa ser resolvida antes de um novo teste.`
            );
    }

    const ceremony =
        getDualSoulCeremonyState(
            item
        );

    if (!ceremony) {
        return ui.notifications
            ?.error?.(
                'Runtime da Cerimônia não foi encontrado.'
            );
    }

    const dc =
        Number(
            ceremony
                ?.intensity
                ?.awakeningCd
        );

    if (
        !Number.isFinite(dc) ||
        dc <= 0
    ) {
        return ui.notifications
            ?.error?.(
                'A Cerimônia não possui uma CD de Despertar válida.'
            );
    }

    const props =
        item.system?.props ??
        {};

    const unstable =
        isUnstableDualSoulCeremony(
            ceremony
        );

    const trigger =
        String(
            ceremony
                ?.trigger
                ?.publicText ??
            props.arma_gatilho_despertar ??
            'Gatilho declarado pela mesa.'
        );

    const dominantDisplay =
        unstable
            ? 'Equilíbrio Instável'
            : (
                ceremony
                    ?.dominance
                    ?.display ??
                ceremony
                    ?.dominance
                    ?.dominantName ??
                '—'
            );

    const confirmed =
        await foundry
            .applications
            .api
            .DialogV2
            .confirm({
                window: {
                    title:
                        'Gatilho de Despertar',
                },

                content: `
                    <div class="na-csb-automation">
                        <h2>
                            ${escapeHtml(
                                item.name
                            )}
                        </h2>

                        <p>
                            Vínculo:
                            <strong>
                                ${escapeHtml(
                                    dominantDisplay
                                )}
                            </strong>
                        </p>

                        <p>
                            Intensidade:
                            <strong>
                                ${escapeHtml(
                                    ceremony
                                        ?.intensity
                                        ?.name ??
                                    '—'
                                )}
                            </strong>
                        </p>

                        <p>
                            CD:
                            <strong>
                                ${escapeHtml(dc)}
                            </strong>
                        </p>

                        <hr>

                        <p>
                            Gatilho:
                            <strong>
                                ${escapeHtml(
                                    trigger
                                )}
                            </strong>
                        </p>

                        ${
                            unstable
                                ? `
                                    <p>
                                        O vínculo está em
                                        <strong>
                                            Equilíbrio Instável
                                        </strong>.
                                        Um 1d2 determinará
                                        qual lado desafia
                                        neste evento.
                                    </p>
                                `
                                : `
                                    <p>
                                        O lado adormecido
                                        tentará assumir.
                                    </p>
                                `
                        }

                        <p>
                            Confirmar que o gatilho
                            aconteceu?
                        </p>
                    </div>
                `,

                modal: true,
                rejectClose: false,

                yes: {
                    label:
                        'Confirmar gatilho',
                },

                no: {
                    label:
                        'Cancelar',
                },
            });

    if (!confirmed) {
        return null;
    }

    let challengerRoll =
        null;

    let challenge;

    if (unstable) {
        challengerRoll =
            Roll.create(
                '1d2'
            );

        await challengerRoll
            .evaluate();

        challenge =
            resolveDualSoulChallenge({
                ceremony,

                challengerRollTotal:
                    challengerRoll.total,
            });

        const challengerName =
            soulName(
                challenge
                    .challengerKind,
                props
            );

        /*
         * A rolagem é anexada a uma ChatMessage.
         * Dice So Nice usa o fluxo padrão de rolagens
         * do Foundry já adotado pelo restante do módulo.
         */
        await challengerRoll
            .toMessage({
                speaker:
                    ChatMessage
                        .getSpeaker({
                            actor,
                        }),

                flavor:
                    `<strong>Equilíbrio Instável — Desafiante</strong> · 1 = Entidade · 2 = Demônio · Resultado: <strong>${escapeHtml(challengerRoll.total)}</strong> → ${escapeHtml(challengerName)}`,

                rollMode:
                    currentRollMode(),
            });
    } else {
        challenge =
            resolveDualSoulChallenge({
                ceremony,
            });
    }

    const challengerName =
        soulName(
            challenge
                .challengerKind,
            props
        );

    const attribute =
        await chooseAttribute({
            actor,
            challengerName,
            dc,
        });

    if (!attribute) {
        return null;
    }

    let chosenValue;

    try {
        chosenValue =
            attributeValue(
                actor,
                attribute
            );
    } catch (error) {
        return ui.notifications
            ?.error?.(
                error.message
            );
    }

    const formula =
        `1d20 + ${chosenValue}`;

    const resistanceRoll =
        Roll.create(
            formula,
            actor?.getRollData?.() ??
            {}
        );

    await resistanceRoll
        .evaluate();

    const event =
        buildDualSoulResistanceEvent({
            ceremony,

            challengerRollTotal:
                challengerRoll
                    ?.total ??
                null,

            attribute,

            attributeValue:
                chosenValue,

            rollTotal:
                resistanceRoll.total,

            dc,

            actorUuid:
                actor.uuid ??
                null,

            itemUuid:
                item.uuid ??
                null,

            combatId:
                game.combat?.id ??
                null,

            round:
                game.combat?.round ??
                null,

            turn:
                game.combat?.turn ??
                null,

            eventId:
                globalThis
                    .foundry
                    ?.utils
                    ?.randomID
                    ?.() ??
                globalThis
                    .crypto
                    ?.randomUUID
                    ?.() ??
                String(
                    Date.now()
                ),

            createdAt:
                new Date()
                    .toISOString(),

            trigger,
        });

    const resultLabel =
        event.result === 'success'
            ? '✅ SUCESSO'
            : '❌ FALHA';

    /*
     * Esta mensagem contém a própria Roll.
     * Não há uma segunda rolagem escondida.
     */
    await resistanceRoll
        .toMessage({
            speaker:
                ChatMessage
                    .getSpeaker({
                        actor,
                    }),

            flavor:
                `<strong>Resistência ao Despertar</strong> · ${escapeHtml(challengerName)} desafia · ${escapeHtml(attribute)} = ${escapeHtml(chosenValue)} · CD ${escapeHtml(dc)} → <strong>${resultLabel}</strong>`,

            rollMode:
                currentRollMode(),
        });

    /*
     * ÚNICA escrita mecânica deste slice.
     *
     * A Cerimônia, arma_lado_dominante,
     * estado da arma e Marcas não são alterados.
     */
    await item.update(
        {
            [`system.props.${RUNTIME_KEY}`]:
                JSON.stringify(
                    event
                ),
        },
        {
            naCsbAutomation: true,
            naSpecialWeapon: true,
            naDualSoulAwakeningResistance:
                true,
        }
    );

    if (
        event.result === 'success'
    ) {
        ui.notifications
            ?.info?.(
                `${actor.name} resistiu a ${challengerName}. O vínculo permanece como estava.`
            );
    } else {
        ui.notifications
            ?.warn?.(
                `${actor.name} falhou contra ${challengerName}. Evento de despertar registrado como pendente.`
            );
    }

    return {
        ok: true,

        actor,
        item,

        ceremony,

        event,

        challengerRoll,
        resistanceRoll,
    };
}
