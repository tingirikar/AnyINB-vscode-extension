import { HttpExecutor, HttpResult } from './httpExecutor';

/**
 * GraphQL executor using the existing HttpExecutor backend.
 * Parses a special GraphQL block format:
 * 
 * POST https://api.github.com/graphql
 * Authorization: Bearer token123
 * 
 * query {
 *   viewer {
 *     login
 *   }
 * }
 */
export class GraphqlExecutor {
    private httpExecutor: HttpExecutor;

    constructor() {
        this.httpExecutor = new HttpExecutor();
    }

    async execute(code: string): Promise<HttpResult> {
        // We will transform the user's GraphQL query into a standard HTTP JSON request
        const lines = code.trim().split('\n');
        
        let headerEndIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '') {
                headerEndIndex = i;
                break;
            }
        }

        if (headerEndIndex === -1) {
            // No empty line found, maybe just a URL and the query?
            return {
                status: 0,
                statusText: 'Error',
                headers: {},
                body: '',
                elapsed: 0,
                error: 'Invalid GraphQL block format. Expected an empty line separating headers and the query.'
            };
        }

        // Reconstruct as HTTP request
        const headers = lines.slice(0, headerEndIndex);
        
        // Ensure Content-Type is application/json
        const hasContentType = headers.some(h => h.toLowerCase().startsWith('content-type:'));
        if (!hasContentType) {
            headers.push('Content-Type: application/json');
        }

        const graphqlQuery = lines.slice(headerEndIndex + 1).join('\n').trim();
        const jsonBody = JSON.stringify({ query: graphqlQuery });

        const httpCode = headers.join('\n') + '\n\n' + jsonBody;

        return this.httpExecutor.execute(httpCode);
    }
}
