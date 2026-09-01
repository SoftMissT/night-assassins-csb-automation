import { MODULE_ID } from './constants.mjs';

const SOCKET_NAME = `module.${MODULE_ID}`;
const SOCKET_TYPE = 'diagnostic-event';
const JOURNAL_NAME = 'NA Registro de Erros';
const MODULE_MARKERS = Object.freeze([
    MODULE_ID,
    `modules/${MODULE_ID}/`,
    `Compendium.${MODULE_ID}.`,
    '[Night Assassins]',
    '[NA-',
    '[NA ',
    '[NA_Oni]',
    '[NA-Oni]',
]);

let registered = false;
let writeQueue = Promise.resolve();

function primaryActiveGm() {
    return (
        game.users
            ?.filter((user) => user.active && user.isGM)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null
    );
}

function isPrimaryGm() {
    return game.user?.isGM && primaryActiveGm()?.id === game.user.id;
}

function stringifyPart(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
}

function redact(value) {
    return String(value ?? '')
        .replace(
            /(authorization|cookie|token|password|secret|session)\s*[:=]\s*[^\s,;]+/gi,
            '$1=[REDACTED]'
        )
        .replace(/[?&](token|key|secret|session)=[^&#\s]+/gi, '?$1=[REDACTED]')
        .slice(0, 20_000);
}

export function isNightAssassinsDiagnostic(value) {
    // Objetos de contexto do CSB podem conter UUIDs do módulo dentro de um
    // Actor/Item completo. Serializá-los em todo console.warn é caro e ainda
    // atribui falsamente o warning do sistema ao módulo.
    if (typeof value !== 'string' && !(value instanceof Error)) return false;
    const text = stringifyPart(value);
    return MODULE_MARKERS.some((marker) => text.includes(marker));
}

function diagnosticContext() {
    const token = globalThis.canvas?.tokens?.controlled?.[0] ?? null;
    const actor = token?.actor ?? game.user?.character ?? null;
    return {
        userId: game.user?.id ?? null,
        userName: game.user?.name ?? 'Usuário desconhecido',
        actorName: actor?.name ?? null,
        actorUuid: actor?.uuid ?? null,
        tokenName: token?.name ?? null,
        sceneName: globalThis.canvas?.scene?.name ?? null,
        sceneUuid: globalThis.canvas?.scene?.uuid ?? null,
        foundryVersion: game.version ?? null,
        systemId: game.system?.id ?? null,
        systemVersion: game.system?.version ?? null,
        moduleVersion: game.modules.get(MODULE_ID)?.version ?? null,
    };
}

function normalizeEvent(source, parts, extra = {}) {
    const raw = parts.map(stringifyPart).join(' ');
    return {
        id: foundry.utils.randomID(),
        timestamp: new Date().toISOString(),
        source,
        level: extra.level ?? 'error',
        message: redact(raw),
        stack: redact(extra.stack ?? parts.find((part) => part instanceof Error)?.stack ?? ''),
        location: redact(extra.location ?? ''),
        context: diagnosticContext(),
    };
}

function emitDiagnostic(event) {
    if (!isNightAssassinsDiagnostic(`${event.message}\n${event.stack}\n${event.location}`))
        return false;
    if (isPrimaryGm()) enqueueWrite(event);
    else game.socket?.emit?.(SOCKET_NAME, { type: SOCKET_TYPE, event });
    return true;
}

function markdownEscape(value) {
    return redact(value).replaceAll('```', '`\u200b``').replaceAll('|', '\\|');
}

function eventMarkdown(event) {
    const ctx = event.context ?? {};
    return `## [${markdownEscape(event.timestamp)}] ${markdownEscape(event.level).toUpperCase()} ${markdownEscape(event.source)}

| Campo | Valor |
|---|---|
| Jogador | ${markdownEscape(ctx.userName ?? '—')} |
| User ID | \`${markdownEscape(ctx.userId ?? '—')}\` |
| Actor | ${markdownEscape(ctx.actorName ?? '—')} |
| Actor UUID | \`${markdownEscape(ctx.actorUuid ?? '—')}\` |
| Token | ${markdownEscape(ctx.tokenName ?? '—')} |
| Cena | ${markdownEscape(ctx.sceneName ?? '—')} |
| Foundry | \`${markdownEscape(ctx.foundryVersion ?? '—')}\` |
| Sistema | \`${markdownEscape(ctx.systemId ?? '—')} ${markdownEscape(ctx.systemVersion ?? '')}\` |
| Módulo | \`${markdownEscape(ctx.moduleVersion ?? '—')}\` |
| Origem | \`${markdownEscape(event.location ?? '—')}\` |

### Mensagem

\`\`\`txt
${markdownEscape(event.message || '—')}
\`\`\`

### Stack

\`\`\`txt
${markdownEscape(event.stack || '—')}
\`\`\`
`;
}

export function diagnosticJournalOwnership() {
    const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const ownership = { default: levels.NONE };
    for (const user of game.users ?? []) if (user.isGM) ownership[user.id] = levels.OWNER;
    return ownership;
}

function sameOwnership(left = {}, right = {}) {
    const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
    const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

async function ensureJournal() {
    if (!isPrimaryGm()) return null;
    let journal = game.journal?.getName?.(JOURNAL_NAME) ?? null;
    if (!journal) {
        journal = await JournalEntry.create({
            name: JOURNAL_NAME,
            ownership: diagnosticJournalOwnership(),
        });
    } else {
        const ownership = diagnosticJournalOwnership();
        const current = journal.ownership?.toObject?.() ?? journal.ownership ?? {};
        if (!sameOwnership(current, ownership)) await journal.update({ ownership });
    }
    return journal;
}

function sessionPageName() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} Sessão`;
}

function journalPages(journal) {
    const pages = journal?.pages?.contents ?? journal?.pages ?? [];
    return Array.from(pages).map((page) => ({
        id: page.id ?? page._id ?? null,
        name: page.name ?? 'Página sem nome',
        markdown: page.text?.markdown ?? page.text?.content ?? '',
    }));
}

function exportTimestamp(date = new Date()) {
    return date.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
}

export function buildDiagnosticExport(journal, { format = 'markdown', generatedAt } = {}) {
    const timestamp = generatedAt ?? new Date().toISOString();
    const pages = journalPages(journal);
    if (format === 'json') {
        return JSON.stringify(
            {
                schema: 'night-assassins-diagnostic-v1',
                generatedAt: timestamp,
                journal: journal?.name ?? JOURNAL_NAME,
                pages,
            },
            null,
            2
        );
    }
    return [
        '# Night Assassins Diagnóstico — Exportação',
        '',
        `**Gerado:** ${timestamp}`,
        '',
        ...pages.flatMap((page) => [`# ${page.name}`, '', page.markdown.trim(), '']),
    ]
        .join('\n')
        .trimEnd()
        .concat('\n');
}

