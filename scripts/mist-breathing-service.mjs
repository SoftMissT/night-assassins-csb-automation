/**
 * Estado e planos executáveis da Respiração da Névoa.
 *
 * Ponto arquitetural central (ver `RESPIRACAO-NEVOA-IMPLEMENTACAO.md`): os
 * três Padrões da Névoa ("Ciclone", "Estigma", "Reflexão") separam duas
 * responsabilidades que NÃO podem compartilhar um único booleano:
 *   - `earned`           → o Padrão foi conquistado (permanece mesmo depois
 *                           de usar o benefício; alimenta o Colapso na 6ª Forma).
 *   - `benefitAvailable` → o benefício concreto (técnica grátis / atordoar /
 *                           Recuperação com Vantagem) ainda não foi gasto e
 *                           ainda está dentro da janela "próximo turno".
 * Consumir o benefício NUNCA apaga `earned`. Ver seção "Padrões" da doc.
 */
import { parseNumber } from './parsing.mjs';
import { mistFormById } from './mist-breathing-data.mjs';

const PATTERN_KEYS = ['cyclone', 'stigma', 'reflection'];

function emptyPattern() {
    return { earned: false, benefitAvailable: false, turnsRemaining: 0 };
}

function emptyState() {
    return {
        version: 1,
        skySuspended: null,
        patterns: { cyclone: emptyPattern(), stigma: emptyPattern(), reflection: emptyPattern() },
        mistSea: null,
        moonMist: null,
        fog: null,
        obfuscation: null,
        resistanceSuppression: {},
    };
}

/**
 * Normaliza um estado de `resp_nevoa_estado`, tolerando o schema legado em
 * que `patterns.<nome>` era um booleano simples. Um Padrão legado `true` é
 * migrado para `{ earned: true, benefitAvailable: true }` (o benefício ainda
 * não tinha sido diferenciado, então assume-se disponível até a próxima
 * ativação/tick apagar).
 */
function normalizePatterns(rawPatterns) {
    const patterns = {
        cyclone: emptyPattern(),
        stigma: emptyPattern(),
        reflection: emptyPattern(),
    };
    if (!rawPatterns || typeof rawPatterns !== 'object') return patterns;
    for (const key of PATTERN_KEYS) {
        const raw = rawPatterns[key];
        if (raw === true) {
            patterns[key] = { earned: true, benefitAvailable: true, turnsRemaining: 1 };
        } else if (raw && typeof raw === 'object') {
            patterns[key] = {
                earned: raw.earned === true,
                benefitAvailable: raw.benefitAvailable === true,
                turnsRemaining: Math.max(0, Math.trunc(parseNumber(raw.turnsRemaining))),
            };
        }
    }
    return patterns;
}

export function normalizeMistBreathingState(raw) {
    let parsed = raw;
    if (typeof raw !== 'object' || raw === null) {
        try {
            parsed = JSON.parse(String(raw || '{}'));
        } catch (_) {
            parsed = {};
        }
    }
    if (!parsed || typeof parsed !== 'object') parsed = {};
    const base = emptyState();
    return {
        ...base,
        ...structuredClone(parsed),
        version: 1,
        patterns: normalizePatterns(parsed.patterns),
    };
}

// Alias mantido por compatibilidade com o resto do runtime.
export const parseMistBreathingState = normalizeMistBreathingState;

export function mistStatePatch(state, overrides = {}) {
    const normalized = normalizeMistBreathingState(state);
    return { 'system.props.resp_nevoa_estado': JSON.stringify(normalized), ...overrides };
}

/** Conta quantos Padrões foram CONQUISTADOS (earned), não quantos têm benefício disponível. */
export function mistPatternCount(state) {
    const normalized = normalizeMistBreathingState(state);
    return PATTERN_KEYS.filter((key) => normalized.patterns[key].earned).length;
}

/**
 * Concede um Padrão da Névoa: marca `earned = true` (permanente, não expira)
 * e `benefitAvailable = true` com uma janela de 1 tick (o próximo turno do
 * usuário), conforme "este status permanece mesmo após aplicar o efeito".
 */
export function grantMistPattern(state, pattern) {
    if (!PATTERN_KEYS.includes(pattern)) return normalizeMistBreathingState(state);
    const normalized = normalizeMistBreathingState(state);
    normalized.patterns[pattern] = { earned: true, benefitAvailable: true, turnsRemaining: 1 };
    return normalized;
}

