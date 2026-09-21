import { MongoClient, Db, Collection, AbstractCursor, FindCursor, ObjectId, Binary, Int32, Long, Double, Decimal128, Timestamp } from 'mongodb';

export interface MongoResult {
    data?: any;
    error?: string;
    results?: any[];
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
            const cleanCode = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

            // Handle `use <database>` if that's the only statement
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

            const statements = this._splitStatements(cleanCode);
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const dbProxy = this._createDbProxy(this.db);

            const __switchDb = (name: string) => {
                this.db = this.client!.db(name);
                if (!this.config) this.config = { connectionString: 'mongodb://localhost:27017' };
                this.config.database = name;
                return `switched to db ${name}`;
            };

            const __showDbs = async () => {
                const adminDb = this.client!.db().admin();
                const res = await adminDb.listDatabases();
                const formatBytes = (bytes: number) => {
                    if (!bytes) return '0.00 B';
                    const units = ['B', 'KiB', 'MiB', 'GiB'];
                    let i = 0;
                    let val = bytes;
                    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
                    return val.toFixed(2) + ' ' + units[i];
                };
                return res.databases.map((d: any) => (d.name || '').padEnd(12) + ' ' + formatBytes(d.sizeOnDisk)).join('\n');
            };

            const __showCollections = async () => {
                const collections = await this.db!.listCollections().toArray();
                const names = collections.map((c: any) => c.name).sort();
                return names.length ? names.join('\n') : '(empty)';
            };

            const __getVersion = async () => {
                const adminDb = this.client!.db().admin();
                const info = await adminDb.serverInfo();
                return info.version || 'unknown';
            };

