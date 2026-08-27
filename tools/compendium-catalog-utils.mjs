import { createHash } from 'node:crypto';

export function stableId(namespace, value) {
    return createHash('sha1').update(`${namespace}:${value}`).digest('hex').slice(0, 16);
}

export function stripMarkdown(value = '') {
    return String(value)
        .replace(/^---[\s\S]*?---\s*/u, '')
        .replace(/>\s*\[![^\]]+\]\s*/gu, '')
        .replace(/[`*_]/gu, '')
        .trim();
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/"/gu, '&quot;');
}

function inlineMarkdown(value = '') {
    return escapeHtml(value)
        .replace(
            /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu,
            (_match, target, label) => `<span class="na-wikilink">${label || target}</span>`
        )
        .replace(/`([^`]+)`/gu, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
        .replace(/__([^_]+)__/gu, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/gu, '<em>$1</em>');
}

/** Convert trusted rule Markdown into HTML accepted by Foundry's enriched editor. */
export function markdownToFoundryHtml(markdown = '') {
    const lines = String(markdown).replace(/\r\n?/gu, '\n').trim().split('\n');
    const output = [];
    let paragraph = [];
    let listType = null;
    let listItems = [];

    const flushParagraph = () => {
        if (!paragraph.length) return;
        output.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
        paragraph = [];
    };
    const flushList = () => {
        if (!listType) return;
        output.push(
            `<${listType}>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${listType}>`
        );
        listType = null;
        listItems = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trimEnd();
        if (!line.trim()) {
            flushParagraph();
            flushList();
            continue;
        }
        if (/^---+$/u.test(line.trim())) {
            flushParagraph();
            flushList();
            output.push('<hr>');
            continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.+)$/u);
        if (heading) {
            flushParagraph();
            flushList();
            const level = heading[1].length;
            output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
            continue;
        }
        const quote = line.match(/^>\s?(.*)$/u);
        if (quote) {
            flushParagraph();
            flushList();
            output.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
            continue;
        }
        const unordered = line.match(/^[-*+]\s+(.+)$/u);
        const ordered = line.match(/^\d+[.)]\s+(.+)$/u);
        if (unordered || ordered) {
            flushParagraph();
            const nextType = unordered ? 'ul' : 'ol';
            if (listType && listType !== nextType) flushList();
            listType = nextType;
            listItems.push((unordered || ordered)[1]);
            continue;
        }
        if (/^\|.*\|$/u.test(line) && /^\|?\s*:?-{3,}/u.test(lines[index + 1]?.trim() || '')) {
            flushParagraph();
            flushList();
            const rows = [line];
            let cursor = index + 2;
            while (cursor < lines.length && /^\|.*\|$/u.test(lines[cursor].trim())) {
                rows.push(lines[cursor]);
                cursor += 1;
            }
            const header = rows
                .shift()
                .split('|')
                .slice(1, -1)
                .map((cell) => `<th>${inlineMarkdown(cell.trim())}</th>`)
                .join('');
            const body = rows
                .map(
                    (row) =>
                        `<tr>${row
                            .split('|')
                            .slice(1, -1)
                            .map((cell) => `<td>${inlineMarkdown(cell.trim())}</td>`)
                            .join('')}</tr>`
                )
                .join('');
            output.push(`<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`);
            index = cursor - 1;
            continue;
        }
        flushList();
        paragraph.push(line.trim());
    }
    flushParagraph();
    flushList();
    return output.join('\n');
}

export function splitLevelTwoSections(markdown = '') {
    const matches = [...String(markdown).matchAll(/^##\s+(.+)$/gmu)];
    return matches.map((match, index) => ({
        heading: match[1].trim(),
        body: String(markdown)
            .slice(
                match.index + match[0].length,
                matches[index + 1]?.index ?? String(markdown).length
            )
            .trim(),
    }));
}

export function firstDiceFormula(text = '') {
    const match = String(text).match(
        /\b\d+d\d+(?:\s*[+-]\s*(?:\d+|(?:DEX|FOR|VIT|CAR|FDV|INT|SAB)))?/iu
    );
    return (
        match?.[0]?.replace(
            /\b(DEX|FOR|VIT|CAR|FDV|INT|SAB)\b/giu,
            (value) => `@${value.toLowerCase()}`
        ) ?? ''
    );
}

export function firstFixedDamage(text = '') {
    const match = String(text).match(/(?:^|\n)[^\n]*\bDano(?:\s+[^:]+)?:\s*(\d+)/iu);
    return Number(match?.[1] ?? 0);
}

export function attributesIn(text = '') {
    return [
        ...new Set(
            (String(text).match(/\b(?:DEX|FOR|VIT|CAR|FDV|INT|SAB)\b/giu) ?? []).map((value) =>
                value.toUpperCase()
            )
        ),
    ];
}

export function damageTypesIn(text = '') {
    const types = [
        'cortante',
        'perfurante',
        'concussivo',
        'trovejante',
        'sonoro',
        'ferida',
        'sangramento',
        'envenenamento',
        'necrótico',
    ];
    const normalized = String(text).toLocaleLowerCase('pt-BR');
    return types.filter((type) => normalized.includes(type));
}

export function actionIn(text = '') {
    const match = String(text).match(
        /Ação\s+(Livre|Única|Especial|de Ataque|Completa|de Movimento)|Reação/iu
    );
    return match?.[0] ?? 'Não informada';
}

export function costIn(text = '') {
    const values = [...String(text).matchAll(/(\d+)\s*PDR\b/giu)].map((match) => Number(match[1]));
    return values.length ? values[0] : 0;
}

export function minimumBreathingLevel(text = '') {
    const match = String(text).match(
        /(?:a partir do|requer(?:imento)?[^\n]*?)\s*N[ií]vel\s+(\d)\s+de Respira/iu
    );
    return Math.min(4, Math.max(1, Number(match?.[1] ?? 1)));
}

export function folderDocument(id, name, sort = 0) {
    return {
        _id: id,
        _key: `!folders!${id}`,
        name,
        type: 'Item',
        folder: null,
        sorting: 'a',
        sort,
        color: null,
        flags: {},
    };
}
