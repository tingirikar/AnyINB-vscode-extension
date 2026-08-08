import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as os from 'os';

export interface ReplResult {
    stdout: string;
    stderr: string;
    error?: string;
}

/**
 * Executes code in a persistent REPL process, maintaining state between cells.
 * Supports Python, Node, and Bash.
 * Also supports Docker wrapping via the anyinb.useDocker setting.
 */
export class ReplExecutor {
    private processes: Map<string, cp.ChildProcess> = new Map();
    private buffers: Map<string, { out: string, err: string }> = new Map();

    private readonly END_MARKER = '___ANYINB_EXEC_END___';

    async execute(
        code: string,
        language: string,
        timeoutMs: number,
        token?: vscode.CancellationToken
    ): Promise<ReplResult> {
        const useDocker = vscode.workspace.getConfiguration('anyinb').get<boolean>('useDocker', false);
        const processKey = `${language}-${useDocker ? 'docker' : 'local'}`;

        if (!this.processes.has(processKey)) {
            const success = await this._startRepl(processKey, language, useDocker);
            if (!success) {
                return { stdout: '', stderr: '', error: `Failed to start REPL for ${language}. Is the runtime installed?` };
            }
        }

        const proc = this.processes.get(processKey)!;
        this.buffers.set(processKey, { out: '', err: '' });

        return new Promise((resolve) => {
            let isDone = false;
            let timeout: NodeJS.Timeout;

            const cancelListener = token?.onCancellationRequested(() => {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timeout);
                    this._killRepl(processKey);
                    resolve({ 
                        stdout: this.buffers.get(processKey)!.out, 
                        stderr: this.buffers.get(processKey)!.err + '\n\n[Execution Cancelled]', 
                    });
                }
            });

            timeout = setTimeout(() => {
                if (!isDone) {
                    isDone = true;
                    cancelListener?.dispose();
                    this._killRepl(processKey);
                    resolve({ 
                        stdout: this.buffers.get(processKey)!.out, 
                        stderr: this.buffers.get(processKey)!.err + `\n\n[Execution Timed Out after ${timeoutMs}ms]`, 
                    });
                }
            }, timeoutMs);

            const checkOutput = () => {
                if (isDone) return;
                const buf = this.buffers.get(processKey)!;
                if (buf.out.includes(this.END_MARKER)) {
                    isDone = true;
                    clearTimeout(timeout);
                    cancelListener?.dispose();
                    resolve({
                        stdout: buf.out.replace(this.END_MARKER + '\n', '').replace(this.END_MARKER, ''),
                        stderr: buf.err
                    });
                }
            };

            // Setup listeners specifically for this execution block
            const onStdout = (data: Buffer) => {
                if (isDone) return;
                this.buffers.get(processKey)!.out += data.toString('utf8');
                checkOutput();
            };
            const onStderr = (data: Buffer) => {
                if (isDone) return;
                this.buffers.get(processKey)!.err += data.toString('utf8');
            };

            proc.stdout?.on('data', onStdout);
            proc.stderr?.on('data', onStderr);

            proc.once('close', () => {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timeout);
                    cancelListener?.dispose();
                    this.processes.delete(processKey);
                    resolve({
                        stdout: this.buffers.get(processKey)!.out,
                        stderr: this.buffers.get(processKey)!.err + '\n[Process Exited Unexpectedly]'
                    });
                }
            });

            // Send code
            try {
                let wrappedCode = '';
                if (language === 'python') {
                    // In Python REPL wrapper, we read until END_MARKER, so we just send the code 
                    // and then a special delimiter. Wait, it's easier if we just write the python code 
                    // and then tell it to execute.
                    wrappedCode = code + `\nprint('${this.END_MARKER}')\n`;
                } else if (language === 'javascript') {
                    wrappedCode = code + `\nconsole.log('${this.END_MARKER}');\n`;
                } else {
                    wrappedCode = code + `\necho '${this.END_MARKER}'\n`;
                }
                
                proc.stdin?.write(wrappedCode);
            } catch (err) {
                isDone = true;
                clearTimeout(timeout);
                cancelListener?.dispose();
                resolve({ stdout: '', stderr: '', error: 'Failed to write to REPL' });
            }
        });
    }

    private async _startRepl(processKey: string, language: string, useDocker: boolean): Promise<boolean> {
        let cmd = '';
        let args: string[] = [];

        if (language === 'python') {
            cmd = useDocker ? 'docker' : 'python';
            args = useDocker ? ['run', '-i', '--rm', 'python:3.9-slim', 'python', '-i', '-q'] : ['-i', '-q', '-u'];
        } else if (language === 'javascript') {
            cmd = useDocker ? 'docker' : 'node';
            args = useDocker ? ['run', '-i', '--rm', 'node:18-alpine', 'node', '-i'] : ['-i'];
        } else if (language === 'shellscript' || language === 'bash') {
            cmd = useDocker ? 'docker' : 'bash';
            args = useDocker ? ['run', '-i', '--rm', 'ubuntu:latest', 'bash'] : [];
        } else {
            return false;
        }

        try {
            const proc = cp.spawn(cmd, args, {
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Wait a tiny bit to ensure it didn't immediately crash
            await new Promise(r => setTimeout(r, 500));
            if (proc.killed || proc.exitCode !== null) {
                return false;
            }

            this.processes.set(processKey, proc);
            return true;
        } catch {
            return false;
        }
    }

    private _killRepl(processKey: string) {
        const proc = this.processes.get(processKey);
        if (proc) {
            proc.kill('SIGKILL');
            this.processes.delete(processKey);
        }
    }
    
    killAll() {
        for (const [key, proc] of this.processes.entries()) {
            proc.kill('SIGKILL');
        }
        this.processes.clear();
    }
}
