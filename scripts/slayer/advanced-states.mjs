/**
 * @fileoverview Motor dos estados avançados do Slayer: Mundo Transparente,
 * Lâmina Carmesim e Estado Altruísta.
 *
 * As regras são funções puras e testáveis; a persistência segue o contrato do
 * módulo (um JSON em `estados_slayer_dados` + resumo legível em
 * `estados_slayer_resumo`). Os hooks de combate controlam rodadas, rastro,
 * estresse, Foco, Alvos Lidos e a limpeza ao encerrar combate. Os bônus são
 * resolvidos por consulta (`mundoBonuses`, `altruistaFirstAttack`, ...) para a
 * camada de acerto/defesa/dano aplicar a partir de atacante, defensor e alvo.
 */

import { MODULE_ID } from '../constants.mjs';
import { parseNumber } from '../parsing.mjs';
import { consumeSlayerActions } from '../action-service.mjs';
import { parseStatusState, saveSlayerStatuses } from '../status-service.mjs';

export const READING_ATTRIBUTES = Object.freeze(['INT', 'SAB', 'FDV']);
export const LAMINA_RASTRO_MAX = 4;
export const LAMINA_ESTRESSE_MAX = 6;
export const ALTRIUSTA_DURACAO_RODADAS = 3;
export const ALTRIUSTA_CUSTO_PDR = 4;
export const FOCO_CUSTO_PDR = 3;
export const FOCO_EXTRA_CD_BASE = 12;

const CONTRACT = Object.freeze({
    data: 'estados_slayer_dados',
    summary: 'estados_slayer_resumo',
});

const TURN_FLAG = 'lastAdvancedStatesTurn';

function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, integer(value, min)));
}

/**
 * Grau do Mundo Transparente conforme o nível.
 * @param {number} level
 * @returns {number} 0 (não despertado), 1 (nível 7), 2 (nível 10) ou 3 (nível 11).
 */
export function mundoTransparenteGrade(level) {
    const normalized = integer(level);
    if (normalized >= 11) return 3;
    if (normalized >= 10) return 2;
    if (normalized >= 7) return 1;
    return 0;
}

/**
 * Usos seguros de Foco Transparente por combate: metade do Atributo de Leitura,
 * arredondado para baixo, mínimo 1.
 * @param {number} readingAttr
 * @returns {number}
 */
export function mundoSafeFocusUses(readingAttr) {
    return Math.max(1, Math.floor(integer(readingAttr) / 2));
}

/**
 * CD de um uso extra de Foco: 12 + quantidade de usos extras já feitos + 1.
 * O primeiro uso extra é CD 13.
 * @param {number} extrasUsed Usos extras já concluídos.
 * @returns {number}
 */
export function mundoFocusExtraDc(extrasUsed) {
    return FOCO_EXTRA_CD_BASE + 1 + Math.max(0, integer(extrasUsed));
}

/**
 * Bônus do Mundo Transparente contra um alvo.
 * @param {object} options
 * @param {number} options.grade Grau 0–3.
 * @param {boolean} options.isRead Se o alvo é Alvo Lido.
 * @param {boolean} [options.hasFocus] Se o Foco Transparente está ativo contra o alvo.
 * @returns {object} Bônus de acerto/esquiva/bloqueio, crítico, vantagens e Ponto Vital.
 */
export function mundoBonuses({ grade, isRead, hasFocus = false } = {}) {
    const g = clamp(grade, 0, 3);
    if (!isRead || g < 1) {
        return Object.freeze({
            attack: 0,
            dodge: 0,
            block: 0,
            critImprovement: 0,
            advantageFirstAttack: false,
            advantageDefense: false,
            perfectDefenseMargin: null,
            pontoVital: false,
        });
    }
    const bonus = hasFocus ? 2 : 1;
    return Object.freeze({
        attack: bonus,
        dodge: bonus,
        block: bonus,
        critImprovement: g >= 2 ? 1 : 0,
        advantageFirstAttack: g >= 2 && hasFocus,
        advantageDefense: g >= 3,
        perfectDefenseMargin: g >= 3 ? 3 : null,
        pontoVital: g >= 2,
    });
}

/**
 * Perfil de Ignição da Lâmina Carmesim.
 * @param {"sangue"|"atrito"|"pressao"} method
 * @returns {object} Perfil com custo, rastro e estresse iniciais.
 */
export function laminaIgnitionProfile(method) {
    if (method === 'sangue') {
        return Object.freeze({
            method: 'sangue',
            acao: 'especial',
            custoPdv: '1d4',
            rastro: 1,
            estresseInicial: 1,
        });
    }
    if (method === 'atrito') {
        return Object.freeze({
            method: 'atrito',
            acao: 'especial',
            custoPdr: 3,
            rastro: 2,
            estresseInicial: 1,
        });
    }
    if (method === 'pressao') {
        return Object.freeze({
            method: 'pressao',
            acao: 'especial',
            custoPdr: 5,
            rastro: 2,
            estresseInicial: 2,
            teste: Object.freeze({ atributo: 'VIT', cd: 16 }),
        });
    }
    return null;
}

/**
 * Efeitos do Rastro de Calor da Lâmina Carmesim.
 * @param {number} rastro Rastro 0–4.
 * @returns {object} Dano Solar, Cauterização e efeitos extras.
 */
export function laminaRastroEffects(rastro) {
    const r = clamp(rastro, 0, LAMINA_RASTRO_MAX);
    if (r === 1) return Object.freeze({ solarDice: '1d4', cauterizacao: 'ateFimProximoTurnoOni' });
    if (r === 2)
        return Object.freeze({
            solarDice: '1d6',
            cauterizacao: '2rodadas',
            movimento: Object.freeze({ cd: 14, perdeMetros: 3 }),
        });
    if (r === 3)
        return Object.freeze({
            solarDice: '2d6',
            cauterizacao: '3rodadas',
            solarAoBloquear: '1d6',
        });
    if (r === 4)
        return Object.freeze({
            solarDice: '3d6',
            cauterizacao: 'ateFimCombate',
            ignoraMetadeRD: true,
        });
    return Object.freeze({ solarDice: '', cauterizacao: null });
}

