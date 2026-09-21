import { MongoClient, Db, Collection, AbstractCursor, FindCursor, ObjectId, Binary, Int32, Long, Double, Decimal128, Timestamp } from 'mongodb';

export interface MongoResult {
    data?: any;
    error?: string;
}

export interface MongoConfig {
    connectionString: string;
    database?: string;
}

// Bundle BSON types so user code can reference them (e.g. new ObjectId(...))
const BSON_TYPES = { ObjectId, Binary, Int32, Long, Double, Decimal128, Timestamp };

// Monkey-patch cursor prototypes for mongosh compatibility
if (AbstractCursor && (AbstractCursor as any).prototype && !(AbstractCursor as any).prototype.pretty) {
    (AbstractCursor as any).prototype.pretty = function () { return this; };
}
if (FindCursor && (FindCursor as any).prototype && !(FindCursor as any).prototype.count) {
    (FindCursor as any).prototype.count = async function () {
        const docs = await this.toArray();
        return docs.length;
    };
}

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
        this.db = this.client.db(config.database || 'test');

        // Test connection
        await this.client.db('admin').command({ ping: 1 });
    }

    async execute(code: string): Promise<MongoResult> {
        if (!this.db || !this.client) {
            return { error: 'Not connected to MongoDB. Run "AnyINB: Configure Database Connection" first.' };
        }

        try {
            // Handle `use <database>` — switch db just like mongosh
            const cleanCode = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
            const useMatch = cleanCode.match(/^use\s+[`"']?([^;\s'"`]+)[`"']?\s*;?$/i);
            if (useMatch) {
                const dbName = useMatch[1];
                this.db = this.client.db(dbName);
                if (!this.config) {
                    this.config = { connectionString: 'mongodb://localhost:27017' };
                }
                this.config.database = dbName;
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

            // If evaluating `db`, return the current database name like in mongosh
            if (result instanceof Db || (result && typeof result === 'object' && result.databaseName && typeof result.collection === 'function')) {
                return { data: result.databaseName };
            }

            // If evaluating `client`
            if (result instanceof MongoClient) {
                return { data: `Connected to ${this.config?.connectionString || 'MongoDB'}` };
            }

            // If result is a Collection (e.g. db.createCollection("students") or evaluating db.students)
            if (result instanceof Collection || (result && typeof result === 'object' && typeof result.collectionName === 'string' && typeof result.find === 'function')) {
                if (/\bcreateCollection\b/.test(code)) {
                    return { data: { ok: 1 } };
                }
                return { data: `${this.db?.databaseName || 'test'}.${result.collectionName}` };
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
                    if (prop === 'getName') {
                        return () => target.databaseName;
                    }
                    if (prop === 'getCollectionNames') {
                        return async () => {
                            const cols = await target.listCollections().toArray();
                            return cols.map((c: any) => c.name);
                        };
                    }
                    if (prop === 'getCollectionInfos') {
                        return async (filter?: any) => {
                            return await target.listCollections(filter).toArray();
                        };
                    }
                    if (prop === 'getCollection') {
                        return (name: string) => target.collection(name);
                    }
                    if (prop === 'version') {
                        return async () => {
                            const info = await target.admin().serverInfo();
                            return info.version || 'unknown';
                        };
                    }
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

        // typing just `db` (like in mongosh) outputs the current database name
        if (lower === 'db' || lower === 'db.getname()' || lower === 'db.getname') {
            return `return db.databaseName;`;
        }

        // db.version() / version()
        if (lower === 'db.version()' || lower === 'version()') {
            return `
                const adminDb = client.db().admin();
                const info = await adminDb.serverInfo();
                return info.version || 'unknown';
            `;
        }

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
