import { randomUUID } from 'crypto';
import * as http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express, { type Request, type Response } from 'express';
import { logger } from '../common/logger';
import type { ServerMetadata } from '../common/serverMetadata';
import { getWorkspaceIdentity } from '../common/workspaceIdentity';
import { createCorsMiddleware } from './cors';
import { registerTools, TOOL_NAMES } from './tools';

interface SessionEntry {
	server: McpServer;
	transport: StreamableHTTPServerTransport;
}

export interface LocalMcpServerOptions {
	version: string;
	host: string;
	port: number;
	corsEnabled: boolean;
	corsAllowOrigins: string;
	corsWithCredentials: boolean;
}

export class LocalMcpServer {
	private readonly options: LocalMcpServerOptions;
	private readonly sessions = new Map<string, SessionEntry>();
	private httpServer: http.Server | undefined;
	private readonly workspaceIdentity = getWorkspaceIdentity();

	public constructor(options: LocalMcpServerOptions) {
		this.options = options;
	}

	public getMetadata(status: 'listening' | 'reused' = 'listening'): ServerMetadata {
		const mcpUrl = `http://${this.options.host}:${this.options.port}/mcp`;
		return {
			workspaceKey: this.workspaceIdentity.workspaceKey,
			workspaceDisplayName: this.workspaceIdentity.displayName,
			host: this.options.host,
			port: this.options.port,
			mcpPath: '/mcp',
			mcpUrl,
			infoUrl: `http://${this.options.host}:${this.options.port}/info`,
			toolNames: [...TOOL_NAMES],
			version: this.options.version,
			status,
		};
	}

	public async start(): Promise<ServerMetadata> {
		const app = express();
		if (this.options.corsEnabled) {
			app.use(createCorsMiddleware(this.options.corsAllowOrigins, this.options.corsWithCredentials));
		}

		app.use(express.json({ limit: '1mb' }));

		app.get('/info', (_request, response) => {
			response.json(this.getMetadata());
		});

		app.get('/health', (_request, response) => {
			response.json({ ok: true, ...this.getMetadata() });
		});

		app.post('/mcp', async (request, response) => {
			await this.handleMcpRequest(request, response);
		});

		app.get('/mcp', async (request, response) => {
			await this.handleStandaloneStream(request, response);
		});

		await new Promise<void>((resolve, reject) => {
			const server = app.listen(this.options.port, this.options.host, () => {
				this.httpServer = server;
				resolve();
			});

			server.once('error', reject);
		});

		logger.info('server', 'server listening', this.getMetadata());
		return this.getMetadata();
	}

	public async dispose(): Promise<void> {
		for (const [sessionId, entry] of this.sessions) {
			try {
				await entry.transport.close();
				await entry.server.close();
			}
			catch (error) {
				logger.warn('server', 'failed to close session cleanly', { sessionId, error });
			}
		}

		this.sessions.clear();

		if (!this.httpServer) {
			return;
		}

		await new Promise<void>((resolve, reject) => {
			this.httpServer?.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});

		this.httpServer = undefined;
		logger.info('server', 'server stopped');
	}

	private async handleMcpRequest(request: Request, response: Response): Promise<void> {
		try {
			const sessionIdHeader = request.headers['mcp-session-id'];
			const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
			let transport = sessionId ? this.sessions.get(sessionId)?.transport : undefined;

			if (!transport && !sessionId && isInitializeRequest(request.body)) {
				transport = await this.createSessionTransport();
			}

			if (!transport) {
				response.status(400).json({
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: 'Bad Request: missing or invalid Mcp-Session-Id.',
					},
					id: null,
				});
				return;
			}

			await transport.handleRequest(request, response, request.body);
		}
		catch (error) {
			logger.error('server', 'failed to handle POST /mcp request', error);
			if (!response.headersSent) {
				response.status(500).json({
					jsonrpc: '2.0',
					error: {
						code: -32603,
						message: error instanceof Error ? error.message : 'Unknown MCP server error.',
					},
					id: null,
				});
			}
		}
	}

	private async handleStandaloneStream(request: Request, response: Response): Promise<void> {
		try {
			const sessionIdHeader = request.headers['mcp-session-id'];
			const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
			if (!sessionId) {
				response.status(400).send('Missing Mcp-Session-Id header.');
				return;
			}

			const session = this.sessions.get(sessionId);
			if (!session) {
				response.status(404).send('Unknown MCP session.');
				return;
			}

			await session.transport.handleRequest(request, response);
		}
		catch (error) {
			logger.error('server', 'failed to handle GET /mcp request', error);
			if (!response.headersSent) {
				response.status(500).send(error instanceof Error ? error.message : 'Unknown MCP stream error.');
			}
		}
	}

	private async createSessionTransport(): Promise<StreamableHTTPServerTransport> {
		const server = this.createSessionServer();
		let createdTransport: StreamableHTTPServerTransport | undefined;
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: (sessionId) => {
				if (!createdTransport) {
					return;
				}

				this.sessions.set(sessionId, {
					server,
					transport: createdTransport,
				});
				logger.info('server', 'session initialized', { sessionId });
			},
			allowedHosts: [this.options.host, '127.0.0.1', 'localhost'],
		});

		createdTransport = transport;

		transport.onclose = async () => {
			const currentSessionId = transport.sessionId;
			if (currentSessionId) {
				this.sessions.delete(currentSessionId);
				logger.info('server', 'session closed', { sessionId: currentSessionId });
			}

			await server.close();
		};

		transport.onerror = (error) => {
			logger.error('server', 'transport error', error);
		};

		await server.connect(transport);
		if (transport.sessionId) {
			this.sessions.set(transport.sessionId, {
				server,
				transport,
			});
		}

		return transport;
	}

	private createSessionServer(): McpServer {
		const server = new McpServer({
			name: 'vscode-mcp-server',
			version: this.options.version,
		});

		registerTools(server);
		return server;
	}
}