/**
 * Consome o BENEFÍCIO de um Padrão (a técnica grátis do Ciclone, o atordoar
 * da Estigma, a Recuperação com Vantagem da Reflexão) sem apagar `earned`.
 */
export function consumeMistPatternBenefit(state, pattern) {
    if (!PATTERN_KEYS.includes(pattern)) return normalizeMistBreathingState(state);
    const normalized = normalizeMistBreathingState(state);
    if (!normalized.patterns[pattern].benefitAvailable) return normalized;
    normalized.patterns[pattern] = {
        ...normalized.patterns[pattern],
        benefitAvailable: false,
        turnsRemaining: 0,
    };
    return normalized;
}

export function consumeMistPending(state, { hit = false, damage = false } = {}) {
    const next = normalizeMistBreathingState(state);
    if (hit) delete next.nextHit;
    if (damage) delete next.pendingDamage;
    return next;
}

export function resolveMistFormula(formula, props = {}, extra = {}) {
    const values = {
        sab: parseNumber(props.sab_display),
        fdv: parseNumber(props.fdv_display),
        dex: parseNumber(props.dex_display),
        for: parseNumber(props.for_display),
        car: parseNumber(props.car_display),
        level: Math.max(1, Math.trunc(parseNumber(extra.level ?? props.nvl_num))),
    };
    return String(formula ?? '').replace(/@(sab|fdv|dex|for|car|level)\b/giu, (_match, key) =>
        String(values[String(key).toLowerCase()] ?? 0)
    );
}

/**
 * Resolve o resultado da 2ª Forma (Névoa de Oito Camadas): 5 rolagens de
 * Acerto independentes já foram feitas pelo chamador (hit-service). Aqui só
 * traduzimos a contagem de acertos em modo de dano — nunca dano fixo por
 * acerto abaixo de 3 sucessos, e dano fixo TOTAL (não por acerto) a partir
 * de 3 sucessos.
 */
export function resolveEightLayersResult(state, hits) {
    const count = Math.max(0, Math.min(5, Math.trunc(parseNumber(hits))));
    let next = normalizeMistBreathingState(state);
    if (count === 5) next = grantMistPattern(next, 'cyclone');
    return {
        hits: count,
        mode: count >= 3 ? 'fixed' : count > 0 ? 'weapon-per-hit' : 'none',
        formula: count >= 3 ? String(state?.eightLayers?.damage ?? '') : '',
        weaponRolls: count >= 3 ? 0 : count,
        state: next,
    };
}

/**
 * Resolve a redução de dano da 3ª Forma (Expansão de Névoa).
 *
 * DECISÃO DO OPERADOR — EMPATE: a fonte só define "maior → anula" e
 * "menor → subtrai"; a regra geral de Críticos do sistema estabelece que
 * defesa sempre ganha de ataque em empate. Empate (`reduction === incoming`)
 * é tratado como sucesso total (mesmo resultado de "maior"): nega o dano.
 */
export function resolveMistReduction(incomingDamage, rolledReduction) {
    const incoming = Math.max(0, Math.trunc(parseNumber(incomingDamage)));
    const reduction = Math.max(0, Math.trunc(parseNumber(rolledReduction)));
    const negated = reduction >= incoming;
    return {
        incoming,
        reduction,
        negated,
        finalDamage: negated ? 0 : Math.max(0, incoming - reduction),
    };
}

/** Constrói o flag de Anulação de Resistências (Sinergia da 4ª Forma). Não apaga resistências, só as suprime por N turnos. */
export function buildMistResistanceSuppressionFlag(sourceActorUuid, turns) {
    return {
        sourceActorUuid: String(sourceActorUuid ?? ''),
        turns: Math.max(0, Math.trunc(parseNumber(turns))),
    };
}

