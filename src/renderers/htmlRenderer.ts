/**
 * HTML renderer for AnyINB notebook cells.
 * 100% Seamless, Pure .ipynb-identical rendering with syntax-colored text.
 * Zero AI-slop cards, zero background boxes, zero artificial borders.
 */

import * as vscode from 'vscode';
import { HttpResult } from '../executors/httpExecutor';
import { DataContext } from '../dataContext';

export interface RendererConfig {
    theme: string;
    maxHeight: number;
    fontSize: number;
}

export function getRendererConfig(): RendererConfig {
    try {
        const c = vscode.workspace.getConfiguration('anyinb');
        return {
            theme: c.get<string>('outputTheme', 'mongosh-terminal'),
            maxHeight: c.get<number>('maxOutputHeight', 450),
            fontSize: c.get<number>('fontSize', 13)
        };
    } catch {
        return { theme: 'mongosh-terminal', maxHeight: 450, fontSize: 13 };
    }
}

const STYLES = `<style>
*{box-sizing:border-box;margin:0;padding:0;}
.qnb-output{font-family:Consolas,'Cascadia Code','Fira Code','Courier New',monospace;font-size:var(--qnb-font-size,13px);line-height:1.45;color:var(--qnb-text);background:transparent!important;width:100%;margin:2px 0 4px 0;}
.qnb-output{--qnb-text:#d4d4d4;--qnb-key:#e0e0e0;--qnb-str:#23d18b;--qnb-num:#23d18b;--qnb-bool:#e5c07b;--qnb-null:#888888;--qnb-id:#23d18b;--qnb-border:rgba(128,128,128,0.2);--qnb-hover:rgba(255,255,255,0.04);}
.qnb-output[data-theme="dracula"]{--qnb-text:#f8f8f2;--qnb-key:#f8f8f2;--qnb-str:#50fa7b;--qnb-num:#bd93f9;--qnb-bool:#ff79c6;--qnb-null:#6272a4;--qnb-id:#50fa7b;--qnb-border:rgba(68,71,90,0.4);--qnb-hover:rgba(68,71,90,0.2);}
.qnb-output[data-theme="tokyo-night"]{--qnb-text:#a9b1d6;--qnb-key:#c0caf5;--qnb-str:#9ece6a;--qnb-num:#ff9e64;--qnb-bool:#f7768e;--qnb-null:#565f89;--qnb-id:#9ece6a;--qnb-border:rgba(41,46,66,0.5);--qnb-hover:rgba(41,46,66,0.25);}
.qnb-output[data-theme="monokai"]{--qnb-text:#f8f8f2;--qnb-key:#66d9ef;--qnb-str:#a6e22e;--qnb-num:#ae81ff;--qnb-bool:#f92672;--qnb-null:#75715e;--qnb-id:#a6e22e;--qnb-border:rgba(62,61,50,0.5);--qnb-hover:rgba(62,61,50,0.25);}
.qnb-output[data-theme="one-dark"]{--qnb-text:#abb2bf;--qnb-key:#61afef;--qnb-str:#98c379;--qnb-num:#d19a66;--qnb-bool:#e06c75;--qnb-null:#5c6370;--qnb-id:#98c379;--qnb-border:rgba(62,68,81,0.4);--qnb-hover:rgba(62,68,81,0.2);}
.qnb-output[data-theme="nord"]{--qnb-text:#eceff4;--qnb-key:#88c0d0;--qnb-str:#a3be8c;--qnb-num:#b48ead;--qnb-bool:#bf616a;--qnb-null:#4c566a;--qnb-id:#a3be8c;--qnb-border:rgba(67,76,94,0.4);--qnb-hover:rgba(67,76,94,0.2);}
.qnb-output[data-theme="github-dark"]{--qnb-text:#c9d1d9;--qnb-key:#79c0ff;--qnb-str:#7ee787;--qnb-num:#79c0ff;--qnb-bool:#ff7b72;--qnb-null:#8b949e;--qnb-id:#7ee787;--qnb-border:rgba(48,54,61,0.4);--qnb-hover:rgba(48,54,61,0.2);}
.qnb-output[data-theme="solarized-dark"]{--qnb-text:#839496;--qnb-key:#268bd2;--qnb-str:#859900;--qnb-num:#2aa198;--qnb-bool:#cb4b16;--qnb-null:#586e75;--qnb-id:#859900;--qnb-border:rgba(88,110,117,0.4);--qnb-hover:rgba(88,110,117,0.2);}
.qnb-mongosh,.qnb-json{font-family:inherit;font-size:inherit;line-height:inherit;background:transparent!important;border:none!important;padding:0!important;margin:0!important;white-space:pre-wrap;word-break:break-word;color:var(--qnb-text);overflow-y:auto;max-height:var(--qnb-max-height,450px);}
.qnb-mongosh::-webkit-scrollbar,.qnb-table-wrap::-webkit-scrollbar{width:6px;height:6px;}
.qnb-mongosh::-webkit-scrollbar-thumb,.qnb-table-wrap::-webkit-scrollbar-thumb{background:rgba(128,128,128,0.3);border-radius:3px;}
.qnb-mongosh::-webkit-scrollbar-thumb:hover,.qnb-table-wrap::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,0.5);}
.qnb-mongosh .mongosh-key,.qnb-json .json-key{color:var(--qnb-key);}
.qnb-mongosh .mongosh-str,.qnb-json .json-string{color:var(--qnb-str);}
.qnb-mongosh .mongosh-num,.qnb-json .json-number{color:var(--qnb-num);}
.qnb-mongosh .mongosh-bool,.qnb-json .json-boolean{color:var(--qnb-bool);}
.qnb-mongosh .mongosh-null,.qnb-json .json-null{color:var(--qnb-null);font-style:italic;}
.qnb-table-wrap{overflow:auto;max-height:var(--qnb-max-height,450px);margin:2px 0;background:transparent;}
.qnb-table{width:100%;border-collapse:collapse;font-size:12px;line-height:1.45;font-family:inherit;background:transparent;}
.qnb-table thead{position:sticky;top:0;}
.qnb-table th{color:var(--qnb-key);font-weight:600;text-align:left;padding:4px 10px;border-bottom:1px solid var(--qnb-border);background:transparent;}
.qnb-table td{padding:3px 10px;border-bottom:1px solid var(--qnb-border);color:var(--qnb-text);max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.qnb-table tr:hover td{background:var(--qnb-hover);}
.qnb-td-idx,.qnb-th-idx{width:32px;color:var(--qnb-null);text-align:center;}
</style>`;

