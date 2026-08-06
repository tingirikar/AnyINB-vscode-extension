import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';

/**
 * Status bar item showing current database connection status.
 * Clicking it opens the connection configuration dialog.
 */
export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private connectionManager: ConnectionManager;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;

        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        this.statusBarItem.command = 'anyinb.configureConnection';
        this.statusBarItem.tooltip = 'AnyINB — Click to configure database connection';

        this.update();
        this.statusBarItem.show();
    }

    update(): void {
        const mysqlStatus = this.connectionManager.getMySqlStatus();
        const mongoStatus = this.connectionManager.getMongoStatus();

        if (mysqlStatus && mongoStatus) {
            this.statusBarItem.text = `$(database) ${mysqlStatus} | ${mongoStatus}`;
            this.statusBarItem.backgroundColor = undefined;
        } else if (mysqlStatus) {
            this.statusBarItem.text = `$(database) ${mysqlStatus}`;
            this.statusBarItem.backgroundColor = undefined;
        } else if (mongoStatus) {
            this.statusBarItem.text = `$(database) ${mongoStatus}`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = '$(notebook) AnyINB: No DB Connection';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
