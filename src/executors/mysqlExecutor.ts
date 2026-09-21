import * as mysql from 'mysql2/promise';

export interface MySqlResult {
    rows?: any;
    fields?: string[];
    error?: string;
}

export interface MySqlConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database?: string;
}

/**
 * MySQL query executor using mysql2/promise.
 * Uses a dedicated connection pool and tracks active database when `USE <db>` is executed.
 */
export class MySqlExecutor {
    private pool: mysql.Pool | null = null;
    private config: MySqlConfig | null = null;
    private currentDatabase: string | null = null;

    async connect(config: MySqlConfig): Promise<void> {
        // Close existing pool if any
        if (this.pool) {
            await this.disconnect();
        }

        this.config = config;
        this.currentDatabase = config.database || null;

        const poolOptions: mysql.PoolOptions = {
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            waitForConnections: true,
            connectionLimit: 1,
            queueLimit: 0,
            multipleStatements: true
        };

        if (config.database) {
            poolOptions.database = config.database;
        }

        this.pool = mysql.createPool(poolOptions);

        // Test the connection
        const connection = await this.pool.getConnection();
        connection.release();
    }

    async execute(query: string): Promise<MySqlResult> {
        if (!this.pool) {
            return { error: 'Not connected to MySQL. Run "AnyINB: Configure Database Connection" first.' };
        }

        try {
            const trimmed = query.trim();
            const useMatch = trimmed.match(/^use\s+[`"']?([a-zA-Z0-9_$]+)[`"']?\s*;?$/i);
            if (useMatch) {
                this.currentDatabase = useMatch[1];
            }

            // Use pool.query() instead of pool.execute() so statements like SHOW TABLES,
            // DESCRIBE, EXPLAIN, and multi-statements are supported.
            const [rows, fields] = await this.pool.query(query);

            if (useMatch) {
                return {
                    rows: {
                        message: `Database changed to '${useMatch[1]}'`
                    }
                };
            }

            // For SELECT/SHOW/DESCRIBE queries, rows is an array and fields contains column metadata
            if (Array.isArray(rows) && fields && Array.isArray(fields)) {
                const fieldNames = (fields as any[]).map((f: any) => f.name);
                return { rows, fields: fieldNames };
            }

            // For INSERT/UPDATE/DELETE, rows is an OkPacket/ResultSetHeader
            return { rows };
        } catch (err: any) {
            return {
                error: `${err.code || 'ERROR'}: ${err.sqlMessage || err.message}`
            };
        }
    }

    async disconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
        this.currentDatabase = null;
    }

    isConnected(): boolean {
        return this.pool !== null;
    }

    getConfig(): MySqlConfig | null {
        return this.config;
    }

    getCurrentDatabase(): string | null {
        return this.currentDatabase;
    }
}
