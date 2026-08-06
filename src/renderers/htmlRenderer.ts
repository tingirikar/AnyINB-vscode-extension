/**
 * HTML renderer for AnyINB notebook cells.
 * Produces beautiful, VS Code-themed output for all cell types.
 */

import { HttpResult } from '../executors/httpExecutor';

const STYLES = `
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .qnb-output {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        font-size: 13px;
        color: #cccccc;
        background: transparent;
        width: 100%;
    }

    /* ── Table ───────────────────────────────────────────── */
    .qnb-table-wrapper {
        overflow-x: auto;
        border-radius: 6px;
        border: 1px solid #333333;
        margin-bottom: 8px;
    }

    .qnb-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12.5px;
        line-height: 1.5;
    }

    .qnb-table thead { position: sticky; top: 0; z-index: 1; }

    .qnb-table th {
        background: #252526;
        color: #4fc1ff;
        font-weight: 600;
        text-align: left;
        padding: 8px 12px;
        border-bottom: 2px solid #007acc;
        white-space: nowrap;
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .qnb-table td {
        padding: 6px 12px;
        border-bottom: 1px solid #2d2d2d;
        max-width: 400px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .qnb-table tr:hover td { background: #2a2d2e; }
    .qnb-table tr:nth-child(even) td { background: #1e1e1e; }
    .qnb-table tr:nth-child(even):hover td { background: #2a2d2e; }

    .qnb-null { color: #666; font-style: italic; }
    .qnb-number { color: #b5cea8; }
    .qnb-string { color: #ce9178; }
    .qnb-boolean { color: #569cd6; }
    .qnb-object { color: #9cdcfe; cursor: pointer; }

    /* ── Footer ──────────────────────────────────────────── */
    .qnb-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 4px;
        font-size: 11px;
        color: #888;
    }

    .qnb-footer-left {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .qnb-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.3px;
    }

    .qnb-badge-mysql { background: #00758f22; color: #00b4d8; border: 1px solid #00758f44; }
    .qnb-badge-mongodb { background: #00684a22; color: #00ed64; border: 1px solid #00684a44; }
    .qnb-badge-generic { background: #ffffff11; color: #aaa; border: 1px solid #ffffff22; }

    .qnb-rows-count { color: #aaa; }
    .qnb-time { color: #666; }

    /* ── Console Output ─────────────────────────────────── */
    .qnb-console {
        font-family: 'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace;
        font-size: 12.5px;
        line-height: 1.6;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 6px;
        padding: 12px 16px;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-x: auto;
        color: #d4d4d4;
        margin-bottom: 8px;
    }

    .qnb-stderr {
        color: #f4a460;
    }

    /* ── Error ───────────────────────────────────────────── */
    .qnb-error {
        background: #5a1d1d;
        border: 1px solid #f4484833;
        border-left: 4px solid #f44848;
        border-radius: 6px;
        padding: 12px 16px;
        color: #f48771;
        font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
        font-size: 12.5px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .qnb-error-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        margin-bottom: 6px;
        color: #f44848;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* ── Success ─────────────────────────────────────────── */
    .qnb-success {
        background: #1a3a1a;
        border: 1px solid #2ea04333;
        border-left: 4px solid #2ea043;
        border-radius: 6px;
        padding: 12px 16px;
        color: #7ee787;
        font-size: 12.5px;
        line-height: 1.5;
    }

    .qnb-success-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        margin-bottom: 4px;
        color: #2ea043;
        font-size: 12px;
    }

    /* ── Connection Required ─────────────────────────────── */
    .qnb-connect {
        background: #1e2a3a;
        border: 1px solid #007acc44;
        border-left: 4px solid #007acc;
        border-radius: 6px;
        padding: 12px 16px;
        color: #7ec8e3;
        font-size: 12.5px;
        line-height: 1.6;
    }

    .qnb-connect-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        margin-bottom: 6px;
        color: #4fc1ff;
        font-size: 12px;
    }

    .qnb-connect code {
        background: #ffffff12;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
        font-size: 11.5px;
    }

    /* ── JSON ────────────────────────────────────────────── */
    .qnb-json {
        font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.6;
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 6px;
        padding: 12px 16px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .qnb-json .json-key { color: #9cdcfe; }
    .qnb-json .json-string { color: #ce9178; }
    .qnb-json .json-number { color: #b5cea8; }
    .qnb-json .json-boolean { color: #569cd6; }
    .qnb-json .json-null { color: #569cd6; }

    /* ── HTTP Response ───────────────────────────────────── */
    .qnb-http-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 4px;
        font-weight: 700;
        font-size: 13px;
        margin-bottom: 8px;
    }

    .qnb-http-2xx { background: #2ea04322; color: #7ee787; border: 1px solid #2ea04344; }
    .qnb-http-3xx { background: #007acc22; color: #4fc1ff; border: 1px solid #007acc44; }
    .qnb-http-4xx { background: #f4484822; color: #f48771; border: 1px solid #f4484844; }
    .qnb-http-5xx { background: #a3333322; color: #f44848; border: 1px solid #a3333344; }

    .qnb-http-headers {
        font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
        font-size: 11px;
        color: #888;
        margin-bottom: 8px;
        padding: 8px 12px;
        background: #1a1a1a;
        border-radius: 4px;
        border: 1px solid #2d2d2d;
    }

    .qnb-http-headers summary {
        cursor: pointer;
        color: #aaa;
        font-size: 11px;
        margin-bottom: 4px;
    }

    .qnb-http-header-key { color: #4fc1ff; }
    .qnb-http-header-val { color: #ce9178; }

    /* ── Runtime Not Found ───────────────────────────────── */
    .qnb-runtime-missing {
        background: #3a2a1a;
        border: 1px solid #f4a46044;
        border-left: 4px solid #f4a460;
        border-radius: 6px;
        padding: 12px 16px;
        color: #f4c97e;
        font-size: 12.5px;
        line-height: 1.6;
    }

    .qnb-runtime-missing-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        margin-bottom: 6px;
        color: #f4a460;
        font-size: 12px;
    }

    .qnb-runtime-missing code {
        background: #ffffff12;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
        font-size: 11.5px;
    }
</style>
`;

