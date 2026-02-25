import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';

const CREATE_EDIT_PROMPT = `
  mutation CreateEditPrompt($input: CreateEditPromptInput!) {
    createEditPrompt(input: $input) {
      prompt { id }
      usageData { left used planLimit }
    }
  }
`;

export function modifyTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'modify_image',
      description: `Modify an existing image using AI. Describe the changes you want in the prompt.
Optionally provide a mask (base64 PNG where white = area to change) for targeted edits.
Supports "standard" and "pro" quality modes (pro requires a paid plan).
This is Vizcom's most-used feature — use it for iterating on designs.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to modify'),
        prompt: z.string().describe('Description of the changes to make'),
        sourceImageBase64: z.string().describe('Base64-encoded source image (PNG/JPEG)'),
        maskBase64: z.string().optional().describe('Base64-encoded mask image (white = area to change)'),
        qualityMode: z.enum(['standard', 'pro']).optional().default('standard').describe('Quality mode: "standard" or "pro" (pro requires paid plan)'),
        outputsCount: z.number().min(1).max(4).optional().default(1).describe('Number of variations to generate (1-4)'),
      }),
      handler: async ({
        drawingId,
        prompt,
        sourceImageBase64,
        maskBase64,
        qualityMode,
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

        const variables: Record<string, unknown> = {
          input: {
            id: promptId,
            drawingId,
            prompt,
            outputsCount: outputsCount ?? 1,
            qualityMode: qualityMode ?? 'standard',
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
        }>(CREATE_EDIT_PROMPT, variables, files);

        return await pollForResult(client, promptId);
      },
    },
  ];
}
