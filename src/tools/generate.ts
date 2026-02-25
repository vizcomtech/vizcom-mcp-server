import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';
import { QUERIES } from '../queries.js';

export function generateTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'generate_image',
      description: `Generate an image from a text prompt alone — no source sketch needed.
Use this for early ideation and concept exploration.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to generate into'),
        prompt: z.string().describe('Text description of the image to generate'),
        outputsCount: z.number().min(1).max(4).optional().default(1).describe('Number of variations (1-4)'),
      }),
      handler: async ({ drawingId, prompt, outputsCount }) => {
        const promptId = randomUUID();

        await client.query<{
          createPrompt: { prompt: { id: string } };
        }>(QUERIES.CreatePrompt, {
          input: {
            id: promptId,
            drawingId,
            prompt,
            imageInferenceType: 'RAW_GENERATION',
            outputsCount: outputsCount ?? 1,
            sourceImageInfluence: 0,
          },
        });

        return await pollForResult(client, promptId);
      },
    },
  ];
}
