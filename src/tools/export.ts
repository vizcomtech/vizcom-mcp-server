import { z } from 'zod';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { QUERIES } from '../queries.js';

async function fetchImageBuffer(imagePath: string): Promise<Buffer> {
  const url = imagePath.startsWith('http')
    ? imagePath
    : `https://storage.vizcom.ai/${imagePath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

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
    {
      name: 'create_drawing',
      description: `Create a new drawing on a workbench from a generated image.
After using modify_image or render_sketch, use this tool to place the output
as a new drawing on the workbench — this is how users normally save results in Vizcom.`,
      inputSchema: z.object({
        workbenchId: z.string().uuid().describe('Workbench ID to place the drawing on'),
        imagePath: z.string().describe('Image path from a generation output (e.g. from modify_image or render_sketch results)'),
        width: z.number().optional().default(1024).describe('Drawing width in pixels'),
        height: z.number().optional().default(1024).describe('Drawing height in pixels'),
        name: z.string().optional().describe('Name for the drawing'),
      }),
      handler: async ({ workbenchId, imagePath, width, height, name }) => {
        const imageBuffer = await fetchImageBuffer(imagePath as string);

        const files = new Map<string, { buffer: Buffer; filename: string; mimetype: string }>();
        files.set('variables.input.0.image', {
          buffer: imageBuffer,
          filename: 'output.png',
          mimetype: 'image/png',
        });

        const data = await client.mutationWithUpload<{
          createDrawings: {
            drawings: Array<{ id: string; name: string; width: number; height: number }>;
          };
        }>(QUERIES.CreateDrawings, {
          input: [{
            workbenchId,
            width: width ?? 1024,
            height: height ?? 1024,
            backgroundColor: '#FFFFFF',
            backgroundVisible: true,
            image: null,
            ...(name ? { name } : {}),
          }],
        }, files);

        return data.createDrawings.drawings[0];
      },
    },
  ];
}
