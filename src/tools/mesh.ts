import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { QUERIES } from '../queries.js';
import { toImageUrl, fetchDrawingImageBuffer, pollCdnForFile } from '../utils/storage.js';

interface LayerNode {
  id: string;
  name: string;
  visible: boolean;
  imagePath: string | null;
  meshPath: string | null;
  quadMeshPath: string | null;
  metadata3D: Record<string, unknown> | null;
  orderKey: string;
}

interface DrawingFull {
  id: string;
  name: string;
  width: number;
  height: number;
  workbenchId: string;
  layers: { nodes: LayerNode[] };
}

const QUALITY_MAP = {
  basic: 'BASIC',
  detailed_sharp: 'HIGH_0',
  detailed_smooth: 'HIGH_1',
  max: 'HIGH_2',
} as const;

function poll3dStatus(
  client: VizcomClient,
  drawingId: string,
  layerId: string,
  intervalMs = 3000,
  maxAttempts = 120
): Promise<{ meshPath: string; quadMeshPath: string | null; metadata3D: Record<string, unknown> | null }> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const check = async () => {
      attempt++;
      try {
        const data = await client.query<{ drawing: DrawingFull }>(
          QUERIES.drawingByIdFull,
          { id: drawingId }
        );

        const layer = data.drawing.layers.nodes.find((l) => l.id === layerId);
        if (!layer) {
          reject(new Error(`Layer ${layerId} not found on drawing ${drawingId}`));
          return;
        }

        const meta = layer.metadata3D as Record<string, unknown> | null;

        if (meta?.generatedFrom2dTo3dError) {
          reject(new Error(`3D generation failed: ${meta.generatedFrom2dTo3dError}`));
          return;
        }

        if (layer.meshPath) {
          resolve({
            meshPath: layer.meshPath,
            quadMeshPath: layer.quadMeshPath,
            metadata3D: meta,
          });
          return;
        }

        if (attempt >= maxAttempts) {
          reject(new Error(`3D generation timed out after ${(maxAttempts * intervalMs) / 1000}s. Layer ID: ${layerId}`));
          return;
        }

        setTimeout(check, intervalMs);
      } catch (err) {
        reject(err);
      }
    };

    check();
  });
}

