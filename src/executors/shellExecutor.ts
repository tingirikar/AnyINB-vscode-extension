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
        shellType: 'shellscript' | 'powershell' | 'bat',
        timeout: number = 30000
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
                shell = 'cmd.exe';
                shellArgs = ['/c', code];
                break;
            case 'shellscript':
            default:
                if (isWindows) {
                    // Use Git Bash or WSL bash on Windows if available, fallback to powershell
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
                timeout,
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('error', (err) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: 1,
                    error: `Failed to start shell: ${err.message}. Is "${shell}" installed and in your PATH?`
                });
            });

            proc.on('close', (exitCode) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: exitCode ?? 0,
                });
            });
        });
    }
}
