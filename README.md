# VSCode LSP MCP

`vscode-lsp-mcp` is a VS Code extension that exposes model-friendly code navigation tools over MCP.

The goal is not to copy raw LSP primitives into MCP. The goal is to redesign them for models.

## Why This Extension Exists

Most LSP tools are designed for humans sitting inside an editor. That is reasonable for VS Code, but not ideal for an LLM.

For example, Claude Code exposes an `lsp` tool with operations such as:

- `goToDefinition`
- `findReferences`
- `hover`
- `documentSymbol`
- `workspaceSymbol`
- `goToImplementation`
- `prepareCallHierarchy`
- `incomingCalls`
- `outgoingCalls`

This is still too close to the original LSP surface area.

Take call hierarchy as an example: to get the full incoming hierarchy, the model must first call `prepareCallHierarchy`, then call `incomingCalls` again. That flow is natural for an editor integration, but awkward for a model.

More importantly, classic LSP APIs require symbol positions:

- `filePath`
- `line`
- `character`

For humans, that is fine. For models, `character` is especially unfriendly. Even when the model can identify the file and line, precise character offsets are still noisy and error-prone.

There is also a second problem: many LSP APIs only return locations.

- `goToDefinition`
- `findReferences`
- `documentSymbol`

These results are accurate, but the model still has to re-read the target text afterwards. That means more tool calls and more latency.

`hover` is another example. It is very useful in an editor, but for a model it often overlaps with "give me the definition and the actual source text".

I used to work on C/C++ LSP tooling and know the LSP feature set well. This extension is built around a simple idea:

> Do not expose raw editor-oriented LSP commands directly. Expose higher-level symbol tools that reduce parameter burden and return useful text immediately.

## Core Tools

This extension currently exposes three MCP tools.

| Tool | Description | How it works |
| --- | --- | --- |
| `searchSymbol` | Find symbol definitions by symbol name and return both location and definition text | Uses `workspaceSymbol`, then opens the resolved document and returns the actual source text |
| `documentSymbols` | Quickly show all top-level symbols in a file | Uses `documentSymbol`, with optional `imports/includes` output |
| `FindReference` | Find all references of a symbol when you need to update it everywhere | Resolves the symbol definition first, then calls reference search and returns code snippets with each result |

## Why These Tools Are Better For Models

- `searchSymbol` accepts a symbol name instead of forcing the model to provide `line` and `character`.
- `searchSymbol` returns definition text directly, so the model often does not need another file read.
- `documentSymbols` is optimized for fast file-level navigation, which is what models often need first.
- `FindReference` already covers the practical value of `incomingCalls` for most refactoring tasks, so there is no need to expose both.

## MCP Server

The extension starts a local MCP server automatically when VS Code finishes startup.

- Transport: MCP Streamable HTTP
- MCP endpoint: `GET/POST /mcp`
- Metadata endpoint: `GET /info`
- Health endpoint: `GET /health`

You can use the built-in commands to inspect the current address:

- `VSCode LSP MCP: Show Server Info`
- `VSCode LSP MCP: Copy MCP URL`
- `VSCode LSP MCP: Show Logs`

## Stable Per-Workspace Ports

This extension supports multiple VS Code windows cleanly.

- Different workspaces get different ports.
- The same workspace keeps the same preferred port across restarts.
- If the same workspace is already being served by another VS Code window, the new window reuses that existing MCP endpoint instead of starting a duplicate server.

Workspace identity is derived from:

- the `.code-workspace` URI when present
- otherwise the single-root folder URI
- otherwise a stable multi-root signature

That makes it practical to configure external tools per project without the port changing every time you reopen VS Code.

## Example MCP Config

After the extension starts, use the URL shown by `Show Server Info`.

Cursor:

```json
{
  "mcpServers": {
    "vscode-lsp": {
      "url": "http://127.0.0.1:9527/mcp"
    }
  }
}
```

Claude Code:

```json
{
  "mcpServers": {
    "vscode-lsp": {
      "type": "http",
      "url": "http://127.0.0.1:9527/mcp"
    }
  }
}
```

Gemini / tools that support streamable HTTP:

```json
{
  "mcpServers": {
    "vscode-lsp": {
      "type": "streamable-http",
      "httpUrl": "http://127.0.0.1:9527/mcp"
    }
  }
}
```

## Extension Settings

The extension contributes these settings:

| Setting | Description | Default |
| --- | --- | --- |
| `vscode-lsp-mcp.enabled` | Enable or disable the local MCP server | `true` |
| `vscode-lsp-mcp.host` | Host used by the local MCP server | `127.0.0.1` |
| `vscode-lsp-mcp.basePort` | Base port for workspace-specific port allocation | `9527` |
| `vscode-lsp-mcp.portRangeSize` | Size of the stable port allocation range | `200` |
| `vscode-lsp-mcp.cors.enabled` | Enable CORS headers | `true` |
| `vscode-lsp-mcp.cors.allowOrigins` | Allowed origins, `*` or comma-separated list | `*` |
| `vscode-lsp-mcp.cors.withCredentials` | Allow credentials in CORS requests | `false` |
| `vscode-lsp-mcp.logLevel` | Minimum output log level | `info` |
| `vscode-lsp-mcp.showStartupNotification` | Show startup or reuse notifications | `true` |

## Logging And Troubleshooting

The extension uses a dedicated VS Code `OutputChannel` named `VSCode LSP MCP`.

It records:

- activation and shutdown
- workspace identity
- port selection and port reuse
- MCP session lifecycle
- tool invocation inputs
- failures and stack traces

If something looks wrong, the first step is usually to run `VSCode LSP MCP: Show Logs`.

## Development

```bash
npm install
npm run lint
npm run compile
npm run vsix
```

## Notes

- This extension depends on language providers already available inside VS Code.
- It does not replace your language extensions. It reuses the language intelligence they already provide.
- Results are only as good as the active language server for the current workspace.
