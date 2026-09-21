import * as assert from 'assert';
import * as vscode from 'vscode';
import { normalizePythonMagicCommand } from '../../controller';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('xenon-dev.anyinb'));
    });

    test('Should activate', async () => {
        const ext = vscode.extensions.getExtension('xenon-dev.anyinb');
        if (ext) {
            await ext.activate();
            assert.strictEqual(ext.isActive, true);
        } else {
            assert.fail('Extension not found');
        }
    });

    test('Should register AnyINB notebook controller', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('anyinb.newNotebook'));
        assert.ok(commands.includes('anyinb.configureConnection'));
    });

    test('Python pip magic should use bash shell on non-Windows systems', () => {
        const result = normalizePythonMagicCommand('%pip install requests');

        assert.strictEqual(result.shellType, process.platform === 'win32' ? 'powershell' : 'bash');
        assert.ok(result.command.includes('install requests'));
    });
});