            // Multi-statement execution: execute each statement and collect outputs
            if (statements.length > 1 && !/\breturn\b/.test(cleanCode)) {
                try {
                    const transformedStatements = statements.map((stmt) => {
                        const trimmed = stmt.trim();
                        const lower = trimmed.toLowerCase().replace(/;+$/, '').trim();

                        if (/^use\s+/i.test(trimmed)) {
                            const m = trimmed.match(/^use\s+[`"']?([^;\s'"`]+)[`"']?\s*;?$/i);
                            if (m) {
                                return `__results.push(__switchDb("${m[1]}"));`;
                            }
                        }
                        if (lower === 'show dbs' || lower === 'show databases') {
                            return `__results.push(await __showDbs());`;
                        }
                        if (lower === 'show collections' || lower === 'show tables') {
                            return `__results.push(await __showCollections());`;
                        }
                        if (lower === 'show users') {
                            return `__results.push(await db.command({ usersInfo: 1 }));`;
                        }
                        if (lower === 'db' || lower === 'db.getname()' || lower === 'db.getname') {
                            return `__results.push(db.databaseName);`;
                        }
                        if (lower === 'db.version()' || lower === 'version()') {
                            return `__results.push(await __getVersion());`;
                        }
                        if (lower === 'db.stats()' || lower === 'db.stats') {
                            return `__results.push(await db.stats());`;
                        }

                        // Declarations & flow control: execute directly without pushing result
                        if (/^(const|let|var|function|class|import)\b/.test(trimmed) ||
                            /^(for|while|if|try|switch)\b/.test(trimmed)) {
                            return trimmed + (trimmed.endsWith(';') ? '' : ';');
                        }

                        // Normal expression or driver method call
                        const cleanStmt = trimmed.replace(/;+$/, '');
                        return `__results.push(await (${cleanStmt}));`;
                    });

                    const transformedCode = `
                        const __results = [];
                        ${transformedStatements.join('\n')}
                        return __results;
                    `;

                    const fn = new AsyncFunction(
                        'db', 'client', 'ObjectId', 'Binary', 'Int32', 'Long', 'Double', 'Decimal128', 'Timestamp',
                        '__switchDb', '__showDbs', '__showCollections', '__getVersion',
                        transformedCode
                    );
                    const rawResults = await fn(
                        dbProxy, this.client,
                        BSON_TYPES.ObjectId, BSON_TYPES.Binary, BSON_TYPES.Int32,
                        BSON_TYPES.Long, BSON_TYPES.Double, BSON_TYPES.Decimal128, BSON_TYPES.Timestamp,
                        __switchDb, __showDbs, __showCollections, __getVersion
                    );

                    if (Array.isArray(rawResults)) {
                        const formattedResults: any[] = [];
                        for (let i = 0; i < rawResults.length; i++) {
                            const formatted = await this._formatOneResult(rawResults[i], statements[i] || '');
                            if (formatted !== undefined) {
                                formattedResults.push(formatted);
                            }
                        }
                        return {
                            results: formattedResults,
                            data: formattedResults.length > 0 ? formattedResults[formattedResults.length - 1] : undefined
                        };
                    }
                } catch {
                    // If multi-statement wrapping fails, fall through to default execution
                }
            }

            // Single statement execution
            const translatedCode = this._translateShellCommands(code);
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

            const formatted = await this._formatOneResult(result, code);
            return { data: formatted };
        } catch (err: any) {
            return {
                error: `${err.name || 'MongoError'}: ${err.message}`
            };
        }
    }

    private async _formatOneResult(item: any, stmtCode: string): Promise<any> {
        if (item && typeof item.toArray === 'function') {
            return await item.toArray();
        }
        if (item instanceof Db || (item && typeof item === 'object' && item.databaseName && typeof item.collection === 'function')) {
            return item.databaseName;
        }
        if (item instanceof MongoClient) {
            return `Connected to ${this.config?.connectionString || 'MongoDB'}`;
        }
        if (item instanceof Collection || (item && typeof item === 'object' && typeof item.collectionName === 'string' && typeof item.find === 'function')) {
            if (/\bcreateCollection\b/.test(stmtCode)) {
                return { ok: 1 };
            }
            return `${this.db?.databaseName || 'test'}.${item.collectionName}`;
        }
        return item;
    }

    private _splitStatements(code: string): string[] {
        const statements: string[] = [];
        let current = '';
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inTemplateLiteral = false;
        let inLineComment = false;
        let inBlockComment = false;
        let parenDepth = 0;
        let braceDepth = 0;
        let bracketDepth = 0;

        for (let i = 0; i < code.length; i++) {
            const char = code[i];
            const next = code[i + 1] || '';

            if (inLineComment) {
                current += char;
                if (char === '\n') inLineComment = false;
                continue;
            }
            if (inBlockComment) {
                current += char;
                if (char === '*' && next === '/') {
                    current += next;
                    i++;
                    inBlockComment = false;
                }
                continue;
            }
            if (!inSingleQuote && !inDoubleQuote && !inTemplateLiteral) {
                if (char === '/' && next === '/') {
                    current += char + next;
                    i++;
                    inLineComment = true;
                    continue;
                }
                if (char === '/' && next === '*') {
                    current += char + next;
                    i++;
                    inBlockComment = true;
                    continue;
                }
            }

            if (inSingleQuote) {
                current += char;
                if (char === '\\') { current += next; i++; }
                else if (char === "'") inSingleQuote = false;
                continue;
            }
            if (inDoubleQuote) {
                current += char;
                if (char === '\\') { current += next; i++; }
                else if (char === '"') inDoubleQuote = false;
                continue;
            }
            if (inTemplateLiteral) {
                current += char;
                if (char === '\\') { current += next; i++; }
                else if (char === '`') inTemplateLiteral = false;
                continue;
            }

            if (char === "'") { inSingleQuote = true; current += char; continue; }
            if (char === '"') { inDoubleQuote = true; current += char; continue; }
            if (char === '`') { inTemplateLiteral = true; current += char; continue; }

            if (char === '(') parenDepth++;
            else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
            else if (char === '{') braceDepth++;
            else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
            else if (char === '[') bracketDepth++;
            else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);

            const isZeroDepth = parenDepth === 0 && braceDepth === 0 && bracketDepth === 0;
            if (isZeroDepth) {
                if (char === ';') {
                    if (current.trim()) {
                        statements.push(current.trim());
                    }
                    current = '';
                    continue;
                }
                if (char === '\n') {
                    const trimmed = current.trim();
                    if (trimmed && !/[.,+\-*&|=(\[{]$/.test(trimmed)) {
                        const rest = code.slice(i + 1).trim();
                        if (!rest.startsWith('.')) {
                            statements.push(trimmed);
                            current = '';
                            continue;
                        }
                    }
                }
            }

            current += char;
        }

        if (current.trim()) {
            statements.push(current.trim());
        }

        return statements;
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
