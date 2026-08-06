import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
}

/**
 * Configuration for each supported programming language.
 */
export interface LanguageConfig {
    id: string;
    name: string;
    icon: string;
    extension: string;
    runCommand: (filePath: string) => string;
    compileCommand?: (filePath: string, outPath: string) => string;
    needsCleanup?: boolean;
    wrapperTemplate?: (code: string) => string;
}

/**
 * Registry of all supported programming languages.
 */
export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
    python: {
        id: 'python',
        name: 'Python',
        icon: '🐍',
        extension: '.py',
        runCommand: (f) => `python ${f}`,
    },
    javascript: {
        id: 'javascript',
        name: 'Node.js',
        icon: '⬡',
        extension: '.js',
        runCommand: (f) => `node ${f}`,
    },
    typescript: {
        id: 'typescript',
        name: 'TypeScript',
        icon: '🔷',
        extension: '.ts',
        runCommand: (f) => `npx tsx ${f}`,
    },
    go: {
        id: 'go',
        name: 'Go',
        icon: '🐹',
        extension: '.go',
        runCommand: (f) => `go run ${f}`,
        wrapperTemplate: (code: string) => {
            if (!code.includes('package ')) {
                return `package main\n\nimport "fmt"\n\nfunc main() {\n${code}\n_ = fmt.Sprintf("")\n}`;
            }
            return code;
        },
    },
    rust: {
        id: 'rust',
        name: 'Rust',
        icon: '🦀',
        extension: '.rs',
        runCommand: (f) => {
            const out = f.replace(/\.rs$/, os.platform() === 'win32' ? '.exe' : '');
            return os.platform() === 'win32' ? `.\\${out}` : `./${out}`;
        },
        compileCommand: (f, out) => `rustc ${f} -o ${out}`,
        needsCleanup: true,
        wrapperTemplate: (code: string) => {
            if (!code.includes('fn main')) {
                return `fn main() {\n${code}\n}`;
            }
            return code;
        },
    },
    java: {
        id: 'java',
        name: 'Java',
        icon: '☕',
        extension: '.java',
        runCommand: () => `java -cp . Main`,
        compileCommand: (f) => `javac ${f}`,
        needsCleanup: true,
        wrapperTemplate: (code: string) => {
            if (!code.includes('class ')) {
                return `public class Main {\n    public static void main(String[] args) {\n${code}\n    }\n}`;
            }
            return code;
        },
    },
    c: {
        id: 'c',
        name: 'C',
        icon: '🔧',
        extension: '.c',
        runCommand: (f) => {
            const out = f.replace(/\.c$/, os.platform() === 'win32' ? '.exe' : '');
            return os.platform() === 'win32' ? `.\\${out}` : `./${out}`;
        },
        compileCommand: (f, out) => `gcc ${f} -o ${out}`,
        needsCleanup: true,
        wrapperTemplate: (code: string) => {
            if (!code.includes('int main') && !code.includes('void main')) {
                return `#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main() {\n${code}\n    return 0;\n}`;
            }
            return code;
        },
    },
    cpp: {
        id: 'cpp',
        name: 'C++',
        icon: '⚙️',
        extension: '.cpp',
        runCommand: (f) => {
            const out = f.replace(/\.cpp$/, os.platform() === 'win32' ? '.exe' : '');
            return os.platform() === 'win32' ? `.\\${out}` : `./${out}`;
        },
        compileCommand: (f, out) => `g++ ${f} -o ${out} -std=c++17`,
        needsCleanup: true,
        wrapperTemplate: (code: string) => {
            if (!code.includes('int main') && !code.includes('void main')) {
                return `#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n${code}\n    return 0;\n}`;
            }
            return code;
        },
    },
    ruby: {
        id: 'ruby',
        name: 'Ruby',
        icon: '💎',
        extension: '.rb',
        runCommand: (f) => `ruby ${f}`,
    },
    php: {
        id: 'php',
        name: 'PHP',
        icon: '🐘',
        extension: '.php',
        runCommand: (f) => `php ${f}`,
        wrapperTemplate: (code: string) => {
            if (!code.startsWith('<?php') && !code.startsWith('<?')) {
                return `<?php\n${code}`;
            }
            return code;
        },
    },
    perl: {
        id: 'perl',
        name: 'Perl',
        icon: '🐪',
        extension: '.pl',
        runCommand: (f) => `perl ${f}`,
    },
    r: {
        id: 'r',
        name: 'R',
        icon: '📊',
        extension: '.r',
        runCommand: (f) => `Rscript ${f}`,
    },
    lua: {
        id: 'lua',
        name: 'Lua',
        icon: '🌙',
        extension: '.lua',
        runCommand: (f) => `lua ${f}`,
    },
    swift: {
        id: 'swift',
        name: 'Swift',
        icon: '🐦',
        extension: '.swift',
        runCommand: (f) => `swift ${f}`,
    },
    kotlin: {
        id: 'kotlin',
        name: 'Kotlin',
        icon: '🟣',
        extension: '.kt',
        runCommand: (f) => {
            const jar = f.replace(/\.kt$/, '.jar');
            return `java -jar ${jar}`;
        },
        compileCommand: (f, out) => `kotlinc ${f} -include-runtime -d ${out}.jar`,
        needsCleanup: true,
    },
    dart: {
        id: 'dart',
        name: 'Dart',
        icon: '🎯',
        extension: '.dart',
        runCommand: (f) => `dart run ${f}`,
    },
};

/**
 * Generic process executor for programming languages.
 * Writes code to a temp file, runs it with the appropriate runtime,
 * captures stdout/stderr, and supports interactive stdin (like Jupyter).
 */
