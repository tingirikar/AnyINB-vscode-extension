import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConnectionManager } from './connectionManager';
import { ProcessExecutor, LANGUAGE_CONFIGS } from './executors/processExecutor';
import { ShellExecutor } from './executors/shellExecutor';
import { HttpExecutor } from './executors/httpExecutor';
import { ReplExecutor } from './executors/replExecutor';
import { GraphqlExecutor } from './executors/graphqlExecutor';
import { WebsocketExecutor } from './executors/websocketExecutor';
import { RuntimeDetector } from './runtimeDetector';
import {
    renderTable, renderError, renderJson, renderSuccess,
    renderConnectionRequired, renderHttpResponse,
    renderRuntimeNotFound, renderMockEndpointCreated
} from './renderers/htmlRenderer';

import { DataContext } from './dataContext';
import { MockServer } from './mockServer';
import {
    ALL_SUPPORTED_LANGUAGES,
    HTTP_LANGUAGES,
    NOTEBOOK_CONTROLLER_ID,
    NOTEBOOK_LABEL,
    NOTEBOOK_TYPE,
    PROCESS_LANGUAGES,
    SHELL_LANGUAGES,
} from './config';

export function normalizePythonMagicCommand(code: string): { command: string; shellType: 'bash' | 'powershell' } {
    const cleanCmd = code
        .replace(/^\s*%pip\s+/i, 'python -m pip ')
        .replace(/^\s*!pip\s+/i, 'python -m pip ')
        .replace(/^\s*%conda\s+/i, 'conda ')
        .replace(/^\s*!\s*/, '');

    return {
        command: cleanCmd.trim(),
        shellType: process.platform === 'win32' ? 'powershell' : 'bash',
    };
}

/**
 * AnyINB NotebookController — the brain of the extension.
 * Routes cell execution to the appropriate executor based on language.
 */
export class AnyInbController {
    readonly controllerId = NOTEBOOK_CONTROLLER_ID;
    readonly notebookType = NOTEBOOK_TYPE;
    readonly label = NOTEBOOK_LABEL;

    private readonly _controller: vscode.NotebookController;
    private _executionOrder = 0;

    // Track the last cell that needed a DB connection (for auto-re-execute after quickConnect)
    private _pendingCell: vscode.NotebookCell | null = null;

    private processExecutor: ProcessExecutor;
    private shellExecutor: ShellExecutor;
    private httpExecutor: HttpExecutor;
    private runtimeDetector: RuntimeDetector;
    private replExecutor: ReplExecutor;
    private graphqlExecutor: GraphqlExecutor;
    private websocketExecutor: WebsocketExecutor;

    constructor(private connectionManager: ConnectionManager) {
        this._controller = vscode.notebooks.createNotebookController(
            this.controllerId,
            this.notebookType,
            this.label
        );

        this._controller.supportedLanguages = ALL_SUPPORTED_LANGUAGES;
        this._controller.supportsExecutionOrder = true;
        this._controller.description = 'Run any language — databases, scripts, APIs';
        this._controller.executeHandler = this._executeAll.bind(this);

        this.processExecutor = new ProcessExecutor();
        this.shellExecutor = new ShellExecutor();
        this.httpExecutor = new HttpExecutor();
        this.runtimeDetector = new RuntimeDetector();
        this.replExecutor = new ReplExecutor();
        this.graphqlExecutor = new GraphqlExecutor();
        this.websocketExecutor = new WebsocketExecutor();
    }

