/**
 * SandboxExecutor — Zero-Install in-memory SQLite and MongoDB mock database.
 * Allows practicing SQL and MongoDB queries on day one with zero software or servers installed.
 */

import * as sqlite3 from 'sqlite3';

export class SandboxExecutor {
    private static instance: SandboxExecutor;
    private sqliteDb: sqlite3.Database | null = null;
    private mongoCollections = new Map<string, any[]>();

    private constructor() {
        this._initSqlite();
        this._initMongoSamples();
    }

    static getInstance(): SandboxExecutor {
        return (SandboxExecutor.instance ??= new SandboxExecutor());
    }

    private _initSqlite(): void {
        this.sqliteDb = new sqlite3.Database(':memory:');
        this.sqliteDb.serialize(() => {
            this.sqliteDb?.run(`
                CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, role TEXT, score INT);
                INSERT INTO users VALUES (1, 'Alice Walker', 'alice@example.com', 'Admin', 95);
                INSERT INTO users VALUES (2, 'Bob Chen', 'bob@example.com', 'Developer', 88);
                INSERT INTO users VALUES (3, 'Charlie Diaz', 'charlie@example.com', 'Designer', 92);
                INSERT INTO users VALUES (4, 'Diana Prince', 'diana@example.com', 'Manager', 99);

                CREATE TABLE products (id INTEGER PRIMARY KEY, title TEXT, price REAL, stock INT, category TEXT);
                INSERT INTO products VALUES (101, 'MacBook Pro 16"', 2499.99, 12, 'Electronics');
                INSERT INTO products VALUES (102, 'Wireless Mechanical Keyboard', 149.50, 45, 'Accessories');
                INSERT INTO products VALUES (103, 'UltraWide 4K Monitor', 699.00, 8, 'Electronics');
                INSERT INTO products VALUES (104, 'Ergonomic Desk Chair', 380.00, 20, 'Furniture');
            `);
        });
    }

    private _initMongoSamples(): void {
        this.mongoCollections.set('users', [
            { _id: '6a58751ce3aa932566ef6498', id: '0001', name: 'Alice Walker', email: 'alice@example.com', role: 'admin', age: 28, address: { city: 'San Francisco', state: 'CA' } },
            { _id: '6a58751ce3aa932566ef6499', id: '0002', name: 'Bob Chen', email: 'bob@example.com', role: 'developer', age: 34, address: { city: 'Seattle', state: 'WA' } },
            { _id: '6a58751ce3aa932566ef6500', id: '0003', name: 'Charlie Diaz', email: 'charlie@example.com', role: 'designer', age: 26, address: { city: 'Austin', state: 'TX' } },
            { _id: '6a58751ce3aa932566ef6501', id: '0004', name: 'Diana Prince', email: 'diana@example.com', role: 'manager', age: 31, address: { city: 'New York', state: 'NY' } }
        ]);
        this.mongoCollections.set('products', [
            { _id: '6a58751ce3aa932566ef6502', name: 'MacBook Pro 16"', price: 2499.99, inStock: true, category: 'Computers' },
            { _id: '6a58751ce3aa932566ef6503', name: 'Wireless Mechanical Keyboard', price: 149.50, inStock: true, category: 'Accessories' }
        ]);
    }

    async executeSql(query: string): Promise<{ rows?: any[]; fields?: string[]; error?: string }> {
        if (!this.sqliteDb) this._initSqlite();
        return new Promise((resolve) => {
            this.sqliteDb!.all(query, (err, rows) => {
                if (err) {
                    resolve({ error: err.message });
                } else if (rows && rows.length > 0) {
                    resolve({ rows, fields: Object.keys(rows[0] as any) });
                } else {
                    resolve({ rows: [], fields: [] });
                }
            });
        });
    }

    executeMongo(code: string): any {
        const trimmed = code.trim();
        if (/^show\s+dbs/i.test(trimmed)) {
            return 'sandbox_db  0.001GB\nlocal       0.000GB';
        }
        if (/^show\s+collections/i.test(trimmed)) {
            return Array.from(this.mongoCollections.keys()).join('\n');
        }

        // Mock db.<collection> operations
        const colMatch = trimmed.match(/^db\.([a-zA-Z0-9_]+)\.(find|findOne|insertOne|insertMany|countDocuments|count)\(([\s\S]*)\)?/);
        if (colMatch) {
            const colName = colMatch[1];
            const op = colMatch[2];
            const argsRaw = colMatch[3]?.trim();

            if (!this.mongoCollections.has(colName)) {
                this.mongoCollections.set(colName, []);
            }
            const col = this.mongoCollections.get(colName)!;

            if (op === 'findOne') {
                return col[0] || null;
            }
            if (op === 'find') {
                return col;
            }
            if (op === 'count' || op === 'countDocuments') {
                return col.length;
            }
            if (op === 'insertOne') {
                try {
                    let doc = eval(`(${argsRaw || '{}'})`);
                    doc._id = doc._id || Math.random().toString(16).substring(2, 26).padEnd(24, '0');
                    col.push(doc);
                    return { acknowledged: true, insertedId: doc._id };
                } catch {
                    return { acknowledged: true, insertedId: 'mock_id_123' };
                }
            }
        }

        return Array.from(this.mongoCollections.entries()).map(([k, v]) => ({ collection: k, count: v.length }));
    }
}