// ─── Table ──────────────────────────────────────────────────────

export function renderTable(
    rows: Record<string, any>[],
    fields: string[],
    elapsedMs: number,
    dbType: string
): string {
    if (!fields || fields.length === 0) {
        if (rows.length > 0) { fields = Object.keys(rows[0]); }
        else { return renderSuccess('Query returned 0 rows.', elapsedMs, dbType); }
    }

    const maxRows = 500;
    const displayRows = rows.slice(0, maxRows);
    const truncated = rows.length > maxRows;

    const headerCells = fields.map(f => `<th>${esc(String(f))}</th>`).join('');
    const bodyRows = displayRows.map(row => {
        const cells = fields.map(f => `<td>${fmtCell(row[f])}</td>`).join('');
        return `<tr>${cells}</tr>`;
    }).join('\n');

    const { badgeClass, badgeIcon } = getBadge(dbType);

    return `${STYLES}
<div class="qnb-output">
    <div class="qnb-table-wrapper">
        <table class="qnb-table">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    </div>
    <div class="qnb-footer">
        <div class="qnb-footer-left">
            <span class="qnb-badge ${badgeClass}">${badgeIcon} ${dbType}</span>
            <span class="qnb-rows-count">${rows.length} row${rows.length !== 1 ? 's' : ''}${truncated ? ` (showing first ${maxRows})` : ''}</span>
        </div>
        <span class="qnb-time">⏱ ${elapsedMs}ms</span>
    </div>
</div>`;
}

// ─── Error ──────────────────────────────────────────────────────

export function renderError(message: string, source?: string): string {
    const badge = source
        ? (() => { const { badgeClass, badgeIcon } = getBadge(source); return `<span class="qnb-badge ${badgeClass}">${badgeIcon} ${source}</span>`; })()
        : '';

    return `${STYLES}
<div class="qnb-output">
    <div class="qnb-error">
        <div class="qnb-error-title">❌ Error ${badge}</div>
        ${esc(message)}
    </div>
</div>`;
}

