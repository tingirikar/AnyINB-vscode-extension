import * as vscode from 'vscode';
import { MySqlExecutor, MySqlConfig } from './executors/mysqlExecutor';
import { MongoExecutor, MongoConfig } from './executors/mongoExecutor';
import { PostgresExecutor, PostgresConfig } from './executors/postgresExecutor';
import { SqliteExecutor, SqliteConfig } from './executors/sqliteExecutor';
import { RedisExecutor, RedisConfig } from './executors/redisExecutor';

/**
 * Manages database connections for MySQL, MongoDB, PostgreSQL, SQLite, and Redis.
 */
export class ConnectionManager {
    private static instance: ConnectionManager;

    private _onDidChangeConnection = new vscode.EventEmitter<void>();
    readonly onDidChangeConnection = this._onDidChangeConnection.event;

    private mysqlExecutor = new MySqlExecutor();
    private mongoExecutor = new MongoExecutor();
    private postgresExecutor = new PostgresExecutor();
    private sqliteExecutor = new SqliteExecutor();
    private redisExecutor = new RedisExecutor();

    private constructor(private context: vscode.ExtensionContext) {}

    notifyConnectionChanged(): void {
        this._onDidChangeConnection.fire();
    }

    static getInstance(context: vscode.ExtensionContext): ConnectionManager {
        return (ConnectionManager.instance ??= new ConnectionManager(context));
    }

    getMySqlExecutor(): MySqlExecutor { return this.mysqlExecutor; }
    getMongoExecutor(): MongoExecutor { return this.mongoExecutor; }
    getPostgresExecutor(): PostgresExecutor { return this.postgresExecutor; }
    getSqliteExecutor(): SqliteExecutor { return this.sqliteExecutor; }
    getRedisExecutor(): RedisExecutor { return this.redisExecutor; }

    getMySqlStatus(): string {
        if (!this.mysqlExecutor.isConnected()) return '';
        const db = this.mysqlExecutor.getCurrentDatabase();
        return db ? `MySQL: Connected (${db})` : 'MySQL: Connected';
    }
    getMongoStatus(): string { return this.mongoExecutor.isConnected() ? `MongoDB: ${this.mongoExecutor.getConfig()?.database || 'Connected'}` : ''; }
    getPostgresStatus(): string { return this.postgresExecutor.isConnected() ? 'PostgreSQL: Connected' : ''; }
    getSqliteStatus(): string { return this.sqliteExecutor.isConnected() ? 'SQLite: Connected' : ''; }
    getRedisStatus(): string { return this.redisExecutor.isConnected() ? 'Redis: Connected' : ''; }

    async configureConnection(): Promise<void> {
        const pick = await vscode.window.showQuickPick([
            { label: '🐬 MySQL', value: 'mysql' },
            { label: '🍃 MongoDB', value: 'mongodb' },
            { label: '🐘 PostgreSQL', value: 'postgres' },
            { label: '🪶 SQLite', value: 'sqlite' },
            { label: '🟥 Redis', value: 'redis' },
        ], { title: 'AnyINB — Select Database Type', placeHolder: 'Choose database type to connect' });

        if (pick) { await this.quickConnect(pick.value); }
    }

    async quickConnect(dbType: string): Promise<boolean> {
        switch (dbType.toLowerCase()) {
            case 'mysql': return this._connectMySql();
            case 'mongodb': return this._connectMongo();
            case 'postgresql':
            case 'postgres': return this._connectPostgres();
            case 'sqlite': return this._connectSqlite();
            case 'redis': return this._connectRedis();
            default:
                vscode.window.showErrorMessage(`Unknown database type: ${dbType}`);
                return false;
        }
    }

    private async _prompt(title: string, prompt: string, value: string = '', password = false): Promise<string | undefined> {
        return vscode.window.showInputBox({ title, prompt, value, password, ignoreFocusOut: true });
    }

