import * as cp from 'child_process';
import { LANGUAGE_CONFIGS } from './executors/processExecutor';

export interface RuntimeInfo {
    id: string;
    name: string;
    icon: string;
    installed: boolean;
    version?: string;
}

/**
 * Detects which programming language runtimes are installed on the system.
 * Results are cached for performance.
 */
export class RuntimeDetector {
    private cache: Map<string, RuntimeInfo> = new Map();

    /**
     * Check if a specific runtime is available.
     */
    async check(languageId: string): Promise<RuntimeInfo> {
        // Return cached result
        if (this.cache.has(languageId)) {
            return this.cache.get(languageId)!;
        }

        const config = LANGUAGE_CONFIGS[languageId];
        if (!config) {
            const result: RuntimeInfo = {
                id: languageId,
                name: languageId,
                icon: '❓',
                installed: false
            };
            this.cache.set(languageId, result);
            return result;
        }

        const versionCommands: Record<string, string> = {
            python: 'python --version',
            javascript: 'node --version',
            typescript: 'npx tsx --version',
            go: 'go version',
            rust: 'rustc --version',
            java: 'java --version',
            c: 'gcc --version',
            cpp: 'g++ --version',
            ruby: 'ruby --version',
            php: 'php --version',
            perl: 'perl --version',
            r: 'Rscript --version',
            lua: 'lua -v',
            swift: 'swift --version',
            kotlin: 'kotlinc -version',
            dart: 'dart --version',
        };

        const cmd = versionCommands[languageId];
        if (!cmd) {
            const result: RuntimeInfo = {
                id: languageId,
                name: config.name,
                icon: config.icon,
                installed: false
            };
            this.cache.set(languageId, result);
            return result;
        }

        try {
            const version = await this._getVersion(cmd);
            const result: RuntimeInfo = {
                id: languageId,
                name: config.name,
                icon: config.icon,
                installed: true,
                version
            };
            this.cache.set(languageId, result);
            return result;
        } catch {
            const result: RuntimeInfo = {
                id: languageId,
                name: config.name,
                icon: config.icon,
                installed: false
            };
            this.cache.set(languageId, result);
            return result;
        }
    }

    /**
     * Check all known runtimes.
     */
    async checkAll(): Promise<RuntimeInfo[]> {
        const ids = Object.keys(LANGUAGE_CONFIGS);
        const results = await Promise.all(ids.map(id => this.check(id)));
        return results;
    }

    /**
     * Get only installed runtimes.
     */
    async getInstalled(): Promise<RuntimeInfo[]> {
        const all = await this.checkAll();
        return all.filter(r => r.installed);
    }

    /**
     * Clear the cache to force re-detection.
     */
    clearCache(): void {
        this.cache.clear();
    }

    private _getVersion(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                // Extract first line of version output
                const output = (stdout || stderr).trim().split('\n')[0];
                resolve(output);
            });
        });
    }
}
