export interface ServerMetadata {
	workspaceKey: string;
	workspaceDisplayName: string;
	host: string;
	port: number;
	mcpPath: string;
	mcpUrl: string;
	infoUrl: string;
	toolNames: string[];
	version: string;
	status: 'listening' | 'reused';
}
