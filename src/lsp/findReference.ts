import * as vscode from 'vscode';
import { getLineSnippet, toSerializableRange } from '../common/document';
import { logger } from '../common/logger';
import { searchSymbol } from './searchSymbol';
import type { FindReferenceResult, ReferenceMatch, SymbolMatch } from './types';

export interface FindReferenceOptions {
	symbolName: string;
	filePath?: string;
	includeDeclaration?: boolean;
}

function isSameLocation(left: vscode.Location, right: vscode.Location): boolean {
	return left.uri.toString() === right.uri.toString()
		&& left.range.start.isEqual(right.range.start)
		&& left.range.end.isEqual(right.range.end);
}

function shouldDisambiguate(definitionCandidates: SymbolMatch[], requestedFilePath?: string): boolean {
	if (requestedFilePath || definitionCandidates.length <= 1) {
		return false;
	}

	return definitionCandidates[0].filePath !== definitionCandidates[1].filePath;
}

async function buildReference(location: vscode.Location, definitionLocation: vscode.Location): Promise<ReferenceMatch> {
	const document = await vscode.workspace.openTextDocument(location.uri);
	return {
		filePath: location.uri.fsPath,
		uri: location.uri.toString(),
		range: toSerializableRange(location.range),
		isDeclaration: isSameLocation(location, definitionLocation),
		snippet: getLineSnippet(document, location.range.start.line),
	};
}

export async function findReference(options: FindReferenceOptions): Promise<FindReferenceResult> {
	logger.info('tool.FindReference', 'finding references', options);

	const symbolSearch = await searchSymbol({
		symbolName: options.symbolName,
		filePath: options.filePath,
		limit: 5,
	});

	if (symbolSearch.matches.length === 0) {
		return {
			query: options.symbolName,
			needsDisambiguation: false,
			references: [],
			totalReferences: 0,
		};
	}

	if (shouldDisambiguate(symbolSearch.matches, options.filePath)) {
		return {
			query: options.symbolName,
			needsDisambiguation: true,
			candidates: symbolSearch.matches,
			references: [],
			totalReferences: 0,
		};
	}

	const definition = symbolSearch.matches[0];
	const definitionLocation = new vscode.Location(
		vscode.Uri.parse(definition.uri),
		new vscode.Range(
			new vscode.Position(definition.range.start.line - 1, definition.range.start.character - 1),
			new vscode.Position(definition.range.end.line - 1, definition.range.end.character - 1),
		),
	);

	const references = await vscode.commands.executeCommand<vscode.Location[]>(
		'vscode.executeReferenceProvider',
		definitionLocation.uri,
		definitionLocation.range.start,
	) ?? [];

	const enriched = await Promise.all(
		references
			.filter((reference) => options.includeDeclaration || !isSameLocation(reference, definitionLocation))
			.map((reference) => buildReference(reference, definitionLocation)),
	);

	return {
		query: options.symbolName,
		definition,
		needsDisambiguation: false,
		references: enriched,
		totalReferences: enriched.length,
	};
}