// ─── Table (SQL & Tabular Data) ─────────────────────────────────

export function renderTable(rows: Record<string, any>[], fields: string[], elapsedMs: number, dbType: string, queryText?: string): string {
    const config = getRendererConfig();
    if (!fields?.length) {
        if (rows.length) fields = Object.keys(rows[0]);
        else return renderSuccess('0 rows returned.', elapsedMs, dbType);
    }

    // Save to DataContext for Polyglot Data Piping
    DataContext.getInstance().setLastResult({ rows, fields, source: dbType });

    const isMongo = dbType.toLowerCase().includes('mongo');
    if (isMongo) {
        return renderJson(rows, elapsedMs, dbType);
    }

    const previewRows = rows.slice(0, 500);
    const headerCells = `<th class="qnb-th-idx">#</th>` + fields.map(f => `<th>${esc(String(f))}</th>`).join('');
    const bodyRows = previewRows.map((row, i) =>
        `<tr><td class="qnb-td-idx">${i + 1}</td>` + fields.map(f => `<td>${row ? fmtCell(row[f]) : '<span class="mongosh-null">null</span>'}</td>`).join('') + `</tr>`
    ).join('\n');

    return `${STYLES}
<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;--qnb-max-height:${config.maxHeight > 0 ? config.maxHeight + 'px' : 'none'};">
    <div class="qnb-table-wrap"><table class="qnb-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>
</div>`;
}

// ─── JSON & MongoDB Document Output ─────────────────────────────

export function renderJson(data: any, elapsedMs: number, source: string): string {
    const config = getRendererConfig();
    DataContext.getInstance().setLastResult({ rawJson: data, source });

    return `${STYLES}
<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;--qnb-max-height:${config.maxHeight > 0 ? config.maxHeight + 'px' : 'none'};">
    <div class="qnb-mongosh">${mongoshFormatValue(data, 0)}</div>
</div>`;
}

// ─── Success & Error Monospace Text ─────────────────────────────

export function renderSuccess(message: string, elapsedMs: number, source: string): string {
    const config = getRendererConfig();
    return `${STYLES}<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;"><div class="qnb-mongosh" style="color:var(--qnb-str);">${esc(message)}</div></div>`;
}

export function renderError(message: string, source?: string): string {
    const config = getRendererConfig();
    return `${STYLES}<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;"><div class="qnb-mongosh" style="color:#f48771;">${esc(message)}</div></div>`;
}

export function renderConnectionRequired(dbType: string): string {
    const cmd = `command:anyinb.quickConnect?${encodeURIComponent(JSON.stringify(dbType.toLowerCase()))}`;
    return `${STYLES}<div class="qnb-output" style="color:#e5c07b;">${dbType} connection required. <a href="${cmd}" style="color:var(--qnb-str,#23d18b);text-decoration:underline;">⚡ Connect</a></div>`;
}

export function renderHttpResponse(result: HttpResult): string {
    const config = getRendererConfig();
    let body = result.body;
    try {
        const parsed = JSON.parse(result.body);
        DataContext.getInstance().setLastResult({ rawJson: parsed, source: 'HTTP' });
        body = mongoshFormatValue(parsed, 0);
    } catch {
        DataContext.getInstance().setLastResult({ rawJson: result.body, source: 'HTTP' });
        body = esc(result.body);
    }
    const stCol = result.status >= 400 ? '#f48771' : 'var(--qnb-str)';
    return `${STYLES}<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;"><div style="color:${stCol};font-weight:600;margin-bottom:2px;">${result.status} ${esc(result.statusText)}</div><div class="qnb-mongosh">${body}</div></div>`;
}

