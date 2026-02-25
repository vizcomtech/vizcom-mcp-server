#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { VizcomClient } from './client.js';
import { loadCredentials } from './auth/credentials.js';
import { browseTools } from './tools/browse.js';
import { modifyTools } from './tools/modify.js';
import { renderTools } from './tools/render.js';
import { exportTools } from './tools/export.js';
import type { ToolDefinition } from './types.js';

function getCredentialsOrExit() {
  // Check for env var override first (for CI / advanced users)
  if (process.env.VIZCOM_AUTH_TOKEN && process.env.VIZCOM_ORGANIZATION_ID) {
    return {
      apiUrl: process.env.VIZCOM_API_URL ?? 'https://app.vizcom.com/api/v1',
      authToken: process.env.VIZCOM_AUTH_TOKEN,
      organizationId: process.env.VIZCOM_ORGANIZATION_ID,
    };
  }

  const creds = loadCredentials();
  if (!creds) {
    console.error(
      'Not authenticated. Run: npx @vizcom/mcp-server login'
    );
    process.exit(1);
  }
  return creds;
}

// Handle login subcommand
if (process.argv[2] === 'login') {
  import('./auth/login.js').then((m) => m.runLoginCli()).catch(() => process.exit(1));
} else {
  main();
}

async function main() {
  const creds = getCredentialsOrExit();

  const client = new VizcomClient({
    apiUrl: creds.apiUrl,
    authToken: creds.authToken,
    organizationId: creds.organizationId,
  });

  const server = new McpServer({
    name: 'vizcom',
    version: '0.1.0',
  });

  const allTools: ToolDefinition[] = [
    ...browseTools(client),
    ...modifyTools(client),
    ...renderTools(client),
    ...exportTools(client),
  ];

  for (const tool of allTools) {
    server.tool(
      tool.name,
      tool.description,
      { input: tool.inputSchema },
      async ({ input }) => {
        try {
          const result = await tool.handler(input as Record<string, unknown>);
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(result, null, 2) },
            ],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);

          if (message.includes('jwt') || message.includes('token') || message.includes('authorized')) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Your session has expired. Run `npx @vizcom/mcp-server login` to re-authenticate.',
                },
              ],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text' as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Vizcom MCP server running (${allTools.length} tools)`);
}