// ─── Success ────────────────────────────────────────────────────

export function renderSuccess(message: string, elapsedMs: number, source: string): string {
    const { badgeClass, badgeIcon } = getBadge(source);

    return `${STYLES}
<div class="qnb-output">
    <div class="qnb-success">
        <div class="qnb-success-title">✅ Success</div>
        ${esc(message)}
    </div>
    <div class="qnb-footer">
        <div class="qnb-footer-left">
            <span class="qnb-badge ${badgeClass}">${badgeIcon} ${source}</span>
        </div>
        <span class="qnb-time">⏱ ${elapsedMs}ms</span>
    </div>
</div>`;
}

// ─── Connection Required ────────────────────────────────────────

export function renderConnectionRequired(dbType: string): string {
    return `${STYLES}
<div class="qnb-output">
    <div class="qnb-connect">
        <div class="qnb-connect-title">🔌 ${dbType} Connection Required</div>
        No active ${dbType} connection. Open the Command Palette and run:<br>
        <code>AnyINB: Configure Database Connection</code>
    </div>
</div>`;
}

// ─── JSON ───────────────────────────────────────────────────────

export function renderJson(data: any, elapsedMs: number, source: string): string {
    const highlighted = syntaxHighlightJson(JSON.stringify(data, null, 2));
    const { badgeClass, badgeIcon } = getBadge(source);
    const count = Array.isArray(data) ? `${data.length} document${data.length !== 1 ? 's' : ''}` : '1 document';

    return `${STYLES}
<div class="qnb-output">
    <div class="qnb-json">${highlighted}</div>
    <div class="qnb-footer">
        <div class="qnb-footer-left">
            <span class="qnb-badge ${badgeClass}">${badgeIcon} ${source}</span>
            <span class="qnb-rows-count">${count}</span>
        </div>
        <span class="qnb-time">⏱ ${elapsedMs}ms</span>
    </div>
</div>`;
}

// ─── Console Output (for programming languages) ─────────────────

export function renderConsoleOutput(
    stdout: string,
    stderr: string,
    exitCode: number,
    elapsedMs: number,
    langName: string,
    langIcon: string
): string {
    let consoleHtml = '';

    if (stdout) {
        consoleHtml += `<div class="qnb-console">${esc(stdout)}</div>`;
    }

    if (stderr) {
        consoleHtml += `<div class="qnb-console qnb-stderr">${esc(stderr)}</div>`;
    }

    if (!stdout && !stderr) {
        consoleHtml = `<div class="qnb-console" style="color:#666;font-style:italic;">(no output)</div>`;
    }

    const exitBadge = exitCode === 0
        ? '<span style="color:#7ee787;">✓ exit 0</span>'
        : `<span style="color:#f48771;">✗ exit ${exitCode}</span>`;

    return `${STYLES}
<div class="qnb-output">
    ${consoleHtml}
    <div class="qnb-footer">
        <div class="qnb-footer-left">
            <span class="qnb-badge qnb-badge-generic">${langIcon} ${langName}</span>
            ${exitBadge}
        </div>
        <span class="qnb-time">⏱ ${elapsedMs}ms</span>
    </div>
</div>`;
}

// ─── HTTP Response ──────────────────────────────────────────────

export function renderHttpResponse(result: HttpResult): string {
    const statusClass =
        result.status >= 500 ? 'qnb-http-5xx' :
        result.status >= 400 ? 'qnb-http-4xx' :
        result.status >= 300 ? 'qnb-http-3xx' :
        'qnb-http-2xx';

    // Try to format JSON body
    let bodyHtml: string;
    try {
        const parsed = JSON.parse(result.body);
        bodyHtml = `<div class="qnb-json">${syntaxHighlightJson(JSON.stringify(parsed, null, 2))}</div>`;
    } catch {
        bodyHtml = result.body
            ? `<div class="qnb-console">${esc(result.body)}</div>`
            : `<div class="qnb-console" style="color:#666;font-style:italic;">(empty body)</div>`;
    }

    // Headers
    const headersHtml = Object.entries(result.headers)
        .map(([k, v]) => `<span class="qnb-http-header-key">${esc(k)}</span>: <span class="qnb-http-header-val">${esc(v)}</span>`)
        .join('\n');

    return `${STYLES}
<div class="qnb-output">
    <div class="qnb-http-status ${statusClass}">
        ${result.status} ${esc(result.statusText)}
    </div>
    <details class="qnb-http-headers">
        <summary>Response Headers (${Object.keys(result.headers).length})</summary>
        <pre>${headersHtml}</pre>
    </details>
    ${bodyHtml}
    <div class="qnb-footer">
        <div class="qnb-footer-left">
            <span class="qnb-badge qnb-badge-generic">🌐 HTTP</span>
        </div>
        <span class="qnb-time">⏱ ${result.elapsed}ms</span>
    </div>
</div>`;
}

