import * as vscode from 'vscode';
import { MySqlExecutor, MySqlConfig } from './executors/mysqlExecutor';
import { MongoExecutor, MongoConfig } from './executors/mongoExecutor';
import { PostgresExecutor, PostgresConfig } from './executors/postgresExecutor';
import { SqliteExecutor, SqliteConfig } from './executors/sqliteExecutor';
import { RedisExecutor, RedisConfig } from './executors/redisExecutor';

/**
 * Manages database connections for MySQL and MongoDB.
 * Stores connection configs in VS Code's globalState (persistent)
 * and passwords in SecretStorage (secure).
 */
export class ConnectionManager {
    private static instance: ConnectionManager;

    private mysqlExecutor: MySqlExecutor;
    private mongoExecutor: MongoExecutor;
    private postgresExecutor: PostgresExecutor;
    private sqliteExecutor: SqliteExecutor;
    private redisExecutor: RedisExecutor;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.mysqlExecutor = new MySqlExecutor();
        this.mongoExecutor = new MongoExecutor();
        this.postgresExecutor = new PostgresExecutor();
        this.sqliteExecutor = new SqliteExecutor();
        this.redisExecutor = new RedisExecutor();
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

    getPostgresExecutor(): PostgresExecutor {
        return this.postgresExecutor;
    }

    getSqliteExecutor(): SqliteExecutor {
        return this.sqliteExecutor;
    }

    getRedisExecutor(): RedisExecutor {
        return this.redisExecutor;
    }

    /**
     * Interactive connection configuration via VS Code UI.
     */
    async configureConnection(): Promise<void> {
        const dbType = await vscode.window.showQuickPick(
            [
                { label: '🐬  MySQL', description: 'Connect to a MySQL database', value: 'mysql' },
                { label: '🍃  MongoDB', description: 'Connect to a MongoDB database', value: 'mongodb' },
                { label: '🐘  PostgreSQL', description: 'Connect to a PostgreSQL database', value: 'postgres' },
                { label: '🪶  SQLite', description: 'Connect to a SQLite database', value: 'sqlite' },
                { label: '🟥  Redis', description: 'Connect to a Redis server', value: 'redis' },
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
        } else if (dbType.value === 'mongodb') {
            await this.configureMongo();
        } else if (dbType.value === 'postgres') {
            await this.configurePostgres();
        } else if (dbType.value === 'sqlite') {
            await this.configureSqlite();
        } else if (dbType.value === 'redis') {
            await this.configureRedis();
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

    private async configurePostgres(): Promise<void> {
        const saved = this.context.globalState.get<Partial<PostgresConfig>>('postgres.config', {});

        const connectionString = await vscode.window.showInputBox({
            title: 'PostgreSQL — Connection String',
            prompt: 'Enter PostgreSQL connection string',
            value: saved.connectionString || 'postgresql://user:password@localhost:5432/mydb',
            ignoreFocusOut: true
        });
        if (!connectionString) { return; }

        const config: PostgresConfig = { connectionString };

        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '🐘 Connecting to PostgreSQL...' },
                async () => {
                    await this.postgresExecutor.connect(config);
                }
            );

            await this.context.globalState.update('postgres.config', config);
            vscode.window.showInformationMessage(`🐘 Connected to PostgreSQL`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to connect to PostgreSQL: ${err.message}`);
        }
    }

    private async configureSqlite(): Promise<void> {
        const saved = this.context.globalState.get<Partial<SqliteConfig>>('sqlite.config', {});

        const database = await vscode.window.showInputBox({
            title: 'SQLite — Database File',
            prompt: 'Enter SQLite database file path (or :memory:)',
            value: saved.database || ':memory:',
            ignoreFocusOut: true
        });
        if (!database) { return; }

        const config: SqliteConfig = { database };

        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '🪶 Connecting to SQLite...' },
                async () => {
                    await this.sqliteExecutor.connect(config);
                }
            );

            await this.context.globalState.update('sqlite.config', config);
            vscode.window.showInformationMessage(`🪶 Connected to SQLite: ${config.database}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to connect to SQLite: ${err.message}`);
        }
    }

    private async configureRedis(): Promise<void> {
        const saved = this.context.globalState.get<Partial<RedisConfig>>('redis.config', {});

        const connectionString = await vscode.window.showInputBox({
            title: 'Redis — Connection String',
            prompt: 'Enter Redis connection string',
            value: saved.connectionString || 'redis://localhost:6379',
            ignoreFocusOut: true
        });
        if (!connectionString) { return; }

        const config: RedisConfig = { connectionString };

        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '🟥 Connecting to Redis...' },
                async () => {
                    await this.redisExecutor.connect(config);
                }
            );

            await this.context.globalState.update('redis.config', config);
            vscode.window.showInformationMessage(`🟥 Connected to Redis`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to connect to Redis: ${err.message}`);
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

        // Restore Postgres
        const postgresConfig = this.context.globalState.get<PostgresConfig>('postgres.config');
        if (postgresConfig && postgresConfig.connectionString) {
            try {
                await this.postgresExecutor.connect(postgresConfig);
            } catch { }
        }

        // Restore Sqlite
        const sqliteConfig = this.context.globalState.get<SqliteConfig>('sqlite.config');
        if (sqliteConfig && sqliteConfig.database) {
            try {
                await this.sqliteExecutor.connect(sqliteConfig);
            } catch { }
        }

        // Restore Redis
        const redisConfig = this.context.globalState.get<RedisConfig>('redis.config');
        if (redisConfig && redisConfig.connectionString) {
            try {
                await this.redisExecutor.connect(redisConfig);
            } catch { }
        }
    }

    async disconnectAll(): Promise<void> {
        await this.mysqlExecutor.disconnect();
        await this.mongoExecutor.disconnect();
        await this.postgresExecutor.disconnect();
        await this.sqliteExecutor.disconnect();
        await this.redisExecutor.disconnect();
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

    getPostgresStatus(): string {
        if (this.postgresExecutor.isConnected()) {
            return '🐘 Connected';
        }
        return '';
    }

    getSqliteStatus(): string {
        if (this.sqliteExecutor.isConnected()) {
            const cfg = this.sqliteExecutor.getConfig();
            return cfg ? `🪶 ${cfg.database}` : '🪶 Connected';
        }
        return '';
    }

    getRedisStatus(): string {
        if (this.redisExecutor.isConnected()) {
            return '🟥 Connected';
        }
        return '';
    }
}