/**
 * Combustão Final: sacrifício voluntário da arma em Rastro 3 ou 4.
 * @returns {object} Regras do ataque de sacrifício.
 */
export function laminaCombustaoFinal() {
    return Object.freeze({
        requisitoRastroMin: 3,
        criticoAutomatico: true,
        solarDice: '4d10',
        ignoraRD: true,
        cauterizacao: 'ateFimCombate',
        colapsoAposAtaque: true,
    });
}

/**
 * CD do Despertar do Estado Altruísta.
 * @param {boolean} escalado CD 18 quando a cena envolver trauma pessoal, vingança ou ódio absoluto.
 * @returns {number}
 */
export function altruistaAwakenDc(escalado = false) {
    return escalado ? 18 : 16;
}

/**
 * Regras de ativação do Estado Altruísta em combate.
 * @returns {object}
 */
export function altruistaActivation() {
    return Object.freeze({
        acao: 'especial',
        custoPdr: ALTRIUSTA_CUSTO_PDR,
        duracaoRodadas: ALTRIUSTA_DURACAO_RODADAS,
        umaVezPorCombate: true,
    });
}

/**
 * Efeito do primeiro ataque por rodada sob o Estado Altruísta.
 * @param {object} options
 * @param {boolean} options.ativo Se o estado está ativo.
 * @param {boolean} [options.inimigoLeIntencao] Se o alvo depende de ler intenção.
 * @returns {object} Sem reação inimiga e bônus de acerto contra leitores de intenção.
 */
export function altruistaFirstAttack({ ativo, inimigoLeIntencao = false } = {}) {
    if (!ativo) return Object.freeze({ semReacao: false, bonusAcerto: 0 });
    return Object.freeze({ semReacao: true, bonusAcerto: inimigoLeIntencao ? 2 : 0 });
}

/**
 * Regras do Corte Sem Ego.
 * @returns {object}
 */
export function altruistaCorteSemEgo() {
    return Object.freeze({
        custoPdr: 8,
        indefensavel: true,
        danoExtra: '3d6',
        umaVezPorPersonagem: true,
        pos: Object.freeze({ pdr: 0, exaustao: 2, fimEstado: true, travaAteDescansoN1: true }),
    });
}

/**
 * Estado inicial persistido dos estados avançados.
 * @returns {object}
 */
export function defaultAdvancedStates() {
    return {
        version: 1,
        mundo: {
            despertado: false,
            atributoLeitura: '',
            grau: 0,
            alvosLidos: {},
            focoAtivo: false,
            focoAlvoUuid: '',
            focoAlvoNome: '',
            usosSeguros: 0,
            usosFoco: 0,
            usosExtras: 0,
            pdrRecuperadoFoco: false,
            focoUsadoRodada: false,
            penalidadeAcerto: 0,
            penalidadeIntSab: false,
            penalidadeDistancia: false,
        },
        lamina: {
            ativa: false,
            rastro: 0,
            estresse: 0,
            colapso: false,
            superaquecida: false,
            pressaoTravada: false,
            usadoCombate: false,
        },
        altruista: {
            despertado: false,
            ativo: false,
            rodadasRestantes: 0,
            usadoCombate: false,
            corteLimpoUsado: false,
            corteSemEgoUsado: false,
            travadoDescansoN1: false,
        },
    };
}

function mergeState(base, parsed) {
    const state = defaultAdvancedStates();
    if (!parsed || typeof parsed !== 'object') return state;
    const mundo = parsed.mundo ?? {};
    const lamina = parsed.lamina ?? {};
    const altruista = parsed.altruista ?? {};
    state.mundo.despertado = Boolean(mundo.despertado);
    state.mundo.atributoLeitura = READING_ATTRIBUTES.includes(
        String(mundo.atributoLeitura ?? '').toUpperCase()
    )
        ? String(mundo.atributoLeitura).toUpperCase()
        : '';
    state.mundo.grau = clamp(mundo.grau, 0, 3);
    state.mundo.alvosLidos =
        mundo.alvosLidos && typeof mundo.alvosLidos === 'object' && !Array.isArray(mundo.alvosLidos)
            ? Object.fromEntries(
                  Object.entries(mundo.alvosLidos).map(([uuid, name]) => [
                      String(uuid).slice(0, 200),
                      String(name ?? uuid).slice(0, 120),
                  ])
              )
            : {};
    state.mundo.focoAtivo = Boolean(mundo.focoAtivo);
    state.mundo.focoAlvoUuid = String(mundo.focoAlvoUuid ?? '').slice(0, 200);
    state.mundo.focoAlvoNome = String(mundo.focoAlvoNome ?? '').slice(0, 120);
    state.mundo.usosSeguros = Math.max(0, integer(mundo.usosSeguros, 0));
    state.mundo.usosFoco = Math.max(0, integer(mundo.usosFoco, 0));
    state.mundo.usosExtras = Math.max(0, integer(mundo.usosExtras, 0));
    state.mundo.pdrRecuperadoFoco = Boolean(mundo.pdrRecuperadoFoco);
    state.mundo.focoUsadoRodada = Boolean(mundo.focoUsadoRodada);
    state.mundo.penalidadeAcerto = clamp(mundo.penalidadeAcerto, 0, 3);
    state.mundo.penalidadeIntSab = Boolean(mundo.penalidadeIntSab);
    state.mundo.penalidadeDistancia = Boolean(mundo.penalidadeDistancia);
    state.lamina.ativa = Boolean(lamina.ativa);
    state.lamina.rastro = clamp(lamina.rastro, 0, LAMINA_RASTRO_MAX);
    state.lamina.estresse = clamp(lamina.estresse, 0, LAMINA_ESTRESSE_MAX);
    state.lamina.colapso = Boolean(lamina.colapso);
    state.lamina.superaquecida = Boolean(lamina.superaquecida);
    state.lamina.pressaoTravada = Boolean(lamina.pressaoTravada);
    state.lamina.usadoCombate = Boolean(lamina.usadoCombate);
    state.altruista.despertado = Boolean(altruista.despertado);
    state.altruista.ativo = Boolean(altruista.ativo);
    state.altruista.rodadasRestantes = clamp(
        altruista.rodadasRestantes,
        0,
        ALTRIUSTA_DURACAO_RODADAS
    );
    state.altruista.usadoCombate = Boolean(altruista.usadoCombate);
    state.altruista.corteLimpoUsado = Boolean(altruista.corteLimpoUsado);
    state.altruista.corteSemEgoUsado = Boolean(altruista.corteSemEgoUsado);
    state.altruista.travadoDescansoN1 = Boolean(altruista.travadoDescansoN1);
    return state;
}

