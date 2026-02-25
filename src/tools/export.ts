import { z } from 'zod';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { QUERIES } from '../queries.js';

export function exportTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'get_generation_status',
      description:
        'Check the status of an in-progress image generation by prompt ID.',
      inputSchema: z.object({
        promptId: z.string().uuid().describe('Prompt ID to check'),
      }),
      handler: async ({ promptId }) => {
        const data = await client.query<{
          prompt: {
            id: string;
            outputs: {
              nodes: Array<{
                id: string;
                imagePath: string | null;
                failureReason: string | null;
              }>;
            };
          };
        }>(QUERIES.prompt, { id: promptId });

        const outputs = data.prompt.outputs.nodes;
        const failed = outputs.find((o) => o.failureReason);
        const completed = outputs.filter((o) => o.imagePath);

        let status: string;
        if (failed) status = 'failed';
        else if (completed.length > 0) status = 'completed';
        else status = 'processing';

        return { id: data.prompt.id, status, outputs };
      },
    },
    {
      name: 'export_image',
      description:
        'Get the full URL for a generated image. Pass the imagePath from a generation result.',
      inputSchema: z.object({
        imagePath: z
          .string()
          .describe('Image storage path from a generation result'),
      }),
      handler: async ({ imagePath }) => {
        const url = (imagePath as string).startsWith('http')
          ? imagePath
          : `https://storage.vizcom.ai/${imagePath}`;
        return { url, imagePath };
      },
    },
    {
      name: 'create_workbench',
      description: 'Create a new workbench in a folder.',
      inputSchema: z.object({
        folderId: z
          .string()
          .uuid()
          .describe('Folder ID to create the workbench in'),
        name: z.string().describe('Name for the new workbench'),
      }),
      handler: async ({ folderId, name }) => {
        const data = await client.query<{
          createWorkbench: {
            workbench: { id: string; name: string };
          };
        }>(QUERIES.CreateWorkbench, {
          input: { workbench: { folderId, name } },
        });
        return data.createWorkbench.workbench;
      },
    },
  ];
}
