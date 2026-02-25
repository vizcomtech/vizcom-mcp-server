import { z } from 'zod';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { QUERIES } from '../queries.js';
import { toImageUrl, fetchImageAsBase64, fetchImageBuffer } from '../utils/storage.js';

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

        return {
          id: data.prompt.id,
          status,
          outputs: outputs.map((o) => ({
            ...o,
            imageUrl: o.imagePath ? toImageUrl(o.imagePath) : null,
          })),
        };
      },
    },
    {
      name: 'export_image',
      description:
        'Get the full CDN URL for an image. Pass the imagePath from any result.',
      inputSchema: z.object({
        imagePath: z
          .string()
          .describe('Image storage path from a generation result or layer'),
      }),
      handler: async ({ imagePath }) => {
        return { url: toImageUrl(imagePath as string), imagePath };
      },
    },
    {
      name: 'get_drawing_image',
      description: `Download a drawing's image as base64. Use this to get the current state of a drawing
so you can pass it to modify_image or render_sketch for iteration.
Returns the image from the top visible layer of the drawing.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to get the image from'),
      }),
      handler: async ({ drawingId }) => {
        const data = await client.query<{
          drawing: {
            id: string;
            name: string;
            width: number;
            height: number;
            thumbnailPath: string | null;
            layers: {
              nodes: Array<{
                id: string;
                name: string;
                imagePath: string | null;
                visible: boolean;
              }>;
            };
          };
        }>(QUERIES.drawingById, { id: drawingId });

        const drawing = data.drawing;
        const visibleLayer = drawing.layers.nodes.find(
          (l) => l.visible && l.imagePath
        );

        const imagePath = visibleLayer?.imagePath ?? drawing.thumbnailPath;
        if (!imagePath) {
          throw new Error('Drawing has no image — it may be empty. Draw a sketch or import an image in the Vizcom UI first.');
        }

        const base64 = await fetchImageAsBase64(imagePath);

        return {
          drawingId: drawing.id,
          name: drawing.name,
          width: drawing.width,
          height: drawing.height,
          imageUrl: toImageUrl(imagePath),
          imageBase64: base64,
        };
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
      description: `Create a new drawing on a workbench from an image.
Use this to either:
- Place a generated result (pass imagePath from modify_image/render_sketch output)
- Upload a new sketch or photo to start working with (pass imageBase64)
This is how users normally save results and start new work in Vizcom.`,
      inputSchema: z.object({
        workbenchId: z.string().uuid().describe('Workbench ID to place the drawing on'),
        imagePath: z.string().optional().describe('Storage path from a generation output'),
        imageBase64: z.string().optional().describe('Base64-encoded image to upload (PNG/JPEG)'),
        width: z.number().optional().default(1024).describe('Drawing width in pixels'),
        height: z.number().optional().default(1024).describe('Drawing height in pixels'),
        name: z.string().optional().describe('Name for the drawing'),
      }),
      handler: async ({ workbenchId, imagePath, imageBase64, width, height, name }) => {
        let imageBuffer: Buffer;

        if (imageBase64) {
          imageBuffer = Buffer.from(imageBase64 as string, 'base64');
        } else if (imagePath) {
          imageBuffer = await fetchImageBuffer(imagePath as string);
        } else {
          throw new Error('Provide either imagePath (from a generation result) or imageBase64 (raw image data)');
        }

        const files = new Map<string, { buffer: Buffer; filename: string; mimetype: string }>();
        files.set('variables.input.0.image', {
          buffer: imageBuffer,
          filename: 'image.png',
          mimetype: 'image/png',
        });

        const data = await client.mutationWithUpload<{
          createDrawings: {
            drawings: Array<{ id: string; name: string }>;
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
