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
    renderConnectionRequired, renderConsoleOutput, renderHttpResponse,
    renderRuntimeNotFound
} from './renderers/htmlRenderer';

// All languages the controller can handle
const DATABASE_LANGUAGES = ['sql', 'javascript', 'postgres', 'sqlite', 'redis'];
const PROCESS_LANGUAGES = Object.keys(LANGUAGE_CONFIGS);
const SHELL_LANGUAGES = ['shellscript', 'powershell', 'bat'];
const HTTP_LANGUAGES = ['http'];

const ALL_SUPPORTED_LANGUAGES = [
    ...new Set([
        ...DATABASE_LANGUAGES,
        ...PROCESS_LANGUAGES,
        ...SHELL_LANGUAGES,
        ...HTTP_LANGUAGES,
        'markdown',
    ])
];

/**
 * AnyINB NotebookController — the brain of the extension.
 * Routes cell execution to the appropriate executor based on language.
 */
export class AnyInbController {
    readonly controllerId = 'anyinb-controller';
    readonly notebookType = 'anyinb';
    readonly label = 'AnyINB';

    private readonly _controller: vscode.NotebookController;
    private _executionOrder = 0;

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

    private _executeAll(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): void {
        for (const cell of cells) {
            this._doExecution(cell);
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

        const code = cell.document.getText().trim();
        const language = cell.document.languageId;

        if (!code) {
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(
                        renderError('Empty cell — write some code and try again.'),
                        'text/html'
                    )
                ])
            ]);
            execution.end(false, Date.now());
            return;
        }

        try {
            // Route to the right executor
            if (language === 'sql') {
                await this._executeMySql(execution, code);
            } else if (language === 'postgres') {
                await this._executePostgres(execution, code);
            } else if (language === 'sqlite') {
                await this._executeSqlite(execution, code);
            } else if (language === 'redis') {
                await this._executeRedis(execution, code);
            } else if (language === 'javascript' && this._looksLikeMongo(code)) {
                await this._executeMongo(execution, code);
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
     * Heuristic: does this JavaScript code look like a MongoDB query?
     * (uses `db.` or shell commands like `show dbs`)
     */
    private _looksLikeMongo(code: string): boolean {
        const trimmed = code.trim().toLowerCase();
        return (
            trimmed.startsWith('db.') ||
            trimmed.startsWith('show ') ||
            trimmed.startsWith('use ') ||
            this.connectionManager.getMongoExecutor().isConnected()
        );
    }

    // ─── MySQL ─────────────────────────────────────────────────────

    private async _executeMySql(
        execution: vscode.NotebookCellExecution,
        query: string
    ): Promise<void> {
        const executor = this.connectionManager.getMySqlExecutor();

        if (!executor || !executor.isConnected()) {
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(
                        renderConnectionRequired('MySQL'),
                        'text/html'
                    )
                ])
            ]);
            execution.end(false, Date.now());
            return;
        }

        const startTime = Date.now();
        const result = await executor.execute(query);
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, 'MySQL'), false);
            return;
        }

        let html: string;
        if (result.rows && Array.isArray(result.rows) && result.rows.length > 0) {
            html = renderTable(result.rows, result.fields || [], elapsed, 'MySQL');
        } else if (result.rows && typeof result.rows === 'object' && !Array.isArray(result.rows)) {
            const info = result.rows as any;
            html = renderSuccess(
                `Query OK. Affected rows: ${info.affectedRows ?? 0}, Changed: ${info.changedRows ?? 0}`,
                elapsed, 'MySQL'
            );
        } else {
            html = renderSuccess('Query executed successfully.', elapsed, 'MySQL');
        }

        this._outputHtml(execution, html, true);
    }

    // ─── MongoDB ───────────────────────────────────────────────────

    private async _executeMongo(
        execution: vscode.NotebookCellExecution,
        code: string
    ): Promise<void> {
        const executor = this.connectionManager.getMongoExecutor();

        if (!executor || !executor.isConnected()) {
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(
                        renderConnectionRequired('MongoDB'),
                        'text/html'
                    )
                ])
            ]);
            execution.end(false, Date.now());
            return;
        }

        const startTime = Date.now();
        const result = await executor.execute(code);
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, 'MongoDB'), false);
            return;
        }

        let html: string;
        if (Array.isArray(result.data)) {
            if (result.data.length > 0 && typeof result.data[0] === 'object') {
                const fields = Object.keys(result.data[0]);
                html = renderTable(result.data, fields, elapsed, 'MongoDB');
            } else if (result.data.length > 0) {
                html = renderJson(result.data, elapsed, 'MongoDB');
            } else {
                html = renderSuccess('Query returned 0 documents.', elapsed, 'MongoDB');
            }
        } else if (result.data && typeof result.data === 'object') {
            html = renderJson(result.data, elapsed, 'MongoDB');
        } else {
            html = renderSuccess(
                result.data !== undefined ? String(result.data) : 'Operation completed.',
                elapsed, 'MongoDB'
            );
        }

        this._outputHtml(execution, html, true);
    }

    // ─── PostgreSQL ────────────────────────────────────────────────

    private async _executePostgres(
        execution: vscode.NotebookCellExecution,
        query: string
    ): Promise<void> {
        const executor = this.connectionManager.getPostgresExecutor();

        if (!executor || !executor.isConnected()) {
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(
                        renderConnectionRequired('PostgreSQL'),
                        'text/html'
                    )
                ])
            ]);
            execution.end(false, Date.now());
            return;
        }

        const startTime = Date.now();
        const result = await executor.execute(query);
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, 'PostgreSQL'), false);
            return;
        }

        let html: string;
        if (result.rows && Array.isArray(result.rows) && result.rows.length > 0) {
            html = renderTable(result.rows, result.fields || [], elapsed, 'PostgreSQL');
        } else {
            html = renderSuccess('Query executed successfully.', elapsed, 'PostgreSQL');
        }

        this._outputHtml(execution, html, true);
    }

    // ─── SQLite ────────────────────────────────────────────────────

    private async _executeSqlite(
        execution: vscode.NotebookCellExecution,
        query: string
    ): Promise<void> {
        const executor = this.connectionManager.getSqliteExecutor();

        if (!executor || !executor.isConnected()) {
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(
                        renderConnectionRequired('SQLite'),
                        'text/html'
                    )
                ])
            ]);
            execution.end(false, Date.now());
            return;
        }

        const startTime = Date.now();
        const result = await executor.execute(query);
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, 'SQLite'), false);
            return;
        }

        let html: string;
        if (result.rows && Array.isArray(result.rows) && result.rows.length > 0) {
            html = renderTable(result.rows, result.fields || [], elapsed, 'SQLite');
        } else {
            html = renderSuccess('Query executed successfully.', elapsed, 'SQLite');
        }

        this._outputHtml(execution, html, true);
    }

    // ─── Redis ─────────────────────────────────────────────────────

    private async _executeRedis(
        execution: vscode.NotebookCellExecution,
        query: string
    ): Promise<void> {
        const executor = this.connectionManager.getRedisExecutor();

        if (!executor || !executor.isConnected()) {
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(
                        renderConnectionRequired('Redis'),
                        'text/html'
                    )
                ])
            ]);
            execution.end(false, Date.now());
            return;
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
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution,
                renderError(result.error, langName),
                false
            );
            return;
        }

        const html = renderConsoleOutput(
            result.stdout,
            result.stderr,
            result.exitCode,
            elapsed,
            langName,
            langIcon
        );

        this._outputHtml(execution, html, result.exitCode === 0);
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
        const { name, icon } = names[language] || { name: 'Shell', icon: '🐚' };

        const inputProvider = async (prompt?: string): Promise<string | undefined> => {
            return vscode.window.showInputBox({
                prompt: prompt || 'Enter input:',
                placeHolder: 'Type your input here...',
                ignoreFocusOut: true,
            });
        };

        const startTime = Date.now();
        const result = await this.shellExecutor.execute(code, shellType, 30000, inputProvider);
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, name), false);
            return;
        }

        const html = renderConsoleOutput(
            result.stdout, result.stderr, result.exitCode,
            elapsed, name, icon
        );
        this._outputHtml(execution, html, result.exitCode === 0);
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
        const langIcon = language === 'python' ? '🐍' : (language === 'javascript' ? '🟨' : '🐚');
        const startTime = Date.now();
        const result = await this.replExecutor.execute(code, language, 30000, execution.token);
        const elapsed = Date.now() - startTime;

        if (result.error) {
            this._outputHtml(execution, renderError(result.error, language), false);
            return;
        }

        const html = renderConsoleOutput(result.stdout, result.stderr, 0, elapsed, language, langIcon);
        this._outputHtml(execution, html, true);
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
        const html = renderConsoleOutput(msgs + err, '', 0, result.elapsed, 'WebSocket', '🔌');
        this._outputHtml(execution, html, !result.error);
    }

    // ─── Helpers ───────────────────────────────────────────────────

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
}
