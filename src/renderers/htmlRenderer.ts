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
.qnb-table td{padding:3px 10px;border-bottom:1px solid var(--qnb-border);color:var(--qnb-text);max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}
.qnb-table tr:hover td{background:var(--qnb-hover);}
.qnb-td-idx,.qnb-th-idx{width:32px;color:var(--qnb-null);text-align:center;}
.qnb-mongo-toolbar{display:flex;align-items:center;justify-content:space-between;padding:3px 2px 6px 2px;font-size:11px;border-bottom:1px solid var(--qnb-border);margin-bottom:6px;user-select:none;}
.qnb-mongo-meta{display:flex;align-items:center;gap:6px;color:var(--qnb-text);opacity:0.85;}
.qnb-mongo-badge{background:rgba(0,237,100,0.12);color:#00ED64;font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:0.5px;}
.qnb-mongo-time{opacity:0.6;}
.qnb-seg-control{display:inline-flex;background:rgba(128,128,128,0.12);padding:2px;border-radius:4px;gap:2px;border:1px solid var(--qnb-border);}
.qnb-seg-btn{display:inline-flex;align-items:center;padding:2px 8px;font-size:11px;border-radius:3px;cursor:pointer;user-select:none;color:var(--qnb-text);opacity:0.65;transition:all 0.15s ease;}
.qnb-seg-btn:hover{opacity:1;background:rgba(255,255,255,0.06);}
.qnb-radio-table:checked ~ .qnb-mongo-toolbar .qnb-seg-table{background:rgba(0,237,100,0.22);color:#00ED64;font-weight:600;opacity:1;box-shadow:0 1px 2px rgba(0,0,0,0.2);}
.qnb-radio-json:checked ~ .qnb-mongo-toolbar .qnb-seg-json{background:rgba(0,237,100,0.22);color:#00ED64;font-weight:600;opacity:1;box-shadow:0 1px 2px rgba(0,0,0,0.2);}
.qnb-radio-table:checked ~ .qnb-view-table{display:block;}
.qnb-radio-table:checked ~ .qnb-view-json{display:none;}
.qnb-radio-json:checked ~ .qnb-view-table{display:none;}
.qnb-radio-json:checked ~ .qnb-view-json{display:block;}
.qnb-th-inner{display:flex;align-items:baseline;gap:6px;}
.qnb-th-name{font-weight:600;color:var(--qnb-key);}
.qnb-th-type{font-size:10px;font-weight:normal;opacity:0.6;font-style:italic;color:var(--qnb-str);}
.qnb-cell-missing{color:var(--qnb-null);opacity:0.4;font-weight:bold;}
.qnb-cell-oid{color:var(--qnb-id);font-family:inherit;}
.qnb-cell-str{color:var(--qnb-text);}
.qnb-pill{display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:500;}
.qnb-pill-array{background:rgba(229,192,123,0.15);color:#e5c07b;border:1px solid rgba(229,192,123,0.3);}
.qnb-pill-obj{background:rgba(97,175,239,0.15);color:#61afef;border:1px solid rgba(97,175,239,0.3);}
</style>`;

// ─── Table (SQL & Tabular Data) ─────────────────────────────────

export function renderTable(rows: Record<string, any>[], fields: string[], elapsedMs: number, dbType: string, _queryText?: string): string {
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
    void elapsedMs;

    return `${STYLES}
<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;--qnb-max-height:${config.maxHeight > 0 ? config.maxHeight + 'px' : 'none'};">
    <div class="qnb-mongosh">${mongoshFormatValue(data, 0)}</div>
</div>`;
}

// ─── MongoDB Visual Table & Dual-View Switcher ──────────────────

export function renderMongoTable(data: any, elapsedMs: number): string {
    const config = getRendererConfig();
    const rows: Record<string, any>[] = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);

    // Also pipe to DataContext
    DataContext.getInstance().setLastResult({ rawJson: data, source: 'MongoDB' });

    if (!rows.length) {
        return `${STYLES}
<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;">
    <div class="qnb-mongo-toolbar">
        <div class="qnb-mongo-meta">
            <span class="qnb-mongo-badge">MongoDB</span>
            <strong>0 documents</strong>
            <span class="qnb-mongo-time">• ${elapsedMs}ms</span>
        </div>
    </div>
    <div class="qnb-mongosh" style="opacity:0.7;padding:2px 0;">[]</div>
</div>`;
    }

    // Dynamic field detection across all documents
    const fieldSet = new Set<string>();
    for (const r of rows) {
        if (r && typeof r === 'object') {
            for (const k of Object.keys(r)) {
                fieldSet.add(k);
            }
        }
    }
    const fields = Array.from(fieldSet);
    const idIdx = fields.indexOf('_id');
    if (idIdx > -1) {
        fields.splice(idIdx, 1);
        fields.unshift('_id');
    }

    // Column type determination
    const colTypes: Record<string, string> = {};
    for (const f of fields) {
        const types = new Set<string>();
        for (const r of rows) {
            if (r && typeof r === 'object' && f in r) {
                types.add(getBsonType(r[f]));
            }
        }
        if (types.size === 0) colTypes[f] = 'null';
        else if (types.size === 1) colTypes[f] = Array.from(types)[0];
        else colTypes[f] = 'mixed';
    }

    const uid = 'mg_' + Math.random().toString(36).substring(2, 9);
    const previewRows = rows.slice(0, 500);

    const headerCells = `<th class="qnb-th-idx">#</th>` + fields.map(f => {
        const typeBadge = colTypes[f] ? `<span class="qnb-th-type">${esc(colTypes[f])}</span>` : '';
        return `<th><div class="qnb-th-inner"><span class="qnb-th-name">${esc(f)}</span>${typeBadge}</div></th>`;
    }).join('');

    const bodyRows = previewRows.map((r, i) => {
        const cells = fields.map(f => {
            const present = r && typeof r === 'object' && f in r;
            return `<td>${formatMongoTableCell(r?.[f], present)}</td>`;
        }).join('');
        return `<tr><td class="qnb-td-idx">${i + 1}</td>${cells}</tr>`;
    }).join('\n');

    return `${STYLES}
<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;--qnb-max-height:${config.maxHeight > 0 ? config.maxHeight + 'px' : 'none'};">
    <input type="radio" name="mongo_view_${uid}" id="tab_table_${uid}" checked class="qnb-radio-table" style="display:none;">
    <input type="radio" name="mongo_view_${uid}" id="tab_json_${uid}" class="qnb-radio-json" style="display:none;">

    <div class="qnb-mongo-toolbar">
        <div class="qnb-mongo-meta">
            <span class="qnb-mongo-badge">MongoDB</span>
            <strong>${rows.length} document${rows.length === 1 ? '' : 's'}</strong>
            <span class="qnb-mongo-time">• ${elapsedMs}ms</span>
        </div>
        <div class="qnb-seg-control">
            <label for="tab_table_${uid}" class="qnb-seg-btn qnb-seg-table" title="View as Table">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-1px;margin-right:4px;"><path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm1 2v4h6V1H2a1 1 0 0 0-1 1zm7-3v7h7V2a1 1 0 0 0-1-1H8zm7 8H8v6h6a1 1 0 0 0 1-1V9zm-8 6V9H1v5a1 1 0 0 0 1 1h6z"/></svg>Table
            </label>
            <label for="tab_json_${uid}" class="qnb-seg-btn qnb-seg-json" title="View as JSON (mongosh)">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-1px;margin-right:4px;"><path d="M10.478 1.647a.5.5 0 1 0-.956-.294l-4 13a.5.5 0 0 0 .956.294l4-13zM4.854 4.146a.5.5 0 0 1 0 .708L1.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0zm6.292 0a.5.5 0 0 0 0 .708L14.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0z"/></svg>JSON
            </label>
        </div>
    </div>

    <div class="qnb-view-table">
        <div class="qnb-table-wrap">
            <table class="qnb-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    </div>

    <div class="qnb-view-json">
        <div class="qnb-mongosh">${mongoshFormatValue(data, 0)}</div>
    </div>
</div>`;
}

function getBsonType(val: any): string {
    if (val === undefined) return 'missing';
    if (val === null) return 'null';
    if (isObjectId(val) || (typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val))) return 'ObjectId';
    if (typeof val === 'string') return 'string';
    if (typeof val === 'number') return Number.isInteger(val) ? 'int32' : 'double';
    if (typeof val === 'bigint') return 'int64';
    if (typeof val === 'boolean') return 'bool';
    if (val instanceof Date) return 'date';
    if (Array.isArray(val)) return 'array';
    if (val && val._bsontype) return String(val._bsontype).toLowerCase();
    if (typeof val === 'object') return 'object';
    return typeof val;
}

function formatMongoTableCell(val: any, fieldPresent: boolean): string {
    if (!fieldPresent) {
        return '<span class="qnb-cell-missing" title="Field not present in document">—</span>';
    }
    if (val === null || val === undefined) {
        return '<span class="mongosh-null">null</span>';
    }
    if (isObjectId(val) || (typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val))) {
        const hex = getObjectIdString(val);
        return `<span class="qnb-cell-oid" title="ObjectId('${esc(hex)}')">${esc(hex)}</span>`;
    }
    if (typeof val === 'string') {
        return `<span class="qnb-cell-str">${esc(val)}</span>`;
    }
    if (typeof val === 'number' || typeof val === 'bigint') {
        return `<span class="mongosh-num">${val}</span>`;
    }
    if (typeof val === 'boolean') {
        return `<span class="mongosh-bool">${val}</span>`;
    }
    if (val instanceof Date) {
        return `<span class="qnb-cell-date">${esc(val.toISOString())}</span>`;
    }
    if (Array.isArray(val)) {
        const preview = JSON.stringify(val);
        return `<span class="qnb-pill qnb-pill-array" title="${esc(preview)}">Array(${val.length})</span>`;
    }
    if (typeof val === 'object') {
        const preview = JSON.stringify(val);
        const keys = Object.keys(val).length;
        return `<span class="qnb-pill qnb-pill-obj" title="${esc(preview)}">{ ${keys} field${keys === 1 ? '' : 's'} }</span>`;
    }
    return esc(String(val));
}

