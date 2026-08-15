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
            return { error: 'Not connected to MongoDB. Run "AnyINB: Configure Database Connection" first.' };
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
            const dbProxy = this._createDbProxy(this.db);

            // Create a function that receives `db`, `client`, and BSON types
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

            let result: any;
            if (/\breturn\b/.test(translatedCode)) {
                const fn = new AsyncFunction('db', 'client', 'ObjectId', 'Binary', 'Int32', 'Long', 'Double', 'Decimal128', 'Timestamp', translatedCode);
                result = await fn(
                    dbProxy, this.client,
                    BSON_TYPES.ObjectId, BSON_TYPES.Binary, BSON_TYPES.Int32,
                    BSON_TYPES.Long, BSON_TYPES.Double, BSON_TYPES.Decimal128, BSON_TYPES.Timestamp
                );
            } else {
                try {
                    const fn = new AsyncFunction('db', 'client', 'ObjectId', 'Binary', 'Int32', 'Long', 'Double', 'Decimal128', 'Timestamp', `return (${translatedCode});`);
                    result = await fn(
                        dbProxy, this.client,
                        BSON_TYPES.ObjectId, BSON_TYPES.Binary, BSON_TYPES.Int32,
                        BSON_TYPES.Long, BSON_TYPES.Double, BSON_TYPES.Decimal128, BSON_TYPES.Timestamp
                    );
                } catch {
                    const fn = new AsyncFunction('db', 'client', 'ObjectId', 'Binary', 'Int32', 'Long', 'Double', 'Decimal128', 'Timestamp', translatedCode);
                    result = await fn(
                        dbProxy, this.client,
                        BSON_TYPES.ObjectId, BSON_TYPES.Binary, BSON_TYPES.Int32,
                        BSON_TYPES.Long, BSON_TYPES.Double, BSON_TYPES.Decimal128, BSON_TYPES.Timestamp
                    );
                }
            }

            // Handle cursor-like results (FindCursor, AggregationCursor, etc.)
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
     * Wrap Db in a Proxy so `db.<collectionName>` shorthand works anywhere in code (e.g. db.users.find()).
     */
    private _createDbProxy(db: Db): any {
        return new Proxy(db, {
            get(target: any, prop: string | symbol) {
                if (typeof prop === 'string') {
                    if (prop in target || typeof target[prop] === 'function') {
                        const val = target[prop];
                        return typeof val === 'function' ? val.bind(target) : val;
                    }
                    if (prop !== 'then' && !prop.startsWith('_') && !prop.startsWith('$')) {
                        return target.collection(prop);
                    }
                }
                return target[prop];
            }
        });
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
                const formatBytes = (bytes) => {
                    if (!bytes) return '0.00 B';
                    const units = ['B', 'KiB', 'MiB', 'GiB'];
                    let i = 0;
                    let val = bytes;
                    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
                    return val.toFixed(2) + ' ' + units[i];
                };
                return result.databases.map(d => (d.name || '').padEnd(12) + ' ' + formatBytes(d.sizeOnDisk)).join('\\n');
            `;
        }

        // show collections / show tables
        if (lower === 'show collections' || lower === 'show tables') {
            return `
                const collections = await db.listCollections().toArray();
                const names = collections.map(c => c.name).sort();
                return names.length ? names.join('\\n') : '(empty)';
            `;
        }

        // show users
        if (lower === 'show users') {
            return `return await db.command({ usersInfo: 1 });`;
        }

        // db.stats()
        if (lower === 'db.stats()' || lower === 'db.stats') {
            return `return await db.stats();`;
        }

        return trimmed;
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
