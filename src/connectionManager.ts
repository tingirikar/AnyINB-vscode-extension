import * as vscode from 'vscode';
import { MySqlExecutor, MySqlConfig } from './executors/mysqlExecutor';
import { MongoExecutor, MongoConfig } from './executors/mongoExecutor';

/**
 * Manages database connections for MySQL and MongoDB.
 * Stores connection configs in VS Code's globalState (persistent)
 * and passwords in SecretStorage (secure).
 */
export class ConnectionManager {
    private static instance: ConnectionManager;

    private mysqlExecutor: MySqlExecutor;
    private mongoExecutor: MongoExecutor;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.mysqlExecutor = new MySqlExecutor();
        this.mongoExecutor = new MongoExecutor();
    }

    static getInstance(context: vscode.ExtensionContext): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager(context);
        }
        return ConnectionManager.instance;
    }

    getMySqlExecutor(): MySqlExecutor {
        return this.mysqlExecutor;
    }

    getMongoExecutor(): MongoExecutor {
        return this.mongoExecutor;
    }

    /**
     * Interactive connection configuration via VS Code UI.
     */
    async configureConnection(): Promise<void> {
        const dbType = await vscode.window.showQuickPick(
            [
                { label: '🐬  MySQL', description: 'Connect to a MySQL database', value: 'mysql' },
                { label: '🍃  MongoDB', description: 'Connect to a MongoDB database', value: 'mongodb' },
            ],
            {
                title: 'AnyINB — Select Database Type',
                placeHolder: 'Which database do you want to connect to?'
            }
        );

        if (!dbType) {
            return;
        }

        if (dbType.value === 'mysql') {
            await this.configureMySql();
        } else {
            await this.configureMongo();
        }
    }

    private async configureMySql(): Promise<void> {
        // Load saved config
        const saved = this.context.globalState.get<Partial<MySqlConfig>>('mysql.config', {});

        const host = await vscode.window.showInputBox({
            title: 'MySQL — Host',
            prompt: 'Enter MySQL server host',
            value: saved.host || 'localhost',
            ignoreFocusOut: true
        });
        if (!host) { return; }

        const portStr = await vscode.window.showInputBox({
            title: 'MySQL — Port',
            prompt: 'Enter MySQL server port',
            value: String(saved.port || 3306),
            ignoreFocusOut: true,
            validateInput: v => isNaN(Number(v)) ? 'Must be a number' : undefined
        });
        if (!portStr) { return; }

        const user = await vscode.window.showInputBox({
            title: 'MySQL — Username',
            prompt: 'Enter MySQL username',
            value: saved.user || 'root',
            ignoreFocusOut: true
        });
        if (!user) { return; }

        const password = await vscode.window.showInputBox({
            title: 'MySQL — Password',
            prompt: 'Enter MySQL password (leave empty if none)',
            password: true,
            ignoreFocusOut: true
        });
        if (password === undefined) { return; }

        const database = await vscode.window.showInputBox({
            title: 'MySQL — Database',
            prompt: 'Enter database name',
            value: saved.database || '',
            ignoreFocusOut: true
        });
        if (!database) { return; }

        const config: MySqlConfig = {
            host,
            port: Number(portStr),
            user,
            password,
            database
        };

        // Try connecting
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '🐬 Connecting to MySQL...' },
                async () => {
                    await this.mysqlExecutor.connect(config);
                }
            );

            // Save config (without password)
            await this.context.globalState.update('mysql.config', {
                host: config.host,
                port: config.port,
                user: config.user,
                database: config.database
            });

            // Save password securely
            await this.context.secrets.store('mysql.password', config.password);

            vscode.window.showInformationMessage(
                `🐬 Connected to MySQL: ${config.host}:${config.port}/${config.database}`
            );
        } catch (err: any) {
            vscode.window.showErrorMessage(
                `Failed to connect to MySQL: ${err.message}`
            );
        }
    }

    private async configureMongo(): Promise<void> {
        const saved = this.context.globalState.get<Partial<MongoConfig>>('mongo.config', {});

        const connectionString = await vscode.window.showInputBox({
            title: 'MongoDB — Connection String',
            prompt: 'Enter MongoDB connection string',
            value: saved.connectionString || 'mongodb://localhost:27017',
            ignoreFocusOut: true,
            placeHolder: 'mongodb://localhost:27017 or mongodb+srv://...'
        });
        if (!connectionString) { return; }

        const database = await vscode.window.showInputBox({
            title: 'MongoDB — Database',
            prompt: 'Enter database name',
            value: saved.database || 'test',
            ignoreFocusOut: true
        });
        if (!database) { return; }

        const config: MongoConfig = { connectionString, database };

        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '🍃 Connecting to MongoDB...' },
                async () => {
                    await this.mongoExecutor.connect(config);
                }
            );

            // Save config
            await this.context.globalState.update('mongo.config', config);

            vscode.window.showInformationMessage(
                `🍃 Connected to MongoDB: ${config.database}`
            );
        } catch (err: any) {
            vscode.window.showErrorMessage(
                `Failed to connect to MongoDB: ${err.message}`
            );
        }
    }

    /**
     * Try to restore saved connections on startup.
     */
    async restoreConnections(): Promise<void> {
        // Restore MySQL
        const mysqlConfig = this.context.globalState.get<Partial<MySqlConfig>>('mysql.config');
        if (mysqlConfig && mysqlConfig.host && mysqlConfig.database) {
            const password = await this.context.secrets.get('mysql.password');
            if (password !== undefined) {
                try {
                    await this.mysqlExecutor.connect({
                        host: mysqlConfig.host,
                        port: mysqlConfig.port || 3306,
                        user: mysqlConfig.user || 'root',
                        password,
                        database: mysqlConfig.database
                    });
                } catch {
                    // Silent failure on restore — user can reconnect manually
                }
            }
        }

        // Restore MongoDB
        const mongoConfig = this.context.globalState.get<MongoConfig>('mongo.config');
        if (mongoConfig && mongoConfig.connectionString && mongoConfig.database) {
            try {
                await this.mongoExecutor.connect(mongoConfig);
            } catch {
                // Silent failure
            }
        }
    }

    async disconnectAll(): Promise<void> {
        await this.mysqlExecutor.disconnect();
        await this.mongoExecutor.disconnect();
    }

    getMySqlStatus(): string {
        if (this.mysqlExecutor.isConnected()) {
            const cfg = this.mysqlExecutor.getConfig();
            return cfg ? `🐬 ${cfg.host}:${cfg.port}/${cfg.database}` : '🐬 Connected';
        }
        return '';
    }

    getMongoStatus(): string {
        if (this.mongoExecutor.isConnected()) {
            const cfg = this.mongoExecutor.getConfig();
            return cfg ? `🍃 ${cfg.database}` : '🍃 Connected';
        }
        return '';
    }
}
