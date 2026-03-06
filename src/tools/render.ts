import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';
import { placeOutputAsDrawing } from '../utils/place-result.js';
import { fetchDrawingImageBuffer } from '../utils/storage.js';
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
Provide a drawingId and a text prompt describing the desired look.
The source image is fetched automatically from the drawing — you don't need to pass it.

Use influenceLevel to control how closely the output follows the sketch (0 = loose, 1 = strict).

A style is required. Common styles: "generalV2" (default, good for most things),
"realisticProduct_v2" (product design), "architectureRendering_v2" (architecture),
"carExterior_v2" / "carInterior_v2" (automotive). Use list_styles to see all options.

Results are placed as new drawings on the workbench. Use accept_result to apply
a result back onto the source drawing instead.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID containing the sketch to render'),
        prompt: z.string().describe('Description of the desired render'),
        sourceImageBase64: z.string().optional().describe('Base64-encoded sketch image (optional — omit to use the drawing\'s current image)'),
        style: z.enum(PUBLIC_STYLES).optional().default('generalV2').describe('Style preset (use list_styles to see all options)'),
        influenceLevel: z.number().min(0).max(1).optional().default(0.5).describe('How closely the output follows the sketch (0 = loose, 1 = strict)'),
        paletteInfluence: z.number().min(0).max(1).optional().default(1).describe('How strongly the style is applied (0 = subtle, 1 = full)'),
        outputsCount: z.number().min(1).max(4).optional().default(1).describe('Number of variations (1-4)'),
      }),
      handler: async ({
        drawingId,
        prompt,
        sourceImageBase64,
        style,
        influenceLevel,
        paletteInfluence,
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
            paletteInfluence: paletteInfluence ?? 1,
            outputsCount: outputsCount ?? 1,
            data: null,
          },
        }, files);

        const result = await pollForResult(client, promptId);

        const placed = [];
        for (const output of result.outputs) {
          const drawing = await placeOutputAsDrawing(client, drawingId as string, output);
          if (drawing) placed.push(drawing);
        }

        return { ...result, placedDrawings: placed };
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
