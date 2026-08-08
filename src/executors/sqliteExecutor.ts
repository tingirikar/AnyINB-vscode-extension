import * as sqlite3 from 'sqlite3';

export interface SqliteResult {
    rows?: any[];
    fields?: string[];
    error?: string;
}

export interface SqliteConfig {
    database: string; // file path or ':memory:'
}

/**
 * SQLite query executor using sqlite3.
 */
export class SqliteExecutor {
    private db: sqlite3.Database | null = null;
    private config: SqliteConfig | null = null;

    async connect(config: SqliteConfig): Promise<void> {
        // Close existing db if any
        if (this.db) {
            await this.disconnect();
        }

        this.config = config;

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(config.database, (err) => {
                if (err) {
                    this.db = null;
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async execute(query: string): Promise<SqliteResult> {
        if (!this.db) {
            return { error: 'Not connected to SQLite. Run "Query Notebook: Configure Database Connection" first.' };
        }

        return new Promise((resolve) => {
            // Use all() for queries that return rows (SELECT, PRAGMA)
            // Use exec() for multiple statements, but exec() doesn't return rows easily.
            // A simple approach is to use all() for single statements.
            this.db!.all(query, (err, rows) => {
                if (err) {
                    resolve({ error: `${err.name || 'ERROR'}: ${err.message}` });
                    return;
                }
                
                if (rows && rows.length > 0) {
                    const fields = Object.keys(rows[0] as any);
                    resolve({ rows, fields });
                } else {
                    resolve({ rows: [], fields: [] });
                }
            });
        });
    }

    async disconnect(): Promise<void> {
        if (this.db) {
            return new Promise((resolve) => {
                this.db!.close(() => {
                    this.db = null;
                    resolve();
                });
            });
        }
    }

    isConnected(): boolean {
        return this.db !== null;
    }

    getConfig(): SqliteConfig | null {
        return this.config;
    }
}