/**
 * Normaliza um valor persistido de `estados_slayer_dados`.
 * @param {unknown} value
 * @returns {object} Estado limpo e válido.
 */
export function parseAdvancedStates(value) {
    if (!value) return defaultAdvancedStates();
    try {
        let candidate = value;
        if (typeof candidate === 'string') {
            candidate = candidate
                .replace(/<[^>]*>/g, '')
                .replaceAll('&quot;', '"')
                .replaceAll('&#34;', '"')
                .replaceAll('&amp;', '&')
                .replaceAll('&nbsp;', ' ')
                .trim();
            const firstBrace = candidate.indexOf('{');
            const lastBrace = candidate.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace)
                candidate = candidate.slice(firstBrace, lastBrace + 1);
        }
        let parsed = typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return mergeState(defaultAdvancedStates(), parsed);
    } catch {
        return mergeState(defaultAdvancedStates(), value);
    }
}

/**
 * Resumo legível dos estados avançados para exibição na ficha.
 * @param {object} state
 * @returns {string}
 */
export function formatStatesSummary(state) {
    const s = parseAdvancedStates(state);
    const parts = [];
    if (s.mundo.despertado) {
        const focus = s.mundo.focoAtivo ? ` · Foco: ${s.mundo.focoAlvoNome || 'alvo'}` : '';
        parts.push(`Mundo Transparente Gr.${s.mundo.grau}${focus}`);
    }
    if (s.lamina.ativa)
        parts.push(`Lâmina Carmesim Rastro ${s.lamina.rastro} · Estresse ${s.lamina.estresse}`);
    else if (s.lamina.colapso) parts.push('Lâmina em Colapso');
    else if (s.lamina.superaquecida) parts.push('Lâmina Superaquecida');
    if (s.altruista.ativo) parts.push(`Estado Altruísta (${s.altruista.rodadasRestantes}r)`);
    else if (s.altruista.travadoDescansoN1) parts.push('Estado Altruísta travado');
    return parts.length > 0 ? parts.join(' · ') : 'Nenhum estado avançado';
}

/**
 * Lê o estado dos estados avançados de um Actor/objeto de props.
 * @param {object} props `actor.system.props`
 * @returns {object}
 */
export function readAdvancedStates(props = {}) {
    return parseAdvancedStates(props[CONTRACT.data]);
}

/**
 * Persiste o estado dos estados avançados no Actor.
 * @param {Actor} actor
 * @param {object} state
 * @returns {Promise<{state: object, summary: string}>}
 */
export async function saveAdvancedStates(actor, state) {
    if (!actor?.update) throw new Error('Actor inválido para salvar estados avançados.');
    const normalized = parseAdvancedStates(state);
    const summary = formatStatesSummary(normalized);
    await actor.update(
        {
            [`system.props.${CONTRACT.data}`]: JSON.stringify(normalized),
            [`system.props.${CONTRACT.summary}`]: summary,
        },
        { naCsbAutomation: true }
    );
    return { state: normalized, summary };
}

/**
 * Marca um alvo como Alvo Lido.
 * @param {object} state
 * @param {object} options
 * @param {string} options.alvoUuid UUID do Actor/Token alvo.
 * @param {string} [options.alvoNome] Nome para exibição.
 * @returns {object} Novo estado.
 */
export function lerAlvo(state, { alvoUuid, alvoNome = '' } = {}) {
    const s = parseAdvancedStates(state);
    const uuid = String(alvoUuid ?? '').trim();
    if (!uuid) return s;
    s.mundo.alvosLidos[uuid.slice(0, 200)] = String(alvoNome || uuid).slice(0, 120);
    return s;
}

/**
 * Verifica se um alvo é Alvo Lido.
 * @param {object} state
 * @param {string} alvoUuid
 * @returns {boolean}
 */
export function alvoLido(state, alvoUuid) {
    const s = parseAdvancedStates(state);
    return s.mundo.despertado && Object.hasOwn(s.mundo.alvosLidos, String(alvoUuid ?? ''));
}

/**
 * Tenta ativar o Foco Transparente contra um Alvo Lido.
 * @param {object} state
 * @param {object} options
 * @param {string} options.alvoUuid UUID do Alvo Lido.
 * @param {string} [options.alvoNome] Nome para exibição.
 * @param {number} options.grau Grau atual.
 * @returns {object} `{state, ok, reason, extraDc}` `extraDc` presente quando um
 * uso extra precisa de teste 1d20+FDV.
 */