export async function exportDiagnosticJournal(format = 'markdown') {
    if (!game.user?.isGM)
        return ui.notifications.warn('O Journal de diagnóstico é exclusivo do GM.');
    await writeQueue;
    const journal = await ensureJournal();
    await ensureSessionPage(journal);
    const normalized = format === 'json' ? 'json' : 'markdown';
    const data = buildDiagnosticExport(journal, { format: normalized });
    const stamp = exportTimestamp();
    const extension = normalized === 'json' ? 'json' : 'md';
    const mime = normalized === 'json' ? 'application/json' : 'text/markdown';
    const saveData = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
    if (typeof saveData !== 'function')
        throw new Error('A API de download do Foundry não está disponível neste cliente.');
    await Promise.resolve(
        saveData(data, mime, `night-assassins-diagnostico-${stamp}.${extension}`)
    );
    ui.notifications.info(`Diagnóstico exportado em ${extension.toUpperCase()}.`);
    return data;
}

async function ensureSessionPage(journal) {
    const name = sessionPageName();
    const existing = journal.pages?.find?.((page) => page.name === name);
    if (existing) return existing;
    const format = CONST.JOURNAL_ENTRY_PAGE_FORMATS?.MARKDOWN ?? 2;
    const seed = `# Night Assassins Diagnóstico\n\n> Somente eventos atribuídos ao módulo são registrados.\n`;
    const created = await journal.createEmbeddedDocuments('JournalEntryPage', [
        {
            name,
            type: 'text',
            text: { format, markdown: seed, content: seed },
        },
    ]);
    return created[0];
}

async function persistEvent(event) {
    const journal = await ensureJournal();
    if (!journal) return;
    const page = await ensureSessionPage(journal);
    const format = CONST.JOURNAL_ENTRY_PAGE_FORMATS?.MARKDOWN ?? 2;
    const current = page.text?.markdown ?? page.text?.content ?? '';
    const next = `${current.trimEnd()}\n\n${eventMarkdown(event)}\n`;
    await page.update({ 'text.format': format, 'text.markdown': next, 'text.content': next });
}

function enqueueWrite(event) {
    writeQueue = writeQueue.then(() => persistEvent(event)).catch(() => undefined);
}

