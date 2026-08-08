import * as assert from 'assert';
import { renderError, renderConsoleOutput, renderTable } from '../../renderers/htmlRenderer';

suite('htmlRenderer Test Suite', () => {
    test('renderError should escape HTML to prevent XSS', () => {
        const errorMsg = '<script>alert(1)</script>';
        const html = renderError(errorMsg, 'Test');
        
        // Should contain the escaped version
        assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
        // Should NOT contain the unescaped script tag
        assert.ok(!html.includes('<script>alert(1)</script>'));
    });

    test('renderConsoleOutput should handle empty output gracefully', () => {
        const html = renderConsoleOutput('', '', 0, 10, 'Bash', '🐚');
        assert.ok(html.includes('(no output)'));
        assert.ok(html.includes('Bash'));
    });

    test('renderTable should generate table headers based on fields', () => {
        const data = [{ id: 1, name: 'Alice' }];
        const html = renderTable(data, ['id', 'name'], 5, 'SQLite');
        
        assert.ok(html.includes('<th>id</th>'));
        assert.ok(html.includes('<th>name</th>'));
        assert.ok(html.includes('<td><span class="qnb-number">1</span></td>'));
        assert.ok(html.includes('<td>Alice</td>'));
        assert.ok(html.includes('SQLite'));
    });
});
