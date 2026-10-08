/**
 * @fileoverview Primitivas genéricas do contrato de Forma.
 *
 * Cada primitiva é implementada UMA vez e usada por dado — nenhum ramo por
 * Respiração mora aqui. O pipeline injeta o `runtime` (roll, chat,
 * aplicadores de status, cura, flags); os testes injetam fakes.
 */

/** Quantidade de rolagens de acerto/dano do nível (primitiva estrutural). */
export function attackCount(primitives = []) {
    const entry = Array.isArray(primitives)
        ? primitives.find((primitive) => primitive?.tipo === 'ataques')
        : null;
    const n = Math.trunc(Number(entry?.n) || 1);
    return Math.max(1, n);
}

function statusEffectFrom(primitive) {
    return {
        damageFormula: String(primitive.formula ?? '').trim(),
        remainingTurns: Math.max(0, Math.trunc(Number(primitive.turnos) || 0)),
        sourceName: String(primitive.sourceName ?? '').trim(),
        tick: primitive.tick === 'end' ? 'end' : 'start',
        stacks: Math.max(1, Math.trunc(Number(primitive.stacks) || 1)),
    };
}

/**
 * Aplica um status no alvo (com ou sem acúmulo por fonte).
 */
export async function aplicarStatusPrimitive({ primitive, target, runtime } = {}) {
    if (!target || !primitive?.status || typeof runtime?.applyStatus !== 'function')
        return { applied: false, reason: 'Sem alvo, status ou aplicador.' };
    const effect = statusEffectFrom(primitive);
    if (primitive.stack === true) await runtime.applyStackingStatus(target, primitive.status, effect);
    else await runtime.applyStatus(target, primitive.status, effect);
    return { applied: true };
}

/**
 * Cura o Actor (fórmula) e, se declarado, limpa Sangramento.
 */
export async function curaPrimitive({ primitive, actor, runtime } = {}) {
    if (!actor || !primitive) return { healed: 0 };
    let healed = 0;
    const formula = String(primitive.formula ?? '').trim();
    if (formula && typeof runtime?.roll === 'function') {
        const roll = await runtime.roll(formula);
        healed = Math.max(0, Math.trunc(Number(roll?.total) || 0));
        if (healed > 0 && typeof runtime?.applyHeal === 'function')
            await runtime.applyHeal(actor, healed, {
                sourceName: String(primitive.label ?? 'Cura de Forma'),
            });
    }
    if (primitive.removeBleeding === true && typeof runtime?.clearBleeding === 'function')
        await runtime.clearBleeding(actor);
    return { healed };
}

/**
 * Grava um buff temporário no Actor (expiração fora daqui, nos ticks).
 */
export async function buffPrimitive({ primitive, actor, runtime } = {}) {
    if (!actor || !primitive || typeof runtime?.setBuffs !== 'function') return { applied: false };
    const buff = {
        id: String(primitive.id ?? primitive.label ?? 'buff').trim() || 'buff',
        label: String(primitive.label ?? 'Buff').trim() || 'Buff',
        mods: { ...(primitive.mods ?? {}) },
        turns: Math.max(1, Math.trunc(Number(primitive.turnos) || 1)),
    };
    await runtime.setBuffs(actor, buff);
    return { applied: true, buff };
}

/**
 * Filtra alvos marcados pelo raio da área (sem salvaguarda — mesa adjudica).
 */
export function filterAreaTargets({ primitive, origin, targets = [], measure } = {}) {
    const meters = Math.max(0, Number(primitive?.metros) || 0);
    const list = Array.isArray(targets) ? targets : [];
    if (!origin || meters <= 0 || typeof measure !== 'function')
        return { inside: [...list], outside: [] };
    const inside = [];
    const outside = [];
    for (const token of list) {
        const measured = measure(origin, token);
        const distance = Number(measured?.distance ?? measured);
        if (Number.isFinite(distance) && distance > meters) outside.push(token);
        else inside.push(token);
    }
    return { inside, outside };
}

/**
 * Rola a salvaguarda do alvo contra a CD já resolvida pelo pipeline.
 */
export async function saveAlvoPrimitive({ primitive, target, dcTotal = 0, runtime } = {}) {
    if (!target || !primitive?.atributo || typeof runtime?.roll !== 'function')
        return { failed: false, skipped: true };
    const dc = Math.max(0, Math.trunc(Number(dcTotal) || 0));
    const attrValue = Math.max(
        0,
        Math.trunc(Number(runtime.attrValue?.(target, String(primitive.atributo))) || 0)
    );
    const roll = await runtime.roll(`1d20 + ${attrValue}`);
    const total = Math.max(0, Math.trunc(Number(roll?.total) || 0));
    if (typeof runtime.postSave === 'function')
        await runtime.postSave({ target, atributo: primitive.atributo, total, dc });
    return { failed: total < dc, total, dc };
}

/**
 * Executa as primitivas imediatas do nível (`ataques`/`area`/`saveAlvo` são
 * estruturais e ficam com o pipeline).
 */
export async function runLevelPrimitives({ primitives = [], actor, targets = [], runtime } = {}) {
    const results = { attackCount: attackCount(primitives), status: [], heals: [], buffs: [] };
    for (const primitive of Array.isArray(primitives) ? primitives : []) {
        if (!primitive || typeof primitive !== 'object') continue;
        if (primitive.tipo === 'aplicaStatus') {
            for (const target of targets)
                results.status.push(
                    await aplicarStatusPrimitive({ primitive, target, runtime })
                );
        } else if (primitive.tipo === 'cura') {
            results.heals.push(await curaPrimitive({ primitive, actor, runtime }));
        } else if (primitive.tipo === 'buff') {
            results.buffs.push(await buffPrimitive({ primitive, actor, runtime }));
        }
    }
    return results;
}