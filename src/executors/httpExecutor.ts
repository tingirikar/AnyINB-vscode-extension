import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface HttpResult {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    elapsed: number;
    error?: string;
}

/**
 * HTTP executor for REST API testing.
 *
 * Parses HTTP request syntax (similar to REST Client extension):
 *
 *   GET https://api.github.com/users/octocat
 *   Content-Type: application/json
 *   Authorization: Bearer token123
 *
 *   { "key": "value" }
 */
export class HttpExecutor {

    async execute(code: string): Promise<HttpResult> {
        try {
            const parsed = this._parseRequest(code);
            const startTime = Date.now();

            const result = await this._sendRequest(parsed);
            result.elapsed = Date.now() - startTime;

            return result;
        } catch (err: any) {
            return {
                status: 0,
                statusText: 'Error',
                headers: {},
                body: '',
                elapsed: 0,
                error: err.message || String(err)
            };
        }
    }

    private _parseRequest(code: string): {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: string;
    } {
        const lines = code.trim().split('\n');

        // First line: METHOD URL
        const firstLine = lines[0].trim();
        const methodMatch = firstLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);

        let method: string;
        let url: string;

        if (methodMatch) {
            method = methodMatch[1].toUpperCase();
            url = methodMatch[2].trim();
        } else {
            // If no method specified, assume GET
            method = 'GET';
            url = firstLine;
        }

        // Ensure URL has protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Parse headers (lines after first, before empty line)
        const headers: Record<string, string> = {};
        let bodyStartIndex = lines.length;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line === '') {
                bodyStartIndex = i + 1;
                break;
            }

            const headerMatch = line.match(/^([\w-]+):\s*(.+)$/);
            if (headerMatch) {
                headers[headerMatch[1]] = headerMatch[2];
            }
        }

        // Parse body (everything after the empty line)
        const bodyLines = lines.slice(bodyStartIndex);
        const body = bodyLines.join('\n').trim() || undefined;

        return { method, url, headers, body };
    }

    private _sendRequest(req: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: string;
    }): Promise<HttpResult> {
        return new Promise((resolve) => {
            const parsedUrl = new URL(req.url);
            const isHttps = parsedUrl.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: req.method,
                headers: req.headers,
                timeout: 30000,
            };

            const request = lib.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    const responseHeaders: Record<string, string> = {};
                    for (const [key, value] of Object.entries(res.headers)) {
                        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value || '';
                    }

                    resolve({
                        status: res.statusCode || 0,
                        statusText: res.statusMessage || '',
                        headers: responseHeaders,
                        body: data,
                        elapsed: 0,
                    });
                });
            });

            request.on('error', (err) => {
                resolve({
                    status: 0,
                    statusText: 'Error',
                    headers: {},
                    body: '',
                    elapsed: 0,
                    error: err.message,
                });
            });

            request.on('timeout', () => {
                request.destroy();
                resolve({
                    status: 0,
                    statusText: 'Timeout',
                    headers: {},
                    body: '',
                    elapsed: 0,
                    error: 'Request timed out after 30 seconds',
                });
            });

            if (req.body) {
                request.write(req.body);
            }

            request.end();
        });
    }
}