export function ativarFoco(state, { alvoUuid, alvoNome = '', grau = 0 } = {}) {
    const s = parseAdvancedStates(state);
    if (!s.mundo.despertado || s.mundo.grau < 1)
        return { state: s, ok: false, reason: 'Mundo Transparente não despertado.' };
    if (s.mundo.focoAtivo) return { state: s, ok: false, reason: 'Foco já ativo.' };
    if (!Object.hasOwn(s.mundo.alvosLidos, String(alvoUuid ?? ''))) {
        return { state: s, ok: false, reason: 'O alvo precisa ser Alvo Lido.' };
    }
    const grade = clamp(grau, 0, 3) || s.mundo.grau;
    if (grade < 1) return { state: s, ok: false, reason: 'Grau insuficiente.' };
    const safe = Math.max(
        1,
        s.mundo.usosSeguros || mundoSafeFocusUses(parseNumber(s.mundo.atributoLeitura))
    );
    const activate = () => {
        s.mundo.focoAtivo = true;
        s.mundo.focoAlvoUuid = String(alvoUuid).slice(0, 200);
        s.mundo.focoAlvoNome = String(alvoNome || alvoUuid).slice(0, 120);
        s.mundo.focoUsadoRodada = true;
        s.mundo.usosFoco += 1;
        s.mundo.pdrRecuperadoFoco = false;
        return s;
    };
    if (s.mundo.usosFoco < safe) return { state: activate(), ok: true };
    s.mundo.focoAlvoUuid = String(alvoUuid).slice(0, 200);
    s.mundo.focoAlvoNome = String(alvoNome || alvoUuid).slice(0, 120);
    const extraDc = mundoFocusExtraDc(s.mundo.usosExtras);
    return { state: s, ok: true, extraDc };
}

/**
 * Aplica o resultado de um teste de uso extra do Foco.
 * @param {object} state
 * @param {object} options
 * @param {boolean} options.sucesso Se o teste 1d20+FDV passou na CD.
 * @param {number} [options.margemFalha] Margem da falha (10+ = falha crítica).
 * @returns {object} `{state, ativou}` ativou quando o uso extra foi concedido.
 */
export function focoUsoExtra(state, { sucesso, margemFalha = 0 } = {}) {
    const s = parseAdvancedStates(state);
    s.mundo.usosExtras += 1;
    if (sucesso) {
        s.mundo.focoAtivo = true;
        s.mundo.focoUsadoRodada = true;
        s.mundo.usosFoco += 1;
        s.mundo.pdrRecuperadoFoco = false;
        return { state: s, ativou: true };
    }
    s.mundo.penalidadeAcerto = clamp(s.mundo.penalidadeAcerto, 0, 1) + 1;
    s.mundo.penalidadeIntSab = true;
    const margem = Math.max(0, integer(margemFalha));
    if (margem >= 10) {
        s.mundo.penalidadeDistancia = true;
    }
    return { state: s, ativou: false };
}

/**
 * Tenta ativar a Lâmina Carmesim por um método de Ignição.
 * @param {object} state
 * @param {object} options
 * @param {"sangue"|"atrito"|"pressao"} options.method Método de Ignição.
 * @param {boolean} options.cenaOk Marca ativa, PDV abaixo de 25% ou cena extrema aprovada.
 * @param {number} options.pdr PDR disponível.
 * @param {number} options.level Nível do personagem.
 * @returns {object} `{state, ok, reason, teste}` `teste` presente no método
 * Pressão (VIT CD 16). `falhou` marca pressão travada no combate.
 */
export function ativarLamina(state, { method, cenaOk = false, pdr = 0, level = 0 } = {}) {
    const s = parseAdvancedStates(state);
    if (integer(level) < 10)
        return { state: s, ok: false, reason: 'Requer Exterminador nível 10 ou maior.' };
    if (s.lamina.ativa) return { state: s, ok: false, reason: 'Lâmina já ativa.' };
    if (s.lamina.colapso) return { state: s, ok: false, reason: 'Lâmina em Colapso.' };
    if (s.lamina.superaquecida)
        return { state: s, ok: false, reason: 'Lâmina Superaquecida não pode ativar.' };
    const profile = laminaIgnitionProfile(method);
    if (!profile) return { state: s, ok: false, reason: 'Método de Ignição inválido.' };
    if (profile.method === 'pressao' && s.lamina.pressaoTravada) {
        return { state: s, ok: false, reason: 'Pressão já falhou neste combate.' };
    }
    if (profile.method === 'pressao' && !cenaOk) {
        return {
            state: s,
            ok: false,
            reason: 'Pressão exige Marca ativa, PDV abaixo de 25% ou cena extrema.',
        };
    }
    if (profile.custoPdr !== undefined && integer(pdr) < profile.custoPdr) {
        return { state: s, ok: false, reason: 'PDR insuficiente para a Ignição.' };
    }
    if (profile.method === 'pressao') {
        return { state: s, ok: true, teste: profile.teste };
    }
    s.lamina.ativa = true;
    s.lamina.rastro = profile.rastro;
    s.lamina.estresse = clamp(profile.estresseInicial + s.lamina.estresse, 0, LAMINA_ESTRESSE_MAX);
    s.lamina.usadoCombate = true;
    return { state: s, ok: true };
}

/**
 * Aplica o resultado do teste VIT CD 16 da Ignição por Pressão.
 * @param {object} state
 * @param {boolean} sucesso
 * @returns {object} `{state, ativou, danoSolarInterno}` em falha, aplica 1d6 de
 * Dano Solar interno e trava Pressão no combate.
 */
export function laminaPressaoResultado(state, { sucesso } = {}) {
    const s = parseAdvancedStates(state);
    const profile = laminaIgnitionProfile('pressao');
    if (sucesso) {
        s.lamina.ativa = true;
        s.lamina.rastro = profile.rastro;
        s.lamina.estresse = clamp(
            profile.estresseInicial + s.lamina.estresse,
            0,
            LAMINA_ESTRESSE_MAX
        );
        s.lamina.usadoCombate = true;
        return { state: s, ativou: true, danoSolarInterno: 0 };
    }
    s.lamina.pressaoTravada = true;
    return { state: s, ativou: false, danoSolarInterno: '1d6' };
}

/**
 * Apaga a Lâmina Carmesim (Ação Livre no início do turno). A arma fica
 * Superaquecida até o fim da cena ou 10 minutos.
 * @param {object} state
 * @returns {object} Novo estado.
 */
