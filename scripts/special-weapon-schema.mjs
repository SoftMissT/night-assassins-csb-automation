function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isComplex(value) {
    return value !== null && typeof value === 'object';
}

function finiteNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function defaultNumber(component = {}) {
    return finiteNumber(component.defaultValue) ?? 0;
}

export function collectCsbFieldSchema(template = {}) {
    const schema = new Map();

    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (typeof node.key === 'string' && typeof node.type === 'string' && node.key) {
            schema.set(node.key, {
                key: node.key,
                type: node.type,
                defaultValue: node.defaultValue,
                label: node.label ?? '',
            });
        }

        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === 'object') walk(value);
        }
    }

    walk(template.system ?? template);
    return schema;
}

export function findNumberFieldMismatches(props = {}, schema = new Map()) {
    const issues = [];
    for (const [key, component] of schema.entries()) {
        if (component.type !== 'numberField' || !Object.hasOwn(props, key)) continue;
        if (finiteNumber(props[key]) !== null) continue;
        issues.push({
            key,
            type: component.type,
            value: props[key],
            fallback: defaultNumber(component),
        });
    }
    return issues;
}

export function sanitizeSpecialWeaponProps(inputProps = {}, schema = new Map()) {
    const props = cloneJson(inputProps) ?? {};

    if (isComplex(props.arma_marcas_demonio) && !props.arma_marcas_demonio_tabela) {
        props.arma_marcas_demonio_tabela = cloneJson(props.arma_marcas_demonio);
    }

    if (props.arma_marcas_demonio_tabela) {
        props.arma_marcas_demonio_tabela_json = JSON.stringify(
            props.arma_marcas_demonio_tabela
        );
    }

    const marksSchema = schema.get('arma_marcas_demonio');
    if (marksSchema?.type === 'numberField') {
        props.arma_marcas_demonio =
            finiteNumber(props.arma_marcas_demonio) ?? defaultNumber(marksSchema);
    }

    for (const [key, component] of schema.entries()) {
        if (component.type !== 'numberField' || !Object.hasOwn(props, key)) continue;
        props[key] = finiteNumber(props[key]) ?? defaultNumber(component);
    }

    return props;
}

export function validateSpecialWeaponProps(props = {}, schema = new Map()) {
    return findNumberFieldMismatches(props, schema);
}