// ─── Success & Error Monospace Text ─────────────────────────────

export function renderSuccess(message: string, _elapsedMs: number, _source: string): string {
    const config = getRendererConfig();
    return `${STYLES}<div class="qnb-output" data-theme="${config.theme}" style="--qnb-font-size:${config.fontSize}px;"><div class="qnb-mongosh" style="color:var(--qnb-str);">${esc(message)}</div></div>`;
}

export function renderError(message: string, _source?: string): string {
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

export function renderMockEndpointCreated(method: string, endpointUrl: string, _elapsedMs: number): string {
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

function mongoshFormatValue(val: any, indent = 0, parentKey?: string, seen = new WeakSet<object>()): string {
    const pad = '  '.repeat(indent), padInner = '  '.repeat(indent + 1);
    if (val === null || val === undefined) return `<span class="mongosh-null">null</span>`;
    if (typeof val === 'boolean') return `<span class="mongosh-bool">${val}</span>`;
    if (typeof val === 'number' || typeof val === 'bigint') return `<span class="mongosh-num">${val}</span>`;

    if (val !== null && typeof val === 'object') {
        if (seen.has(val)) {
            return `<span class="mongosh-null">[Circular]</span>`;
        }
        if (indent > 15) {
            return `<span class="mongosh-null">[Max Depth]</span>`;
        }
        seen.add(val);
    }

    if (isObjectId(val) || (parentKey === '_id' && typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val))) {
        return `ObjectId('<span class="mongosh-str">${esc(getObjectIdString(val))}</span>')`;
    }
    if (val._bsontype === 'Decimal128' || val._bsontype === 'Long') return `${val._bsontype}('<span class="mongosh-str">${esc(val.toString())}</span>')`;
    if (val._bsontype === 'Int32') return `NumberInt(<span class="mongosh-num">${val.value ?? val}</span>)`;
    if (val._bsontype === 'Timestamp') return `Timestamp({ t: ${val.t ?? 0}, i: ${val.i ?? 0} })`;
    if (val._bsontype === 'Binary' || Buffer.isBuffer(val) || (val.sub_type !== undefined && (val.buffer || Buffer.isBuffer(val.value)))) {
        const buf = Buffer.isBuffer(val) ? val : (val.buffer || val.value);
        if (val.sub_type === 4 && (val.buffer || val.id)) return `UUID('<span class="mongosh-str">${esc(getObjectIdString(val.buffer || val.id))}</span>')`;
        const base64Str = Buffer.isBuffer(buf) ? buf.toString('base64') : (typeof val.toString === 'function' && val.toString !== Object.prototype.toString ? val.toString('base64') : '');
        return `Binary.createFromBase64('<span class="mongosh-str">${esc(base64Str)}</span>')`;
    }
    if (val instanceof Date) return `ISODate('<span class="mongosh-str">${esc(val.toISOString())}</span>')`;
    if (typeof val === 'string') {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/i.test(val)) return `ISODate('<span class="mongosh-str">${esc(val)}</span>')`;
        return `<span class="mongosh-str">'${esc(val)}'</span>`;
    }
    if (Array.isArray(val)) {
        if (!val.length) return `[]`;
        return `[\n${val.map(v => `${padInner}${mongoshFormatValue(v, indent + 1, undefined, seen)}`).join(',\n')}\n${pad}]`;
    }
    if (typeof val === 'object') {
        let keys: string[] = [];
        try {
            keys = Object.keys(val);
        } catch {
            return esc(String(val));
        }
        if (!keys.length) return `{}`;
        const entries = keys.map(k => {
            const keyDisplay = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? esc(k) : `'${esc(k)}'`;
            let childVal: any;
            try {
                childVal = val[k];
            } catch (e: any) {
                childVal = `[Error: ${e.message}]`;
            }
            return `${padInner}<span class="mongosh-key">${keyDisplay}</span>: ${mongoshFormatValue(childVal, indent + 1, k, seen)}`;
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
