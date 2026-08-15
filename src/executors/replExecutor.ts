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

            const cleanup = () => {
                // Remove per-execution listeners to prevent accumulation
                proc.stdout?.removeListener('data', onStdout);
                proc.stderr?.removeListener('data', onStderr);
            };

            const finish = (result: ReplResult) => {
                if (isDone) { return; }
                isDone = true;
                clearTimeout(timeout);
                cancelListener?.dispose();
                cleanup();
                resolve(result);
            };

            const cancelListener = token?.onCancellationRequested(() => {
                this._killRepl(processKey);
                finish({ 
                    stdout: this.buffers.get(processKey)!.out, 
                    stderr: this.buffers.get(processKey)!.err + '\n\n[Execution Cancelled]', 
                });
            });

            timeout = setTimeout(() => {
                this._killRepl(processKey);
                finish({ 
                    stdout: this.buffers.get(processKey)!.out, 
                    stderr: this.buffers.get(processKey)!.err + `\n\n[Execution Timed Out after ${timeoutMs}ms]`, 
                });
            }, timeoutMs);

            const checkOutput = () => {
                if (isDone) { return; }
                const buf = this.buffers.get(processKey)!;
                if (buf.out.includes(this.END_MARKER)) {
                    let stdout = buf.out
                        .replace(this.END_MARKER + '\n', '')
                        .replace(this.END_MARKER, '');

                    // Strip Node REPL prompt artifacts (> , ... , undefined lines)
                    if (language === 'javascript') {
                        stdout = this._cleanNodeReplOutput(stdout);
                    }

                    let stderr = buf.err;

                    // Clean Python REPL prompts
                    if (language === 'python') {
                        stdout = this._cleanPythonOutput(stdout);
                        stderr = this._cleanPythonStderr(stderr);
                    }

                    // Also strip END_MARKER from stderr if it leaked there
                    stderr = stderr
                        .replace(this.END_MARKER + '\n', '')
                        .replace(this.END_MARKER, '');

                    finish({ stdout, stderr });
                }
            };

            // Setup listeners specifically for this execution block
            const onStdout = (data: Buffer) => {
                if (isDone) { return; }
                this.buffers.get(processKey)!.out += data.toString('utf8');
                checkOutput();
            };
            const onStderr = (data: Buffer) => {
                if (isDone) { return; }
                this.buffers.get(processKey)!.err += data.toString('utf8');
            };

            proc.stdout?.on('data', onStdout);
            proc.stderr?.on('data', onStderr);

            proc.once('close', () => {
                this.processes.delete(processKey);
                finish({
                    stdout: this.buffers.get(processKey)?.out || '',
                    stderr: (this.buffers.get(processKey)?.err || '') + '\n[Process Exited Unexpectedly]'
                });
            });

            // Send code
            try {
                let wrappedCode = '';
                if (language === 'python') {
                    const autoPlot = vscode.workspace.getConfiguration('anyinb').get<boolean>('pythonAutoPlot', true);
                    const plotPrelude = `
try:
    import os as _anyinb_os
    _anyinb_os.environ['MPLBACKEND'] = 'Agg'
    import sys as _anyinb_sys
    if 'matplotlib' in _anyinb_sys.modules:
        import matplotlib as _anyinb_mpl
        _anyinb_mpl.use('Agg', force=True)
    if 'matplotlib.pyplot' in _anyinb_sys.modules:
        import matplotlib.pyplot as _anyinb_plt
        _anyinb_plt.show = lambda *a, **k: None
except Exception:
    pass
`;
                    const plotCapture = autoPlot ? `
try:
    import sys as _anyinb_sys
    if 'matplotlib.pyplot' in _anyinb_sys.modules or 'matplotlib' in _anyinb_sys.modules:
        import matplotlib.pyplot as _anyinb_plt
        import io as _anyinb_io, base64 as _anyinb_b64
        _anyinb_figs = _anyinb_plt.get_fignums()
        if _anyinb_figs:
            for _anyinb_f in _anyinb_figs:
                _anyinb_buf = _anyinb_io.BytesIO()
                _anyinb_fig = _anyinb_plt.figure(_anyinb_f)
                _anyinb_fig.savefig(_anyinb_buf, format='png', bbox_inches='tight', dpi=140)
                _anyinb_buf.seek(0)
                _anyinb_b64 = _anyinb_b64.b64encode(_anyinb_buf.read()).decode('utf-8')
                print(f"___ANYINB_IMAGE_START___{_anyinb_b64}___ANYINB_IMAGE_END___")
            _anyinb_plt.close('all')
except Exception:
    pass
` : '';
                    wrappedCode = plotPrelude + '\n' + code + '\n' + plotCapture + `\nprint('${this.END_MARKER}')\n`;
                } else if (language === 'javascript') {
                    // Convert top-level const/let to var so declarations can be
                    // re-run without "already declared" errors, while still keeping
                    // variables in the global REPL scope (accessible across cells).
                    // This is the same approach Chrome DevTools uses.
                    const safeCode = this._convertConstLetToVar(code);
                    wrappedCode = safeCode + `\nconsole.log('${this.END_MARKER}');\n`;
                } else {
                    wrappedCode = code + `\necho '${this.END_MARKER}'\n`;
                }
                
                proc.stdin?.write(wrappedCode);
            } catch (err) {
                finish({ stdout: '', stderr: '', error: 'Failed to write to REPL' });
            }
        });
    }

    /**
     * Clean up Node.js REPL prompt artifacts from stdout.
     * The interactive REPL prefixes lines with "> ", "... ", and prints
     * "undefined" for expression-statements.  Strip all of that.
     */
    private _cleanNodeReplOutput(raw: string): string {
        const lines = raw.split('\n');
        const cleaned: string[] = [];
        for (const line of lines) {
            // Skip bare REPL prompt lines
            if (/^>\s*$/.test(line) || /^\.\.\.\s*$/.test(line)) {
                continue;
            }
            // Skip standalone "undefined" that the REPL prints for void expressions
            if (line.trim() === 'undefined') {
                continue;
            }
            // Strip leading "> " or "... " prompt prefixes
            let stripped = line;
            stripped = stripped.replace(/^>\s?/, '');
            stripped = stripped.replace(/^\.\.\.\s?/, '');
            cleaned.push(stripped);
        }
        // Trim trailing empty lines
        while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') {
            cleaned.pop();
        }
        return cleaned.join('\n');
    }

    private _cleanPythonOutput(raw: string): string {
        const lines = raw.split('\n');
        const cleaned: string[] = [];
        for (const line of lines) {
            if (/^(>>>|\.\.\.)\s*$/.test(line.trim())) continue;
            cleaned.push(line.replace(/^(>>>|\.\.\.)\s*/, ''));
        }
        while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') {
            cleaned.pop();
        }
        return cleaned.join('\n');
    }

    private _cleanPythonStderr(raw: string): string {
        const lines = raw.split('\n');
        const cleaned: string[] = [];
        for (const line of lines) {
            const stripped = line.replace(/^(>>>|\.\.\.)\s*/g, '').replace(/\b(>>>|\.\.\.)\b/g, '').trim();
            if (stripped.length > 0 && !/^[\s>\.]{2,}$/.test(stripped)) {
                cleaned.push(line.replace(/^(>>>|\.\.\.)\s*/, ''));
            }
        }
        return cleaned.join('\n').trim();
    }

    /**
     * Convert top-level `const` and `let` declarations to `var`.
     * Only transforms declarations at brace-depth 0 (top-level),
     * preserving const/let inside functions, classes, loops, etc.
     * This lets the Node REPL re-declare variables without errors,
     * mirroring what Chrome DevTools does.
     */
    private _convertConstLetToVar(code: string): string {
        const lines = code.split('\n');
        let braceDepth = 0;
        const result: string[] = [];

        for (const line of lines) {
            let transformed = line;

            if (braceDepth === 0) {
                // Only transform at top level — replace leading const/let with var
                transformed = transformed.replace(/^(\s*)(const|let)\s/, '$1var ');
            }

            // Track brace depth (simple heuristic — good enough for REPL code)
            for (const ch of line) {
                if (ch === '{') { braceDepth++; }
                else if (ch === '}') { braceDepth = Math.max(0, braceDepth - 1); }
            }

            result.push(transformed);
        }

        return result.join('\n');
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

            if (language === 'python') {
                proc.stdin?.write("import sys, os; sys.ps1 = ''; sys.ps2 = ''; os.environ['MPLBACKEND'] = 'Agg'\n");
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

