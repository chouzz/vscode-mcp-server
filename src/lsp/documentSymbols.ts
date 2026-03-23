import * as vscode from 'vscode';
import { openTextDocumentForPath, toSerializableRange } from '../common/document';
import { logger } from '../common/logger';
import type { DocumentSymbolMatch, DocumentSymbolsResult } from './types';
import { symbolKindToString } from './types';

export interface DocumentSymbolsOptions {
	filePath: string;
	includeImports?: boolean;
	includeChildren?: boolean;
}

function extractImports(document: vscode.TextDocument): string[] {
	const results: string[] = [];
	const patterns = [
		/^\s*import\s.+$/,
		/^\s*export\s.+from\s.+$/,
		/^\s*#include\s+[<"].+[>"]\s*$/,
		/^\s*from\s+\S+\s+import\s.+$/,
		/^\s*use\s+.+$/,
		/^\s*require\s*\(.+\)\s*;?\s*$/,
	];

	for (let index = 0; index < document.lineCount; index++) {
		const text = document.lineAt(index).text;
		if (patterns.some((pattern) => pattern.test(text))) {
			results.push(text.trim());
		}
	}

	return results;
}

function serializeSymbol(symbol: vscode.DocumentSymbol, includeChildren: boolean): DocumentSymbolMatch {
	return {
		name: symbol.name,
		kind: symbolKindToString(symbol.kind),
		detail: symbol.detail || undefined,
		range: toSerializableRange(symbol.range),
		selectionRange: toSerializableRange(symbol.selectionRange),
		children: includeChildren && symbol.children.length > 0
			? symbol.children.map((child) => serializeSymbol(child, includeChildren))
			: undefined,
	};
}

export async function documentSymbols(options: DocumentSymbolsOptions): Promise<DocumentSymbolsResult> {
	const document = await openTextDocumentForPath(options.filePath);
	logger.info('tool.documentSymbols', 'collecting document symbols', options);

	const result = await vscode.commands.executeCommand<Array<vscode.DocumentSymbol | vscode.SymbolInformation>>(
		'vscode.executeDocumentSymbolProvider',
		document.uri,
	) ?? [];

	const symbols = result
		.filter((symbol): symbol is vscode.DocumentSymbol => symbol instanceof vscode.DocumentSymbol)
		.map((symbol) => serializeSymbol(symbol, Boolean(options.includeChildren)));

	return {
		filePath: document.uri.fsPath,
		uri: document.uri.toString(),
		imports: options.includeImports ? extractImports(document) : [],
		symbols,
	};
}