export function buildMistBreathingPlan(formId, level, props = {}, choices = {}) {
    const form = mistFormById(formId);
    const selected = form?.levels?.[level - 1];
    if (!form || !selected)
        return { ok: false, noCost: true, reason: 'Forma indisponível neste Nível de Respiração.' };
    const state = normalizeMistBreathingState(props.resp_nevoa_estado);
    const sab = parseNumber(props.sab_display);
    const fdv = parseNumber(props.fdv_display);
    const car = parseNumber(props.car_display);
    const slayerLevel = Math.max(1, Math.trunc(parseNumber(props.nvl_num ?? props.nvl_pj)));

    // Ciclone da Névoa: "durante qualquer momento de seu próximo turno, pode
    // conjurar qualquer técnica da Névoa sem gastar PDR". Isso isenta apenas o
    // custo BASE da técnica — custos extras opcionais (a Anulação de
    // Resistências da 4ª, o dobro da Reflexão na 5ª) continuam sendo pagos.
    // Ver DECISÃO PENDENTE DO OPERADOR — CICLONE E CUSTOS EXTRAS abaixo.
    const useCycloneFree =
        Boolean(choices.useCycloneFree) && state.patterns.cyclone.benefitAvailable;
    let baseCost = useCycloneFree ? 0 : selected.cost;
    let extraCost = 0;

    const base = { ok: true, form, selected, action: form.action, cost: 0, state, patch: {} };

    if (formId === 'nevoa_01') {
        // 1ª Forma — Céu Suspenso: NÃO causa dano imediato. Prepara o próximo
        // ATAQUE PADRÃO que acertar (efeito de contato, no máximo 1x por ação).
        // A fonte não define duração além de "próximo ataque padrão que
        // acertar" — não inventamos "fim do turno" aqui.
        state.skySuspended = {
            source: formId,
            level,
            damageBonus: { attribute: 'SAB', flat: level >= 2 ? level - 1 : 0 },
            consumeOn: 'successfulStandardAttack',
            contactUsesPerAction: 1,
        };
        state.pendingDamage = {
            source: formId,
            formula: resolveMistFormula(selected.bonus, props),
            uses: 1,
            contactOnce: true,
            standardAttackOnly: true,
        };
    } else if (formId === 'nevoa_02') {
        // 2ª Forma — Névoa de Oito Camadas: 5 ataques, 5 rolagens independentes,
        // +2 em cada uma. O modo de dano é resolvido depois via
        // resolveEightLayersResult, de acordo com o número de acertos.
        state.nextHit = { source: formId, count: 5, bonus: 2 };
        state.eightLayers = {
            threshold: 3,
            damage: selected.damage,
            weaponDamageBelowThreshold: true,
        };
    } else if (formId === 'nevoa_03') {
        // 3ª Forma — Expansão de Névoa: só reage a ataques À DISTÂNCIA.
        state.incomingReduction = {
            source: formId,
            formula: resolveMistFormula(selected.reduction, props, { level: slayerLevel }),
            rangedOnly: true,
            level: slayerLevel,
            sab: level >= 3 ? sab : 0,
        };
        if (choices.kekkijutsuReduced) state.patterns = grantMistPattern(state, 'stigma').patterns;
    } else if (formId === 'nevoa_04') {
        // 4ª Forma — Corte de Advecção: exige que a rolagem de origem JÁ seja
        // classificada como Vantagem (não a forma quem concede a Vantagem a si
        // mesma — ela só reaproveita o resultado de um acerto que já teve
        // Vantagem por outra via). O dano SUBSTITUI, nunca soma.
        if (!choices.advantageAttack)
            return { ok: false, noCost: true, reason: 'Exige um ataque com Vantagem.' };
        let suppressionTurns = 0;
        if (choices.suppressResistance) {
            extraCost += 1;
            const chosenAttribute =
                choices.suppressAttribute === 'for'
                    ? parseNumber(props.for_display)
                    : parseNumber(props.dex_display);
            suppressionTurns = Math.max(0, Math.trunc(chosenAttribute));
        }
        state.pendingDamage = {
            source: formId,
            formula: selected.damage,
            uses: 1,
            replaceWeaponDamage: true,
            suppressResistanceTurns: suppressionTurns,
        };
    } else if (formId === 'nevoa_05') {
        // 5ª Forma — Mar de Nuvens Neblinadas: Vantagem sempre concedida
        // (independente do teste), vinculada ao inimigo por UUID quando
        // disponível. Reflexão da Névoa exige pagar o DOBRO do custo TOTAL.
        if (choices.doubleCost) baseCost *= 2;
        state.mistSea = {
            source: formId,
            saveDc: selected.saveDc.replace('@sab', String(sab)),
            targetUuid: String(choices.targetUuid ?? ''),
            halfDamageOnFail: true,
            normalDamageOnPass: true,
        };
        state.incomingHalfOnFailedSave = {
            source: formId,
            saveDc: selected.saveDc.replace('@sab', String(sab)),
            advantageNextHit: true,
        };
        state.nextHit = {
            source: formId,
            advantage: true,
            targetUuid: String(choices.targetUuid ?? ''),
        };
        if (choices.doubleCost) state.patterns = grantMistPattern(state, 'reflection').patterns;
    } else if (formId === 'nevoa_06') {
        // 6ª Forma — Névoa sob o Luar: "Apenas por declarar o uso, gasta 2 PDR"
        // — o custo de DECLARAÇÃO é cobrado mesmo se o teste de DEX falhar
        // (commitment point específico desta Forma; ver seção 53 da missão).
        if (choices.dexCheckPassed === false) {
            state.dexFailed = true;
            delete state.moonMist;
            delete state.nextHit;
            delete state.pendingDamage;
            state.collapse = false;
        } else {
            delete state.dexFailed;
            const extraAttacks = Math.max(0, Math.trunc(parseNumber(choices.extraAttacks)));
            extraCost += extraAttacks;
            // Colapso da Névoa: precisa dos 3 Padrões CONQUISTADOS (earned), não
            // dos benefícios ainda disponíveis — usar um benefício de um Padrão
            // não desqualifica o Padrão para o Colapso.
            const collapseEligible = mistPatternCount(state) === 3;
            state.moonMist = {
                source: formId,
                active: true,
                round: choices.round ?? null,
                turn: choices.turn ?? null,
                hitBonusAttribute: 'SAB',
            };
            state.nextHit = {
                source: formId,
                count: 1 + extraAttacks,
                bonus: sab,
                stopOnMiss: true,
                criticalBonus: collapseEligible ? fdv : 0,
            };
            state.pendingDamage = collapseEligible
                ? {
                      source: formId,
                      formula: '@sab',
                      uses: 1 + extraAttacks,
                      criticalFormula: '@fdv',
                  }
                : undefined;
            state.collapse = collapseEligible;
            // DECISÃO DO OPERADOR — COLAPSO NÃO CONSOME OS PADRÕES: o Colapso só
            // lê os 3 Padrões `earned` para escalar seu próprio efeito (SAB no
            // dano + FDV em crítico); os Padrões continuam disponíveis depois.
        }
    } else if (formId === 'nevoa_07') {
        if (choices.opposedPassed === false)
            return { ok: false, noCost: false, reason: 'O teste oposto de SAB falhou.' };
        const turns = Math.max(3, Math.trunc(car));
        // DECISÃO PENDENTE DO OPERADOR — ESCOPO DA NEBLINA: a fonte fala em
        // "Teste de SAB vs. SAB do inimigo", mas os bônus concedidos (Acerto,
        // Dano, Esquiva, Bloqueio) são todos sobre o USUÁRIO. Mantivemos o
        // comportamento herdado do runtime anterior (bônus global do usuário,
        // não restrito ao inimigo testado) porque não há contrato inequívoco
        // que diga o contrário; `enemyUuid` fica registrado para permitir uma
        // implementação target-specific no futuro sem quebrar o estado salvo.
        state.fog = {
            source: formId,
            turns,
            bonus: selected.bonus,
            enemyUuid: String(choices.targetUuid ?? ''),
        };
    } else if (formId === 'nevoa_08') {
        state.obfuscation = {
            source: formId,
            turns: 5,
            targetUuid: String(choices.targetUuid ?? ''),
            allyUuid: String(choices.allyUuid ?? ''),
            hitPenalty: selected.hitPenalty,
            hitBonus: selected.hitBonus ?? 0,
            exhaustionImmune: true,
            criticalImmunity: Boolean(selected.criticalImmunity),
        };
        // Mantido também em `dazzle` (nome legado usado por hit-service.mjs e
        // damage-service.mjs) para não exigir reescrever a leitura nesses dois
        // arquivos; ambos os campos ficam sincronizados.
        state.dazzle = { ...state.obfuscation };
    }

    base.cost = baseCost + extraCost;

    Object.assign(
        base.patch,
        mistStatePatch(state, {
            'system.props.resp_nevoa_resumo': `Padrões ${mistPatternCount(state)}/3`,
            'system.props.resp_efeito_flag': `Névoa: ${form.name}`,
            'system.props.resp_efeito_duracao': state.fog?.turns ?? state.dazzle?.turns ?? 0,
            'system.props.resp_bonus_acerto_temp':
                state.fog?.bonus ?? state.dazzle?.hitBonus ?? state.nextHit?.bonus ?? 0,
            'system.props.resp_bonus_esquiva_temp': state.fog?.bonus ?? 0,
            'system.props.resp_bonus_bloqueio_temp': state.fog?.bonus ?? 0,
            'system.props.resp_bonus_dano_fixo': state.fog?.bonus ?? 0,
        })
    );
    if (useCycloneFree) {
        const consumed = consumeMistPatternBenefit(state, 'cyclone');
        base.state = consumed;
        base.patch['system.props.resp_nevoa_estado'] = JSON.stringify(consumed);
        base.patch['system.props.resp_nevoa_resumo'] = `Padrões ${mistPatternCount(consumed)}/3`;
    }
    return base;
}

