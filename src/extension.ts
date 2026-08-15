import * as vscode from 'vscode';
import { QueryNotebookSerializer } from './serializer';
import { AnyInbController } from './controller';
import { ConnectionManager } from './connectionManager';
import { StatusBarManager } from './statusBar';
import { MockServer } from './mockServer';

let controller: AnyInbController;
let connectionManager: ConnectionManager;
let statusBarManager: StatusBarManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('AnyINB — Universal Interactive Notebook is now active!');

    // Initialize connection manager
    connectionManager = ConnectionManager.getInstance(context);

    // Initialize status bar
    statusBarManager = new StatusBarManager(connectionManager);

    // Register notebook serializer
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer(
            'anyinb',
            new QueryNotebookSerializer(),
            { transientOutputs: false }
        )
    );

    // Register notebook controller
    controller = new AnyInbController(connectionManager);
    context.subscriptions.push(controller);

    // ─── Commands ──────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('anyinb.configureConnection', async () => {
            await connectionManager.configureConnection();
            statusBarManager.update();
        })
    );

    // Quick connect — triggered from the "⚡ Quick Connect" button in cell output.
    // Skips the DB type picker and auto-re-executes the pending cell after connecting.
    context.subscriptions.push(
        vscode.commands.registerCommand('anyinb.quickConnect', async (dbType: string) => {
            const success = await connectionManager.quickConnect(dbType);
            statusBarManager.update();
            if (success) {
                await controller.reExecutePendingCell();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('anyinb.disconnectAll', async () => {
            await connectionManager.disconnectAll();
            statusBarManager.update();
            vscode.window.showInformationMessage('All database connections closed.');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('anyinb.selectTheme', async () => {
            const current = vscode.workspace.getConfiguration('anyinb').get<string>('outputTheme', 'mongosh-terminal');
            const pick = await vscode.window.showQuickPick([
                { label: '🐚 mongosh Terminal', description: 'Authentic terminal: black background, green strings, white keys', value: 'mongosh-terminal' },
                { label: '🧛 Dracula', description: 'Classic purple, cyan, green, and pink palette', value: 'dracula' },
                { label: '🏝️ Tokyo Night', description: 'Deep indigo, soft blue, and vibrant magenta', value: 'tokyo-night' },
                { label: '🦎 Monokai', description: 'High-contrast retro yellow, green, and pink', value: 'monokai' },
                { label: '⚛️ One Dark', description: 'Atom One Dark slate, green, and blue accents', value: 'one-dark' },
                { label: '❄️ Nord', description: 'Arctic snow white, frost blue, and forest green', value: 'nord' },
                { label: '🐙 GitHub Dark', description: 'Official GitHub Dark theme', value: 'github-dark' },
                { label: '☀️ Solarized Dark', description: 'Classic deep cyan/teal, yellow, and green', value: 'solarized-dark' },
            ], { title: 'AnyINB — Select Output Color Theme', placeHolder: `Current: ${current}` });

            if (pick) {
                await vscode.workspace.getConfiguration('anyinb').update('outputTheme', pick.value, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Output theme changed to: ${pick.label}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('anyinb.newNotebook', async () => {
            const newNotebook = await vscode.workspace.openNotebookDocument(
                'anyinb',
                new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        '# 🚀 AnyINB — Universal Interactive Notebook\n\nPractice **any language** right here. Change the cell language and hit ▶️ to run.\n\n| Language | Type |\n|----------|------|\n| SQL | MySQL queries |\n| JavaScript | MongoDB / Node.js |\n| Python | Scripts |\n| Go, Rust, Java, C, C++ | Compiled languages |\n| Bash, PowerShell | Shell commands |\n| HTTP | REST API requests |\n\n> 💡 For databases: `Ctrl+Shift+P` → **AnyINB: Configure Database Connection**',
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        'print("Hello from Python! 🐍")',
                        'python'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        'console.log("Hello from Node.js! ⬡")',
                        'javascript'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        '-- MySQL query (connect first)\nSELECT 1 + 1 AS result, NOW() AS current_time;',
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        'GET https://jsonplaceholder.typicode.com/todos/1',
                        'http'
                    ),
                ])
            );
            await vscode.window.showNotebookDocument(newNotebook);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('anyinb.enableSandbox', async () => {
            await vscode.workspace.getConfiguration('anyinb').update('useSandboxIfDisconnected', true, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('🧪 In-Memory Sandbox Mode is now ACTIVE. You can run SQL and MongoDB queries with zero database setup!');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('anyinb.startPresentation', async () => {
            const editor = vscode.window.activeNotebookEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Open an AnyINB notebook first to start presentation mode.');
                return;
            }

            const total = editor.notebook.cellCount;
            let current = 0;

            vscode.window.showInformationMessage(`🎬 Started AnyINB Presentation Mode (${total} cells)`);

            while (current < total) {
                const cell = editor.notebook.cellAt(current);
                editor.selection = new vscode.NotebookRange(current, current + 1);
                editor.revealRange(new vscode.NotebookRange(current, current + 1));

                const choice = await vscode.window.showInformationMessage(
                    `🎬 Step ${current + 1} of ${total}: [${cell.document.languageId}]`,
                    '▶️ Run & Next',
                    '⏭️ Skip',
                    '⏹️ Stop'
                );

                if (!choice || choice === '⏹️ Stop') break;

                if (choice === '▶️ Run & Next' && cell.kind === vscode.NotebookCellKind.Code) {
                    await vscode.commands.executeCommand('notebook.cell.execute', { ranges: [{ start: current, end: current + 1 }] });
                }

                current++;
            }

            vscode.window.showInformationMessage('🎬 Presentation completed!');
        })
    );

    // Update status bar
    statusBarManager.update();
    context.subscriptions.push(statusBarManager);
}

export async function deactivate() {
    MockServer.getInstance().stop();
    if (connectionManager) {
        await connectionManager.disconnectAll();
    }
}
