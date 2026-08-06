import { MongoClient, Db, ObjectId, Binary, Int32, Long, Double, Decimal128, Timestamp } from 'mongodb';

export interface MongoResult {
    data?: any;
    error?: string;
}

export interface MongoConfig {
    connectionString: string;
    database: string;
}

// Bundle BSON types so user code can reference them (e.g. new ObjectId(...))
const BSON_TYPES = { ObjectId, Binary, Int32, Long, Double, Decimal128, Timestamp };

/**
 * MongoDB query executor.
 * 
 * Users write JavaScript that uses a `db` object (the Db instance).
 * Supported patterns:
 *   db.collection("users").find({}).toArray()
 *   db.collection("users").insertOne({ name: "John" })
 *   db.collection("users").aggregate([...]).toArray()
 *   db.collection("users").countDocuments({})
 *   db.collection("users").deleteMany({})
 *   db.collection("users").updateOne({...}, {$set: {...}})
 *
 * Also supports shell-style commands:
 *   show dbs, show collections, db.users.find({})
 */
export class MongoExecutor {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private config: MongoConfig | null = null;

    async connect(config: MongoConfig): Promise<void> {
        // Close existing connection if any
        if (this.client) {
            await this.disconnect();
        }

        this.config = config;
        this.client = new MongoClient(config.connectionString);
        await this.client.connect();
        this.db = this.client.db(config.database);

        // Test connection
        await this.db.command({ ping: 1 });
    }

    async execute(code: string): Promise<MongoResult> {
        if (!this.db || !this.client) {
            return { error: 'Not connected to MongoDB. Run "Query Notebook: Configure Database Connection" first.' };
        }

        try {
            // Handle `use <database>` — switch db just like mongosh
            const useMatch = code.trim().match(/^use\s+(\S+)\s*;?$/i);
            if (useMatch) {
                const dbName = useMatch[1];
                this.db = this.client.db(dbName);
                if (this.config) {
                    this.config.database = dbName;
                }
                return { data: `switched to db ${dbName}` };
            }

            // Translate shell commands (show dbs, show collections, etc.) to JS
            const translatedCode = this._translateShellCommands(code);

            // Create a function that receives `db`, `client`, and BSON types
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

            const fn = new AsyncFunction('db', 'client', 'ObjectId', 'Binary', 'Int32', 'Long', 'Double', 'Decimal128', 'Timestamp', `
                // The user's code — last expression is returned
                return (async () => {
                    ${this._wrapReturnStatement(translatedCode)}
                })();
            `);

            const result = await fn(
                this.db, this.client,
                BSON_TYPES.ObjectId, BSON_TYPES.Binary, BSON_TYPES.Int32,
                BSON_TYPES.Long, BSON_TYPES.Double, BSON_TYPES.Decimal128, BSON_TYPES.Timestamp
            );

            // Handle cursor-like results (though most should be resolved by toArray())
            if (result && typeof result.toArray === 'function') {
                const arr = await result.toArray();
                return { data: arr };
            }

            return { data: result };
        } catch (err: any) {
            return {
                error: `${err.name || 'MongoError'}: ${err.message}`
            };
        }
    }

    /**
     * Translates common MongoDB shell commands into Node.js driver calls.
     * Supports: show dbs, show databases, show collections, show tables,
     *           use <db>, db.stats(), db.<collection>.find() shorthand, etc.
     */
    private _translateShellCommands(code: string): string {
        const trimmed = code.trim();
        const lower = trimmed.toLowerCase().replace(/;+$/, '').trim();

        // show dbs / show databases
        if (lower === 'show dbs' || lower === 'show databases') {
            return `
                const adminDb = client.db().admin();
                const result = await adminDb.listDatabases();
                result.databases.map(d => ({ name: d.name, sizeOnDisk: d.sizeOnDisk, empty: d.empty }));
            `;
        }

        // show collections / show tables
        if (lower === 'show collections' || lower === 'show tables') {
            return 'db.listCollections().toArray()';
        }

        // show users
        if (lower === 'show users') {
            return `db.command({ usersInfo: 1 })`;
        }

        // db.stats()
        if (lower === 'db.stats()' || lower === 'db.stats') {
            return `db.stats()`;
        }

        // Note: `use <database>` is handled directly in execute() above

        // db.<collectionName>.<method>() shorthand (like mongosh)
        // e.g., db.users.find({}) → db.collection("users").find({})
        const shellMethodMatch = trimmed.match(/^db\.(\w+)\.(find|findOne|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|aggregate|countDocuments|count|distinct|drop|createIndex|getIndexes|stats)\s*\(/);
        if (shellMethodMatch) {
            const collectionName = shellMethodMatch[1];
            // Don't translate if it's already using .collection()
            if (collectionName !== 'collection') {
                return trimmed.replace(
                    `db.${collectionName}.`,
                    `db.collection("${collectionName}").`
                );
            }
        }

        // db.<collectionName>.find() without parens at end — just listing
        const shellSimpleMatch = trimmed.match(/^db\.(\w+)\.(find|findOne|countDocuments|count|stats|drop|getIndexes)\s*$/);
        if (shellSimpleMatch) {
            const collectionName = shellSimpleMatch[1];
            if (collectionName !== 'collection') {
                const method = shellSimpleMatch[2];
                if (method === 'find') {
                    return `db.collection("${collectionName}").find({}).toArray()`;
                }
                return `db.collection("${collectionName}").${method}()`;
            }
        }

        return trimmed;
    }

    /**
     * Wraps the user's code so the last expression is returned.
     * If the code already has a return statement, leave it alone.
     * Otherwise, add `return` before the last expression.
     */
    private _wrapReturnStatement(code: string): string {
        const trimmed = code.trim();

        // If the user already has return statements, use as-is
        if (/\breturn\b/.test(trimmed)) {
            return trimmed;
        }

        // Find the last statement (split by semicolons, ignoring those in strings)
        // Simple approach: add return before the last line that looks like an expression
        const lines = trimmed.split('\n');
        const lastNonEmptyIndex = this._findLastNonEmptyLine(lines);

        if (lastNonEmptyIndex >= 0) {
            const lastLine = lines[lastNonEmptyIndex].trim();

            // Don't add return before declarations, loops, or conditionals
            if (
                !lastLine.startsWith('const ') &&
                !lastLine.startsWith('let ') &&
                !lastLine.startsWith('var ') &&
                !lastLine.startsWith('for ') &&
                !lastLine.startsWith('while ') &&
                !lastLine.startsWith('if ') &&
                !lastLine.startsWith('//') &&
                !lastLine.startsWith('/*')
            ) {
                lines[lastNonEmptyIndex] = 'return ' + lines[lastNonEmptyIndex];
            }
        }

        return lines.join('\n');
    }

    private _findLastNonEmptyLine(lines: string[]): number {
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim().length > 0) {
                return i;
            }
        }
        return -1;
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
        }
    }

    isConnected(): boolean {
        return this.client !== null && this.db !== null;
    }

    getConfig(): MongoConfig | null {
        return this.config;
    }
}
