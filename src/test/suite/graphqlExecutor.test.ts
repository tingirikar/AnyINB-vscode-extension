import * as assert from 'assert';
import { GraphqlExecutor } from '../../executors/graphqlExecutor';
import { HttpResult } from '../../executors/httpExecutor';

// Create a subclass or mock to intercept the HTTP call
class TestGraphqlExecutor extends GraphqlExecutor {
    public lastHttpCode: string = '';

    constructor() {
        super();
        // Mock the internal httpExecutor
        (this as any).httpExecutor = {
            execute: async (code: string): Promise<HttpResult> => {
                this.lastHttpCode = code;
                return {
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    body: 'mock',
                    elapsed: 10
                };
            }
        };
    }
}

suite('graphqlExecutor Test Suite', () => {
    test('Should properly format GraphQL query into HTTP JSON request', async () => {
        const executor = new TestGraphqlExecutor();
        
        const rawCode = `POST https://api.github.com/graphql
Authorization: Bearer token123

query {
  viewer {
    login
  }
}`;

        await executor.execute(rawCode);
        
        const expectedBody = JSON.stringify({
            query: `query {\n  viewer {\n    login\n  }\n}`
        });

        // Verify headers include Content-Type
        assert.ok(executor.lastHttpCode.includes('Content-Type: application/json'));
        // Verify authorization header is preserved
        assert.ok(executor.lastHttpCode.includes('Authorization: Bearer token123'));
        // Verify body is properly stringified JSON
        assert.ok(executor.lastHttpCode.endsWith(expectedBody));
    });

    test('Should return error on missing empty line separator', async () => {
        const executor = new TestGraphqlExecutor();
        
        const rawCode = `POST https://api.github.com/graphql
query { viewer { login } }`;

        const result = await executor.execute(rawCode);
        
        assert.strictEqual(result.status, 0);
        assert.ok(result.error?.includes('Invalid GraphQL block format'));
    });
});
