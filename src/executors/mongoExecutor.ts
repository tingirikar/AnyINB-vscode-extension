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
 * Parse `use <database>` commands, handling:
 * - unquoted names with optional trailing semicolon: `use college;` -> `college`
 * - quoted names preserving internal characters: `use "college;"` -> `college;`
 */
export function parseMongoUseCommand(code: string): string | null {
    const clean = code.trim();
    // 1. Quoted: use "dbname" or use 'dbname' or use `dbname`
    const quoted = clean.match(/^use\s+(["'`])(.*?)\1\s*;?$/i);
    if (quoted) {
        return quoted[2];
    }
    // 2. Unquoted: use dbname or use dbname;
    const unquoted = clean.match(/^use\s+([^\s;]+)\s*;?$/i);
    if (unquoted) {
        return unquoted[1];
    }
    return null;
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
            const useDbName = parseMongoUseCommand(cleanCode);
            if (useDbName !== null) {
                let targetDbName = useDbName;
                try {
                    const adminDb = this.client.db().admin();
                    const dbs = await adminDb.listDatabases();
                    if (!dbs.databases.some((d: any) => d.name === targetDbName)) {
                        const semi = dbs.databases.find((d: any) => d.name === `${targetDbName};`);
                        if (semi) {
                            targetDbName = semi.name;
                        }
                    }
                } catch {}

                this.db = this.client.db(targetDbName);
                if (!this.config) {
                    this.config = { connectionString: 'mongodb://localhost:27017' };
                }
                this.config.database = targetDbName;
                return { data: `switched to db ${targetDbName}` };
            }

            const statements = this._splitStatements(cleanCode);
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const dbProxy = this._createDbProxy(this.db);

            const __switchDb = async (name: string) => {
                let targetName = name;
                try {
                    const adminDb = this.client!.db().admin();
                    const dbs = await adminDb.listDatabases();
                    if (!dbs.databases.some((d: any) => d.name === targetName)) {
                        const semi = dbs.databases.find((d: any) => d.name === `${targetName};`);
                        if (semi) {
                            targetName = semi.name;
                        }
                    }
                } catch {}
                this.db = this.client!.db(targetName);
                if (!this.config) this.config = { connectionString: 'mongodb://localhost:27017' };
                this.config.database = targetName;
                return `switched to db ${targetName}`;
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
                    const transformedStatements = statements.map((stmt, i) => {
                        const trimmed = stmt.trim();
                        const lower = trimmed.toLowerCase().replace(/;+$/, '').trim();

                        const useDb = parseMongoUseCommand(trimmed);
                        if (useDb !== null) {
                            return `__results.push(await __switchDb(${JSON.stringify(useDb)}));`;
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

                        // Normal expression or driver method call - immediately snapshot any cursor
                        const cleanStmt = trimmed.replace(/;+$/, '');
                        return `let __stmt_res_${i} = await (${cleanStmt}); if (__stmt_res_${i} && typeof __stmt_res_${i}.toArray === 'function') { __stmt_res_${i} = await __stmt_res_${i}.toArray(); } __results.push(__stmt_res_${i});`;
                    });

                    const transformedCode = `
                        const __results = [];
                        ${transformedStatements.join('\n')}
                        return __results;
                    `;

                    let fn: any;
                    try {
                        fn = new AsyncFunction(
                            'db', 'client', 'ObjectId', 'Binary', 'Int32', 'Long', 'Double', 'Decimal128', 'Timestamp',
                            '__switchDb', '__showDbs', '__showCollections', '__getVersion',
                            transformedCode
                        );
                    } catch {
                        // Syntax error preparing multi-statement function — fall through
                    }

                    if (fn) {
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
                    }
                } catch (err: any) {
                    // Re-throw genuine MongoDB or JavaScript runtime execution errors
                    return {
                        error: `${err.name || 'MongoError'}: ${err.message}`
                    };
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
                const cleanTranslated = translatedCode.trim().replace(/;+$/, '');
                let fn: any;
                try {
                    fn = new AsyncFunction('db', 'client', 'ObjectId', 'Binary', 'Int32', 'Long', 'Double', 'Decimal128', 'Timestamp', `return (${cleanTranslated});`);
                } catch {
                    fn = new AsyncFunction('db', 'client', 'ObjectId', 'Binary', 'Int32', 'Long', 'Double', 'Decimal128', 'Timestamp', translatedCode);
                }

                result = await fn(
                    dbProxy, this.client,
                    BSON_TYPES.ObjectId, BSON_TYPES.Binary, BSON_TYPES.Int32,
                    BSON_TYPES.Long, BSON_TYPES.Double, BSON_TYPES.Decimal128, BSON_TYPES.Timestamp
                );
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
            get: (target: any, prop: string | symbol) => {
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
                    if (prop === 'getCollection' || prop === 'collection') {
                        return (name: string) => this._createCollectionProxy(target.collection(name));
                    }
                    if (prop === 'version') {
                        return async () => {
                            const info = await target.admin().serverInfo();
                            return info.version || 'unknown';
                        };
                    }
                    if (prop === 'getSiblingDB') {
                        return (name: string) => this._createDbProxy((this.client || target.client).db(name));
                    }
                    if (prop === 'dropDatabase') {
                        return async (options?: any) => {
                            const res = await target.dropDatabase(options);
                            try {
                                const admin = (this.client || target.client).db().admin();
                                const dbs = await admin.listDatabases();
                                const baseName = target.databaseName.replace(/;+$/, '');
                                for (const d of dbs.databases) {
                                    const dBase = d.name.replace(/;+$/, '');
                                    if (dBase === baseName && d.name !== target.databaseName) {
                                        await (this.client || target.client).db(d.name).dropDatabase(options);
                                    }
                                }
                            } catch {}
                            return res;
                        };
                    }
                    if (prop in target || typeof target[prop] === 'function') {
                        const val = target[prop];
                        return typeof val === 'function' ? val.bind(target) : val;
                    }
                    if (prop !== 'then' && !prop.startsWith('_') && !prop.startsWith('$')) {
                        return this._createCollectionProxy(target.collection(prop));
                    }
                }
                return target[prop];
            }
        });
    }

    /**
     * Wrap Collection in a Proxy for mongosh compatibility:
     * - find(query, projection, options)
     * - findOne(query, projection, options)
     * - count(filter, options)
     */
    private _createCollectionProxy(col: Collection): any {
        return new Proxy(col, {
            get: (target: any, prop: string | symbol) => {
                if (prop === 'find') {
                    return (filter?: any, projectionOrOptions?: any, maybeOptions?: any) => {
                        if (maybeOptions !== undefined) {
                            return target.find(filter, { ...maybeOptions, projection: projectionOrOptions });
                        }
                        if (projectionOrOptions && typeof projectionOrOptions === 'object') {
                            if ('projection' in projectionOrOptions) {
                                return target.find(filter, projectionOrOptions);
                            }
                            const driverOptionKeys = ['sort', 'skip', 'limit', 'batchSize', 'hint', 'explain', 'maxTimeMS', 'readPreference', 'session', 'timeoutMode'];
                            const hasDriverKeys = Object.keys(projectionOrOptions).some(k => driverOptionKeys.includes(k));
                            if (!hasDriverKeys) {
                                return target.find(filter, { projection: projectionOrOptions });
                            }
                        }
                        return target.find(filter, projectionOrOptions);
                    };
                }
                if (prop === 'findOne') {
                    return (filter?: any, projectionOrOptions?: any, maybeOptions?: any) => {
                        if (maybeOptions !== undefined) {
                            return target.findOne(filter, { ...maybeOptions, projection: projectionOrOptions });
                        }
                        if (projectionOrOptions && typeof projectionOrOptions === 'object') {
                            if ('projection' in projectionOrOptions) {
                                return target.findOne(filter, projectionOrOptions);
                            }
                            const driverOptionKeys = ['sort', 'skip', 'limit', 'batchSize', 'hint', 'explain', 'maxTimeMS', 'readPreference', 'session', 'timeoutMode'];
                            const hasDriverKeys = Object.keys(projectionOrOptions).some(k => driverOptionKeys.includes(k));
                            if (!hasDriverKeys) {
                                return target.findOne(filter, { projection: projectionOrOptions });
                            }
                        }
                        return target.findOne(filter, projectionOrOptions);
                    };
                }
                if (prop === 'count') {
                    return (filter?: any, options?: any) => target.countDocuments(filter || {}, options);
                }
                const val = target[prop];
                return typeof val === 'function' ? val.bind(target) : val;
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
