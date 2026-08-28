import { parseAttributeValue, parseNumber } from './parsing.mjs';

export const WEAPON_RANK_LEVELS = Object.freeze({ D: 2, C: 4, B: 6, A: 8, S: 11, SS: 12 });

export function slayerWeaponRank(actorProps = {}) {
    // O Rank mecânico da arma deriva SEMPRE do nível do portador (nvl_num/nvl_pj),
    // nunca de rank_atual que é texto narrativo ("Mizunoto", "Hashira Novato")
    // sem correspondência garantida com D/C/B/A/S/SS.
    const rawLevel =
        actorProps.nvl_num ??
        actorProps.nivel_slayer_num ??
        actorProps.nivel ??
        String(actorProps.nvl_pj ?? '').replace(/^nvl_/u, '');
    const level = Math.max(0, Math.trunc(parseNumber(rawLevel)));
    if (level >= 12) return 'SS';
    if (level >= 11) return 'S';
    if (level >= 8) return 'A';
    if (level >= 6) return 'B';
    if (level >= 4) return 'C';
    if (level >= 2) return 'D';
    return '';
}

export function extractWeaponRankFormulas(markdown = '') {
    const section = String(markdown).match(/# DANO POR RANK([\s\S]*?)(?=\n# [^#]|$)/i)?.[1] ?? '';
    const formulas = {};
    for (const match of section.matchAll(
        /## Rank (SS|S|A|B|C|D)[^\n]*\n+([\s\S]*?)(?=\n## Rank |$)/gi
    )) {
        const values = [...match[2].matchAll(/`([^`]+)`/g)]
            .map((entry) => entry[1].trim())
            .filter(Boolean);
        if (values.length > 0) formulas[match[1].toUpperCase()] = values;
    }
    return formulas;
}

function diceFromFormula(formula = '') {
    return [...String(formula).matchAll(/\b\d+d\d+\b/gi)].map((match) => match[0]).join(' + ');
}

function attributeChoiceKeys(formula = '') {
    const keys = new Set();
    for (const match of String(formula)
        .toUpperCase()
        .matchAll(/\b(VIT|DEX|FOR|CAR|FDV|INT|SAB)\b\s+OU\s+\b(VIT|DEX|FOR|CAR|FDV|INT|SAB)\b/g)) {
        keys.add(match[1]);
        keys.add(match[2]);
    }
    return keys;
}

const WEAPON_ATTRIBUTES = new Set(['VIT', 'DEX', 'FOR', 'CAR', 'FDV', 'INT', 'SAB']);

function parseStructuredValue(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}

function textList(value) {
    if (Array.isArray(value))
        return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
    const parsed = parseStructuredValue(value);
    if (Array.isArray(parsed)) return textList(parsed);
    return String(value ?? '')
        .split(/[,;/]|\s+ou\s+|\s+e\s+/iu)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

const DAMAGE_TYPE_ALIASES = Object.freeze({
    concussao: 'concussao',
    concussivo: 'concussao',
    cortante: 'cortante',
    perfurante: 'perfurante',
    trovejante: 'trovejante',
    sonoro: 'sonoro',
    ferida: 'ferida',
    sangramento: 'sangramento',
    envenenamento: 'envenenamento',
    necrotico: 'necrotico',
    acido: 'acido',
    eletrico: 'eletrico',
    fogo: 'fogo',
    impacto: 'impacto',
    mental: 'mental',
    solar: 'solar',
    venenoso: 'venenoso',
    congelante: 'congelante',
});

export function weaponDamageTypeKeys(value = []) {
    return [
        ...new Set(
            textList(value)
                .map((entry) =>
                    String(entry)
                        .toLocaleLowerCase('pt-BR')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/gu, '')
                        .replace(/\s+a?\s*escolha.*$/u, '')
                        .trim()
                )
                .map((entry) => DAMAGE_TYPE_ALIASES[entry] ?? entry)
                .filter((entry) => DAMAGE_TYPE_ALIASES[entry])
        ),
    ];
}

function objectList(value) {
    const parsed = parseStructuredValue(value);
    if (Array.isArray(parsed)) return parsed.filter((entry) => entry && typeof entry === 'object');
    return parsed && typeof parsed === 'object' ? [parsed] : [];
}

function legacyAttributeMultiplier(itemProps, key) {
    const normalized = String(itemProps.arma_regra_completa ?? itemProps.descricao ?? '')
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '');
    const normalizedKey = String(key).toLocaleLowerCase('pt-BR');
    return new RegExp(`(?:metade(?:\\s+(?:da|de))?|1\\s*/\\s*2)\\s*${normalizedKey}\\b`, 'u').test(
        normalized
    )
        ? 0.5
        : 1;
}

export function weaponProfilesFromProps(itemProps = {}) {
    const parsedProfiles =
        parseStructuredValue(itemProps.arma_perfis_ataque) ??
        parseStructuredValue(itemProps.arma_perfis_ataque_json);
    const profiles = Array.isArray(parsedProfiles)
        ? parsedProfiles.filter((profile) => profile && typeof profile === 'object')
        : parsedProfiles && typeof parsedProfiles === 'object'
          ? [parsedProfiles]
          : [];
    if (profiles.length > 0) return profiles;

    const hasLegacyData = [
        'arma_dano_dados',
        'arma_dano_fixo',
        'arma_dano_atributo',
        'arma_tipos_dano',
    ].some((key) => itemProps[key] !== undefined && itemProps[key] !== '');
    if (!hasLegacyData) return [];

    const legacyAttributes = textList(
        itemProps.arma_dano_atributo ?? itemProps.arma_dano_atributo_json
    )
        .map((key) => key.toUpperCase())
        .filter((key) => WEAPON_ATTRIBUTES.has(key));
    const attributes = legacyAttributes.map((key) => ({
        key,
        multiplicador: legacyAttributeMultiplier(itemProps, key),
        escolha: legacyAttributes.length > 1,
    }));
    const fixed = Number.isFinite(Number(itemProps.arma_dano_fixo))
        ? Number(itemProps.arma_dano_fixo)
        : 0;
    const dice = String(itemProps.arma_dano_dados ?? '').trim();
    const types = weaponDamageTypeKeys(itemProps.arma_tipos_dano ?? itemProps.arma_tipos_dano_json);
    const formulaParts = [
        fixed || '',
        dice,
        attributes
            .map((rule) => `${rule.multiplicador === 0.5 ? 'metade de ' : ''}${rule.key}`)
            .join(' ou '),
    ].filter(Boolean);
    return [
        {
            nome: 'Ataque Base',
            formula_texto: [formulaParts.join(' + '), types.join(' ou ')]
                .filter(Boolean)
                .join(' / '),
            dano_dados: dice,
            dano_fixo: fixed,
            atributos: attributes,
            tipos_dano: types,
            alcance: itemProps.arma_alcance,
            critico: itemProps.arma_critico,
        },
    ];
}

export function weaponPropertyKeys(value = '') {
    const normalized = String(value ?? '')
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[ *_]/gu, '');
    return [
        ...new Set(
            normalized
                .split(/[/,&;]|\s+e\s+/u)
                .map((part) => part.replace(/\s+\d+$/u, '').trim())
                .filter(Boolean)
        ),
    ];
}

export function weaponAttackAttributes(itemProps = {}, profile = {}) {
    const explicitRaw =
        parseStructuredValue(itemProps.arma_atributo_acerto) ??
        parseStructuredValue(itemProps.arma_atributo_acerto_json) ??
        itemProps.arma_atributo_acerto ??
        itemProps.arma_atributo_acerto_json ??
        '';
    const explicit = textList(explicitRaw)
        .map((key) => key.toUpperCase())
        .filter((key) => WEAPON_ATTRIBUTES.has(key));
    if (explicit.length > 0) return [...new Set(explicit)];

    const properties = weaponPropertyKeys(itemProps.arma_propriedades);
    if (properties.includes('acuidade')) return ['FOR', 'DEX'];
    if (properties.includes('concussao')) return ['FOR'];
    if (properties.includes('manejavel')) return ['DEX'];

    const profileAttributes = objectList(profile.atributos)
        .map((rule) => String(rule?.key ?? '').toUpperCase())
        .filter((key) => WEAPON_ATTRIBUTES.has(key));
    return [...new Set(profileAttributes)];
}

export function weaponPropertyMechanics(itemProps = {}) {
    const mechanics = objectList(itemProps.arma_mecanicas ?? itemProps.arma_mecanicas_json);
    if (mechanics.length > 0) return mechanics;
    return weaponPropertyKeys(itemProps.arma_propriedades).map((id) => ({
        id,
        kind: 'unresolved',
    }));
}

function normalizedWeaponMode(value = '') {
    const normalized = String(value ?? '')
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-z0-9]/gu, '');
    if (normalized.includes('nitoryu')) return 'nitoryu';
    if (normalized.includes('morote')) return 'morote';
    if (normalized.includes('ryoto')) return 'ryoto';
    return '';
}

export function weaponUsageModes(itemProps = {}) {
    const profiles = weaponProfilesFromProps(itemProps);
    const modes = profiles
        .map((profile) => ({
            key: normalizedWeaponMode(profile.modo ?? profile.nome),
            label: String(profile.nome ?? profile.modo ?? '').trim(),
        }))
        .filter((entry) => entry.key);
    return [...new Map(modes.map((entry) => [entry.key, entry])).values()];
}

export function selectedWeaponMode(itemProps = {}) {
    return normalizedWeaponMode(itemProps.arma_modo_uso);
}

export async function ensureWeaponUsageMode(item) {
    const props = item?.system?.props ?? {};
    const modes = weaponUsageModes(props);
    if (modes.length <= 1) {
        const mode = modes[0]?.key ?? '';
        if (mode && selectedWeaponMode(props) !== mode && typeof item?.update === 'function') {
            await item.update({ 'system.props.arma_modo_uso': mode }, { naCsbAutomation: true });
        }
        return mode;
    }
    const current = selectedWeaponMode(props);
    if (modes.some((entry) => entry.key === current)) return current;
    if (!globalThis.foundry?.applications?.api?.DialogV2) return '';
    const options = modes
        .map((entry) => `<option value="${entry.key}">${entry.label}</option>`)
        .join('');
    const chosen = await foundry.applications.api.DialogV2.wait({
        window: { title: `Modo de uso ${props.arma_nome || item.name || 'Arma'}` },
        content: `<div class="na-csb-automation"><p>Escolha como esta arma será empunhada. A escolha fica salva neste Item.</p><select name="weaponMode">${options}</select></div>`,
        modal: true,
        rejectClose: false,
        buttons: [
            {
                action: 'save',
                label: 'Sincronizar arma',
                callback: (_event, button) => String(button.form.elements.weaponMode.value ?? ''),
            },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!chosen) return '';
    await item.update({ 'system.props.arma_modo_uso': chosen }, { naCsbAutomation: true });
    return chosen;
}

export function registerWeaponModeEngine() {
    Hooks.on('createItem', (item) => {
        if (item?.parent?.documentName !== 'Actor') return;
        if (!['NAWeaponTpl00001', 'NASpecialWeaponTpl00001'].includes(item.system?.template))
            return;
        if (weaponUsageModes(item.system?.props ?? {}).length < 2) return;
        setTimeout(() => void ensureWeaponUsageMode(item), 0);
    });
}

export function weaponProficiencyNames(actorProps = {}) {
    const raw =
        actorProps.armas_proficientes ??
        actorProps.proficiencias_armas ??
        actorProps.proficiencia_armas ??
        '';
    if (Array.isArray(raw)) return raw.map((name) => String(name).trim()).filter(Boolean);
    return String(raw)
        .split(/[,;\n]/u)
        .map((name) => name.trim())
        .filter(Boolean);
}

export function isWeaponProficient(itemProps = {}, actorProps = {}) {
    const names = weaponProficiencyNames(actorProps);
    if (names.length === 0) return true;
    const weaponName = String(itemProps.arma_nome ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR');
    return names.some((name) => String(name).trim().toLocaleLowerCase('pt-BR') === weaponName);
}

export function weaponAmmoState(itemProps = {}, profile = {}) {
    const capacity = Math.max(0, Math.trunc(Number(itemProps.arma_municao_capacidade) || 0));
    const current =
        capacity > 0
            ? Math.max(
                  0,
                  Math.min(capacity, Math.trunc(Number(itemProps.arma_municao_atual ?? capacity)))
              )
            : null;
    const shots = Math.max(1, Math.trunc(Number(profile.ataques) || 1));
    return { capacity, current, shots, required: capacity > 0 && current !== null };
}

export function weaponAmmoPatch(itemProps = {}, remaining = 0) {
    if (!itemProps.arma_municao_capacidade) return null;
    return { 'system.props.arma_municao_atual': Math.max(0, Math.trunc(Number(remaining) || 0)) };
}

export function weaponProfilesForActor(itemProps = {}, actorProps = {}) {
    const allProfiles = weaponProfilesFromProps(itemProps);
    const selectedMode = selectedWeaponMode(itemProps);
    const selectedProfiles = selectedMode
        ? allProfiles.filter(
              (profile) => normalizedWeaponMode(profile.modo ?? profile.nome) === selectedMode
          )
        : allProfiles;
    const profiles = selectedProfiles.length > 0 ? selectedProfiles : allProfiles;
    const rank = slayerWeaponRank(actorProps);
    const proficient = isWeaponProficient(itemProps, actorProps);
    const parsedRankFormulas =
        parseStructuredValue(itemProps.arma_formulas_por_rank) ??
        parseStructuredValue(itemProps.arma_formulas_por_rank_json);
    const rankFormulas =
        parsedRankFormulas && typeof parsedRankFormulas === 'object'
            ? parsedRankFormulas
            : extractWeaponRankFormulas(itemProps.arma_regra_completa);
    const specialWeapon =
        String(itemProps.arma_categoria ?? '').toLocaleLowerCase('pt-BR') === 'especial';
    const ranked = specialWeapon && Array.isArray(rankFormulas[rank]) ? rankFormulas[rank] : [];

    return profiles.map((profile, index) => {
        const rankFormula = ranked[index] ?? ranked[0] ?? '';
        const rankDice = diceFromFormula(rankFormula);
        const baseDice = String(profile.dano_dados ?? '').trim();
        const choiceKeys = attributeChoiceKeys(profile.formula_texto || rankFormula);
        const propertyKeys = weaponPropertyKeys(itemProps.arma_propriedades);
        const profileMode = normalizedWeaponMode(profile.modo ?? profile.nome);
        const sourceAttributes = proficient
            ? objectList(profile.atributos).map((rule) => ({ ...rule }))
            : [];
        const attributes = sourceAttributes.map((rule) => {
            const key = String(rule.key ?? '').toUpperCase();
            return {
                ...rule,
                key,
                escolha: rule.escolha === true || choiceKeys.has(key),
            };
        });
        return {
            ...profile,
            tipos_dano: weaponDamageTypeKeys(
                profile.tipos_dano ?? itemProps.arma_tipos_dano ?? itemProps.arma_tipos_dano_json
            ),
            atributos: attributes,
            dano_dados: [baseDice, rankDice].filter(Boolean).join(' + '),
            rank,
            rank_formula: rankFormula,
            proficiente: proficient,
            propriedade_chaves: propertyKeys,
            modo_propriedade: profileMode,
            ataques: Math.max(
                1,
                Math.trunc(
                    Number(profile.ataques) || (['nitoryu', 'ryoto'].includes(profileMode) ? 2 : 1)
                )
            ),
            dano_segundo_golpe: String(
                profile.dano_segundo_golpe ?? (profileMode === 'nitoryu' ? 'fixo' : 'normal')
            ),
            acerto_segundo_sem_atributo:
                profile.acerto_segundo_sem_atributo === true ||
                ['nitoryu', 'ryoto'].includes(profileMode),
            penalidade_segundo_acerto:
                Number(profile.penalidade_segundo_acerto ?? (profileMode === 'nitoryu' ? -2 : 0)) ||
                0,
            cadeia_critica:
                profile.cadeia_critica && typeof profile.cadeia_critica === 'object'
                    ? structuredClone(profile.cadeia_critica)
                    : null,
        };
    });
}

export function weaponActorSummary(actorProps = {}) {
    return {
        rank: slayerWeaponRank(actorProps),
        for: parseAttributeValue(actorProps.for_display),
        dex: parseAttributeValue(actorProps.dex_display),
        fdv: parseAttributeValue(actorProps.fdv_display),
    };
}
