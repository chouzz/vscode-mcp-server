import * as path from 'path';
import * as vscode from 'vscode';

export interface SerializablePosition {
	line: number;
	character: number;
}

export interface SerializableRange {
	start: SerializablePosition;
	end: SerializablePosition;
}

function toOneBasedPosition(position: vscode.Position): SerializablePosition {
	return {
		line: position.line + 1,
		character: position.character + 1,
	};
}

export function toSerializableRange(range: vscode.Range): SerializableRange {
	return {
		start: toOneBasedPosition(range.start),
		end: toOneBasedPosition(range.end),
	};
}

async function pathExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	}
	catch {
		return false;
	}
}

export async function resolveFileUri(filePath: string): Promise<vscode.Uri> {
	if (filePath.startsWith('file://')) {
		return vscode.Uri.parse(filePath);
	}

	if (path.isAbsolute(filePath)) {
		return vscode.Uri.file(path.normalize(filePath));
	}

	const folders = vscode.workspace.workspaceFolders ?? [];
	for (const folder of folders) {
		const candidate = vscode.Uri.joinPath(folder.uri, filePath);
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	if (folders.length > 0) {
		return vscode.Uri.joinPath(folders[0].uri, filePath);
	}

	return vscode.Uri.file(path.resolve(filePath));
}

export async function openTextDocumentForPath(filePath: string): Promise<vscode.TextDocument> {
	const uri = await resolveFileUri(filePath);
	return vscode.workspace.openTextDocument(uri);
}

export function getRangeText(document: vscode.TextDocument, range: vscode.Range, maxLines = 120, maxCharacters = 6000): string {
	const startLine = range.start.line;
	const endLine = Math.min(range.end.line, startLine + Math.max(maxLines - 1, 0));
	const clippedRange = new vscode.Range(
		new vscode.Position(startLine, 0),
		document.lineAt(endLine).range.end,
	);

	const text = document.getText(clippedRange);
	if (text.length <= maxCharacters) {
		return text;
	}

	return `${text.slice(0, maxCharacters)}\n...`;
}

export function getLineSnippet(document: vscode.TextDocument, line: number, contextBefore = 1, contextAfter = 1): string {
	const start = Math.max(0, line - contextBefore);
	const end = Math.min(document.lineCount - 1, line + contextAfter);
	const range = new vscode.Range(
		new vscode.Position(start, 0),
		document.lineAt(end).range.end,
	);
	return document.getText(range);
}
