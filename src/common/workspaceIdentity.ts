import * as vscode from 'vscode';

export interface WorkspaceIdentity {
	workspaceKey: string;
	displayName: string;
}

export function getWorkspaceIdentity(): WorkspaceIdentity {
	const workspaceFile = vscode.workspace.workspaceFile;
	if (workspaceFile) {
		return {
			workspaceKey: workspaceFile.toString(),
			displayName: workspaceFile.fsPath,
		};
	}

	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 1) {
		return {
			workspaceKey: folders[0].uri.toString(),
			displayName: folders[0].uri.fsPath,
		};
	}

	if (folders.length > 1) {
		const sortedUris = [...folders]
			.map((folder) => folder.uri.toString())
			.sort((left, right) => left.localeCompare(right));

		return {
			workspaceKey: `multi-root:${sortedUris.join('|')}`,
			displayName: folders.map((folder) => folder.name).join(', '),
		};
	}

	return {
		workspaceKey: 'empty-window',
		displayName: 'Empty Window',
	};
}
