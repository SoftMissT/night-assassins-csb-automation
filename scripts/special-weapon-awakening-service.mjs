import { MODULE_ID } from './constants.mjs';

import {
    slayerCurrentPdv,
} from './life-death-service.mjs';

import {
    dualSoulCeremonyCompleted,
    getDualSoulCeremonyState,
} from './dual-soul-ceremony-service.mjs';

import {
    YAMATO_NAME,
    hydrateSpecialWeaponItem,
} from './special-weapon-service.mjs';

import {
    YAMATO_AWAKENING_STATE,
    awakeningBloodCost,
    awakeningDuration,
    awakeningExpired,
    awakeningRuntime,
} from './special-weapon-awakening-core.mjs';

const RUNTIME_KEY =
    'arma_especial_despertar_runtime_json';

const USED_COMBAT_FLAG =
    'yamatoAwakeningUsedCombat';

function parseRuntime(value) {
    if (
        value &&
        typeof value === 'object'
    ) {
        return value;
    }

    try {
        return JSON.parse(
            String(value || '{}')
        );
    } catch {
        return {};
    }
}

async function resolveItem(
    options = {}
) {
    if (
        options.item &&
        options.item.documentName !== 'Actor'
    ) {
        return options.item;
    }

    if (options.itemUuid) {
        return fromUuid(
            options.itemUuid
        );
    }

    return null;
}