function installConsoleCapture() {
    for (const level of ['error', 'warn']) {
        const original = console[level]?.bind(console);
        if (!original || original.__naDiagnosticWrapped) continue;
        const wrapped = (...parts) => {
            original(...parts);
            if (parts.some(isNightAssassinsDiagnostic)) {
                emitDiagnostic(normalizeEvent(`console.${level}`, parts, { level }));
            }
        };
        Object.defineProperty(wrapped, '__naDiagnosticWrapped', { value: true });
        console[level] = wrapped;
    }
}

export function registerDiagnosticCollector() {
    if (registered) return;
    registered = true;

    game.socket?.on?.(SOCKET_NAME, (message = {}) => {
        if (message.type !== SOCKET_TYPE || !isPrimaryGm()) return;
        const event = message.event;
        if (
            !event ||
            !isNightAssassinsDiagnostic(`${event.message}\n${event.stack}\n${event.location}`)
        )
            return;
        enqueueWrite(event);
    });

    Hooks.on('error', (location, error, data) => {
        emitDiagnostic(
            normalizeEvent('Hooks.error', [error, data], { location, stack: error?.stack })
        );
    });
    globalThis.addEventListener?.('error', (event) => {
        emitDiagnostic(
            normalizeEvent('window.error', [event.error ?? event.message], {
                location: `${event.filename ?? ''}:${event.lineno ?? ''}:${event.colno ?? ''}`,
                stack: event.error?.stack,
            })
        );
    });
    globalThis.addEventListener?.('unhandledrejection', (event) => {
        emitDiagnostic(
            normalizeEvent('unhandledrejection', [event.reason], { stack: event.reason?.stack })
        );
    });
    installConsoleCapture();
}

export async function openDiagnosticJournal() {
    if (!game.user?.isGM)
        return ui.notifications.warn('O Journal de diagnóstico é exclusivo do GM.');
    const journal = await ensureJournal();
    await ensureSessionPage(journal);
    journal.sheet?.render?.(true);
    return journal;
}

export async function openDiagnosticReportDialog() {
    if (!game.user?.isGM)
        return ui.notifications.warn('O Journal de diagnóstico é exclusivo do GM.');
    const result = await foundry.applications.api.DialogV2.input({
        window: { title: 'Night Assassins Registrar diagnóstico' },
        content: `<form><div class="form-group stacked"><label>Resumo</label><input name="summary" type="text" autofocus></div><div class="form-group stacked"><label>Detalhes / console</label><textarea name="details" rows="10"></textarea></div></form>`,
        ok: { label: 'Registrar' },
    });
    if (!result) return null;
    const data = result instanceof FormData ? Object.fromEntries(result.entries()) : result;
    const event = normalizeEvent(
        'relato-manual-gm',
        [`[${MODULE_ID}] ${data.summary ?? 'Relato manual'}\n${data.details ?? ''}`],
        { level: 'manual' }
    );
    enqueueWrite(event);
    await writeQueue;
    return openDiagnosticJournal();
}

export async function openDiagnosticManager() {
    if (!game.user?.isGM)
        return ui.notifications.warn('O Journal de diagnóstico é exclusivo do GM.');
    const run = async (operation) => {
        try {
            return await operation();
        } catch (error) {
            console.error(`[${MODULE_ID}] Falha no gerenciador de diagnóstico.`, error);
            ui.notifications.error(error?.message || 'Falha no gerenciador de diagnóstico.');
            return null;
        }
    };
    return foundry.applications.api.DialogV2.wait({
        window: { title: 'Night Assassins — Diagnóstico' },
        content: '<p>Registre, abra ou exporte o Journal de diagnóstico.</p>',
        buttons: [
            {
                action: 'report',
                icon: 'fa-solid fa-bug',
                label: 'Registrar erro',
                default: true,
                callback: async () => run(() => openDiagnosticReportDialog()),
            },
            {
                action: 'open',
                icon: 'fa-solid fa-book-open',
                label: 'Abrir Journal',
                callback: async () => run(() => openDiagnosticJournal()),
            },
            {
                action: 'markdown',
                icon: 'fa-solid fa-file-lines',
                label: 'Exportar Markdown',
                callback: async () => run(() => exportDiagnosticJournal('markdown')),
            },
            {
                action: 'json',
                icon: 'fa-solid fa-file-code',
                label: 'Exportar JSON',
                callback: async () => run(() => exportDiagnosticJournal('json')),
            },
            { action: 'cancel', icon: 'fa-solid fa-xmark', label: 'Cancelar' },
        ],
        rejectClose: false,
    });
}
