/**
 * @fileoverview
 * Orquestra Empréstimo e Possessão a partir do evento
 * já produzido pela Resistência ao Despertar.
 *
 * Fonte exclusiva de roteamento:
 *   runtime.challengerKind
 *
 * Não rerrola nada.
 * Não toca na Cerimônia.
 * Não toca em arma_lado_dominante.
 * Não altera ownership do Actor.
 */

import {
    beginPossessionTurn,
    consumeDualSoulLoan,
    expireDualSoulLoan as expireDualSoulLoanState,
    hasActiveDualSoulConsequence,
    markPossessionAway,
    movePossessionToManualTurn,
    routeDualSoulConsequence,
    completeDualSoulPossession,
} from './dual-soul-consequence-core.mjs';

import {
    getDualSoulAwakeningRuntime,
} from './dual-soul-awakening-resistance-service.mjs';

import {
    isDualSoulWeapon,
} from './dual-soul-ceremony-service.mjs';

import {
    hydrateSpecialWeaponItem,
} from './special-weapon-service.mjs';

const RUNTIME_KEY =
    'dupla_alma_despertar_runtime_json';

function nowIso() {
    return new Date()
        .toISOString();
}

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

function actorItems(
    actor
) {
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

function combatants(
    combat
) {
    if (!combat?.combatants) {
        return [];
    }

    if (
        Array.isArray(
            combat.combatants.contents
        )
    ) {
        return combat.combatants.contents;
    }

    try {
        return [
            ...combat.combatants,
        ];
    } catch {
        return [];
    }
}

function currentCombatantId(
    combat
) {
    return (
        combat
            ?.combatant
            ?.id ??
        combat
            ?.current
            ?.combatantId ??
        combat
            ?.turns
            ?.[combat?.turn]
            ?.id ??
        null
    );
}

function combatantForActor(
    combat,
    actor
) {
    return (
        combatants(combat)
            .find(
                (combatant) =>
                    combatant
                        ?.actorId ===
                        actor?.id ||
                    combatant
                        ?.actor
                        ?.uuid ===
                        actor?.uuid
            ) ??
        null
    );
}

function isPrimaryGm() {
    const primary =
        game.users
            ?.filter(
                (user) =>
                    user.active &&
                    user.isGM
            )
            .sort(
                (a, b) =>
                    String(a.id)
                        .localeCompare(
                            String(b.id)
                        )
            )[0];

    return Boolean(
        game.user?.isGM &&
        primary?.id ===
            game.user.id
    );
}

function soulName(
    kind,
    props = {}
) {
    if (
        kind === 'entidade'
    ) {
        return (
            String(
                props.arma_entidade ??
                ''
            ).trim() ||
            'Entidade'
        );
    }

    if (
        kind === 'demonio'
    ) {
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

async function resolveActor(
    options = {}
) {
    if (
        options.actor
            ?.documentName ===
        'Actor'
    ) {
        return options.actor;
    }

    if (
        options.actorUuid
    ) {
        const document =
            await fromUuid(
                options.actorUuid
            );

        const actor =
            document?.actor ??
            document;

        if (
            actor
                ?.documentName ===
            'Actor'
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
        options.item.documentName !==
            'Actor'
    ) {
        return options.item;
    }

    if (
        options.itemUuid
    ) {
        const document =
            await fromUuid(
                options.itemUuid
            );

        if (
            document &&
            document.documentName !==
                'Actor'
        ) {
            return document;
        }
    }

    return null;
}

async function chooseDualSoulItem(
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
                        'Consequência de Dupla Alma',
                },

                content: `
                    <div class="na-csb-automation">
                        <p>
                            Escolha a Arma de Dupla Alma.
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
                        action:
                            'cancel',

                        label:
                            'Cancelar',

                        callback:
                            () => null,
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

async function writeRuntime(
    item,
    runtime,
    extra = {}
) {
    await item.update(
        {
            [`system.props.${RUNTIME_KEY}`]:
                JSON.stringify(
                    runtime
                ),

            ...extra,
        },
        {
            naCsbAutomation:
                true,

            naSpecialWeapon:
                true,

            naDualSoulConsequence:
                true,
        }
    );

    return runtime;
}

async function createAuditMessage({
    actor,
    title,
    body,
} = {}) {
    return ChatMessage.create({
        speaker:
            ChatMessage
                .getSpeaker({
                    actor,
                }),

        content: `
            <div class="na-csb-automation">
                <h2>
                    ${escapeHtml(title)}
                </h2>

                ${body}
            </div>
        `,
    });
}

function loanScopeForActor(
    actor
) {
    const combat =
        game.combat;

    if (
        combat?.started
    ) {
        const combatant =
            combatantForActor(
                combat,
                actor
            );

        if (combatant) {
            return {
                scopeKind:
                    'combat',

                combatId:
                    combat.id,

                sceneId:
                    null,
            };
        }
    }

    return {
        scopeKind:
            'scene',

        combatId:
            null,

        sceneId:
            canvas?.scene?.id ??
            null,
    };
}

function possessionTrackingForActor(
    actor
) {
    const combat =
        game.combat;

    if (
        !combat?.started
    ) {
        return {
            trackedCombat:
                false,

            combatId:
                null,

            combatantId:
                null,

            startedWhileActorTurn:
                false,
        };
    }

    const combatant =
        combatantForActor(
            combat,
            actor
        );

    if (!combatant) {
        return {
            trackedCombat:
                false,

            combatId:
                null,

            combatantId:
                null,

            startedWhileActorTurn:
                false,
        };
    }

    return {
        trackedCombat:
            true,

        combatId:
            combat.id,

        combatantId:
            combatant.id,

        startedWhileActorTurn:
            currentCombatantId(
                combat
            ) === combatant.id,
    };
}

export function getDualSoulConsequenceState(
    item
) {
    return (
        getDualSoulAwakeningRuntime(
            item
        )
            ?.consequence ??
        null
    );
}

export async function routePendingDualSoulConsequence(
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

    if (
        !game.user?.isGM &&
        actor.isOwner === false
    ) {
        return ui.notifications
            ?.warn?.(
                'Você não possui permissão para este Actor.'
            );
    }

    const item =
        await chooseDualSoulItem(
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
            ?.documentName !==
            'Actor' ||
        item.parent?.uuid !==
            actor.uuid
    ) {
        return ui.notifications
            ?.warn?.(
                'A arma precisa estar vinculada ao Actor.'
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

    const runtime =
        getDualSoulAwakeningRuntime(
            item
        );

    if (
        runtime.pending !== true ||
        runtime.result !==
            'failure'
    ) {
        return ui.notifications
            ?.warn?.(
                'Não existe falha de Resistência pendente.'
            );
    }

    if (
        runtime.consequence
    ) {
        return ui.notifications
            ?.warn?.(
                'Este evento já possui uma consequência.'
            );
    }

    const props =
        item.system?.props ??
        {};

    const at =
        nowIso();

    if (
        runtime.challengerKind ===
        'entidade'
    ) {
        const scope =
            loanScopeForActor(
                actor
            );

        const routed =
            routeDualSoulConsequence(
                runtime,
                {
                    routedAt:
                        at,

                    routedByUserId:
                        game.user?.id ??
                        null,

                    entityName:
                        soulName(
                            'entidade',
                            props
                        ),

                    ...scope,
                }
            );

        await writeRuntime(
            item,
            routed
        );

        await createAuditMessage({
            actor,

            title:
                'Empréstimo da Entidade',

            body: `
                <p>
                    <strong>
                        ${escapeHtml(
                            soulName(
                                'entidade',
                                props
                            )
                        )}
                    </strong>
                    respondeu à falha.
                </p>

                <p>
                    O portador recebe
                    <strong>
                        1 uso
                    </strong>
                    de uma habilidade/efeito
                    da Entidade permitido pelo
                    Rank atual.
                </p>

                <p>
                    Escopo:
                    <strong>
                        ${
                            routed
                                .consequence
                                .scope
                                .kind ===
                            'combat'
                                ? 'este combate'
                                : 'esta cena'
                        }
                    </strong>.
                </p>

                <p>
                    Nenhuma Marca do Demônio
                    é concedida.
                </p>
            `,
        });

        ui.notifications
            ?.info?.(
                'Empréstimo concedido: 1 uso disponível.'
            );

        return {
            ok: true,
            actor,
            item,
            runtime:
                routed,
        };
    }

    if (
        runtime.challengerKind ===
        'demonio'
    ) {
        if (
            !game.user?.isGM
        ) {
            return ui.notifications
                ?.warn?.(
                    'A Possessão deve ser iniciada pelo Mestre.'
                );
        }

        const tracking =
            possessionTrackingForActor(
                actor
            );

        const routed =
            routeDualSoulConsequence(
                runtime,
                {
                    routedAt:
                        at,

                    routedByUserId:
                        game.user?.id ??
                        null,

                    demonName:
                        soulName(
                            'demonio',
                            props
                        ),

                    ...tracking,
                }
            );

        await writeRuntime(
            item,
            routed
        );

        const tracked =
            routed
                .consequence
                .state ===
            'waiting_turn';

        await createAuditMessage({
            actor,

            title:
                'Possessão do Demônio',

            body: `
                <p>
                    <strong>
                        ${escapeHtml(
                            soulName(
                                'demonio',
                                props
                            )
                        )}
                    </strong>
                    assumiu a disputa.
                </p>

                <p>
                    O Mestre controla o personagem
                    por
                    <strong>
                        1 turno completo
                    </strong>.
                </p>

                <p>
                    ${
                        tracked
                            ? 'O Combat Tracker acompanhará automaticamente o próximo turno completo do portador.'
                            : 'Não há turno rastreável no Combat Tracker. O Mestre deverá finalizar a Possessão manualmente após cumprir um turno completo.'
                    }
                </p>

                <p>
                    A Marca do Demônio
                    <strong>
                        ainda não foi aplicada
                    </strong>.
                </p>
            `,
        });

        ui.notifications
            ?.warn?.(
                tracked
                    ? 'Possessão armada: o próximo turno completo do portador pertence ao Mestre.'
                    : 'Possessão ativa em modo manual. Finalize após um turno completo.'
            );

        return {
            ok: true,
            actor,
            item,
            runtime:
                routed,
        };
    }

    return ui.notifications
        ?.error?.(
            'challengerKind inválido no evento.'
        );
}

export async function recordDualSoulLoanUse(
    options = {}
) {
    const actor =
        await resolveActor(
            options
        );

    const item =
        await chooseDualSoulItem(
            actor,
            options
        );

    if (
        !actor ||
        !item
    ) {
        return null;
    }

    if (
        !game.user?.isGM &&
        actor.isOwner === false
    ) {
        return ui.notifications
            ?.warn?.(
                'Você não possui permissão para este Actor.'
            );
    }

    const runtime =
        getDualSoulAwakeningRuntime(
            item
        );

    const next =
        consumeDualSoulLoan(
            runtime,
            {
                at:
                    nowIso(),

                userId:
                    game.user?.id ??
                    null,
            }
        );

    await writeRuntime(
        item,
        next
    );

    await createAuditMessage({
        actor,

        title:
            'Empréstimo Consumido',

        body: `
            <p>
                O único uso concedido pela Entidade
                foi registrado como consumido.
            </p>

            <p>
                O lado retorna ao repouso.
            </p>
        `,
    });

    ui.notifications
        ?.info?.(
            'Empréstimo consumido. 0 usos restantes.'
        );

    return next;
}

export async function expireDualSoulLoan(
    options = {}
) {
    const actor =
        options.actor ??
        await resolveActor(
            options
        );

    const item =
        options.item ??
        await chooseDualSoulItem(
            actor,
            options
        );

    if (
        !actor ||
        !item
    ) {
        return null;
    }

    if (
        options.automatic !== true &&
        !game.user?.isGM &&
        actor.isOwner === false
    ) {
        return ui.notifications
            ?.warn?.(
                'Você não possui permissão para este Actor.'
            );
    }

    const runtime =
        getDualSoulAwakeningRuntime(
            item
        );

    const next =
        expireDualSoulLoanState(
            runtime,
            {
                at:
                    nowIso(),

                reason:
                    options.reason ??
                    'scene-or-combat-ended',
            }
        );

    await writeRuntime(
        item,
        next
    );

    if (
        options.automatic !==
        true
    ) {
        ui.notifications
            ?.info?.(
                'Empréstimo encerrado sem uso.'
            );
    }

    return next;
}

async function lockPossessionFinalization(
    item,
    runtime
) {
    const consequence =
        runtime
            ?.consequence;

    if (
        consequence?.kind !==
            'possession'
    ) {
        throw new Error(
            'Runtime não contém Possessão.'
        );
    }

    if (
        ![
            'in_turn',
            'manual_turn',
        ].includes(
            consequence.state
        )
    ) {
        throw new Error(
            `Possessão não pode ser finalizada no estado ${consequence.state}.`
        );
    }

    const finalizationId =
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
        );

    const locked = {
        ...runtime,

        consequence: {
            ...consequence,

            state:
                'finalizing',

            finalizationId,

            finalizationStartedAt:
                nowIso(),
        },
    };

    await writeRuntime(
        item,
        locked
    );

    const fresh =
        getDualSoulAwakeningRuntime(
            item
        );

    if (
        fresh
            ?.consequence
            ?.finalizationId !==
        finalizationId
    ) {
        return {
            ok: false,
            reason:
                'finalization-lock-lost',
        };
    }

    return {
        ok: true,
        finalizationId,
        runtime:
            fresh,
    };
}

export async function finalizeDualSoulPossession(
    options = {}
) {
    if (
        !game.user?.isGM
    ) {
        return ui.notifications
            ?.warn?.(
                'Somente o Mestre pode finalizar uma Possessão.'
            );
    }

    const actor =
        options.actor ??
        await resolveActor(
            options
        );

    const item =
        options.item ??
        await chooseDualSoulItem(
            actor,
            options
        );

    if (
        !actor ||
        !item
    ) {
        return null;
    }

    const runtime =
        getDualSoulAwakeningRuntime(
            item
        );

    if (
        runtime
            ?.consequence
            ?.kind !==
        'possession'
    ) {
        return ui.notifications
            ?.warn?.(
                'Não existe Possessão para finalizar.'
            );
    }

    if (
        runtime
            .consequence
            .state ===
        'complete'
    ) {
        return runtime;
    }

    if (
        ![
            'in_turn',
            'manual_turn',
        ].includes(
            runtime
                .consequence
                .state
        )
    ) {
        return ui.notifications
            ?.warn?.(
                'A Possessão ainda não completou um turno rastreável.'
            );
    }

    const lock =
        await lockPossessionFinalization(
            item,
            runtime
        );

    if (!lock.ok) {
        return ui.notifications
            ?.warn?.(
                'Outra finalização da Possessão venceu a trava de concorrência.'
            );
    }

    const markBefore =
        Math.max(
            0,
            Math.trunc(
                Number(
                    item
                        .system
                        ?.props
                        ?.arma_marcas_demonio
                ) ||
                0
            )
        );

    const markAfter =
        markBefore + 1;

    const at =
        nowIso();

    const completed =
        completeDualSoulPossession(
            lock.runtime,
            {
                at,

                round:
                    game.combat?.round ??
                    null,

                turn:
                    game.combat?.turn ??
                    null,

                markBefore,
                markAfter,

                finalizationId:
                    lock.finalizationId,
            }
        );

    /*
     * Marca e runtime são atualizados no MESMO Item.update.
     *
     * A trava finalizationId impede duplo incremento
     * por duas finalizações concorrentes.
     */
    await item.update(
        {
            'system.props.arma_marcas_demonio':
                markAfter,

            [`system.props.${RUNTIME_KEY}`]:
                JSON.stringify(
                    completed
                ),
        },
        {
            naCsbAutomation:
                true,

            naSpecialWeapon:
                true,

            naDualSoulConsequence:
                true,

            naDualSoulDemonMark:
                true,
        }
    );

    await createAuditMessage({
        actor,

        title:
            'Possessão Encerrada',

        body: `
            <p>
                O turno completo de Possessão terminou.
            </p>

            <p>
                Marcas do Demônio:
                <strong>
                    ${escapeHtml(markBefore)}
                    →
                    ${escapeHtml(markAfter)}
                </strong>
            </p>

            <p>
                <strong>
                    +1 Marca permanente aplicada.
                </strong>
            </p>
        `,
    });

    ui.notifications
        ?.warn?.(
            `Possessão encerrada. Marcas do Demônio: ${markBefore} → ${markAfter}.`
        );

    return completed;
}

async function processPossessionItem(
    item,
    actor,
    combat
) {
    let runtime =
        getDualSoulAwakeningRuntime(
            item
        );

    const consequence =
        runtime
            ?.consequence;

    if (
        runtime.resolved === true ||
        consequence?.kind !==
            'possession'
    ) {
        return;
    }

    if (
        consequence.combatId !==
        combat.id
    ) {
        return;
    }

    const combatant =
        combatantForActor(
            combat,
            actor
        );

    if (!combatant) {
        return;
    }

    if (
        consequence.combatantId &&
        consequence.combatantId !==
            combatant.id
    ) {
        return;
    }

    const currentId =
        currentCombatantId(
            combat
        );

    if (!currentId) {
        return;
    }

    if (
        consequence.state ===
        'waiting_turn'
    ) {
        /*
         * Possessão foi criada DURANTE o turno atual:
         * primeiro esperamos sair dele.
         */
        if (
            currentId !==
            combatant.id
        ) {
            if (
                consequence.seenAway !==
                true
            ) {
                runtime =
                    markPossessionAway(
                        runtime,
                        {
                            at:
                                nowIso(),
                        }
                    );

                await writeRuntime(
                    item,
                    runtime
                );
            }

            return;
        }

        /*
         * Só entra aqui se já houve um estado "away".
         * Portanto este início corresponde a um turno completo.
         */
        if (
            consequence.seenAway ===
            true
        ) {
            runtime =
                beginPossessionTurn(
                    runtime,
                    {
                        round:
                            combat.round ??
                            null,

                        turn:
                            combat.turn ??
                            null,

                        at:
                            nowIso(),
                    }
                );

            await writeRuntime(
                item,
                runtime
            );

            await createAuditMessage({
                actor,

                title:
                    'Turno de Possessão',

                body: `
                    <p>
                        <strong>
                            O turno completo do Mestre começou.
                        </strong>
                    </p>

                    <p>
                        O jogador não decide as ações
                        deste turno.
                    </p>

                    <p>
                        A Marca será aplicada somente
                        quando o turno terminar.
                    </p>
                `,
            });
        }

        return;
    }

    /*
     * Se o turno da Possessão estava ativo e o Tracker
     * avançou para outro combatente, o turno completo terminou.
     */
    if (
        consequence.state ===
            'in_turn' &&
        currentId !==
            combatant.id
    ) {
        await finalizeDualSoulPossession({
            actor,
            item,
            automatic:
                true,
        });
    }
}

async function processCombatPossessions(
    combat
) {
    const tasks = [];

    for (
        const combatant
        of combatants(
            combat
        )
    ) {
        const actor =
            combatant?.actor;

        if (!actor) {
            continue;
        }

        for (
            const item
            of actorItems(actor)
        ) {
            if (
                !isDualSoulWeapon(
                    item
                )
            ) {
                continue;
            }

            const runtime =
                getDualSoulAwakeningRuntime(
                    item
                );

            if (
                runtime
                    ?.consequence
                    ?.kind !==
                'possession'
            ) {
                continue;
            }

            tasks.push(
                processPossessionItem(
                    item,
                    actor,
                    combat
                )
            );
        }
    }

    await Promise.all(
        tasks
    );
}

async function handleDeletedCombat(
    combat
) {
    const tasks = [];

    for (
        const combatant
        of combatants(
            combat
        )
    ) {
        const actor =
            combatant?.actor;

        if (!actor) {
            continue;
        }

        for (
            const item
            of actorItems(actor)
        ) {
            if (
                !isDualSoulWeapon(
                    item
                )
            ) {
                continue;
            }

            const runtime =
                getDualSoulAwakeningRuntime(
                    item
                );

            const consequence =
                runtime
                    ?.consequence;

            if (
                runtime.resolved ===
                true
            ) {
                continue;
            }

            if (
                consequence?.kind ===
                    'loan' &&
                consequence.state ===
                    'active' &&
                consequence
                    ?.scope
                    ?.kind ===
                    'combat' &&
                consequence
                    ?.scope
                    ?.combatId ===
                    combat.id
            ) {
                tasks.push(
                    expireDualSoulLoan({
                        actor,
                        item,

                        automatic:
                            true,

                        reason:
                            'combat-ended',
                    })
                );

                continue;
            }

            /*
             * Se o Combat é removido antes de o Tracker
             * conseguir fechar a Possessão, NÃO concedemos
             * Marca automaticamente. O estado cai para manual.
             */
            if (
                consequence?.kind ===
                    'possession' &&
                consequence.combatId ===
                    combat.id &&
                ![
                    'complete',
                    'finalizing',
                ].includes(
                    consequence.state
                )
            ) {
                const manual =
                    movePossessionToManualTurn(
                        runtime,
                        {
                            at:
                                nowIso(),

                            reason:
                                'combat-ended-before-tracked-finalization',
                        }
                    );

                tasks.push(
                    writeRuntime(
                        item,
                        manual
                    )
                );
            }
        }
    }

    await Promise.all(
        tasks
    );
}

let runtimeRegistered =
    false;

export function registerDualSoulConsequenceRuntime() {
    if (
        runtimeRegistered
    ) {
        return;
    }

    runtimeRegistered =
        true;

    Hooks.on(
        'updateCombat',
        (
            combat,
            changes
        ) => {
            if (
                !isPrimaryGm()
            ) {
                return;
            }

            if (
                !Object.hasOwn(
                    changes,
                    'turn'
                ) &&
                !Object.hasOwn(
                    changes,
                    'round'
                )
            ) {
                return;
            }

            void processCombatPossessions(
                combat
            ).catch(
                (error) =>
                    console.error?.(
                        '[night-assassins-csb-automation] Falha no runtime de Possessão',
                        error
                    )
            );
        }
    );

    Hooks.on(
        'deleteCombat',
        (
            combat
        ) => {
            if (
                !isPrimaryGm()
            ) {
                return;
            }

            void handleDeletedCombat(
                combat
            ).catch(
                (error) =>
                    console.error?.(
                        '[night-assassins-csb-automation] Falha ao encerrar consequências de combate',
                        error
                    )
            );
        }
    );
}

async function expireStaleLoanIfNeeded(
    actor,
    item
) {
    const runtime =
        getDualSoulAwakeningRuntime(
            item
        );

    const consequence =
        runtime
            ?.consequence;

    if (
        runtime.resolved === true ||
        consequence?.kind !==
            'loan' ||
        consequence.state !==
            'active'
    ) {
        return runtime;
    }

    const scope =
        consequence.scope ??
        {};

    if (
        scope.kind ===
        'combat'
    ) {
        if (
            !game.combat?.started ||
            game.combat.id !==
                scope.combatId
        ) {
            return expireDualSoulLoan({
                actor,
                item,

                automatic:
                    true,

                reason:
                    'combat-ended',
            });
        }

        return runtime;
    }

    if (
        scope.kind ===
            'scene' &&
        scope.sceneId &&
        canvas?.scene?.id &&
        scope.sceneId !==
            canvas.scene.id
    ) {
        return expireDualSoulLoan({
            actor,
            item,

            automatic:
                true,

            reason:
                'scene-changed',
        });
    }

    return runtime;
}

export async function openDualSoulConsequenceManager(
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
        await chooseDualSoulItem(
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
            ?.documentName !==
            'Actor' ||
        item.parent?.uuid !==
            actor.uuid
    ) {
        return ui.notifications
            ?.warn?.(
                'A arma precisa estar vinculada ao Actor.'
            );
    }

    await hydrateSpecialWeaponItem(
        item
    );

    await expireStaleLoanIfNeeded(
        actor,
        item
    );

    const runtime =
        getDualSoulAwakeningRuntime(
            item
        );

    const props =
        item.system?.props ??
        {};

    if (
        runtime.pending === true &&
        runtime.result ===
            'failure'
    ) {
        const challengerName =
            soulName(
                runtime
                    .challengerKind,
                props
            );

        const isEntity =
            runtime
                .challengerKind ===
            'entidade';

        if (
            !isEntity &&
            !game.user?.isGM
        ) {
            return ui.notifications
                ?.warn?.(
                    'A falha gerou Possessão. O Mestre deve resolver esta consequência.'
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
                            isEntity
                                ? 'Resolver Empréstimo'
                                : 'Resolver Possessão',
                    },

                    content: `
                        <div class="na-csb-automation">
                            <h2>
                                ${escapeHtml(
                                    item.name
                                )}
                            </h2>

                            <p>
                                Desafiante:
                                <strong>
                                    ${escapeHtml(
                                        challengerName
                                    )}
                                </strong>
                            </p>

                            <p>
                                Consequência:
                                <strong>
                                    ${
                                        isEntity
                                            ? 'Empréstimo'
                                            : 'Possessão'
                                    }
                                </strong>
                            </p>

                            ${
                                isEntity
                                    ? `
                                        <p>
                                            Será concedido 1 uso
                                            de habilidade/efeito
                                            da Entidade permitido
                                            pelo Rank atual.
                                        </p>
                                    `
                                    : `
                                        <p>
                                            O Mestre controlará
                                            o personagem por
                                            1 turno completo.
                                        </p>

                                        <p>
                                            +1 Marca será aplicada
                                            somente ao fim desse turno.
                                        </p>
                                    `
                            }
                        </div>
                    `,

                    modal:
                        true,

                    rejectClose:
                        false,
                });

        if (!confirmed) {
            return null;
        }

        return routePendingDualSoulConsequence({
            actor,
            item,
        });
    }

    const consequence =
        runtime
            ?.consequence;

    if (
        consequence?.kind ===
            'loan'
    ) {
        if (
            consequence.state !==
            'active'
        ) {
            return foundry
                .applications
                .api
                .DialogV2
                .wait({
                    window: {
                        title:
                            'Empréstimo — Auditoria',
                    },

                    content: `
                        <div class="na-csb-automation">
                            <p>
                                Estado:
                                <strong>
                                    ${escapeHtml(
                                        consequence.state
                                    )}
                                </strong>
                            </p>

                            <p>
                                Usos restantes:
                                <strong>
                                    ${escapeHtml(
                                        consequence
                                            .usesRemaining ??
                                        0
                                    )}
                                </strong>
                            </p>

                            <p>
                                Evento original preservado:
                                <strong>
                                    ${
                                        runtime
                                            ?.audit
                                            ?.resistanceEvent
                                            ? 'SIM'
                                            : 'NÃO'
                                    }
                                </strong>
                            </p>
                        </div>
                    `,

                    buttons: [
                        {
                            action:
                                'close',

                            label:
                                'Fechar',

                            callback:
                                () => null,
                        },
                    ],
                });
        }

        const selected =
            await foundry
                .applications
                .api
                .DialogV2
                .wait({
                    window: {
                        title:
                            'Empréstimo da Entidade',
                    },

                    content: `
                        <div class="na-csb-automation">
                            <p>
                                Entidade:
                                <strong>
                                    ${escapeHtml(
                                        consequence
                                            .entityName ||
                                        soulName(
                                            'entidade',
                                            props
                                        )
                                    )}
                                </strong>
                            </p>

                            <p>
                                Usos disponíveis:
                                <strong>
                                    ${escapeHtml(
                                        consequence
                                            .usesRemaining
                                    )}
                                </strong>
                            </p>

                            <p>
                                O Empréstimo autoriza
                                <strong>
                                    1 habilidade/efeito
                                    da Entidade
                                </strong>
                                permitido pelo Rank atual.
                            </p>

                            <p>
                                A habilidade específica
                                continua sendo executada
                                pelas regras da própria arma;
                                esta release controla
                                a autorização e seu consumo.
                            </p>
                        </div>
                    `,

                    modal:
                        true,

                    rejectClose:
                        false,

                    buttons: [
                        {
                            action:
                                'use',

                            label:
                                'Registrar uso do Empréstimo',

                            callback:
                                () => 'use',
                        },

                        ...(game.user?.isGM
                            ? [
                                {
                                    action:
                                        'expire',

                                    label:
                                        'Encerrar sem uso',

                                    callback:
                                        () => 'expire',
                                },
                            ]
                            : []),

                        {
                            action:
                                'close',

                            label:
                                'Fechar',

                            callback:
                                () => null,
                        },
                    ],
                });

        if (
            selected === 'use'
        ) {
            const confirmed =
                await foundry
                    .applications
                    .api
                    .DialogV2
                    .confirm({
                        window: {
                            title:
                                'Consumir Empréstimo',
                        },

                        content: `
                            <div class="na-csb-automation">
                                <p>
                                    Confirma que o único uso
                                    do Empréstimo foi utilizado?
                                </p>
                            </div>
                        `,
                    });

            if (!confirmed) {
                return null;
            }

            return recordDualSoulLoanUse({
                actor,
                item,
            });
        }

        if (
            selected === 'expire'
        ) {
            return expireDualSoulLoan({
                actor,
                item,

                reason:
                    'gm-ended-loan',
            });
        }

        return null;
    }

    if (
        consequence?.kind ===
            'possession'
    ) {
        const state =
            consequence.state;

        const canFinalize =
            game.user?.isGM &&
            [
                'in_turn',
                'manual_turn',
            ].includes(
                state
            );

        const selected =
            await foundry
                .applications
                .api
                .DialogV2
                .wait({
                    window: {
                        title:
                            'Possessão do Demônio',
                    },

                    content: `
                        <div class="na-csb-automation">
                            <p>
                                Demônio:
                                <strong>
                                    ${escapeHtml(
                                        consequence
                                            .demonName ||
                                        soulName(
                                            'demonio',
                                            props
                                        )
                                    )}
                                </strong>
                            </p>

                            <p>
                                Estado:
                                <strong>
                                    ${escapeHtml(
                                        state
                                    )}
                                </strong>
                            </p>

                            <p>
                                Marca aplicada:
                                <strong>
                                    ${
                                        consequence
                                            .markApplied
                                            ? 'SIM'
                                            : 'NÃO'
                                    }
                                </strong>
                            </p>

                            ${
                                state ===
                                'waiting_turn'
                                    ? `
                                        <p>
                                            Aguardando o próximo
                                            turno completo do portador.
                                        </p>
                                    `
                                    : ''
                            }

                            ${
                                state ===
                                'in_turn'
                                    ? `
                                        <p>
                                            O turno de Possessão
                                            está em andamento.
                                        </p>
                                    `
                                    : ''
                            }

                            ${
                                state ===
                                'manual_turn'
                                    ? `
                                        <p>
                                            Rastreamento automático
                                            indisponível.
                                            O Mestre finaliza após
                                            cumprir 1 turno completo.
                                        </p>
                                    `
                                    : ''
                            }

                            ${
                                state ===
                                'complete'
                                    ? `
                                        <p>
                                            Marcas:
                                            <strong>
                                                ${escapeHtml(
                                                    consequence
                                                        .markBefore
                                                )}
                                                →
                                                ${escapeHtml(
                                                    consequence
                                                        .markAfter
                                                )}
                                            </strong>
                                        </p>
                                    `
                                    : ''
                            }
                        </div>
                    `,

                    modal:
                        true,

                    rejectClose:
                        false,

                    buttons: [
                        ...(canFinalize
                            ? [
                                {
                                    action:
                                        'finalize',

                                    label:
                                        'Finalizar após turno completo',

                                    callback:
                                        () => 'finalize',
                                },
                            ]
                            : []),

                        {
                            action:
                                'close',

                            label:
                                'Fechar',

                            callback:
                                () => null,
                        },
                    ],
                });

        if (
            selected ===
            'finalize'
        ) {
            const confirmed =
                await foundry
                    .applications
                    .api
                    .DialogV2
                    .confirm({
                        window: {
                            title:
                                'Finalizar Possessão',
                        },

                        content: `
                            <div class="na-csb-automation">
                                <p>
                                    Confirma que o Mestre
                                    concluiu o turno completo
                                    de Possessão?
                                </p>

                                <p>
                                    Esta ação aplicará
                                    <strong>
                                        +1 Marca do Demônio
                                    </strong>
                                    permanentemente.
                                </p>
                            </div>
                        `,
                    });

            if (!confirmed) {
                return null;
            }

            return finalizeDualSoulPossession({
                actor,
                item,
            });
        }

        return null;
    }

    if (
        runtime.result ===
            'success'
    ) {
        return ui.notifications
            ?.info?.(
                'A última Resistência foi um sucesso. Não existe consequência.'
            );
    }

    return ui.notifications
        ?.info?.(
            'Nenhuma consequência de Dupla Alma está pendente ou ativa.'
        );
}

export {
    hasActiveDualSoulConsequence,
};
