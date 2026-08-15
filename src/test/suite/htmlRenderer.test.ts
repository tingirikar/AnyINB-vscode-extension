import * as assert from 'assert';
import { renderError, renderJson, renderTable } from '../../renderers/htmlRenderer';

suite('htmlRenderer Test Suite', () => {
    test('renderError should escape HTML to prevent XSS', () => {
        const errorMsg = '<script>alert(1)</script>';
        const html = renderError(errorMsg, 'Test');
        
        // Should contain the escaped version
        assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
        // Should NOT contain the unescaped script tag
        assert.ok(!html.includes('<script>alert(1)</script>'));
    });

    test('renderTable should generate table headers based on fields', () => {
        const data = [{ id: 1, name: 'Alice' }];
        const html = renderTable(data, ['id', 'name'], 5, 'SQLite');
        
        assert.ok(html.includes('<th>id</th>'));
        assert.ok(html.includes('<th>name</th>'));
        assert.ok(html.includes('Alice'));
    });

    test('renderJson for MongoDB should include ObjectId formatting', () => {
        const data = [{ _id: '6a58751ce3aa932566ef6498', name: 'Bob' }];
        const html = renderJson(data, 10, 'MongoDB');
        
        assert.ok(html.includes("ObjectId('"));
        assert.ok(html.includes('6a58751ce3aa932566ef6498'));
    });
});
