import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';
import { placeOutputAsDrawing } from '../utils/place-result.js';
import { fetchDrawingImageBuffer } from '../utils/storage.js';
import { QUERIES } from '../queries.js';

export function modifyTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'modify_image',
      description: `Modify an existing image using AI. Describe the changes you want in the prompt.
The source image is fetched automatically from the drawing — you don't need to pass it.
Optionally provide a mask (base64 PNG where white = area to change) for targeted edits.

Results are placed as new drawings on the workbench. Use accept_result to apply
a result back onto the source drawing instead.

IMPORTANT: Vizcom is image-to-image only. You always need a source image — a sketch, a photo,
or even a blank white canvas. To start from scratch, create a workbench in the Vizcom UI and
draw a quick sketch or import an image, then use this tool to transform it.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to modify'),
        prompt: z.string().describe('Description of the changes to make'),
        sourceImageBase64: z.string().optional().describe('Base64-encoded source image (optional — omit to use the drawing\'s current image)'),
        maskBase64: z.string().optional().describe('Base64-encoded mask image (PNG, same dimensions as source, white = area to change, black = keep)'),
        outputsCount: z.number().min(1).max(4).optional().default(1).describe('Number of variations to generate (1-4)'),
      }),
      handler: async ({
        drawingId,
        prompt,
        sourceImageBase64,
        maskBase64,
        outputsCount,
      }) => {
        // Fetch source image server-side if not provided
        let sourceBuffer: Buffer;
        if (sourceImageBase64) {
          sourceBuffer = Buffer.from(sourceImageBase64 as string, 'base64');
        } else {
          sourceBuffer = await fetchDrawingImageBuffer(client, drawingId as string);
        }

        const promptId = randomUUID();

        const files = new Map<string, { buffer: Buffer; filename: string; mimetype: string }>();
        files.set('variables.input.data', {
          buffer: sourceBuffer,
          filename: 'source.png',
          mimetype: 'image/png',
        });

        const variables: Record<string, unknown> = {
          input: {
            id: promptId,
            drawingId,
            prompt,
            outputsCount: outputsCount ?? 1,
            data: null,
            mask: maskBase64 ? null : undefined,
          },
        };

        if (maskBase64) {
          const maskBuffer = Buffer.from(maskBase64 as string, 'base64');
          files.set('variables.input.mask', {
            buffer: maskBuffer,
            filename: 'mask.png',
            mimetype: 'image/png',
          });
        }

        await client.mutationWithUpload<{
          createEditPrompt: { prompt: { id: string } };
        }>(QUERIES.CreateEditPrompt, variables, files);

        const result = await pollForResult(client, promptId);

        const placed = [];
        for (const output of result.outputs) {
          const drawing = await placeOutputAsDrawing(client, drawingId as string, output);
          if (drawing) placed.push(drawing);
        }

        return { ...result, placedDrawings: placed };
      },
    },
  ];
}
