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
            const cleanQuery = query.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

            // Track USE <db> statements to update active database
            const useMatches = [...cleanQuery.matchAll(/\buse\s+[`"']?([^;\s'"`]+)[`"']?/gi)];
            if (useMatches.length > 0) {
                this.currentDatabase = useMatches[useMatches.length - 1][1];
            }

            // If a database is dropped, clear currentDatabase if it matches
            const dropDbMatch = cleanQuery.match(/\bdrop\s+(?:database|schema)\s+[`"']?([^;\s'"`]+)[`"']?/i);
            if (dropDbMatch && this.currentDatabase && dropDbMatch[1].toLowerCase() === this.currentDatabase.toLowerCase()) {
                this.currentDatabase = null;
            }

            // Use pool.query() instead of pool.execute() so statements like SHOW TABLES,
            // DESCRIBE, EXPLAIN, and multi-statements are supported.
            const [rows, fields] = await this.pool.query(query);

            // If the query was purely a USE command
            if (cleanQuery.match(/^use\s+[`"']?([^;\s'"`]+)[`"']?\s*;?$/i)) {
                return {
                    rows: {
                        message: `Database changed to '${this.currentDatabase}'`
                    }
                };
            }

            // Check if this was a multi-statement result
            // In mysql2 with multipleStatements: true:
            // - If multi-statement, `rows` is an Array of each statement's result.
            // - `fields` is an Array of each statement's fields (or undefined for non-SELECT statements).
            const isMultiStatement = Array.isArray(rows) && Array.isArray(fields) && (
                fields.length === 0 ||
                fields[0] === undefined ||
                Array.isArray(fields[0]) ||
                (rows.length > 0 && rows[0] && typeof rows[0] === 'object' && ('affectedRows' in rows[0] || rows[0].constructor?.name === 'ResultSetHeader'))
            );

            if (isMultiStatement) {
                // Find if any statement was a SELECT returning tabular data
                let lastSelectRows: any[] | null = null;
                let lastSelectFields: string[] | null = null;

                for (let i = 0; i < (rows as any[]).length; i++) {
                    const stmtRows = (rows as any[])[i];
                    const stmtFields = (fields as any[])[i];
                    if (Array.isArray(stmtRows) && Array.isArray(stmtFields)) {
                        lastSelectRows = stmtRows;
                        lastSelectFields = stmtFields
                            .filter((f: any) => f && typeof f.name === 'string')
                            .map((f: any) => f.name);
                    }
                }

                if (lastSelectRows !== null) {
                    return {
                        rows: lastSelectRows,
                        fields: lastSelectFields && lastSelectFields.length > 0
                            ? lastSelectFields
                            : (lastSelectRows.length > 0 ? Object.keys(lastSelectRows[0]) : [])
                    };
                }

                // If no statement returned rows (e.g. DROP TABLE ...; DROP DATABASE ...; or multiple INSERTs)
                const totalAffected = (rows as any[]).reduce((sum: number, r: any) => sum + (r?.affectedRows ?? 0), 0);
                const totalChanged = (rows as any[]).reduce((sum: number, r: any) => sum + (r?.changedRows ?? 0), 0);
                return {
                    rows: {
                        affectedRows: totalAffected,
                        changedRows: totalChanged,
                        message: `Query OK. Affected rows: ${totalAffected}, Changed: ${totalChanged}`
                    }
                };
            }

            // Single SELECT / SHOW / DESCRIBE query
            if (Array.isArray(rows) && fields && Array.isArray(fields)) {
                const fieldNames = (fields as any[])
                    .filter((f: any) => f && typeof f.name === 'string')
                    .map((f: any) => f.name);
                return { rows, fields: fieldNames };
            }

            // For single statement INSERT/UPDATE/DELETE/DDL, rows is a ResultSetHeader
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
