import * as path from 'path';
import * as vscode from 'vscode';
import { getLineSnippet, getRangeText, toSerializableRange } from '../common/document';
import { logger } from '../common/logger';
import type { SearchSymbolResult, SymbolMatch } from './types';
import { symbolKindToString } from './types';

export interface SearchSymbolOptions {
	symbolName: string;
	filePath?: string;
	containerName?: string;
	limit?: number;
}

function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, '/').toLowerCase();
}

function matchesFileHint(candidatePath: string, requestedPath?: string): boolean {
	if (!requestedPath) {
		return true;
	}

	const normalizedCandidate = normalizePath(candidatePath);
	const normalizedRequest = normalizePath(requestedPath);
	return normalizedCandidate === normalizedRequest
		|| normalizedCandidate.endsWith(`/${normalizedRequest}`)
		|| path.basename(normalizedCandidate) === path.basename(normalizedRequest);
}

function scoreSymbol(symbol: vscode.SymbolInformation, options: SearchSymbolOptions): number {
	const query = options.symbolName.trim();
	const name = symbol.name.trim();
	const nameLower = name.toLowerCase();
	const queryLower = query.toLowerCase();

	let score = 0;

	if (name === query) {
		score += 1000;
	}
	else if (nameLower === queryLower) {
		score += 900;
	}
	else if (name.startsWith(query)) {
		score += 700;
	}
	else if (nameLower.startsWith(queryLower)) {
		score += 600;
	}
	else if (nameLower.includes(queryLower)) {
		score += 300;
	}

	if (options.containerName && symbol.containerName === options.containerName) {
		score += 150;
	}

	if (options.filePath && matchesFileHint(symbol.location.uri.fsPath, options.filePath)) {
		score += 250;
	}

	return score;
}

async function buildSymbolMatch(symbol: vscode.SymbolInformation): Promise<SymbolMatch> {
	const document = await vscode.workspace.openTextDocument(symbol.location.uri);
	return {
		name: symbol.name,
		kind: symbolKindToString(symbol.kind),
		containerName: symbol.containerName || undefined,
		filePath: symbol.location.uri.fsPath,
		uri: symbol.location.uri.toString(),
		range: toSerializableRange(symbol.location.range),
		selectionRange: toSerializableRange(symbol.location.range),
		definitionText: getRangeText(document, symbol.location.range),
		preview: getLineSnippet(document, symbol.location.range.start.line),
	};
}

export async function searchSymbol(options: SearchSymbolOptions): Promise<SearchSymbolResult> {
	const limit = Math.max(1, options.limit ?? 5);
	logger.info('tool.searchSymbol', 'searching workspace symbols', options);

	const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
		'vscode.executeWorkspaceSymbolProvider',
		options.symbolName,
	) ?? [];

	const filtered = symbols
		.filter((symbol) => scoreSymbol(symbol, options) > 0)
		.filter((symbol) => matchesFileHint(symbol.location.uri.fsPath, options.filePath))
		.filter((symbol) => !options.containerName || symbol.containerName === options.containerName)
		.sort((left, right) => scoreSymbol(right, options) - scoreSymbol(left, options));

	const matches = await Promise.all(filtered.slice(0, limit).map((symbol) => buildSymbolMatch(symbol)));

	return {
		query: options.symbolName,
		totalCandidates: filtered.length,
		matches,
	};
}
