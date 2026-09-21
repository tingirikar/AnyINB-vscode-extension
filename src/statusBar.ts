import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { NOTEBOOK_COMMANDS } from './config';

/**
 * Status bar item showing current database connection status.
 * Clicking it opens the connection configuration dialog.
 */
export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private connectionManager: ConnectionManager;
    private disposables: vscode.Disposable[] = [];

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;

        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        this.statusBarItem.command = NOTEBOOK_COMMANDS.configureConnection;
        this.statusBarItem.tooltip = 'AnyINB — Click to configure database connection';

        this.disposables.push(
            this.connectionManager.onDidChangeConnection(() => {
                this.update();
            })
        );

        this.update();
        this.statusBarItem.show();
    }

    update(): void {
        const statuses = [
            this.connectionManager.getMySqlStatus(),
            this.connectionManager.getMongoStatus(),
            this.connectionManager.getPostgresStatus(),
            this.connectionManager.getSqliteStatus(),
            this.connectionManager.getRedisStatus()
        ].filter(s => s.length > 0);

        if (statuses.length > 0) {
            this.statusBarItem.text = `$(database) ` + statuses.join(' | ');
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = '$(notebook) AnyINB: No DB Connection';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        }
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.statusBarItem.dispose();
    }
}
