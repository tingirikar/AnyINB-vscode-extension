import WebSocket = require('ws');
import * as vscode from 'vscode';

export interface WsResult {
    messages: string[];
    error?: string;
    elapsed: number;
}

/**
 * WebSocket executor.
 * Connects to a WS endpoint, sends an optional payload, and waits for responses.
 * 
 * Format:
 * ws://echo.websocket.org
 * 
 * { "message": "hello world" }
 */
export class WebsocketExecutor {
    async execute(
        code: string,
        timeoutMs: number,
        token?: vscode.CancellationToken
    ): Promise<WsResult> {
        const startTime = Date.now();
        const lines = code.trim().split('\n');
        
        let url = lines[0].trim();
        let payload = lines.slice(1).join('\n').trim();

        // Replace {{ENV_VAR}} with process.env.ENV_VAR
        url = url.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => process.env[p1] || match);
        payload = payload.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => process.env[p1] || match);

        return new Promise((resolve) => {
            const messages: string[] = [];
            let isDone = false;
            let ws: WebSocket;
            
            try {
                ws = new WebSocket(url);
            } catch (err: any) {
                resolve({ messages: [], error: `Invalid URL: ${err.message}`, elapsed: 0 });
                return;
            }

            const cancelListener = token?.onCancellationRequested(() => {
                if (!isDone) {
                    isDone = true;
                    ws.terminate();
                    resolve({ messages, error: 'Connection cancelled.', elapsed: Date.now() - startTime });
                }
            });

            // Automatically close after timeout to prevent hanging forever
            const timeoutTimer = setTimeout(() => {
                if (!isDone) {
                    isDone = true;
                    ws.terminate();
                    cancelListener?.dispose();
                    messages.push('[System: Connection timed out]');
                    resolve({ messages, elapsed: Date.now() - startTime });
                }
            }, timeoutMs);

            ws.on('open', () => {
                if (payload) {
                    ws.send(payload);
                }
            });

            ws.on('message', (data) => {
                messages.push(data.toString());
                
                // For notebooks, we don't want to stream forever. If we get a response, 
                // we'll wait a brief moment for any follow-up messages then close.
                // Or we can rely on the timeout/interrupt button.
            });

            ws.on('error', (err) => {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timeoutTimer);
                    cancelListener?.dispose();
                    resolve({ messages, error: err.message, elapsed: Date.now() - startTime });
                }
            });

            ws.on('close', () => {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timeoutTimer);
                    cancelListener?.dispose();
                    resolve({ messages, elapsed: Date.now() - startTime });
                }
            });
        });
    }
}
