import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';
import { QUERIES } from '../queries.js';

const PUBLIC_STYLES = [
  'generalV2',
  'technicolor_v2',
  'cybercel_v2',
  'volume_v2',
  'pastel',
  'wireframe_v2',
  'pdSketchColor_v2',
  'lineart_v2',
  'realisticProduct_v2',
  'surfaceSculpt',
  'carShading_v2',
  'carExterior_v2',
  'carInterior_v2',
  'carInteriorSketch_v2',
  'carDesignRender_v2',
  'architectureRendering_v2',
] as const;

export function renderTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'render_sketch',
      description: `Turn a sketch into a photorealistic rendered visualization.
Provide a source sketch image and a text prompt describing the desired look.
Use influenceLevel to control how closely the output follows the sketch (0 = loose, 1 = strict).

A style is required. Common styles: "generalV2" (default, good for most things),
"realisticProduct_v2" (product design), "architectureRendering_v2" (architecture),
"carExterior_v2" / "carInterior_v2" (automotive). Use list_styles to see all options.

IMPORTANT: A source image is always required. Start with a sketch or photo in Vizcom,
then use this tool to render it into a realistic visualization.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to render into'),
        prompt: z.string().describe('Description of the desired render'),
        sourceImageBase64: z.string().describe('Base64-encoded sketch image (PNG/JPEG)'),
        style: z.string().optional().default('generalV2').describe('Style preset (e.g. "generalV2", "realisticProduct_v2", "carExterior_v2")'),
        influenceLevel: z.number().min(0).max(1).optional().default(0.5).describe('How closely the output follows the sketch (0-1)'),
        outputsCount: z.number().min(1).max(4).optional().default(1).describe('Number of variations (1-4)'),
      }),
      handler: async ({
        drawingId,
        prompt,
        sourceImageBase64,
        style,
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
            publicPaletteId: style ?? 'generalV2',
            sourceImageInfluence: influenceLevel ?? 0.5,
            outputsCount: outputsCount ?? 1,
            data: null,
          },
        }, files);

        return await pollForResult(client, promptId);
      },
    },
    {
      name: 'list_styles',
      description: 'List available rendering styles for the render_sketch tool.',
      inputSchema: z.object({}),
      handler: async () => {
        return {
          styles: PUBLIC_STYLES,
          recommended: 'generalV2',
          categories: {
            general: ['generalV2', 'technicolor_v2', 'cybercel_v2', 'volume_v2', 'pastel'],
            product: ['realisticProduct_v2', 'surfaceSculpt'],
            sketch: ['wireframe_v2', 'pdSketchColor_v2', 'lineart_v2'],
            automotive: ['carShading_v2', 'carExterior_v2', 'carInterior_v2', 'carInteriorSketch_v2', 'carDesignRender_v2'],
            architecture: ['architectureRendering_v2'],
          },
        };
      },
    },
  ];
}