/**
 * Consome o benefício de Estigma da Névoa (atordoar) quando o usuário
 * acerta qualquer ataque durante a janela do próximo turno. Retorna o novo
 * estado (benefício gasto, `earned` preservado) e os dados para aplicar o
 * status "atordoamento" no alvo.
 */
export function resolveMistStigmaStunOnHit(rawState) {
    const state = normalizeMistBreathingState(rawState);
    if (!state.patterns.stigma.benefitAvailable) return { applied: false, state };
    return {
        applied: true,
        state: consumeMistPatternBenefit(state, 'stigma'),
        effect: { remainingTurns: 1, tick: 'start', sourceName: 'San no Kata Kasan no Shibuki' },
    };
}

/** Consome o benefício de Reflexão da Névoa (Recuperação com Vantagem no próximo turno). */
export function resolveMistReflectionRecoveryAvailable(rawState) {
    const state = normalizeMistBreathingState(rawState);
    if (!state.patterns.reflection.benefitAvailable) return { available: false, state };
    return { available: true, state: consumeMistPatternBenefit(state, 'reflection') };
}

export function tickMistBreathing(raw) {
    const state = normalizeMistBreathingState(raw);
    for (const key of ['fog', 'dazzle', 'obfuscation']) {
        if (state[key]?.turns > 0) {
            state[key].turns -= 1;
            if (state[key].turns <= 0) delete state[key];
        }
    }
    // Névoa sob o Luar ("+SAB em todos os ataques do turno") expira ao fim do
    // turno do próprio usuário — este tick roda na troca de turno de combate,
    // então qualquer moonMist pendente aqui já passou do seu turno.
    delete state.moonMist;
    for (const key of PATTERN_KEYS) {
        const pattern = state.patterns[key];
        if (pattern.benefitAvailable && pattern.turnsRemaining > 0) {
            pattern.turnsRemaining -= 1;
            if (pattern.turnsRemaining <= 0) pattern.benefitAvailable = false; // earned permanece.
        }
    }
    return mistStatePatch(state, {
        'system.props.resp_efeito_duracao': state.fog?.turns ?? state.dazzle?.turns ?? 0,
        'system.props.resp_bonus_acerto_temp':
            state.fog?.bonus ?? state.dazzle?.hitBonus ?? state.nextHit?.bonus ?? 0,
        'system.props.resp_bonus_esquiva_temp': state.fog?.bonus ?? 0,
        'system.props.resp_bonus_bloqueio_temp': state.fog?.bonus ?? 0,
        'system.props.resp_bonus_dano_fixo': state.fog?.bonus ?? 0,
    });
}

/**
 * Limpa os efeitos de combate da Névoa ao fim do combate.
 *
 * DECISÃO DO OPERADOR — PADRÕES AO FIM DO COMBATE: os 3 Padrões
 * (Ciclone/Estigma/Reflexão) resetam em `combatEnd`, mesmo padrão de
 * Quebra (Pedra) e Esquentar (Chamas) nenhum acúmulo de combate sobrevive
 * ao fim do combate.
 */
export function clearMistBreathingState(rawState) {
    const next = emptyState();
    return mistStatePatch(next, {
        'system.props.resp_nevoa_resumo': `Padrões ${mistPatternCount(next)}/3`,
        'system.props.resp_efeito_duracao': 0,
        'system.props.resp_bonus_acerto_temp': 0,
        'system.props.resp_bonus_esquiva_temp': 0,
        'system.props.resp_bonus_bloqueio_temp': 0,
        'system.props.resp_bonus_dano_fixo': 0,
    });
}