async function resolveActor(
    item,
    options = {}
) {
    if (
        item
            ?.parent
            ?.documentName === 'Actor'
    ) {
        return item.parent;
    }

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

        return (
            document?.actor ??
            document
        );
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

function isYamato(item) {
    return (
        String(
            item
                ?.system
                ?.props
                ?.arma_nome ??
            item?.name ??
            ''
        ) === YAMATO_NAME
    );
}

function sideLabel(side) {
    return side === 'forseti'
        ? 'Forseti'
        : 'Yamata no Orochi';
}

/**
 * O Teste 1 pertence à Cerimônia.
 *
 * O adapter só traduz:
 * entidade -> Forseti
 * demonio  -> Orochi
 *
 * Equilíbrio permanece uma decisão do Ritual.
 */
function yamatoSideFromCeremony(
    ceremony
) {
    switch (
        ceremony
            ?.dominance
            ?.dominantKind
    ) {
        case 'entidade':
            return 'forseti';

        case 'demonio':
            return 'orochi';

        default:
            return '';
    }
}

async function chooseEquilibriumSide() {
    return foundry
        .applications
        .api
        .DialogV2
        .wait({
            window: {
                title:
                    'Yamato — Equilíbrio Instável',
            },

            content: `
                <div class="na-csb-automation">
                    <p>
                        A Cerimônia resultou em
                        <strong>Equilíbrio Instável</strong>.
                    </p>

                    <p>
                        Escolha qual lado responderá
                        a Sangue na Bainha neste despertar.
                    </p>
                </div>
            `,

            modal: true,
            rejectClose: false,

            buttons: [
                {
                    action: 'forseti',
                    label: 'Forseti',
                    callback:
                        () => 'forseti',
                },

                {
                    action: 'orochi',
                    label: 'Yamata no Orochi',
                    callback:
                        () => 'orochi',
                },

                {
                    action: 'cancel',
                    label: 'Cancelar',
                    callback:
                        () => null,
                },
            ],
        });
}

async function sealYamato(item) {
    if (
        !item?.update ||
        !isYamato(item)
    ) {
        return false;
    }

    await item.update(
        {
            'system.props.arma_especial_estado_atual':
                YAMATO_AWAKENING_STATE.sealed,

            'system.props.arma_especial_forma_atual':
                'Lâmina Herdada',

            'system.props.arma_especial_recurso_resumo':
                '',

            [`system.props.${RUNTIME_KEY}`]:
                '{}',
        },
        {
            naCsbAutomation: true,
            naSpecialWeapon: true,
            naLifeDeath: true,
        }
    );

    return true;
}

export async function awakenYamato(
    options = {}
) {
    const item =
        await resolveItem(
            options
        );

    if (
        !item ||
        !isYamato(item)
    ) {
        return ui.notifications
            ?.warn?.(
                'Selecione a Yamato vinculada ao Caçador.'
            );
    }

    const actor =
        await resolveActor(
            item,
            options
        );

    if (!actor?.update) {
        return ui.notifications
            ?.warn?.(
                'A Yamato precisa estar vinculada a um Actor.'
            );
    }

    if (!game.combat?.started) {
        return ui.notifications
            ?.warn?.(
                'O Primeiro Despertar deve ser ativado durante um combate.'
            );
    }

    if (
        item.getFlag?.(
            MODULE_ID,
            USED_COMBAT_FLAG
        ) === game.combat.id
    ) {
        return ui.notifications
            ?.warn?.(
                'O Primeiro Despertar da Yamato já foi usado neste combate.'
            );
    }

    await hydrateSpecialWeaponItem(
        item
    );

    if (
        !dualSoulCeremonyCompleted(
            item
        )
    ) {
        return ui.notifications
            ?.warn?.(
                'A Yamato ainda não realizou a Cerimônia de Vínculo.'
            );
    }

    const ceremony =
        getDualSoulCeremonyState(
            item
        );

    const active =
        parseRuntime(
            item
                .system
                ?.props
                ?.[RUNTIME_KEY]
        );

    if (
        active.state ===
        YAMATO_AWAKENING_STATE.first
    ) {
        return ui.notifications
            ?.warn?.(
                'Yamato já está em Primeiro Despertar.'
            );
    }

    let side =
        yamatoSideFromCeremony(
            ceremony
        );

    if (
        ceremony
            ?.dominance
            ?.dominantKind ===
        'equilibrio'
    ) {
        side =
            await chooseEquilibriumSide();

        if (!side) {
            return null;
        }
    }

    if (!side) {
        return ui.notifications
            ?.warn?.(
                'A Cerimônia não possui um Lado Dominante utilizável.'
            );
    }

    const pdv =
        awakeningBloodCost(
            slayerCurrentPdv(
                actor.system?.props ?? {}
            )
        );

    if (pdv.current <= 1) {
        return ui.notifications
            ?.warn?.(
                'Sangue na Bainha não pode reduzir o portador abaixo de 1 PDV.'
            );
    }

    const integration =
        String(
            item
                .system
                ?.props
                ?.arma_especial_integracao ??
            ''
        ).trim() ||
        'Dualidade';

    const duration =
        awakeningDuration(
            integration
        );

    const confirmed =
        await foundry
            .applications
            .api
            .DialogV2
            .confirm({
                window: {
                    title:
                        'Yamato — Sangue na Bainha',
                },

                content: `
                    <div class="na-csb-automation">
                        <p>
                            Lado definido pela Cerimônia:
                            <strong>
                                ${sideLabel(side)}
                            </strong>
                        </p>

                        <p>
                            Integração:
                            <strong>
                                ${integration}
                            </strong>
                        </p>

                        <p>
                            Duração:
                            <strong>
                                ${duration} rodadas
                            </strong>
                        </p>

                        <hr>

                        <p>
                            PDV atual:
                            <strong>
                                ${pdv.current}
                            </strong>
                        </p>

                        <p>
                            PDV após o pacto:
                            <strong>
                                ${pdv.remaining}
                            </strong>
                        </p>

                        <p>
                            Sangue de Pacto:
                            <strong>
                                ${pdv.cost} PDV
                            </strong>
                        </p>
                    </div>
                `,

                modal: true,
                rejectClose: false,
            });

    if (!confirmed) {
        return null;
    }

    const runtime =
        awakeningRuntime({
            combatId:
                game.combat?.id ??
                null,

            round:
                game.combat?.round ??
                0,

            duration,
            side,
        });

    runtime.integration =
        integration;

    runtime.ceremonyDominance =
        ceremony?.dominance ??
        null;

    const damage =
        Math.max(
            0,
            Number(
                actor
                    .system
                    ?.props
                    ?.pdv_slayer_dano_tomado
            ) || 0
        );

    await actor.update(
        {
            'system.props.pdv_slayer_dano_tomado':
                damage + pdv.cost,
        },
        {
            naCsbAutomation: true,
            naSpecialWeapon: true,
            naLifeDeath: true,
            naBloodPact: true,
        }
    );

    /*
     * arma_lado_dominante NÃO é tocado aqui.
     * Esse valor pertence à Cerimônia permanente.
     */
    await item.update(
        {
            'system.props.arma_especial_estado_atual':
                YAMATO_AWAKENING_STATE.first,

            'system.props.arma_especial_forma_atual':
                'Fenda do Herdeiro',

            'system.props.arma_especial_recurso_resumo':
                `${sideLabel(side)} · ${integration} · ${duration} rodadas`,

            [`system.props.${RUNTIME_KEY}`]:
                JSON.stringify(runtime),
        },
        {
            naCsbAutomation: true,
            naSpecialWeapon: true,
            naLifeDeath: true,
            naBloodPact: true,
        }
    );

    await item.setFlag?.(
        MODULE_ID,
        USED_COMBAT_FLAG,
        game.combat.id
    );

    ui.notifications
        ?.info?.(
            `Yamato despertou com ${sideLabel(side)} por ${duration} rodadas.`
        );

    return {
        ok: true,
        runtime,
        pdv,
        ceremony,
    };
}

export async function openSpecialWeaponAwakeningManager(
    options = {}
) {
    const item =
        await resolveItem(
            options
        );

    if (
        !item ||
        !isYamato(item)
    ) {
        return ui.notifications
            ?.warn?.(
                'O despertar desta arma ainda não possui adapter executável.'
            );
    }

    await hydrateSpecialWeaponItem(
        item
    );

    const ceremony =
        getDualSoulCeremonyState(
            item
        );

    const state =
        String(
            item
                .system
                ?.props
                ?.arma_especial_estado_atual ??
            YAMATO_AWAKENING_STATE.sealed
        );

    const ceremonyState =
        dualSoulCeremonyCompleted(
            item
        )
            ? (
                ceremony
                    ?.dominance
                    ?.display ??
                'Concluída'
            )
            : 'NÃO REALIZADA';

    const choice =
        await foundry
            .applications
            .api
            .DialogV2
            .wait({
                window: {
                    title:
                        'Yamato — Gerenciar Despertar',
                },

                content: `
                    <div class="na-csb-automation">
                        <p>
                            Cerimônia:
                            <strong>
                                ${ceremonyState}
                            </strong>
                        </p>

                        <p>
                            Estado atual:
                            <strong>
                                ${state}
                            </strong>
                        </p>
                    </div>
                `,

                modal: true,
                rejectClose: false,

                buttons: [
                    {
                        action: 'awaken',
                        label:
                            'Sangue na Bainha',
                        callback:
                            () => 'awaken',
                    },

                    {
                        action: 'seal',
                        label:
                            'Selar Yamato',
                        callback:
                            () => 'seal',
                    },

                    {
                        action: 'cancel',
                        label:
                            'Cancelar',
                        callback:
                            () => null,
                    },
                ],
            });

    if (choice === 'awaken') {
        return awakenYamato({
            ...options,
            item,
        });
    }

    if (choice === 'seal') {
        return sealYamato(item);
    }

    return null;
}

let registered = false;

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

    return (
        game.user?.isGM &&
        primary?.id ===
            game.user.id
    );
}

export function registerSpecialWeaponAwakeningRuntime() {
    if (registered) {
        return;
    }

    registered = true;

    Hooks.on(
        'updateCombat',
        (
            combat,
            changes
        ) => {
            if (
                !isPrimaryGm() ||
                !Object.hasOwn(
                    changes,
                    'round'
                )
            ) {
                return;
            }

            for (
                const combatant
                of combat.combatants ?? []
            ) {
                const items =
                    combatant.actor
                        ?.items ??
                    [];

                for (const item of items) {
                    if (!isYamato(item)) {
                        continue;
                    }

                    const runtime =
                        parseRuntime(
                            item
                                .system
                                ?.props
                                ?.[RUNTIME_KEY]
                        );

                    if (
                        awakeningExpired(
                            runtime,
                            combat
                        )
                    ) {
                        void sealYamato(
                            item
                        );
                    }
                }
            }
        }
    );
}
