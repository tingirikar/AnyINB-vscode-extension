/**
 * DataContext — Manages cross-cell polyglot data piping.
 * Allows query results (from SQL, Mongo, HTTP, etc.) to be seamlessly
 * referenced in Python (as IN / pandas DataFrame), JavaScript (as IN),
 * and Shell/WSL (as $IN and $IN_JSON environment variables).
 */

export interface LastResultData {
    rows?: any[];
    fields?: string[];
    rawJson?: any;
    source?: string;
    timestamp: number;
}

export class DataContext {
    private static instance: DataContext;
    private lastResult: LastResultData | null = null;
    private history: LastResultData[] = [];

    private constructor() {}

    static getInstance(): DataContext {
        return (DataContext.instance ??= new DataContext());
    }

    setLastResult(data: { rows?: any[]; fields?: string[]; rawJson?: any; source?: string }): void {
        const entry: LastResultData = {
            ...data,
            timestamp: Date.now()
        };
        this.lastResult = entry;
        this.history.push(entry);
        if (this.history.length > 20) {
            this.history.shift();
        }
    }

    getLastResult(): LastResultData | null {
        return this.lastResult;
    }

    getPreviousSnapshot(source?: string): LastResultData | undefined {
        if (!source) {
            return this.history.length > 1 ? this.history[this.history.length - 2] : undefined;
        }
        const matches = this.history.filter(h => h.source === source);
        return matches.length > 1 ? matches[matches.length - 2] : undefined;
    }

    /**
     * Python injection script: creates `IN` variable as a list of dicts
     * and wraps it in pandas DataFrame if pandas is available.
     */
    getPythonInjection(): string {
        if (!this.lastResult || (!this.lastResult.rows?.length && !this.lastResult.rawJson)) {
            return '';
        }
        const data = this.lastResult.rows || this.lastResult.rawJson;
        let jsonStr = '[]';
        try {
            const seen = new WeakSet();
            jsonStr = JSON.stringify(data, (_key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) return undefined;
                    seen.add(value);
                }
                return value;
            });
        } catch {
            jsonStr = '[]';
        }
        const b64 = Buffer.from(jsonStr).toString('base64');
        return `exec('import json, base64; globals()["IN"] = json.loads(base64.b64decode("${b64}").decode("utf-8"));\\ntry:\\n import pandas as _pd; globals()["IN"] = _pd.DataFrame(IN)\\nexcept Exception:\\n pass')`;
    }

    /**
     * JavaScript injection: sets `IN` variable in scope.
     */
    getJavaScriptInjection(): string {
        if (!this.lastResult || (!this.lastResult.rows?.length && !this.lastResult.rawJson)) {
            return '';
        }
        const data = this.lastResult.rows || this.lastResult.rawJson;
        return `var IN = ${JSON.stringify(data)};\n`;
    }

    /**
     * Shell / WSL environment variables.
     */
    getShellEnv(): Record<string, string> {
        if (!this.lastResult) return {};
        const data = this.lastResult.rows || this.lastResult.rawJson || '';
        const json = typeof data === 'string' ? data : JSON.stringify(data);
        return {
            IN: json,
            IN_JSON: json
        };
    }
}
