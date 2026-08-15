import { Pool } from 'pg';

export interface PostgresResult {
    rows?: any[];
    fields?: string[];
    error?: string;
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
                // If multiple queries were sent, just return the last result
                const lastResult = result[result.length - 1];
                return { 
                    rows: lastResult.rows, 
                    fields: lastResult.fields?.map((f: any) => f.name)
                };
            }

            return { 
                rows: result.rows, 
                fields: result.fields?.map((f: any) => f.name) 
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