export class ProcessExecutor {
    private tempDir: string;

    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'anyinb');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Execute code in the given language.
     * @param inputProvider Optional async callback that prompts the user for stdin input
     *                      (like Jupyter's input() popup). Called each time the process needs input.
     */
    async execute(
        code: string,
        languageId: string,
        timeout: number = 30000,
        inputProvider?: (prompt?: string) => Promise<string | undefined>
    ): Promise<ProcessResult> {
        const config = LANGUAGE_CONFIGS[languageId];
        if (!config) {
            return {
                stdout: '',
                stderr: '',
                exitCode: 1,
                error: `Unsupported language: "${languageId}". No runtime configuration found.`
            };
        }

        // Apply wrapper template if needed (e.g., wrap Go code in main())
        const finalCode = config.wrapperTemplate ? config.wrapperTemplate(code) : code;

        // For Java, the filename must be "Main.java"
        const fileName = languageId === 'java' ? 'Main' : `anyinb_${Date.now()}`;
        const filePath = path.join(this.tempDir, `${fileName}${config.extension}`);
        const outPath = filePath.replace(config.extension, os.platform() === 'win32' ? '.exe' : '');

        const cleanupFiles: string[] = [filePath];

        try {
            // Write code to temp file
            fs.writeFileSync(filePath, finalCode, 'utf8');

            const relFilePath = path.basename(filePath);
            const relOutPath = path.basename(outPath);

            // Compile step (if needed)
            if (config.compileCommand) {
                const compileCmd = config.compileCommand(relFilePath, relOutPath);
                const compileResult = await this._runProcess(compileCmd, timeout);

                if (compileResult.exitCode !== 0) {
                    return {
                        stdout: '',
                        stderr: compileResult.stderr || compileResult.stdout,
                        exitCode: compileResult.exitCode,
                        error: `Compilation failed:\n${compileResult.stderr || compileResult.stdout}`
                    };
                }

                if (config.needsCleanup) {
                    if (languageId === 'java') {
                        cleanupFiles.push(path.join(this.tempDir, 'Main.class'));
                    } else if (languageId === 'kotlin') {
                        cleanupFiles.push(outPath + '.jar');
                    } else {
                        cleanupFiles.push(outPath);
                    }
                }
            }

            // Run with interactive input support
            const runCmd = config.runCommand(relFilePath);
            const result = await this._runProcess(runCmd, timeout, inputProvider);

            return result;
        } catch (err: any) {
            return {
                stdout: '',
                stderr: '',
                exitCode: 1,
                error: err.message || String(err)
            };
        } finally {
            for (const f of cleanupFiles) {
                try { if (fs.existsSync(f)) { fs.unlinkSync(f); } } catch { /* ignore */ }
            }
        }
    }

    /**
     * Run a command and capture output.
     * Supports interactive stdin: when the process is waiting for input,
     * calls the inputProvider callback (which shows a VS Code input box, like Jupyter).
     */
    private _runProcess(
        command: string,
        timeout: number,
        inputProvider?: (prompt?: string) => Promise<string | undefined>
    ): Promise<ProcessResult> {
        return new Promise((resolve) => {
            const isWindows = os.platform() === 'win32';
            const shell = isWindows ? 'cmd.exe' : '/bin/sh';
            const shellArg = isWindows ? '/c' : '-c';

            const proc = cp.spawn(shell, [shellArg, command], {
                cwd: this.tempDir,
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                    PYTHONUNBUFFERED: '1',
                    JAVA_TOOL_OPTIONS: '-Dfile.encoding=UTF-8',
                    LANG: 'en_US.UTF-8',
                    LC_ALL: 'en_US.UTF-8',
                },
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';
            let killed = false;
            let exited = false;
            let lastOutputTime = Date.now();

            proc.stdout.on('data', (data) => {
                stdout += data.toString('utf8');
                lastOutputTime = Date.now();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString('utf8');
                lastOutputTime = Date.now();
            });

            // Timeout handler
            const timer = setTimeout(() => {
                killed = true;
                proc.kill('SIGKILL');
            }, timeout);

            proc.on('error', (err) => {
                exited = true;
                clearTimeout(timer);
                resolve({ stdout, stderr, exitCode: 1, error: err.message });
            });

            proc.on('close', (exitCode) => {
                exited = true;
                clearTimeout(timer);
                if (killed) {
                    resolve({
                        stdout,
                        stderr: stderr + '\n⏱ Process timed out after ' + (timeout / 1000) + 's',
                        exitCode: 1,
                    });
                    return;
                }
                resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
            });

            // Interactive input loop — mimics Jupyter's input() behavior
            if (inputProvider) {
                const inputLoop = async () => {
                    while (!exited && !killed) {
                        // Wait for process to produce output or become idle
                        await new Promise(r => setTimeout(r, 300));
                        if (exited || killed) { break; }

                        // If idle for 200ms+, process is probably waiting for input
                        const idleTime = Date.now() - lastOutputTime;
                        if (idleTime >= 200) {
                            // Use the last line of stdout as the prompt text
                            const lines = stdout.split('\n');
                            const lastLine = lines[lines.length - 1] || '';
                            const promptText = lastLine.trim() || undefined;

                            const userInput = await inputProvider(promptText);

                            if (exited || killed) { break; }

                            if (userInput === undefined) {
                                // User pressed Escape — kill the process
                                proc.kill('SIGKILL');
                                break;
                            }

                            try {
                                proc.stdin.write(userInput + '\n');
                                lastOutputTime = Date.now();
                            } catch {
                                break;
                            }
                        }
                    }
                };
                inputLoop();
            } else {
                // No input provider — close stdin so process gets EOF
                proc.stdin.end();
            }
        });
    }
}