export function apagarLamina(state) {
    const s = parseAdvancedStates(state);
    if (!s.lamina.ativa) return s;
    s.lamina.ativa = false;
    s.lamina.rastro = 0;
    s.lamina.superaquecida = true;
    return s;
}

/**
 * Estado Altruísta tenta ativar em combate.
 * @param {object} state
 * @param {number} pdr PDR disponível.
 * @returns {object} `{state, ok, reason}`
 */
export function ativarAltruista(state, { pdr = 0 } = {}) {
    const s = parseAdvancedStates(state);
    if (!s.altruista.despertado)
        return { state: s, ok: false, reason: 'Estado Altruísta não despertado.' };
    if (s.altruista.ativo) return { state: s, ok: false, reason: 'Estado já ativo.' };
    if (s.altruista.usadoCombate)
        return { state: s, ok: false, reason: 'Já ativado neste combate.' };
    if (s.altruista.travadoDescansoN1)
        return { state: s, ok: false, reason: 'Travado até um Descanso Completo Nível 1.' };
    if (integer(pdr) < ALTRIUSTA_CUSTO_PDR)
        return { state: s, ok: false, reason: 'PDR insuficiente.' };
    s.altruista.ativo = true;
    s.altruista.rodadasRestantes = ALTRIUSTA_DURACAO_RODADAS;
    s.altruista.usadoCombate = true;
    s.altruista.corteLimpoUsado = false;
    return { state: s, ok: true };
}

/**
 * Aplica o Corte Sem Ego (uma vez por personagem).
 * @param {object} state
 * @param {number} pdr PDR disponível.
 * @returns {object} `{state, ok, reason}` em sucesso, marca como usado e devolve
 * o estado pós-uso (PDR 0, +2 Exaustão, estado encerrado e travado).
 */
export function corteSemEgo(state, { pdr = 0 } = {}) {
    const s = parseAdvancedStates(state);
    if (!s.altruista.ativo)
        return { state: s, ok: false, reason: 'Requer Estado Altruísta ativo.' };
    if (s.altruista.corteSemEgoUsado)
        return { state: s, ok: false, reason: 'Corte Sem Ego já usado por este personagem.' };
    if (integer(pdr) < 8) return { state: s, ok: false, reason: 'PDR insuficiente (8).' };
    s.altruista.corteSemEgoUsado = true;
    s.altruista.ativo = false;
    s.altruista.rodadasRestantes = 0;
    s.altruista.travadoDescansoN1 = true;
    return { state: s, ok: true, custoPdr: 8 };
}

/**
 * Aplica a rodada: início (rastro +1, Foco expira, Corte Limpo resetado) e fim
 * (estresse +1, rodadas do Altruísta -1, Colapso ao atingir 6 estresses).
 * @param {object} state
 * @param {"start"|"end"} timing
 * @returns {object} `{state, changed, messages}`
 */
export function processarRodadaEstados(state, timing = 'start') {
    const s = parseAdvancedStates(state);
    const messages = [];
    let changed = false;
    if (timing === 'start') {
        if (s.lamina.ativa) {
            s.lamina.rastro = Math.min(LAMINA_RASTRO_MAX, s.lamina.rastro + 1);
            messages.push(`Lâmina Carmesim: Rastro ${s.lamina.rastro}`);
            changed = true;
        }
        if (s.mundo.focoAtivo) {
            s.mundo.focoAtivo = false;
            s.mundo.focoAlvoUuid = '';
            s.mundo.focoAlvoNome = '';
            s.mundo.focoUsadoRodada = false;
            messages.push('Foco Transparente expirou');
            changed = true;
        }
        if (s.altruista.ativo && s.altruista.corteLimpoUsado) {
            s.altruista.corteLimpoUsado = false;
            changed = true;
        }
    } else if (timing === 'end') {
        if (s.lamina.ativa) {
            s.lamina.estresse = Math.min(LAMINA_ESTRESSE_MAX, s.lamina.estresse + 1);
            if (s.lamina.estresse >= LAMINA_ESTRESSE_MAX) {
                s.lamina.ativa = false;
                s.lamina.rastro = 0;
                s.lamina.colapso = true;
                messages.push(
                    'Colapso Carmesim: a arma fica inutilizável até reparo especializado.'
                );
            } else {
                messages.push(
                    `Lâmina Carmesim: Estresse ${s.lamina.estresse}/${LAMINA_ESTRESSE_MAX}`
                );
            }
            changed = true;
        }
        if (s.altruista.ativo) {
            s.altruista.rodadasRestantes = Math.max(0, s.altruista.rodadasRestantes - 1);
            if (s.altruista.rodadasRestantes <= 0) {
                s.altruista.ativo = false;
                messages.push('Estado Altruísta terminou.');
            } else {
                messages.push(
                    `Estado Altruísta: ${s.altruista.rodadasRestantes} rodada(s) restante(s)`
                );
            }
            changed = true;
        }
    }
    return { state: s, changed, messages };
}

/**
 * Limpa os marcadores por combate, preservando o que persiste entre combates
 * (despertar, atributo de leitura, estresse e colapso da arma, Corte Sem Ego e
 * travas de Descanso Completo Nível 1).
 * @param {object} state
 * @returns {object} Estado limpo.
 */
export function resetPerCombate(state) {
    const s = parseAdvancedStates(state);
    s.mundo.alvosLidos = {};
    s.mundo.focoAtivo = false;
    s.mundo.focoAlvoUuid = '';
    s.mundo.focoAlvoNome = '';
    s.mundo.usosFoco = 0;
    s.mundo.usosExtras = 0;
    s.mundo.pdrRecuperadoFoco = false;
    s.mundo.focoUsadoRodada = false;
    s.mundo.penalidadeAcerto = 0;
    s.mundo.penalidadeIntSab = false;
    s.mundo.penalidadeDistancia = false;
    s.lamina.ativa = false;
    s.lamina.rastro = 0;
    s.lamina.pressaoTravada = false;
    s.lamina.usadoCombate = false;
    s.altruista.ativo = false;
    s.altruista.rodadasRestantes = 0;
    s.altruista.usadoCombate = false;
    s.altruista.corteLimpoUsado = false;
    return s;
}

