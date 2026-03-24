import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PRIORITIES: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('VSCode MCP Server');
	}

	return outputChannel;
}

function getConfiguredLevel(): LogLevel {
	const config = vscode.workspace.getConfiguration('vscode-mcp-server');
	return config.get<LogLevel>('logLevel', 'info');
}

function shouldLog(level: LogLevel): boolean {
	return LOG_PRIORITIES[level] >= LOG_PRIORITIES[getConfiguredLevel()];
}

function serialize(value: unknown): string {
	if (value instanceof Error) {
		return JSON.stringify({
			name: value.name,
			message: value.message,
			stack: value.stack,
		}, null, 2);
	}

	try {
		return JSON.stringify(value, null, 2);
	}
	catch {
		return String(value);
	}
}

function write(level: LogLevel, scope: string, message: string, data?: unknown): void {
	if (!shouldLog(level)) {
		return;
	}

	const output = getOutputChannel();
	const timestamp = new Date().toISOString();
	output.appendLine(`[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}`);

	if (typeof data !== 'undefined') {
		output.appendLine(serialize(data));
	}
}

export const logger = {
	debug(scope: string, message: string, data?: unknown): void {
		write('debug', scope, message, data);
	},

	info(scope: string, message: string, data?: unknown): void {
		write('info', scope, message, data);
	},

	warn(scope: string, message: string, data?: unknown): void {
		write('warn', scope, message, data);
	},

	error(scope: string, message: string, data?: unknown): void {
		write('error', scope, message, data);
	},

	show(preserveFocus = false): void {
		getOutputChannel().show(preserveFocus);
	},

	dispose(): void {
		outputChannel?.dispose();
		outputChannel = undefined;
	},
};
