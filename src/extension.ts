import * as vscode from 'vscode';
import { logger } from './common/logger';
import { allocatePort } from './common/ports';
import type { ServerMetadata } from './common/serverMetadata';
import { getWorkspaceIdentity } from './common/workspaceIdentity';
import { LocalMcpServer } from './mcp/server';

interface RuntimeState {
	server?: LocalMcpServer;
	metadata?: ServerMetadata;
}

const runtimeState: RuntimeState = {};

function getConfig() {
	const config = vscode.workspace.getConfiguration('vscode-mcp-server');
	return {
		enabled: config.get<boolean>('enabled', true),
		host: config.get<string>('host', '127.0.0.1'),
		basePort: config.get<number>('basePort', 9527),
		portRangeSize: config.get<number>('portRangeSize', 200),
		corsEnabled: config.get<boolean>('cors.enabled', true),
		corsAllowOrigins: config.get<string>('cors.allowOrigins', '*'),
		corsWithCredentials: config.get<boolean>('cors.withCredentials', false),
		showStartupNotification: config.get<boolean>('showStartupNotification', true),
	};
}

async function startRuntime(context: vscode.ExtensionContext): Promise<void> {
	const workspaceIdentity = getWorkspaceIdentity();
	logger.info('extension', 'activating extension', workspaceIdentity);

	const config = getConfig();
	if (!config.enabled) {
		logger.info('extension', 'extension disabled by configuration');
		return;
	}

	const allocation = await allocatePort(
		context,
		config.host,
		config.basePort,
		config.portRangeSize,
		workspaceIdentity.workspaceKey,
	);

	if (allocation.mode === 'reuse' && allocation.reusedMetadata) {
		runtimeState.metadata = allocation.reusedMetadata;
		logger.info('extension', 'reusing existing workspace MCP server', allocation.reusedMetadata);

		if (config.showStartupNotification) {
			void vscode.window.showInformationMessage(`VSCode MCP Server reused ${allocation.reusedMetadata.mcpUrl}`);
		}

		return;
	}

	const version = String(context.extension.packageJSON.version ?? '0.0.0');
	const server = new LocalMcpServer({
		version,
		host: config.host,
		port: allocation.port,
		corsEnabled: config.corsEnabled,
		corsAllowOrigins: config.corsAllowOrigins,
		corsWithCredentials: config.corsWithCredentials,
	});

	const metadata = await server.start();
	runtimeState.server = server;
	runtimeState.metadata = metadata;

	if (config.showStartupNotification) {
		void vscode.window.showInformationMessage(`VSCode MCP Server listening on ${metadata.mcpUrl}`);
	}
}

function registerCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-mcp-server.showServerInfo', async () => {
			if (!runtimeState.metadata) {
				await vscode.window.showWarningMessage('VSCode MCP Server is not running.');
				return;
			}

			await vscode.window.showInformationMessage(
				`Workspace: ${runtimeState.metadata.workspaceDisplayName}\nMCP URL: ${runtimeState.metadata.mcpUrl}\nStatus: ${runtimeState.metadata.status}`,
			);
		}),
		vscode.commands.registerCommand('vscode-mcp-server.copyServerUrl', async () => {
			if (!runtimeState.metadata) {
				await vscode.window.showWarningMessage('VSCode MCP Server is not running.');
				return;
			}

			await vscode.env.clipboard.writeText(runtimeState.metadata.mcpUrl);
			await vscode.window.showInformationMessage(`Copied ${runtimeState.metadata.mcpUrl}`);
		}),
		vscode.commands.registerCommand('vscode-mcp-server.showLogs', () => {
			logger.show();
		}),
	);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	registerCommands(context);

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('vscode-mcp-server')) {
			logger.info('extension', 'configuration changed; reload window to apply server changes');
			void vscode.window.showInformationMessage('VSCode MCP Server settings changed. Reload the window to apply them.');
		}
	}));

	try {
		await startRuntime(context);
	}
	catch (error) {
		logger.error('extension', 'activation failed', error);
		void vscode.window.showErrorMessage(
			`VSCode MCP Server failed to start: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export async function deactivate(): Promise<void> {
	await runtimeState.server?.dispose();
	runtimeState.server = undefined;
	runtimeState.metadata = undefined;
	logger.dispose();
}
