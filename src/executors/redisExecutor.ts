import Redis from 'ioredis';

export interface RedisResult {
    data?: any;
    error?: string;
}

export interface RedisConfig {
    connectionString: string;
}

/**
 * Redis query executor using ioredis.
 * Parses and executes raw Redis commands (e.g. SET key value, GET key).
 */
export class RedisExecutor {
    private redis: Redis | null = null;
    private config: RedisConfig | null = null;

    async connect(config: RedisConfig): Promise<void> {
        if (this.redis) {
            await this.disconnect();
        }

        this.config = config;

        return new Promise((resolve, reject) => {
            this.redis = new Redis(config.connectionString, {
                lazyConnect: true,
                maxRetriesPerRequest: 1
            });

            this.redis.connect()
                .then(() => resolve())
                .catch((err) => {
                    this.redis = null;
                    reject(err);
                });
        });
    }

    async execute(query: string): Promise<RedisResult> {
        if (!this.redis) {
            return { error: 'Not connected to Redis. Run "Query Notebook: Configure Database Connection" first.' };
        }

        try {
            const lines = query.trim().split('\n').filter(line => line.trim().length > 0 && !line.startsWith('#'));
            if (lines.length === 0) {
                return { error: 'Empty query.' };
            }

            // If there's only one command
            if (lines.length === 1) {
                return { data: await this._executeSingleCommand(lines[0]) };
            }

            // Execute multiple commands in a pipeline
            const pipeline = this.redis.pipeline();
            for (const line of lines) {
                const parts = this._parseCommand(line);
                if (parts.length > 0) {
                    const cmdName = parts[0].toLowerCase();
                    const args = parts.slice(1);
                    // @ts-ignore
                    if (typeof pipeline[cmdName] === 'function') {
                        // @ts-ignore
                        pipeline[cmdName](...args);
                    } else {
                        // Fallback to sending raw command if not a recognized method
                        pipeline.call(parts[0], ...args);
                    }
                }
            }

            const results = await pipeline.exec();
            // results is an array of [error, result]
            if (results) {
                const cleanResults = results.map(res => {
                    if (res[0]) return { error: res[0].message };
                    return res[1];
                });
                return { data: cleanResults };
            }
            return { data: null };
            
        } catch (err: any) {
            return { error: err.message || String(err) };
        }
    }
    
    private async _executeSingleCommand(line: string): Promise<any> {
        const parts = this._parseCommand(line);
        if (parts.length === 0) return null;
        
        const cmdName = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        // @ts-ignore
        if (typeof this.redis[cmdName] === 'function') {
            // @ts-ignore
            return await this.redis[cmdName](...args);
        }
        
        // Fallback
        return await this.redis!.call(parts[0], ...args);
    }

    /**
     * Basic parser to split arguments, handling quotes.
     * e.g. SET "my key" "my value" -> ['SET', 'my key', 'my value']
     */
    private _parseCommand(line: string): string[] {
        const regex = /[^\s"]+|"([^"]*)"/g;
        const result: string[] = [];
        let match;
        while ((match = regex.exec(line)) !== null) {
            result.push(match[1] ? match[1] : match[0]);
        }
        return result;
    }

    async disconnect(): Promise<void> {
        if (this.redis) {
            this.redis.disconnect();
            this.redis = null;
        }
    }

    isConnected(): boolean {
        return this.redis !== null && this.redis.status === 'ready';
    }

    getConfig(): RedisConfig | null {
        return this.config;
    }
}
