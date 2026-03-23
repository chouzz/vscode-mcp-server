import * as http from 'http';
import * as vscode from 'vscode';
import { logger } from './logger';
import type { ServerMetadata } from './serverMetadata';

interface StoredPortMappings {
	[workspaceKey: string]: number;
}

export interface PortAllocationResult {
	port: number;
	mode: 'listen' | 'reuse';
	reusedMetadata?: ServerMetadata;
}

interface ProbeResult {
	status: 'free' | 'occupied' | 'same-workspace' | 'other-workspace';
	metadata?: ServerMetadata;
}

function hashWorkspaceKey(workspaceKey: string): number {
	let hash = 0;
	for (const character of workspaceKey) {
		hash = ((hash << 5) - hash) + character.charCodeAt(0);
		hash |= 0;
	}

	return Math.abs(hash);
}

function getStorage(context: vscode.ExtensionContext): StoredPortMappings {
	return context.globalState.get<StoredPortMappings>('workspacePortMappings', {});
}

async function saveStorage(context: vscode.ExtensionContext, storage: StoredPortMappings): Promise<void> {
	await context.globalState.update('workspacePortMappings', storage);
}

function httpGetJson(url: string, timeoutMs: number): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const request = http.get(url, { timeout: timeoutMs }, (response) => {
			const chunks: Buffer[] = [];
			response.on('data', (chunk) => {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			});
			response.on('end', () => {
				if (response.statusCode !== 200) {
					reject(new Error(`Unexpected status ${response.statusCode ?? 0}`));
					return;
				}

				try {
					resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
				}
				catch (error) {
					reject(error);
				}
			});
		});

		request.on('timeout', () => {
			request.destroy(new Error('Request timed out'));
		});
		request.on('error', reject);
	});
}

async function probePort(host: string, port: number, workspaceKey: string): Promise<ProbeResult> {
	const infoUrl = `http://${host}:${port}/info`;
	try {
		const response = await httpGetJson(infoUrl, 800) as Partial<ServerMetadata>;
		if (typeof response.workspaceKey !== 'string') {
			return { status: 'occupied' };
		}

		if (response.workspaceKey === workspaceKey) {
			return {
				status: 'same-workspace',
				metadata: response as ServerMetadata,
			};
		}

		return {
			status: 'other-workspace',
			metadata: response as ServerMetadata,
		};
	}
	catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/ECONNREFUSED|timed out|socket hang up/i.test(message)) {
			return { status: 'free' };
		}

		logger.debug('ports', 'port probe reported non-MCP listener', { host, port, message });
		return { status: 'occupied' };
	}
}

export async function allocatePort(
	context: vscode.ExtensionContext,
	host: string,
	basePort: number,
	portRangeSize: number,
	workspaceKey: string,
): Promise<PortAllocationResult> {
	const storage = getStorage(context);
	const preferredPort = storage[workspaceKey] ?? (basePort + (hashWorkspaceKey(workspaceKey) % portRangeSize));
	const visitedPorts = new Set<number>();

	for (let offset = 0; offset < portRangeSize; offset++) {
		const candidate = basePort + ((preferredPort - basePort + offset) % portRangeSize);
		if (visitedPorts.has(candidate)) {
			continue;
		}

		visitedPorts.add(candidate);
		const probe = await probePort(host, candidate, workspaceKey);
		logger.debug('ports', 'probe result', { candidate, status: probe.status });

		if (probe.status === 'same-workspace' && probe.metadata) {
			storage[workspaceKey] = candidate;
			await saveStorage(context, storage);
			return {
				port: candidate,
				mode: 'reuse',
				reusedMetadata: {
					...probe.metadata,
					status: 'reused',
				},
			};
		}

		if (probe.status === 'free') {
			storage[workspaceKey] = candidate;
			await saveStorage(context, storage);
			return {
				port: candidate,
				mode: 'listen',
			};
		}
	}

	throw new Error(`No available MCP port found in range ${basePort}-${basePort + portRangeSize - 1}.`);
}
