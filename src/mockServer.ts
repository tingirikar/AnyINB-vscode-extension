/**
 * MockServer — Lightweight embedded HTTP mock server for notebook cells.
 * Turns notebook cells into live REST endpoints (e.g. `@endpoint GET /api/users`).
 */

import * as http from 'http';

export interface MockEndpoint {
    method: string;
    path: string;
    responseBody: string;
    statusCode: number;
    contentType: string;
}

export class MockServer {
    private static instance: MockServer;
    private server: http.Server | null = null;
    private port = 3456;
    private endpoints = new Map<string, MockEndpoint>();
    private isRunning = false;

    private constructor() {}

    static getInstance(): MockServer {
        return (MockServer.instance ??= new MockServer());
    }

    getPort(): number {
        return this.port;
    }

    parseEndpointHeader(code: string): { method: string; path: string; body: string } | null {
        const firstLineMatch = code.match(/^[#//*\s]*@endpoint\s+(GET|POST|PUT|DELETE|PATCH)\s+([^\s\n]+)/i);
        if (!firstLineMatch) return null;

        const method = firstLineMatch[1].toUpperCase();
        const endpointPath = firstLineMatch[2].startsWith('/') ? firstLineMatch[2] : '/' + firstLineMatch[2];
        const body = code.replace(/^[#//*\s]*@endpoint[^\n]*\n?/, '').trim();

        return { method, path: endpointPath, body };
    }

    async registerEndpoint(method: string, path: string, body: string, statusCode = 200, contentType = 'application/json'): Promise<string> {
        const key = `${method}:${path.split('?')[0]}`;
        this.endpoints.set(key, {
            method,
            path,
            responseBody: body,
            statusCode,
            contentType
        });

        await this.ensureServerRunning();
        return `http://localhost:${this.port}${path}`;
    }

    private ensureServerRunning(): Promise<void> {
        if (this.isRunning && this.server) return Promise.resolve();

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                const reqMethod = (req.method || 'GET').toUpperCase();
                const reqUrl = (req.url || '/').split('?')[0];
                const key = `${reqMethod}:${reqUrl}`;

                const endpoint = this.endpoints.get(key);
                if (endpoint) {
                    res.writeHead(endpoint.statusCode, {
                        'Content-Type': endpoint.contentType,
                        'Access-Control-Allow-Origin': '*',
                        'X-Powered-By': 'AnyINB-MockServer'
                    });
                    res.end(endpoint.responseBody);
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Endpoint not found on AnyINB Mock Server',
                        registeredEndpoints: Array.from(this.endpoints.keys()).map(k => {
                            const [m, p] = k.split(':');
                            return `${m} http://localhost:${this.port}${p}`;
                        })
                    }, null, 2));
                }
            });

            this.server.listen(this.port, () => {
                this.isRunning = true;
                resolve();
            });

            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    this.port++;
                    this.server?.listen(this.port);
                } else {
                    reject(err);
                }
            });
        });
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.isRunning = false;
        }
    }
}
