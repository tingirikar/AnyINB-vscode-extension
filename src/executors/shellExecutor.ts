import * as cp from 'child_process';
import * as os from 'os';

export interface ShellResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
}

/**
 * Shell executor for Bash and PowerShell commands.
 * Runs commands directly without writing to temp files.
 */
export class ShellExecutor {

    /**
     * Execute a shell command using the appropriate shell.
     */
    async execute(
        code: string,
        shellType: 'shellscript' | 'powershell' | 'bat' | 'cmd' | 'wsl' | 'bash',
        timeout: number = 30000,
        _inputProvider?: (prompt?: string) => Promise<string | undefined>
    ): Promise<ShellResult> {
        const isWindows = os.platform() === 'win32';

        let shell: string;
        let shellArgs: string[];

        switch (shellType) {
            case 'powershell':
                shell = 'powershell.exe';
                shellArgs = ['-NoProfile', '-Command', code];
                break;
            case 'bat':
            case 'cmd':
                shell = 'cmd.exe';
                shellArgs = ['/c', code];
                break;
            case 'wsl':
                if (isWindows) {
                    shell = 'wsl.exe';
                    shellArgs = ['-e', 'bash', '-c', code];
                } else {
                    shell = '/bin/bash';
                    shellArgs = ['-c', code];
                }
                break;
            case 'bash':
            case 'shellscript':
            default:
                if (isWindows) {
                    // Try bash, if unavailable fallback to powershell
                    shell = 'bash';
                    shellArgs = ['-c', code];
                } else {
                    shell = '/bin/bash';
                    shellArgs = ['-c', code];
                }
                break;
        }

        return new Promise((resolve) => {
            const proc = cp.spawn(shell, shellArgs, {
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';
            let killed = false;

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timer = setTimeout(() => {
                killed = true;
                proc.kill('SIGKILL');
            }, timeout);

            proc.on('error', (err) => {
                clearTimeout(timer);
                resolve({
                    stdout,
                    stderr,
                    exitCode: 1,
                    error: `Failed to start shell: ${err.message}. Is "${shell}" installed and in your PATH?`
                });
            });

            proc.on('close', (exitCode) => {
                clearTimeout(timer);
                if (killed) {
                    resolve({
                        stdout,
                        stderr: stderr + '\n⏱ Process timed out after ' + (timeout / 1000) + 's',
                        exitCode: 1,
                    });
                    return;
                }
                resolve({
                    stdout,
                    stderr,
                    exitCode: exitCode ?? 0,
                });
            });

            proc.stdin?.end();
        });
    }
}
