import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';
import { QUERIES } from '../queries.js';

export function renderTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'render_sketch',
      description: `Turn a sketch into a photorealistic rendered visualization.
Provide a source sketch image and a text prompt describing the desired look.
Use influenceLevel to control how closely the output follows the sketch (0 = loose, 1 = strict).`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to render into'),
        prompt: z.string().describe('Description of the desired render'),
        sourceImageBase64: z.string().describe('Base64-encoded sketch image (PNG/JPEG)'),
        influenceLevel: z.number().min(0).max(1).optional().default(0.5).describe('How closely the output follows the sketch (0-1)'),
        outputsCount: z.number().min(1).max(4).optional().default(1).describe('Number of variations (1-4)'),
      }),
      handler: async ({
        drawingId,
        prompt,
        sourceImageBase64,
        influenceLevel,
        outputsCount,
      }) => {
        const sourceBuffer = Buffer.from(sourceImageBase64 as string, 'base64');
        const promptId = randomUUID();

        const files = new Map<string, { buffer: Buffer; filename: string; mimetype: string }>();
        files.set('variables.input.data', {
          buffer: sourceBuffer,
          filename: 'source.png',
          mimetype: 'image/png',
        });

        await client.mutationWithUpload<{
          createPrompt: { prompt: { id: string } };
        }>(QUERIES.CreatePrompt, {
          input: {
            id: promptId,
            drawingId,
            prompt,
            imageInferenceType: 'RENDER',
            sourceImageInfluence: influenceLevel ?? 0.5,
            outputsCount: outputsCount ?? 1,
            data: null,
          },
        }, files);

        return await pollForResult(client, promptId);
      },
    },
  ];
}
