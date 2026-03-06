import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { QUERIES } from '../queries.js';
import { toImageUrl, fetchImageBuffer, fetchDrawingImageBuffer, pollCdnForFile } from '../utils/storage.js';

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
      description: `Get a drawing's image URL and metadata. Returns the CDN URL for the top visible layer.
You generally don't need this for modify_image or render_sketch — those tools fetch
the source image automatically from the drawingId. Use this when you need to inspect
or display a drawing's current state.`,
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

        return {
          drawingId: drawing.id,
          name: drawing.name,
          width: drawing.width,
          height: drawing.height,
          imageUrl: toImageUrl(imagePath),
        };
      },
    },
    {
      name: 'create_workbench',
      description: `Create a new workbench in a folder.
Set startInStudio to true (default) to create a blank canvas ready for drawing.
Set to false to create an empty workbench without a default drawing.`,
      inputSchema: z.object({
        folderId: z
          .string()
          .uuid()
          .describe('Folder ID to create the workbench in'),
        name: z.string().describe('Name for the new workbench'),
        startInStudio: z.boolean().optional().default(true).describe('Create with a blank canvas ready for drawing (default: true)'),
      }),
      handler: async ({ folderId, name, startInStudio }) => {
        const data = await client.query<{
          createWorkbench: {
            workbench: { id: string; name: string };
          };
        }>(QUERIES.CreateWorkbench, {
          input: {
            startInStudio: startInStudio ?? true,
            workbench: { folderId, name },
          },
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
    {
      name: 'upscale_image',
      description: `Upscale a drawing's image to higher resolution using AI (SeedVR2).
The source image is fetched automatically from the drawing.
Supports 2x and 4x upscaling. Max output dimension is 10,000px per side.
Returns the CDN URL of the upscaled image once ready.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to upscale'),
        upscaleFactor: z.number().min(2).max(4).optional().default(2).describe('Upscale factor: 2 or 4 (default: 2)'),
      }),
      handler: async ({ drawingId, upscaleFactor }) => {
        const sourceBuffer = await fetchDrawingImageBuffer(client, drawingId as string);
        const upscaleId = randomUUID();

        const files = new Map<string, { buffer: Buffer; filename: string; mimetype: string }>();
        files.set('variables.input.image', {
          buffer: sourceBuffer,
          filename: 'source.png',
          mimetype: 'image/png',
        });

        await client.mutationWithUpload<{
          upscaleImage: {
            upscale: { id: string; drawingId: string; sourceImagePath: string | null; upscaledImagePath: string | null };
          };
        }>(QUERIES.UpscaleImage, {
          input: {
            id: upscaleId,
            drawingId,
            image: null,
            upscaleFactor: upscaleFactor ?? 2,
          },
        }, files);

        const outputPath = `upscale/${upscaleId}`;
        const url = await pollCdnForFile(outputPath);

        return {
          drawingId,
          upscaleId,
          upscaleFactor: upscaleFactor ?? 2,
          imageUrl: url,
          imagePath: outputPath,
        };
      },
    },
    {
      name: 'accept_result',
      description: `Apply a generation result onto the source drawing's layer.
After modify_image or render_sketch, the output is just a preview — it hasn't been
committed to the drawing yet. Use this tool to "accept" a result, which replaces the
drawing's top layer with the generated image (like clicking "Add" in the Vizcom UI).

Pass the drawingId of the source drawing and the imagePath from the generation output.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to apply the result to'),
        imagePath: z.string().describe('Image storage path from the generation output'),
      }),
      handler: async ({ drawingId, imagePath }) => {
        // Get the drawing's current layers to find the top visible one
        const data = await client.query<{
          drawing: {
            id: string;
            name: string;
            layers: {
              nodes: Array<{
                id: string;
                name: string;
                visible: boolean;
                imagePath: string | null;
                orderKey: string;
              }>;
            };
          };
        }>(QUERIES.drawingById, { id: drawingId });

        const layers = data.drawing.layers.nodes;
        const topLayer = layers.find((l) => l.visible && l.imagePath);

        const imageBuffer = await fetchImageBuffer(imagePath as string);
        const files = new Map<string, { buffer: Buffer; filename: string; mimetype: string }>();

        if (topLayer) {
          // Update the existing top layer with the new image
          files.set('variables.input.layerUpdates.0.imagePath', {
            buffer: imageBuffer,
            filename: 'result.png',
            mimetype: 'image/png',
          });

          const result = await client.mutationWithUpload<{
            updateDrawingLayers: {
              drawing: { id: string; layers: { nodes: Array<{ id: string; name: string }> } };
            };
          }>(QUERIES.UpdateDrawingLayers, {
            input: {
              id: drawingId,
              layerUpdates: [{ id: topLayer.id, imagePath: null }],
            },
          }, files);

          return {
            drawingId: result.updateDrawingLayers.drawing.id,
            updatedLayerId: topLayer.id,
            imageUrl: toImageUrl(imagePath as string),
          };
        } else {
          // No existing layer — create a new one
          const newLayerId = randomUUID();
          files.set('variables.input.newLayers.0.imagePath', {
            buffer: imageBuffer,
            filename: 'result.png',
            mimetype: 'image/png',
          });

          const result = await client.mutationWithUpload<{
            updateDrawingLayers: {
              drawing: { id: string; layers: { nodes: Array<{ id: string; name: string }> } };
            };
          }>(QUERIES.UpdateDrawingLayers, {
            input: {
              id: drawingId,
              newLayers: [{
                id: newLayerId,
                name: 'AI Result',
                visible: true,
                opacity: 1,
                imagePath: null,
              }],
            },
          }, files);

          return {
            drawingId: result.updateDrawingLayers.drawing.id,
            newLayerId,
            imageUrl: toImageUrl(imagePath as string),
          };
        }
      },
    },
  ];
}
