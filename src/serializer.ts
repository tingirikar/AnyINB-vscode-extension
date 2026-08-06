import * as vscode from 'vscode';

/**
 * Raw cell format stored in .anyinb files.
 */
interface RawNotebookCell {
    kind: 'code' | 'markdown';
    language: string;
    value: string;
    outputs?: RawCellOutput[];
}

interface RawCellOutput {
    mime: string;
    data: string;
}

/**
 * Serializer for .anyinb (Any Interactive Notebook) files.
 * 
 * File format is JSON:
 * {
 *   "cells": [
 *     { "kind": "code", "language": "python", "value": "print('hello')" },
 *     { "kind": "markdown", "language": "markdown", "value": "# Notes" },
 *     { "kind": "code", "language": "sql", "value": "SELECT * FROM users;" }
 *   ]
 * }
 */
export class QueryNotebookSerializer implements vscode.NotebookSerializer {

    async deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): Promise<vscode.NotebookData> {
        const text = new TextDecoder().decode(content);

        let rawCells: RawNotebookCell[] = [];

        if (text.trim().length > 0) {
            try {
                const parsed = JSON.parse(text);
                rawCells = parsed.cells || [];
            } catch {
                // If the file can't be parsed, start with an empty notebook
                rawCells = [];
            }
        }

        // If the file is empty or has no cells, create a default starter notebook
        if (rawCells.length === 0) {
            rawCells = [
                {
                    kind: 'markdown',
                    language: 'markdown',
                    value: '# 🚀 AnyINB Notebook\n\nPractice **any language** below. Change the cell language and click ▶️ to run.'
                },
                {
                    kind: 'code',
                    language: 'python',
                    value: 'print("Hello from AnyINB! 🚀")'
                }
            ];
        }

        const cells = rawCells.map(raw => {
            const cellKind = raw.kind === 'code'
                ? vscode.NotebookCellKind.Code
                : vscode.NotebookCellKind.Markup;

            const cellData = new vscode.NotebookCellData(
                cellKind,
                raw.value,
                raw.language || (raw.kind === 'code' ? 'sql' : 'markdown')
            );

            // Restore outputs if present
            if (raw.outputs && raw.outputs.length > 0) {
                cellData.outputs = [
                    new vscode.NotebookCellOutput(
                        raw.outputs.map(out =>
                            new vscode.NotebookCellOutputItem(
                                new TextEncoder().encode(out.data),
                                out.mime
                            )
                        )
                    )
                ];
            }

            return cellData;
        });

        return new vscode.NotebookData(cells);
    }

    async serializeNotebook(
        data: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Promise<Uint8Array> {
        const rawCells: RawNotebookCell[] = data.cells.map(cell => {
            const raw: RawNotebookCell = {
                kind: cell.kind === vscode.NotebookCellKind.Code ? 'code' : 'markdown',
                language: cell.languageId,
                value: cell.value
            };

            // Persist outputs
            if (cell.outputs && cell.outputs.length > 0) {
                raw.outputs = [];
                for (const output of cell.outputs) {
                    for (const item of output.items) {
                        raw.outputs.push({
                            mime: item.mime,
                            data: new TextDecoder().decode(item.data)
                        });
                    }
                }
            }

            return raw;
        });

        const notebook = { cells: rawCells };
        return new TextEncoder().encode(JSON.stringify(notebook, null, 2));
    }
}
