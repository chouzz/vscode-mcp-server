import * as vscode from 'vscode';
import type { SerializableRange } from '../common/document';

export interface SymbolMatch {
	name: string;
	kind: string;
	containerName?: string;
	filePath: string;
	uri: string;
	range: SerializableRange;
	selectionRange: SerializableRange;
	definitionText: string;
	preview: string;
}

export interface SearchSymbolResult {
	query: string;
	totalCandidates: number;
	matches: SymbolMatch[];
}

export interface ReferenceMatch {
	filePath: string;
	uri: string;
	range: SerializableRange;
	isDeclaration: boolean;
	snippet: string;
}

export interface FindReferenceResult {
	query: string;
	definition?: SymbolMatch;
	needsDisambiguation: boolean;
	candidates?: SymbolMatch[];
	references: ReferenceMatch[];
	totalReferences: number;
}

export interface DocumentSymbolMatch {
	name: string;
	kind: string;
	detail?: string;
	range: SerializableRange;
	selectionRange: SerializableRange;
	children?: DocumentSymbolMatch[];
}

export interface DocumentSymbolsResult {
	filePath: string;
	uri: string;
	imports: string[];
	symbols: DocumentSymbolMatch[];
}

export function symbolKindToString(kind: vscode.SymbolKind): string {
	return vscode.SymbolKind[kind] ?? 'Unknown';
}
