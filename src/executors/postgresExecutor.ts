import { Pool } from 'pg';

export interface PostgresStatementResult {
    rows?: any[];
    fields?: string[];
    message?: string;
    isTable?: boolean;
}

export interface PostgresResult {
    rows?: any[];
    fields?: string[];
    error?: string;
    results?: PostgresStatementResult[];
}

export interface PostgresConfig {
    connectionString: string;
}

/**
 * PostgreSQL query executor using pg.
 * Manages a connection pool for efficient query execution.
 */
export class PostgresExecutor {
    private pool: Pool | null = null;
    private config: PostgresConfig | null = null;

    async connect(config: PostgresConfig): Promise<void> {
        // Close existing pool if any
        if (this.pool) {
            await this.disconnect();
        }

        this.config = config;

        this.pool = new Pool({
            connectionString: config.connectionString,
            max: 5, // connectionLimit
        });

        // Test the connection
        const client = await this.pool.connect();
        client.release();
    }

    async execute(query: string): Promise<PostgresResult> {
        if (!this.pool) {
            return { error: 'Not connected to PostgreSQL. Run "AnyINB: Configure Database Connection" first.' };
        }

        try {
            const result = await this.pool.query(query);

            if (Array.isArray(result)) {
                const statementResults: PostgresStatementResult[] = result.map(r => {
                    const isTable = r.command === 'SELECT' || (Array.isArray(r.rows) && r.fields && r.fields.length > 0);
                    const fields = r.fields?.filter((f: any) => f && typeof f.name === 'string').map((f: any) => f.name);
                    const message = `${r.command || 'Query'} OK. Affected rows: ${r.rowCount ?? 0}`;
                    return { rows: r.rows, fields, message, isTable };
                });
                return {
                    results: statementResults
                };
            }

            return { 
                rows: result.rows, 
                fields: result.fields?.filter((f: any) => f && typeof f.name === 'string').map((f: any) => f.name) 
            };
        } catch (err: any) {
            return {
                error: `${err.code || 'ERROR'}: ${err.message}`
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

    getConfig(): PostgresConfig | null {
        return this.config;
    }
}