function isPrimaryGm() {
    return game.user?.isGM;
}

/**
 * Processa o início ou fim de turno de um Actor com estados avançados.
 * @param {Actor} actor
 * @param {"start"|"end"} timing
 * @returns {Promise<object>}
 */
export async function processAdvancedStatesTiming(actor, timing = 'start') {
    if (!actor?.update) return { processed: false, reason: 'actor-invalid' };
    const props = actor.system?.props ?? {};
    if (props[CONTRACT.data] === undefined && props[CONTRACT.summary] === undefined) {
        return { processed: false, reason: 'sem-estados' };
    }
    const { state, changed, messages } = processarRodadaEstados(props[CONTRACT.data], timing);
    if (!changed) return { processed: true, messages: [] };
    await saveAdvancedStates(actor, state);
    if (messages.length) {
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<strong>Estados avançados ${actor.name}</strong><br>${messages.join('<br>')}`,
        });
    }
    return { processed: true, messages };
}

async function processCurrentTurn(combat) {
    if (!isPrimaryGm() || !combat?.started) return;
    const combatant = combat.combatant;
    const actor = combatant?.actor;
    if (!actor?.system?.props) return;
    const key = `${combat.id}:${combat.round}:${combat.turn}:${combatant.id}`;
    const previousKey = combat.getFlag(MODULE_ID, TURN_FLAG);
    if (previousKey === key) return;
    const previousCombatantId = String(previousKey ?? '')
        .split(':')
        .at(-1);
    const previousActor = previousCombatantId
        ? combat.combatants.get(previousCombatantId)?.actor
        : null;
    if (previousActor?.system?.props) await processAdvancedStatesTiming(previousActor, 'end');
    await combat.setFlag(MODULE_ID, TURN_FLAG, key);
    await processAdvancedStatesTiming(actor, 'start');
}

async function clearCombatStates(combat) {
    if (!isPrimaryGm() || !combat?.combatants) return;
    const updates = [...combat.combatants]
        .map((combatant) => combatant?.actor)
        .filter((actor) => actor?.system?.props?.[CONTRACT.data] !== undefined)
        .map((actor) =>
            saveAdvancedStates(actor, resetPerCombate(actor.system.props[CONTRACT.data]))
        );
    await Promise.allSettled(updates);
}

/**
 * Registra os hooks de combate do motor de estados avançados.
 * @returns {void}
 */
export function registerAdvancedStatesEngine() {
    Hooks.on('combatStart', (combat) => void processCurrentTurn(combat));
    Hooks.on('updateCombat', (combat, changes) => {
        if (Object.hasOwn(changes, 'turn') || Object.hasOwn(changes, 'round'))
            void processCurrentTurn(combat);
    });
    Hooks.on('combatEnd', (combat) => void clearCombatStates(combat));
}

async function resolveSlayerActor(actorUuid) {
    if (actorUuid) {
        const document = await fromUuid(actorUuid);
        const actor = document?.actor ?? document;
        if (actor?.system?.props) return actor;
    }
    return canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
}

function slayerPdrInfo(props = {}) {
    const pdrMax = Math.max(
        0,
        parseNumber(props.pdr_slayer_total_conta) +
            parseNumber(props.metal_slayer_pdr_bonus) +
            parseNumber(props.pdr_slayer_extra)
    );
    const pdrCurrent = Math.max(
        0,
        Math.min(
            pdrMax,
            pdrMax +
                parseNumber(props.pdr_slayer_curado) -
                parseNumber(props.pdr_slayer_gasto_valor)
        )
    );
    return { pdrMax, pdrCurrent };
}

function slayerLevel(props = {}) {
    return Math.max(0, Math.trunc(parseNumber(props.nvl_pj)));
}

function combatTargetOptions(actor) {
    return [...(game.combat?.combatants ?? [])]
        .map((entry) => entry?.actor)
        .filter((target) => target && target.id !== actor.id)
        .map((target) => `<option value="${target.uuid}">${target.name}</option>`)
        .join('');
}

function alvoLidoOptions(state) {
    return Object.entries(state.mundo.alvosLidos)
        .map(([uuid, nome]) => `<option value="${uuid}">${nome}</option>`)
        .join('');
}

/**
 * Resolve a transação de uma ação de estado avançado: consome Ação Especial,
 * gasta PDR/PDV e persiste o estado em um único update.
 * @param {Actor} actor
 * @param {object} nextState Estado avançado já transicionado.
 * @param {object} options
 * @param {number} [options.pdrCost]
 * @param {string} [options.pdvFormula] Fórmula de dano de PDV (ex.: "1d4").
 * @param {boolean} [options.consumeAction] Consome a Ação Especial do turno.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function commitAdvancedState(
    actor,
    nextState,
    { pdrCost = 0, pdvFormula = '', consumeAction = false, extraPatch = {} } = {}
) {
    const props = actor.system?.props ?? {};
    const patch = {};
    if (consumeAction) {
        const action = await consumeSlayerActions(actor, 'especial', { update: false });
        if (!action.ok) return { ok: false, reason: action.reason };
        if (action.patch) Object.assign(patch, action.patch);
    }
    if (pdrCost > 0) {
        patch['system.props.pdr_slayer_gasto_valor'] =
            parseNumber(props.pdr_slayer_gasto_valor) + pdrCost;
    }
    Object.assign(patch, extraPatch);
    if (pdvFormula) {
        const roll = await new Roll(pdvFormula).evaluate();
        patch['system.props.pdv_slayer_dano_tomado'] =
            parseNumber(props.pdv_slayer_dano_tomado) + Math.max(0, Math.trunc(roll.total || 0));
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `<strong>Custo de PDV ${actor.name}</strong>`,
        });
    }
    const normalized = parseAdvancedStates(nextState);
    patch[`system.props.${CONTRACT.data}`] = JSON.stringify(normalized);
    patch[`system.props.${CONTRACT.summary}`] = formatStatesSummary(normalized);
    await actor.update(patch, { naCsbAutomation: true });
    return { ok: true };
}

/**
 * Abre o gerenciador DialogV2 dos Estados Avançados do Slayer.
 * @param {object} options
 * @param {string} [options.actorUuid]
 * @returns {Promise<void>}
 */
export async function openAdvancedStatesManager({ actorUuid } = {}) {
    const actor = await resolveSlayerActor(actorUuid);
    if (!actor) return ui.notifications.warn('Não há personagem ativo.');
    let state = readAdvancedStates(actor.system?.props);

    while (true) {
        const level = slayerLevel(actor.system?.props);
        const { pdrCurrent } = slayerPdrInfo(actor.system?.props);
        const result = await foundry.applications.api.DialogV2.wait({
            window: { title: `Estados Avançados ${actor.name}` },
            modal: true,
            rejectClose: false,
            content: `<div class="na-csb-automation" style="display:grid;gap:8px"><h3>${formatStatesSummary(state)}</h3><div>PDR disponível: <strong>${pdrCurrent}</strong></div>${level < 7 ? '<p>Requer Exterminador nível 7 para Mundo Transparente e nível 10 para Lâmina Carmesim.</p>' : ''}${state.mundo.despertado && level >= 7 ? `<fieldset><legend>Mundo Transparente</legend>${state.mundo.focoAtivo ? `<p>Foco ativo: <strong>${state.mundo.focoAlvoNome || state.mundo.focoAlvoUuid}</strong></p>` : `<label>Alvo Lido<select name="alvo"><option value="">selecione —</option>${alvoLidoOptions(state)}</select></label>`}<label>Novo Alvo Lido (combate)<select name="novoAlvo"><option value="">selecione um alvo do combate —</option>${combatTargetOptions(actor)}</select></label></fieldset>` : ''}${state.lamina.ativa ? `<fieldset><legend>Lâmina Carmesim</legend><p>Rastro <strong>${state.lamina.rastro}</strong> · Estresse <strong>${state.lamina.estresse}/${LAMINA_ESTRESSE_MAX}</strong></p></fieldset>` : level >= 10 && !state.lamina.colapso && !state.lamina.superaquecida ? `<fieldset><legend>Lâmina Carmesim</legend><label>Ignição<select name="metodo"><option value="sangue">Sangue 1d4 PDV</option><option value="atrito">Atrito 3 PDR</option><option value="pressao">Pressão 5 PDR + VIT CD 16</option></select></label></fieldset>` : ''}${state.altruista.ativo ? `<fieldset><legend>Estado Altruísta</legend><p>Rodadas restantes: <strong>${state.altruista.rodadasRestantes}</strong></p></fieldset>` : ''}</div>`,
            buttons: [
                ...(state.mundo.despertado && !state.mundo.focoAtivo
                    ? [
                          {
                              action: 'foco',
                              label: 'Ativar Foco (3 PDR)',
                              callback: (_event, _button, dialog) => ({
                                  action: 'foco',
                                  value: String(
                                      dialog.element.querySelector('[name="alvo"]')?.value ?? ''
                                  ),
                              }),
                          },
                      ]
                    : []),
                ...(state.mundo.focoAtivo
                    ? [
                          {
                              action: 'encerrar-foco',
                              label: 'Encerrar Foco',
                              callback: () => ({ action: 'encerrar-foco' }),
                          },
                      ]
                    : []),
                ...(level >= 7 && state.mundo.despertado
                    ? [
                          {
                              action: 'ler-alvo',
                              label: 'Ler Alvo',
                              callback: (_event, _button, dialog) => ({
                                  action: 'ler-alvo',
                                  value: String(
                                      dialog.element.querySelector('[name="novoAlvo"]')?.value ?? ''
                                  ),
                              }),
                          },
                      ]
                    : []),
                ...(level >= 10 &&
                !state.lamina.ativa &&
                !state.lamina.colapso &&
                !state.lamina.superaquecida
                    ? [
                          {
                              action: 'lamina',
                              label: 'Ativar Lâmina',
                              callback: (_event, _button, dialog) => ({
                                  action: 'lamina',
                                  value: String(
                                      dialog.element.querySelector('[name="metodo"]')?.value ??
                                          'sangue'
                                  ),
                              }),
                          },
                      ]
                    : []),
                ...(state.lamina.ativa
                    ? [
                          {
                              action: 'apagar',
                              label: 'Apagar Lâmina',
                              callback: () => ({ action: 'apagar' }),
                          },
                      ]
                    : []),
                ...(state.altruista.despertado &&
                !state.altruista.ativo &&
                !state.altruista.usadoCombate &&
                !state.altruista.travadoDescansoN1
                    ? [
                          {
                              action: 'altruista',
                              label: 'Ativar Estado Altruísta (4 PDR)',
                              callback: () => ({ action: 'altruista' }),
                          },
                      ]
                    : []),
                ...(state.altruista.ativo
                    ? [
                          {
                              action: 'corte-sem-ego',
                              label: 'Corte Sem Ego (8 PDR)',
                              callback: () => ({ action: 'corte-sem-ego' }),
                          },
                      ]
                    : []),
                { action: 'close', label: 'Fechar', callback: () => null },
            ],
        });

        if (result === null || result === undefined) return;
        const action = typeof result === 'object' ? result.action : String(result);

        if (action === 'encerrar-foco') {
            state.mundo.focoAtivo = false;
            state.mundo.focoAlvoUuid = '';
            state.mundo.focoAlvoNome = '';
            await saveAdvancedStates(actor, state);
            continue;
        }

        if (action === 'ler-alvo') {
            const uuid = String(result.value ?? '');
            if (!uuid) {
                ui.notifications.warn('Selecione um alvo do combate.');
                continue;
            }
            const target = await fromUuid(uuid);
            const targetActor = target?.actor ?? target;
            state = lerAlvo(state, { alvoUuid: uuid, alvoNome: targetActor?.name || uuid });
            await saveAdvancedStates(actor, state);
            continue;
        }

        if (action === 'foco') {
            const uuid = String(result.value ?? '');
            if (!uuid) {
                ui.notifications.warn('Selecione um Alvo Lido.');
                continue;
            }
            const ativado = ativarFoco(state, {
                alvoUuid: uuid,
                alvoNome: state.mundo.alvosLidos[uuid] || uuid,
                grau: state.mundo.grau,
            });
            if (!ativado.ok) {
                ui.notifications.warn(ativado.reason);
                continue;
            }
            if (ativado.extraDc !== undefined) {
                const fdv = parseNumber(actor.system?.props?.fdv_display);
                const roll = await new Roll(`1d20 + ${fdv}`).evaluate();
                await roll.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    flavor: `<strong>Foco Transparente uso extra</strong> FDV contra CD ${ativado.extraDc}`,
                });
                const natural = roll.dice?.[0]?.results?.[0]?.result;
                const sucesso = natural === 20 || roll.total >= ativado.extraDc;
                const resultado = focoUsoExtra(ativado.state, {
                    sucesso,
                    margemFalha: Math.max(0, ativado.extraDc - roll.total),
                });
                const commit = await commitAdvancedState(actor, resultado.state, {
                    pdrCost: FOCO_CUSTO_PDR,
                    consumeAction: true,
                });
                if (!commit.ok) {
                    ui.notifications.warn(commit.reason);
                    continue;
                }
                if (resultado.ativou)
                    ui.notifications.info(`Uso extra de Foco concedido (CD ${ativado.extraDc}).`);
                else
                    ui.notifications.warn(
                        'Uso extra falhou: -1 de acerto contra Alvos Lidos até o fim do turno.'
                    );
                state = resultado.state;
                continue;
            }
            const commit = await commitAdvancedState(actor, ativado.state, {
                pdrCost: FOCO_CUSTO_PDR,
                consumeAction: true,
            });
            if (!commit.ok) {
                ui.notifications.warn(commit.reason);
                continue;
            }
            state = ativado.state;
            continue;
        }

        if (action === 'lamina') {
            const method = String(result.value ?? 'sangue');
            const ativada = ativarLamina(state, { method, cenaOk: true, pdr: pdrCurrent, level });
            if (!ativada.ok) {
                ui.notifications.warn(ativada.reason);
                continue;
            }
            const profile = laminaIgnitionProfile(method);
            if (profile?.teste) {
                const vit = parseNumber(actor.system?.props?.vit_display);
                const roll = await new Roll(`1d20 + ${vit}`).evaluate();
                await roll.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    flavor: `<strong>Ignição por Pressão</strong> VIT contra CD ${profile.teste.cd}`,
                });
                const natural = roll.dice?.[0]?.results?.[0]?.result;
                const sucesso = natural === 20 || roll.total >= profile.teste.cd;
                const resultado = laminaPressaoResultado(state, { sucesso });
                const danoFormula = resultado.danoSolarInterno
                    ? String(resultado.danoSolarInterno)
                    : '';
                const commit = await commitAdvancedState(actor, resultado.state, {
                    pdrCost: 5,
                    consumeAction: true,
                    pdvFormula: danoFormula,
                });
                if (!commit.ok) {
                    ui.notifications.warn(commit.reason);
                    continue;
                }
                state = resultado.state;
                continue;
            }
            const pdrCost = profile?.custoPdr ?? 0;
            const pdvFormula = profile?.custoPdv ?? '';
            const commit = await commitAdvancedState(actor, ativada.state, {
                pdrCost,
                pdvFormula,
                consumeAction: true,
            });
            if (!commit.ok) {
                ui.notifications.warn(commit.reason);
                continue;
            }
            state = ativada.state;
            continue;
        }

        if (action === 'apagar') {
            const apagada = apagarLamina(state);
            await saveAdvancedStates(actor, apagada);
            ui.notifications.info('A arma fica Superaquecida até o fim da cena ou 10 minutos.');
            state = apagada;
            continue;
        }

        if (action === 'altruista') {
            const ativado = ativarAltruista(state, { pdr: pdrCurrent });
            if (!ativado.ok) {
                ui.notifications.warn(ativado.reason);
                continue;
            }
            const commit = await commitAdvancedState(actor, ativado.state, {
                pdrCost: ALTRIUSTA_CUSTO_PDR,
                consumeAction: true,
            });
            if (!commit.ok) {
                ui.notifications.warn(commit.reason);
                continue;
            }
            state = ativado.state;
            continue;
        }

        if (action === 'corte-sem-ego') {
            const corte = corteSemEgo(state, { pdr: pdrCurrent });
            if (!corte.ok) {
                ui.notifications.warn(corte.reason);
                continue;
            }
            const props = actor.system?.props ?? {};
            const { pdrMax } = slayerPdrInfo(props);
            const patch = {
                'system.props.pdr_slayer_gasto_valor':
                    pdrMax + parseNumber(props.pdr_slayer_curado),
            };
            await commitAdvancedState(actor, corte.state, {
                consumeAction: false,
                extraPatch: patch,
            });
            const status = parseStatusState(props.status_slayer_dados);
            await saveSlayerStatuses(
                actor,
                status.active,
                Math.min(8, status.exhaustion + 2),
                status.effects,
                status.exhaustionMilestones
            );
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `<strong>Corte Sem Ego</strong> ${actor.name} zerou o PDR, ganhou 2 de Exaustão e o Estado Altruísta encerrou.`,
            });
            state = corte.state;
            continue;
        }
    }
}

export const ADVANCED_STATES_CONTRACT = CONTRACT;