    private async _runConnect(title: string, successMsg: string, connectFn: () => Promise<void>): Promise<boolean> {
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, connectFn);
            this._onDidChangeConnection.fire();
            vscode.window.showInformationMessage(successMsg);
            return true;
        } catch (err: any) {
            vscode.window.showErrorMessage(`Connection failed: ${err.message}`);
            return false;
        }
    }

    private async _connectMySql(): Promise<boolean> {
        const saved = this.context.globalState.get<Partial<MySqlConfig>>('mysql.config', {});
        const host = await this._prompt('MySQL — Host', 'Enter host', saved.host || 'localhost');
        if (!host) return false;
        const portStr = await this._prompt('MySQL — Port', 'Enter port', String(saved.port || 3306));
        if (!portStr) return false;
        const user = await this._prompt('MySQL — Username', 'Enter username', saved.user || 'root');
        if (!user) return false;
        const password = await this._prompt('MySQL — Password', 'Enter password', '', true);
        if (password === undefined) return false;

        const config: MySqlConfig = { host, port: Number(portStr), user, password };
        return this._runConnect('🐬 Connecting to MySQL...', `🐬 Connected to MySQL: ${host}:${portStr}`, async () => {
            await this.mysqlExecutor.connect(config);
            await this.context.globalState.update('mysql.config', { host, port: config.port, user });
            await this.context.secrets.store('mysql.password', password);
        });
    }

    private async _connectMongo(): Promise<boolean> {
        const saved = this.context.globalState.get<Partial<MongoConfig>>('mongo.config', {});
        const connectionString = await this._prompt('MongoDB — URI', 'Enter connection string', saved.connectionString || 'mongodb://localhost:27017');
        if (!connectionString) return false;

        const config: MongoConfig = { connectionString, database: saved.database || 'test' };
        return this._runConnect('🍃 Connecting to MongoDB...', `🍃 Connected to MongoDB`, async () => {
            await this.mongoExecutor.connect(config);
            await this.context.globalState.update('mongo.config', config);
        });
    }

    private async _connectPostgres(): Promise<boolean> {
        const saved = this.context.globalState.get<Partial<PostgresConfig>>('postgres.config', {});
        const cs = await this._prompt('PostgreSQL — URI', 'Enter connection URI (e.g. postgresql://user:pass@localhost:5432/dbname)', saved.connectionString || 'postgresql://postgres:password@localhost:5432/postgres');
        if (!cs) return false;

        const config: PostgresConfig = { connectionString: cs };
        return this._runConnect('🐘 Connecting to PostgreSQL...', `🐘 Connected to PostgreSQL`, async () => {
            await this.postgresExecutor.connect(config);
            await this.context.globalState.update('postgres.config', config);
        });
    }

    private async _connectSqlite(): Promise<boolean> {
        const saved = this.context.globalState.get<Partial<SqliteConfig>>('sqlite.config', {});
        const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            defaultUri,
            filters: { 'SQLite Databases': ['db', 'sqlite', 'sqlite3', 'db3'], 'All Files': ['*'] },
            title: 'SQLite — Select Database File'
        });
        const database = fileUris && fileUris[0] ? fileUris[0].fsPath : (await this._prompt('SQLite — File Path', 'Enter path or :memory:', saved.database || ':memory:'));
        if (!database) return false;

        const config: SqliteConfig = { database };
        return this._runConnect('🪶 Connecting to SQLite...', `🪶 Connected to SQLite: ${database}`, async () => {
            await this.sqliteExecutor.connect(config);
            await this.context.globalState.update('sqlite.config', config);
        });
    }

    private async _connectRedis(): Promise<boolean> {
        const saved = this.context.globalState.get<Partial<RedisConfig>>('redis.config', {});
        const cs = await this._prompt('Redis — URI', 'Enter redis:// URI', saved.connectionString || 'redis://localhost:6379');
        if (!cs) return false;

        const config: RedisConfig = { connectionString: cs };
        return this._runConnect('🟥 Connecting to Redis...', `🟥 Connected to Redis`, async () => {
            await this.redisExecutor.connect(config);
            await this.context.globalState.update('redis.config', config);
        });
    }

    async disconnectAll(): Promise<void> {
        await Promise.all([
            this.mysqlExecutor.disconnect(),
            this.mongoExecutor.disconnect(),
            this.postgresExecutor.disconnect(),
            this.sqliteExecutor.disconnect(),
            this.redisExecutor.disconnect(),
        ]);
        this._onDidChangeConnection.fire();
        vscode.window.showInformationMessage('Disconnected from all databases.');
    }
}