// ─── Runtime Not Found ──────────────────────────────────────────

export function renderRuntimeNotFound(langName: string, langIcon: string, langId: string): string {
    const installHints: Record<string, string> = {
        python: 'Install from python.org or run: <code>winget install Python.Python.3</code>',
        go: 'Install from go.dev or run: <code>winget install GoLang.Go</code>',
        rust: 'Install from rustup.rs or run: <code>curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh</code>',
        java: 'Install JDK from adoptium.net or run: <code>winget install EclipseAdoptium.Temurin.21.JDK</code>',
        ruby: 'Install from ruby-lang.org',
        php: 'Install from php.net',
        c: 'Install GCC: <code>winget install GnuWin32.GCC</code> or install MinGW/MSYS2',
        cpp: 'Install G++: <code>winget install GnuWin32.GCC</code> or install MinGW/MSYS2',
        typescript: 'Install tsx: <code>npm install -g tsx</code>',
        dart: 'Install from dart.dev',
        kotlin: 'Install from kotlinlang.org',
        swift: 'Install from swift.org',
    };

    const hint = installHints[langId] || `Make sure <code>${langId}</code> is installed and available in your PATH.`;

    return `${STYLES}
<div class="qnb-output">
    <div class="qnb-runtime-missing">
        <div class="qnb-runtime-missing-title">${langIcon} ${langName} Runtime Not Found</div>
        ${hint}<br><br>
        After installing, restart VS Code and try again.
    </div>
</div>`;
}

// ─── Helpers ────────────────────────────────────────────────────

function esc(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function fmtCell(val: any): string {
    if (val === null || val === undefined) {
        return '<span class="qnb-null">NULL</span>';
    }
    if (typeof val === 'number' || typeof val === 'bigint') {
        return `<span class="qnb-number">${val}</span>`;
    }
    if (typeof val === 'boolean') {
        return `<span class="qnb-boolean">${val}</span>`;
    }
    if (typeof val === 'object') {
        if (val instanceof Date) { return `<span class="qnb-string">${val.toISOString()}</span>`; }
        if (Buffer.isBuffer(val)) { return `<span class="qnb-string">[Buffer ${val.length} bytes]</span>`; }
        const json = JSON.stringify(val);
        const t = json.length > 100 ? json.substring(0, 100) + '…' : json;
        return `<span class="qnb-object" title="${esc(json)}">${esc(t)}</span>`;
    }
    const str = String(val);
    return str.length > 200 ? `<span class="qnb-string">${esc(str.substring(0, 200))}…</span>` : esc(str);
}

function getBadge(source: string): { badgeClass: string; badgeIcon: string } {
    const map: Record<string, { badgeClass: string; badgeIcon: string }> = {
        'MySQL': { badgeClass: 'qnb-badge-mysql', badgeIcon: '🐬' },
        'MongoDB': { badgeClass: 'qnb-badge-mongodb', badgeIcon: '🍃' },
    };
    return map[source] || { badgeClass: 'qnb-badge-generic', badgeIcon: '▶️' };
}

function syntaxHighlightJson(json: string): string {
    return esc(json).replace(
        /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        (match) => {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                cls = /:$/.test(match) ? 'json-key' : 'json-string';
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return `<span class="${cls}">${match}</span>`;
        }
    );
}