    private async _executeAll(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): Promise<void> {
        const mode = vscode.workspace.getConfiguration('anyinb').get<string>('runAllMode', 'sequential');

        if (mode === 'concurrent') {
            await Promise.all(cells.map(cell => this._doExecution(cell)));
        } else {
            for (const cell of cells) {
                await this._doExecution(cell);
            }
        }
    }

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
        const execution = this._controller.createNotebookCellExecution(cell);
        execution.executionOrder = ++this._executionOrder;
        execution.start(Date.now());

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            dotenv.config({ path: path.join(workspaceFolder.uri.fsPath, '.env'), override: true });
        }

        let code = cell.document.getText().trim();
        let language = cell.document.languageId;

        if (!code) {
            execution.clearOutput();
            execution.end(true, Date.now());
            return;
        }

        // Smart Auto-Detect: Only auto-switch language if cell is unassigned or plaintext
        if (!language || language === 'plaintext') {
            const detectedLang = this._detectLanguage(code, language);
            if (detectedLang && detectedLang !== language) {
                try {
                    await vscode.languages.setTextDocumentLanguage(cell.document, detectedLang);
                    language = detectedLang;
                } catch {}
            }
        }

        // Feature: Live Mock API Server inside Notebook
        const mockEndpoint = MockServer.getInstance().parseEndpointHeader(code);
        if (mockEndpoint) {
            try {
                const url = await MockServer.getInstance().registerEndpoint(
                    mockEndpoint.method,
                    mockEndpoint.path,
                    mockEndpoint.body
                );
                this._outputHtml(execution, renderMockEndpointCreated(mockEndpoint.method, url, 1), true);
                return;
            } catch (err: any) {
                this._outputHtml(execution, renderError(`Failed to start Mock Server: ${err.message}`, 'MockServer'), false);
                return;
            }
        }

        try {
            // Route to the right executor
            if (language === 'mysql' || language === 'sql') {
                await this._executeMySql(execution, code, cell);
            } else if (language === 'postgres') {
                await this._executePostgres(execution, code, cell);
            } else if (language === 'sqlite') {
                await this._executeSqlite(execution, code, cell);
            } else if (language === 'redis') {
                await this._executeRedis(execution, code, cell);
            } else if (language === 'mongodb' || language === 'mongosh') {
                await this._executeMongo(execution, code, cell);
            } else if (language === 'graphql') {
                await this._executeGraphql(execution, code);
            } else if (language === 'websocket') {
                await this._executeWebsocket(execution, code);
            } else if (language === 'python' || language === 'javascript' || language === 'bash' || language === 'shellscript') {
                await this._executeRepl(execution, code, language);
            } else if (PROCESS_LANGUAGES.includes(language)) {
                await this._executeProcess(execution, code, language);
            } else if (SHELL_LANGUAGES.includes(language)) {
                await this._executeShell(execution, code, language);
            } else if (HTTP_LANGUAGES.includes(language)) {
                await this._executeHttp(execution, code);
            } else {
                // Try as a process language anyway
                await this._executeProcess(execution, code, language);
            }
        } catch (err: any) {
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(
                        renderError(err.message || String(err)),
                        'text/html'
                    )
                ])
            ]);
            execution.end(false, Date.now());
        }
    }

    /**
     * Smart Auto-Detect Language:
     * Analyzes code structure and keywords to identify the intended programming
     * or database language, auto-switching the cell's language mode on the fly.
     */
    private _detectLanguage(code: string, currentLanguage: string): string {
        const trimmed = code.trim();
        if (!trimmed) return currentLanguage;

        // If the user already chose a database or SQL language, keep it
        const sqlDialects = ['mysql', 'postgres', 'sqlite', 'sql'];
        if (sqlDialects.includes(currentLanguage.toLowerCase())) {
            return currentLanguage;
        }

        // 1. Java
        if (/\bpublic\s+(class|interface|enum)\s+\w+|\bpublic\s+static\s+void\s+main\s*\(|System\.out\.print/.test(trimmed)) {
            return 'java';
        }

        // 2. C / C++
        if (/#include\s*<iostream>|\bstd::cout\b|\bstd::cin\b|\bcout\s*<<|\bcin\s*>>/.test(trimmed)) {
            return 'cpp';
        }
        if (/#include\s*<stdio\.h>|\bprintf\s*\(|\bscanf\s*\(/.test(trimmed)) {
            return 'c';
        }

        // 3. Rust
        if (/\bfn\s+main\s*\(\s*\)|\bprintln!\s*\(|\blet\s+mut\s+/.test(trimmed)) {
            return 'rust';
        }

        // 4. Go
        if (/\bpackage\s+main\b|\bfunc\s+main\s*\(\s*\)|\bfmt\.(Println|Printf)\b/.test(trimmed)) {
            return 'go';
        }

        // 5. C#
        if (/\busing\s+System;|\bConsole\.(WriteLine|ReadLine)\b/.test(trimmed)) {
            return 'csharp';
        }

        // 6. Kotlin
        if (/\bfun\s+main\s*\(/.test(trimmed) && /\b(val|var)\s+/.test(trimmed)) {
            return 'kotlin';
        }

        // 7. MongoDB
        if (this._looksLikeMongo(trimmed)) {
            return 'mongodb';
        }

        // 8. MySQL specific
        if (/^SHOW\s+(DATABASES|TABLES|COLUMNS|VARIABLES|STATUS|PROCESSLIST)\b/i.test(trimmed)) {
            return 'mysql';
        }

        // 9. SQL / MySQL
        if (/^(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE|DESCRIBE|EXPLAIN)\b/i.test(trimmed)) {
            return currentLanguage === 'mysql' ? 'mysql' : 'sql';
        }

        // 10. HTTP
        if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+https?:\/\//i.test(trimmed)) {
            return 'http';
        }

        return currentLanguage;
    }

    /**
     * Heuristic: does this code look like a MongoDB command or query?
     * (uses `db.`, `use <db>`, `show dbs`, `show databases`, `show collections`, `mongosh`, etc.)
     */
    private _looksLikeMongo(code: string): boolean {
        const trimmed = code.trim();
        if (/^(show\s+(dbs|collections)|mongosh\b)/i.test(trimmed)) {
            return true;
        }
        return /\bdb\s*(\.|\bcollection\b|\[)|\bObjectId\s*\(|\bBinary\s*\(|\bDecimal128\s*\(|\bISODate\s*\(/.test(code);
    }

    // ─── SQL Databases ─────────────────────────────────────────────

    private _showConnectionRequired(execution: vscode.NotebookCellExecution, cell: vscode.NotebookCell, dbName: string): void {
        this._pendingCell = cell;
        execution.replaceOutput([
            new vscode.NotebookCellOutput([
                vscode.NotebookCellOutputItem.text(renderConnectionRequired(dbName), 'text/html')
            ])
        ]);
        execution.end(false, Date.now());
    }

    private async _executeSqlDb(
        execution: vscode.NotebookCellExecution,
        cell: vscode.NotebookCell,
        executor: { isConnected(): boolean; execute(q: string): Promise<{ rows?: any; fields?: string[]; error?: string }> },
        dbName: string,
        query: string
    ): Promise<void> {
        if (!executor || !executor.isConnected()) {
            const connected = await this.connectionManager.quickConnect(dbName.toLowerCase());
            if (!connected || !executor.isConnected()) {
                this._showConnectionRequired(execution, cell, dbName);
                return;
            }
        }

        const start = Date.now();
        const res = await executor.execute(query);
        const elapsed = Date.now() - start;

        if (res.error) {
            this._outputHtml(execution, renderError(res.error, dbName), false);
            return;
        }

        let html: string;
        if (res.rows && Array.isArray(res.rows) && res.rows.length > 0) {
            html = renderTable(res.rows, res.fields || Object.keys(res.rows[0]), elapsed, dbName, query);
        } else if (res.rows && typeof res.rows === 'object' && !Array.isArray(res.rows)) {
            const info = res.rows as any;
            const msg = info.message
                || ((info.affectedRows !== undefined || info.changedRows !== undefined)
                    ? `Query OK. Affected rows: ${info.affectedRows ?? 0}, Changed: ${info.changedRows ?? 0}`
                    : 'Query executed successfully.');
            html = renderSuccess(msg, elapsed, dbName);
        } else {
            html = renderSuccess('Query executed successfully.', elapsed, dbName);
        }

        this._outputHtml(execution, html, true);
    }

    private async _executeMySql(
        execution: vscode.NotebookCellExecution,
        query: string,
        cell: vscode.NotebookCell
    ): Promise<void> {
        return this._executeSqlDb(execution, cell, this.connectionManager.getMySqlExecutor(), 'MySQL', query);
    }

    // ─── MongoDB ───────────────────────────────────────────────────

    private async _executeMongo(
        execution: vscode.NotebookCellExecution,
        code: string,
        cell: vscode.NotebookCell
    ): Promise<void> {
        const executor = this.connectionManager.getMongoExecutor();
        const cleanCode = code.replace(/^mongosh\s*/i, '').trim();

        if (!cleanCode) {
            if (executor && executor.isConnected()) {
                const dbName = executor.getConfig()?.database || 'test';
                this._outputConsole(execution, `Connected to MongoDB (${dbName})\nType commands like 'show databases', 'show collections', 'use <db>', or 'db.<collection>.find()'`, '', true);
            } else {
                const success = await this.connectionManager.quickConnect('mongodb');
                if (success) {
                    this._outputConsole(execution, `Connected to MongoDB`, '', true);
                } else {
                    this._showConnectionRequired(execution, cell, 'MongoDB');
                }
            }
            return;
        }

        if (!executor || !executor.isConnected()) {
            const success = await this.connectionManager.quickConnect('mongodb');
            if (!success || !executor.isConnected()) {
                this._showConnectionRequired(execution, cell, 'MongoDB');
                return;
            }

            // If the user typed `use <database>`, switch db right away
            const useMatch = cleanCode.match(/^use\s+(\S+)\s*;?$/i);
            if (useMatch) {
                const dbName = useMatch[1];
                const switchResult = await executor.execute(`use ${dbName}`);
                if (switchResult.error) {
                    this._outputHtml(execution, renderError(switchResult.error, 'MongoDB'), false);
                } else {
                    this._outputConsole(execution, `switched to db ${dbName}`, '', true);
                }
                return;
            }
        }

        const startTime = Date.now();
        const result = await executor.execute(cleanCode);
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, 'MongoDB'), false);
            return;
        }

        if (typeof result.data === 'string') {
            this._outputConsole(execution, result.data, '', true);
        } else if (Array.isArray(result.data) || (result.data && typeof result.data === 'object')) {
            this._outputHtml(execution, renderJson(result.data, elapsed, 'MongoDB'), true);
        } else {
            this._outputConsole(
                execution,
                result.data !== undefined ? String(result.data) : 'Operation completed.',
                '',
                true
            );
        }
    }

    // ─── PostgreSQL ────────────────────────────────────────────────

    private async _executePostgres(
        execution: vscode.NotebookCellExecution,
        query: string,
        cell: vscode.NotebookCell
    ): Promise<void> {
        return this._executeSqlDb(execution, cell, this.connectionManager.getPostgresExecutor(), 'PostgreSQL', query);
    }

    // ─── SQLite ────────────────────────────────────────────────────

    private async _executeSqlite(
        execution: vscode.NotebookCellExecution,
        query: string,
        cell: vscode.NotebookCell
    ): Promise<void> {
        return this._executeSqlDb(execution, cell, this.connectionManager.getSqliteExecutor(), 'SQLite', query);
    }

    // ─── Redis ─────────────────────────────────────────────────────

    private async _executeRedis(
        execution: vscode.NotebookCellExecution,
        query: string,
        cell: vscode.NotebookCell
    ): Promise<void> {
        const executor = this.connectionManager.getRedisExecutor();

        if (!executor || !executor.isConnected()) {
            const connected = await this.connectionManager.quickConnect('redis');
            if (!connected || !executor.isConnected()) {
                this._showConnectionRequired(execution, cell, 'Redis');
                return;
            }
        }

        const startTime = Date.now();
        const result = await executor.execute(query);
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, 'Redis'), false);
            return;
        }

        let html: string;
        if (Array.isArray(result.data)) {
            html = renderJson(result.data, elapsed, 'Redis');
        } else if (result.data !== null && result.data !== undefined) {
            html = renderJson(result.data, elapsed, 'Redis');
        } else {
            html = renderSuccess('Command executed successfully.', elapsed, 'Redis');
        }

        this._outputHtml(execution, html, true);
    }

    // ─── Programming Languages ─────────────────────────────────────

    private async _executeProcess(
        execution: vscode.NotebookCellExecution,
        code: string,
        language: string
    ): Promise<void> {
        // Check if runtime is installed
        const runtimeInfo = await this.runtimeDetector.check(language);
        const config = LANGUAGE_CONFIGS[language];
        const langName = config?.name || language;
        const langIcon = config?.icon || '▶️';

        if (!runtimeInfo.installed) {
            this._outputHtml(execution,
                renderRuntimeNotFound(langName, langIcon, language),
                false
            );
            return;
        }

        const startTime = Date.now();

        // Input provider — shows a VS Code input box when the process needs input
        // (just like Jupyter's input() popup!)
        const inputProvider = async (prompt?: string): Promise<string | undefined> => {
            return vscode.window.showInputBox({
                prompt: prompt || 'Enter input:',
                placeHolder: 'Type your input here...',
                ignoreFocusOut: true,
            });
        };

        const result = await this.processExecutor.execute(code, language, 30000, inputProvider);
        void startTime;

        if (result.error) {
            this._outputHtml(execution,
                renderError(result.error, langName),
                false
            );
            return;
        }

        this._outputConsole(execution, result.stdout, result.stderr, result.exitCode === 0);
    }

    // ─── Shell ─────────────────────────────────────────────────────

    private async _executeShell(
        execution: vscode.NotebookCellExecution,
        code: string,
        language: string
    ): Promise<void> {
        const shellType = language as 'shellscript' | 'powershell' | 'bat';
        const names: Record<string, { name: string; icon: string }> = {
            shellscript: { name: 'Bash', icon: '🐚' },
            powershell: { name: 'PowerShell', icon: '💙' },
            bat: { name: 'CMD', icon: '⬛' },
        };
        const { name } = names[language] || { name: 'Shell', icon: '🐚' };

        const result = await this.shellExecutor.execute(code, shellType, 30000);

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, name), false);
            return;
        }

        this._outputConsole(execution, result.stdout, result.stderr, result.exitCode === 0);
    }

    // ─── HTTP ──────────────────────────────────────────────────────

    private async _executeHttp(
        execution: vscode.NotebookCellExecution,
        code: string
    ): Promise<void> {
        const result = await this.httpExecutor.execute(code);

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, 'HTTP'), false);
            return;
        }

        const html = renderHttpResponse(result);
        this._outputHtml(execution, html, result.status >= 200 && result.status < 400);
    }

    // ─── Repl ───────────────────────────────────────────────────────

    private async _executeRepl(
        execution: vscode.NotebookCellExecution,
        code: string,
        language: string
    ): Promise<void> {
        // Support Jupyter-style shell magics such as %pip install ..., !pip install ..., !dir, etc.
        if (language === 'python' && /^\s*(!|%pip|%conda)\s*(.*)/i.test(code)) {
            const { command, shellType } = normalizePythonMagicCommand(code);
            await this._executeShell(execution, command, shellType);
            return;
        }

        // Feature: Polyglot Data Piping — auto-inject IN variable from previous query
        let fullCode = code;
        if (language === 'python') {
            const pyInject = DataContext.getInstance().getPythonInjection();
            if (pyInject) fullCode = `${pyInject}\n${code}`;
        } else if (language === 'javascript') {
            const jsInject = DataContext.getInstance().getJavaScriptInjection();
            if (jsInject) fullCode = `${jsInject}\n${code}`;
        }

        const result = await this.replExecutor.execute(fullCode, language, 30000, execution.token);

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, language), false);
            return;
        }

        this._outputConsole(execution, result.stdout, result.stderr, true);
    }

    // ─── GraphQL ───────────────────────────────────────────────────

    private async _executeGraphql(
        execution: vscode.NotebookCellExecution,
        code: string
    ): Promise<void> {
        const result = await this.graphqlExecutor.execute(code);

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, 'GraphQL'), false);
            return;
        }

        const html = renderHttpResponse(result);
        this._outputHtml(execution, html, result.status >= 200 && result.status < 400);
    }

    // ─── WebSocket ─────────────────────────────────────────────────

    private async _executeWebsocket(
        execution: vscode.NotebookCellExecution,
        code: string
    ): Promise<void> {
        const result = await this.websocketExecutor.execute(code, 15000, execution.token);

        if (result.error && result.messages.length === 0) {
            this._outputHtml(execution, renderError(result.error, 'WebSocket'), false);
            return;
        }

        const msgs = result.messages.join('\n');
        const err = result.error ? `\n[Error: ${result.error}]` : '';
        this._outputConsole(execution, msgs, err, !result.error);
    }

    // ─── Helpers ───────────────────────────────────────────────────

    /**
     * Authentic .ipynb-style clean console output:
     * Outputs native stdout/text, stderr stream, and image/png plots directly
     * without artificial card borders, copy buttons, or AI-slop wrappers.
     */
    private _outputConsole(
        execution: vscode.NotebookCellExecution,
        stdout: string,
        stderr: string,
        success: boolean
    ): void {
        const outputs: vscode.NotebookCellOutput[] = [];
        const images: string[] = [];
        const cleanStdout = stdout.replace(/___ANYINB_IMAGE_START___([\s\S]*?)___ANYINB_IMAGE_END___/g, (_, b64) => {
            images.push(b64.trim());
            return '';
        }).trim();

        const cleanStderr = stderr
            .replace(/^(>>>|\.\.\.)\s*/gm, '')
            .replace(/\b(>>>|\.\.\.)\b/g, '')
            .replace(/^[>\.\s]+$/gm, '')
            .trim();

        // 1. Matplotlib / figures -> Native image/png output (same as Jupyter .ipynb)
        for (const b64 of images) {
            try {
                outputs.push(new vscode.NotebookCellOutput([
                    new vscode.NotebookCellOutputItem(Buffer.from(b64, 'base64'), 'image/png')
                ]));
            } catch {}
        }

        // 2. Stdout -> Native text stream (same as Jupyter .ipynb)
        if (cleanStdout) {
            outputs.push(new vscode.NotebookCellOutput([
                vscode.NotebookCellOutputItem.stdout(cleanStdout + '\n')
            ]));
        }

        // 3. Stderr -> Native stderr stream (same as Jupyter .ipynb)
        if (cleanStderr) {
            outputs.push(new vscode.NotebookCellOutput([
                vscode.NotebookCellOutputItem.stderr(cleanStderr + '\n')
            ]));
        }

        if (outputs.length === 0) {
            execution.clearOutput();
            execution.end(success, Date.now());
            return;
        }

        execution.replaceOutput(outputs);
        execution.end(success, Date.now());
    }

    private _outputHtml(
        execution: vscode.NotebookCellExecution,
        html: string,
        success: boolean
    ): void {
        execution.replaceOutput([
            new vscode.NotebookCellOutput([
                vscode.NotebookCellOutputItem.text(html, 'text/html')
            ])
        ]);
        execution.end(success, Date.now());
    }

    dispose() {
        this._controller.dispose();
    }

    /**
     * Store a pending cell reference when a connection-required error is shown.
     */
    setPendingCell(cell: vscode.NotebookCell): void {
        this._pendingCell = cell;
    }

    /**
     * Re-execute the last cell that needed a DB connection.
     * Called after quickConnect succeeds for a frictionless flow.
     */
    async reExecutePendingCell(): Promise<void> {
        const cell = this._pendingCell;
        this._pendingCell = null;

        if (cell) {
            // Small delay so the connection notification is visible before re-execution
            await new Promise(resolve => setTimeout(resolve, 300));
            await this._doExecution(cell);
        }
    }
}