export function renderMockEndpointCreated(method: string, endpointUrl: string, elapsedMs: number): string {
    const config = getRendererConfig();
    return `${STYLES}<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;"><div class="qnb-mongosh" style="color:var(--qnb-str);">⚡ Mock API Active: <code>${method} ${endpointUrl}</code></div></div>`;
}

export function renderRuntimeNotFound(langName: string, langIcon: string, langId: string): string {
    return `${STYLES}<div class="qnb-output" style="color:#e5c07b;">${langName} runtime not found. Make sure <code>${langId}</code> is installed and in your PATH.</div>`;
}

// ─── Formatters & Value Syntax Highlighting ─────────────────────

function isObjectId(v: any): boolean {
    if (!v) return false;
    if (typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v)) return true;
    if (typeof v.toHexString === 'function') return true;
    if (v._bsontype && String(v._bsontype).toLowerCase() === 'objectid') return true;
    if (v.buffer && typeof v.buffer === 'object' && Object.keys(v.buffer).length === 12) return true;
    if (v.id && (Buffer.isBuffer(v.id) || (typeof v.id === 'object' && Object.keys(v.id).length === 12))) return true;
    return false;
}

function getObjectIdString(v: any): string {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v.toHexString === 'function') return v.toHexString();
    const buf = v.id || v.buffer;
    if (buf) {
        if (Buffer.isBuffer(buf) || buf instanceof Uint8Array) return Buffer.from(buf).toString('hex');
        if (typeof buf === 'object') return Buffer.from(Object.values(buf).map((b: any) => Number(b))).toString('hex');
    }
    return String(v);
}

function mongoshFormatValue(val: any, indent = 0, parentKey?: string): string {
    const pad = '  '.repeat(indent), padInner = '  '.repeat(indent + 1);
    if (val === null || val === undefined) return `<span class="mongosh-null">null</span>`;
    if (typeof val === 'boolean') return `<span class="mongosh-bool">${val}</span>`;
    if (typeof val === 'number' || typeof val === 'bigint') return `<span class="mongosh-num">${val}</span>`;
    if (isObjectId(val) || (parentKey === '_id' && typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val))) {
        return `ObjectId('<span class="mongosh-str">${esc(getObjectIdString(val))}</span>')`;
    }
    if (val._bsontype === 'Decimal128' || val._bsontype === 'Long') return `${val._bsontype}('<span class="mongosh-str">${esc(val.toString())}</span>')`;
    if (val._bsontype === 'Int32') return `NumberInt(<span class="mongosh-num">${val.value ?? val}</span>)`;
    if (val._bsontype === 'Timestamp') return `Timestamp({ t: ${val.t ?? 0}, i: ${val.i ?? 0} })`;
    if (val._bsontype === 'Binary' || Buffer.isBuffer(val) || val.sub_type !== undefined) {
        if (val.sub_type === 4 && (val.buffer || val.id)) return `UUID('<span class="mongosh-str">${esc(getObjectIdString(val.buffer || val.id))}</span>')`;
        return `Binary.createFromBase64('<span class="mongosh-str">${esc(val.toString ? val.toString('base64') : '')}</span>')`;
    }
    if (val instanceof Date) return `ISODate('<span class="mongosh-str">${esc(val.toISOString())}</span>')`;
    if (typeof val === 'string') {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/i.test(val)) return `ISODate('<span class="mongosh-str">${esc(val)}</span>')`;
        return `<span class="mongosh-str">'${esc(val)}'</span>`;
    }
    if (Array.isArray(val)) {
        if (!val.length) return `[]`;
        return `[\n${val.map(v => `${padInner}${mongoshFormatValue(v, indent + 1)}`).join(',\n')}\n${pad}]`;
    }
    if (typeof val === 'object') {
        const keys = Object.keys(val);
        if (!keys.length) return `{}`;
        const entries = keys.map(k => {
            const keyDisplay = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? esc(k) : `'${esc(k)}'`;
            return `${padInner}<span class="mongosh-key">${keyDisplay}</span>: ${mongoshFormatValue(val[k], indent + 1, k)}`;
        }).join(',\n');
        return `{\n${entries}\n${pad}}`;
    }
    return esc(String(val));
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function fmtCell(val: any): string {
    if (val === null || val === undefined) return '<span class="mongosh-null">null</span>';
    if (isObjectId(val)) return `<span class="mongosh-str">${esc(getObjectIdString(val))}</span>`;
    if (typeof val === 'number' || typeof val === 'bigint') return `<span class="mongosh-num">${val}</span>`;
    if (typeof val === 'boolean') return `<span class="mongosh-bool">${val}</span>`;
    if (typeof val === 'object') {
        if (val instanceof Date) return `<span class="mongosh-str">${val.toISOString()}</span>`;
        const json = JSON.stringify(val);
        return `<span>${esc(json.length > 80 ? json.substring(0, 80) + '…' : json)}</span>`;
    }
    const str = String(val);
    return str.length > 150 ? `<span>${esc(str.substring(0, 150))}…</span>` : esc(str);
}
