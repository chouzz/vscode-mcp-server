import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { documentSymbols, findReference, searchSymbol } from '../lsp';

export const TOOL_NAMES = ['searchSymbol', 'documentSymbols', 'FindReference'] as const;

function asTextResult(payload: unknown) {
	return {
		content: [
			{
				type: 'text' as const,
				text: JSON.stringify(payload, null, 2),
			},
		],
	};
}

export function registerTools(server: McpServer): void {
	server.registerTool(
		'searchSymbol',
		{
			title: 'Search Symbol',
			description: 'Find symbol definitions by symbol name and return the definition location together with the definition text.',
			inputSchema: z.object({
				symbolName: z.string().min(1).describe('Symbol name to search.'),
				filePath: z.string().optional().describe('Optional absolute or workspace-relative file path to narrow the search.'),
				containerName: z.string().optional().describe('Optional container name such as namespace, class, or module name.'),
				limit: z.number().int().min(1).max(20).optional().describe('Maximum number of matches to return.'),
			}),
		},
		async (args) => asTextResult(await searchSymbol(args)),
	);

	server.registerTool(
		'documentSymbols',
		{
			title: 'Document Symbols',
			description: 'List the top-level symbols of a file. Optionally include imports/includes and nested child symbols.',
			inputSchema: z.object({
				filePath: z.string().min(1).describe('Absolute or workspace-relative file path.'),
				includeImports: z.boolean().optional().describe('Whether to include import or include statements in the result.'),
				includeChildren: z.boolean().optional().describe('Whether to include nested child symbols.'),
			}),
		},
		async (args) => asTextResult(await documentSymbols(args)),
	);

	server.registerTool(
		'FindReference',
		{
			title: 'Find References',
			description: 'Find references for a symbol name. Returns the resolved definition and code snippets for each reference.',
			inputSchema: z.object({
				symbolName: z.string().min(1).describe('Symbol name to search.'),
				filePath: z.string().optional().describe('Optional absolute or workspace-relative file path to disambiguate the target symbol.'),
				includeDeclaration: z.boolean().optional().describe('Whether to include the declaration location in the returned references.'),
			}),
		},
		async (args) => asTextResult(await findReference(args)),
	);
}
