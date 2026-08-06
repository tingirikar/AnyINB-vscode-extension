import * as vscode from 'vscode';
import { QueryNotebookSerializer } from './serializer';
import { AnyInbController } from './controller';
import { ConnectionManager } from './connectionManager';
import { StatusBarManager } from './statusBar';

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
        vscode.commands.registerCommand('anyinb.disconnectAll', async () => {
            await connectionManager.disconnectAll();
            statusBarManager.update();
            vscode.window.showInformationMessage('All database connections closed.');
        })
    );

    // Update status bar
    statusBarManager.update();
    context.subscriptions.push(statusBarManager);
}

export async function deactivate() {
    if (connectionManager) {
        await connectionManager.disconnectAll();
    }
}