export function meshTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'generate_3d_model',
      description: `Generate a 3D model from a drawing's image using AI.
The source image is fetched automatically from the drawing.

Quality levels:
- "basic" — Fast, lower detail (Hunyuan basic or Partcrafter for parts)
- "detailed_sharp" — High detail with sharp edges (Tripo v3)
- "detailed_smooth" — High detail with smooth surfaces (Rodin, falls back to Tripo)
- "max" — Maximum quality (Hunyuan v3, supports multi-view)

Basic quality costs 1 credit. Higher qualities cost HD 3D credits.
Returns the mesh CDN URL once generation completes (may take 1-5 minutes).`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID containing the source image'),
        quality: z
          .enum(['basic', 'detailed_sharp', 'detailed_smooth', 'max'])
          .optional()
          .default('basic')
          .describe('Quality level (default: "basic")'),
        meshDetail: z
          .enum(['low_poly', 'balanced', 'highest'])
          .optional()
          .default('balanced')
          .describe('Mesh polygon density (default: "balanced")'),
        textureMode: z
          .enum(['none', 'standard', 'hd'])
          .optional()
          .default('standard')
          .describe('Texture quality (default: "standard")'),
        quadTopology: z
          .boolean()
          .optional()
          .default(false)
          .describe('Generate quad-topology mesh instead of triangles (default: false)'),
      }),
      handler: async ({ drawingId, quality, meshDetail, textureMode, quadTopology }) => {
        const qualityType = QUALITY_MAP[(quality as keyof typeof QUALITY_MAP) ?? 'basic'];
        const layerId = randomUUID();

        // Get drawing info (workbenchId) and source image
        const [drawingData, sourceBuffer] = await Promise.all([
          client.query<{ drawing: DrawingFull }>(
            QUERIES.drawingByIdFull,
            { id: drawingId }
          ),
          fetchDrawingImageBuffer(client, drawingId as string),
        ]);

        const workbenchId = drawingData.drawing.workbenchId;

        const meshDetailEnum = {
          low_poly: 'LOW_POLY',
          balanced: 'BALANCED',
          highest: 'HIGHEST',
        }[(meshDetail as string) ?? 'balanced'];

        const textureModeEnum = {
          none: 'NONE',
          standard: 'STANDARD',
          hd: 'HD',
        }[(textureMode as string) ?? 'standard'];

        const files = new Map<string, { buffer: Buffer; filename: string; mimetype: string }>();
        files.set('variables.input.sourceImages.0', {
          buffer: sourceBuffer,
          filename: 'source.png',
          mimetype: 'image/png',
        });

        await client.mutationWithUpload<{
          createLayer3dFromDrawing: {
            drawing: { id: string };
            usageData: unknown;
          };
        }>(QUERIES.CreateLayer3dFromDrawing, {
          input: {
            drawingId,
            workbenchId,
            qualityType,
            sourceImages: [null],
            layer: {
              id: layerId,
              name: '3D Model',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              fill: null,
              orderKey: 'a0',
              x: 0,
              y: 0,
              width: drawingData.drawing.width,
              height: drawingData.drawing.height,
            },
            config: {
              meshDetail: meshDetailEnum,
              quadTopology: quadTopology ?? false,
              textureMode: textureModeEnum,
            },
          },
        }, files);

        // Poll for completion
        const result = await poll3dStatus(client, drawingId as string, layerId);

        return {
          drawingId,
          layerId,
          meshUrl: toImageUrl(result.meshPath),
          meshPath: result.meshPath,
          quadMeshUrl: result.quadMeshPath ? toImageUrl(result.quadMeshPath) : null,
          quadMeshPath: result.quadMeshPath,
          metadata: result.metadata3D,
        };
      },
    },
    {
      name: 'get_3d_status',
      description: `Check the status of a 3D model generation on a drawing.
Returns all layers that have 3D generation in progress or completed.
Use this to check on a generate_3d_model that timed out, or to find
existing 3D models on a drawing.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to check'),
      }),
      handler: async ({ drawingId }) => {
        const data = await client.query<{ drawing: DrawingFull }>(
          QUERIES.drawingByIdFull,
          { id: drawingId }
        );

        const meshLayers = data.drawing.layers.nodes
          .filter((l) => {
            const meta = l.metadata3D as Record<string, unknown> | null;
            return l.meshPath || meta?.generatedFrom2dTo3d;
          })
          .map((l) => {
            const meta = l.metadata3D as Record<string, unknown> | null;
            const error = meta?.generatedFrom2dTo3dError as string | undefined;
            const progress = meta?.generationProgress as number | undefined;

            let status: string;
            if (error) status = 'failed';
            else if (l.meshPath) status = 'completed';
            else if (progress !== undefined) status = `processing (${progress}%)`;
            else status = 'processing';

            return {
              layerId: l.id,
              name: l.name,
              status,
              meshUrl: l.meshPath ? toImageUrl(l.meshPath) : null,
              meshPath: l.meshPath,
              quadMeshUrl: l.quadMeshPath ? toImageUrl(l.quadMeshPath) : null,
              error: error ?? null,
              materialMode: meta?.materialMode ?? null,
            };
          });

        if (meshLayers.length === 0) {
          return { drawingId, message: 'No 3D models found on this drawing.', layers: [] };
        }

        return { drawingId, layers: meshLayers };
      },
    },
    {
      name: 'export_3d_model',
      description: `Get the full CDN URL for a 3D model file.
Pass the meshPath from a generate_3d_model or get_3d_status result.
The URL can be used to download the GLB/FBX file directly.`,
      inputSchema: z.object({
        meshPath: z.string().describe('Mesh storage path from a 3D generation result'),
      }),
      handler: async ({ meshPath }) => {
        return {
          url: toImageUrl(meshPath as string),
          meshPath,
          format: (meshPath as string).split('.').pop() ?? 'glb',
        };
      },
    },
    {
      name: 'convert_mesh_format',
      description: `Convert a 3D model to a different file format.
Pass the meshPath from a generate_3d_model or get_3d_status result.
Supported output formats: FBX, OBJ, STL (3D printing), USDZ (Apple AR).
Returns the CDN URL of the converted file once ready.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID (for authorization)'),
        meshPath: z.string().describe('Source mesh storage path from a 3D generation result'),
        outputFormat: z
          .enum(['FBX', 'OBJ', 'STL', 'USDZ'])
          .describe('Target format'),
        quadTopology: z
          .boolean()
          .optional()
          .default(false)
          .describe('Use quad topology in the output (default: false)'),
      }),
      handler: async ({ drawingId, meshPath, outputFormat, quadTopology }) => {
        const mailboxId = randomUUID();

        const data = await client.query<{
          MeshConversion: {
            jobId: string;
          };
        }>(QUERIES.MeshConversion, {
          input: {
            id: drawingId,
            meshPath,
            mailboxId,
            outputFormat,
            useQuadTopology: quadTopology ?? false,
          },
        });

        const jobId = data.MeshConversion.jobId;

        const extMap: Record<string, string> = {
          FBX: '.fbx',
          OBJ: '.obj',
          STL: '.stl',
          USDZ: '.usdz',
        };
        const ext = extMap[(outputFormat as string)] ?? '.fbx';
        const outputPath = `meshConvert/${jobId}${ext}`;

        const url = await pollCdnForFile(outputPath);

        return {
          jobId,
          url,
          outputPath,
          format: outputFormat,
        };
      },
    },
  ];
}
