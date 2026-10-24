/**
 * @fileoverview Auditoria de criação de arma em Actor.
 *
 * Nenhum código do módulo cria Item de arma. Quando uma cópia aparece sem o jogador ter
 * feito nada, o que identifica a causa é a origem que o próprio Foundry grava em `_stats`
 * (`duplicateSource`, `compendiumSource`). Esta auditoria registra essa origem sempre que uma
 * arma ganha uma "gêmea" (mesmo nome) no mesmo Actor e só avisa o GM quando a origem é
 * desconhecida. Nunca apaga nada: duas armas iguais podem ser legítimas (ex.: Nitoryu).
 */
import { isWeaponItem } from './weapon-migration.mjs';

const LOG_MARKER = '[NA-ARMA-DUP]';

function nameKey(item) {
    return String(item?.system?.props?.arma_nome ?? item?.name ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR');
}

/** @returns {{kind: 'duplicar'|'compendio'|'desconhecida', source: string}} */
export function weaponCreationOrigin(item) {
    const stats = item?._stats ?? item?._source?._stats ?? {};
    if (stats.duplicateSource) return { kind: 'duplicar', source: String(stats.duplicateSource) };
    if (stats.compendiumSource) return { kind: 'compendio', source: String(stats.compendiumSource) };
    return { kind: 'desconhecida', source: '' };
}

export function findWeaponTwins(item, items = []) {
    const key = nameKey(item);
    if (!key) return [];
    return [...items].filter(
        (other) => other && other.id !== item.id && isWeaponItem(other) && nameKey(other) === key
    );
}

/**
 * Decide o que registrar para uma arma recém-criada.
 * @returns {null | {origin: object, twins: object[], notify: boolean, logLine: string, message: string}}
 */
export function auditWeaponCreation(item, { actorItems = [], userId = '', users = new Map() } = {}) {
    if (item?.parent?.documentName !== 'Actor' || !isWeaponItem(item)) return null;
    const twins = findWeaponTwins(item, actorItems);
    if (twins.length === 0) return null;
    const origin = weaponCreationOrigin(item);
    const name = String(item.system?.props?.arma_nome ?? item.name ?? 'Arma');
    const actorName = String(item.parent?.name ?? 'Actor');
    const payload = {
        itemId: item.id,
        itemUuid: item.uuid,
        name,
        actorUuid: item.parent?.uuid ?? '',
        actorName,
        userId,
        userName: users.get?.(userId)?.name ?? 'desconhecido',
        origin: origin.kind,
        source: origin.source,
        createdTime: item._stats?.createdTime ?? null,
        twinIds: twins.map((twin) => twin.id),
    };
    return {
        origin,
        twins,
        notify: origin.kind === 'desconhecida',
        logLine: `${LOG_MARKER} ${JSON.stringify(payload)}`,
        message: `${name} ganhou uma cópia em ${actorName} sem origem identificada (nem Duplicar, nem compêndio). Se não foi intencional, rode "Diagnosticar armas duplicadas".`,
    };
}

function isPrimaryActiveGm() {
    const primary = game.users
        ?.filter((user) => user.active && user.isGM)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    return Boolean(primary) && primary.id === game.user?.id;
}

export function registerWeaponCreationAudit() {
    Hooks.on('createItem', (item, _options, userId) => {
        const result = auditWeaponCreation(item, {
            actorItems: [...(item?.parent?.items ?? [])],
            userId,
            users: game.users,
        });
        if (!result) return;
        // Só o criador registra (um log por criação, não um por cliente conectado).
        if (game.user?.id === userId) console.warn(result.logLine);
        if (result.notify && isPrimaryActiveGm()) ui.notifications?.warn?.(result.message);
    });
}
