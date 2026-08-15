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
    database: string;
}

/**
 * MySQL query executor using mysql2/promise.
 * Manages a connection pool for efficient query execution.
 */
export class MySqlExecutor {
    private pool: mysql.Pool | null = null;
    private config: MySqlConfig | null = null;

    async connect(config: MySqlConfig): Promise<void> {
        // Close existing pool if any
        if (this.pool) {
            await this.disconnect();
        }

        this.config = config;

        this.pool = mysql.createPool({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            multipleStatements: true
        });

        // Test the connection
        const connection = await this.pool.getConnection();
        connection.release();
    }

    async execute(query: string): Promise<MySqlResult> {
        if (!this.pool) {
            return { error: 'Not connected to MySQL. Run "AnyINB: Configure Database Connection" first.' };
        }

        try {
            // Use pool.query() instead of pool.execute() so statements like SHOW TABLES,
            // DESCRIBE, EXPLAIN, and multi-statements are supported.
            const [rows, fields] = await this.pool.query(query);

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
    }

    isConnected(): boolean {
        return this.pool !== null;
    }

    getConfig(): MySqlConfig | null {
        return this.config;
    }
}
