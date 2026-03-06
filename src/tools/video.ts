import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { QUERIES } from '../queries.js';
import { toImageUrl } from '../utils/storage.js';

const ANIMATE_TYPES = ['standard', 'standard_v2', 'turbo', 'turbo_v2', 'turntable'] as const;

interface VideoNode {
  id: string;
  videoPath: string;
  name: string | null;
  prompt: string | null;
  model: string | null;
  sourceImagePath: string | null;
}

interface PlaceholderNode {
  id: string;
  type: string | null;
  failureReason: string | null;
  loadingDuration: number | null;
}

interface WorkbenchData {
  workbench: {
    id: string;
    videos: { nodes: VideoNode[] };
    placeholders: { nodes: PlaceholderNode[] };
  };
}

function pollForVideo(
  client: VizcomClient,
  workbenchId: string,
  placeholderId: string,
  intervalMs = 5000,
  maxAttempts = 180
): Promise<VideoNode> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const check = async () => {
      attempt++;
      try {
        const data = await client.query<WorkbenchData>(
          QUERIES.workbenchContent,
          { id: workbenchId }
        );

        // Check if placeholder failed
        const placeholder = data.workbench.placeholders.nodes.find(
          (p) => p.id === placeholderId
        );
        if (placeholder?.failureReason) {
          reject(new Error(`Video generation failed: ${placeholder.failureReason}`));
          return;
        }

        // Check if video appeared (placeholder is replaced by video with same ID)
        const video = data.workbench.videos.nodes.find(
          (v) => v.id === placeholderId
        );
        if (video?.videoPath) {
          resolve(video);
          return;
        }

        if (attempt >= maxAttempts) {
          reject(
            new Error(
              `Video generation timed out after ${(maxAttempts * intervalMs) / 1000}s. The video may still be processing — check the workbench later.`
            )
          );
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

export function videoTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'generate_video',
      description: `Generate a video from a drawing's image using AI.

Model options:
- "standard" — Kling v1.6, high quality (~5 min)
- "standard_v2" — Kling v2.5 turbo, good quality (~1 min)
- "turbo" — VEO2, fast high quality (~1 min)
- "turbo_v2" — VEO3, fastest high quality (~45s)
- "turntable" — PixVerse 360° turntable rotation (~1 min)

Duration: 5 or 10 seconds (free plans limited to 5s).
Returns the video CDN URL once generation completes.`,
      inputSchema: z.object({
        drawingId: z
          .string()
          .uuid()
          .describe('Drawing ID containing the source image'),
        prompt: z
          .string()
          .optional()
          .default('')
          .describe('Description of the desired animation/motion'),
        model: z
          .enum(ANIMATE_TYPES)
          .optional()
          .default('standard_v2')
          .describe('Animation model (default: "standard_v2")'),
        duration: z
          .number()
          .min(5)
          .max(10)
          .optional()
          .default(5)
          .describe('Video duration in seconds: 5 or 10 (default: 5)'),
      }),
      handler: async ({ drawingId, prompt, model, duration }) => {
        // Get drawing info to find workbenchId and dimensions
        const drawingData = await client.query<{
          drawing: {
            id: string;
            name: string;
            workbenchId: string;
            width: number;
            height: number;
          };
        }>(QUERIES.drawingByIdFull, { id: drawingId });

        const { workbenchId, width, height } = drawingData.drawing;
        const animateId = randomUUID();
        const placeholderId = randomUUID();

        const animateType = (model as string ?? 'standard_v2').toUpperCase();

        // Step 1: Create the animate element
        await client.query(QUERIES.CreateWorkbenchElementAnimate, {
          input: {
            workbenchElementAnimate: {
              id: animateId,
              workbenchId,
              sourceDrawingId: drawingId,
              prompt: prompt ?? '',
              duration: duration ?? 5,
              animateType,
              x: 0,
              y: 0,
              width,
              height,
              zIndex: 100,
            },
          },
        });

        // Step 2: Trigger the animation
        await client.query(QUERIES.TriggerWorkbenchElementAnimate, {
          input: {
            id: animateId,
            placeholder: {
              id: placeholderId,
              type: 'video',
              workbenchId,
              x: 0,
              y: 0,
              width,
              height,
              zIndex: 101,
            },
            animateV1NoPromptExpansion: false,
          },
        });

        // Step 3: Poll for the video to appear
        const video = await pollForVideo(client, workbenchId, placeholderId);

        return {
          drawingId,
          videoId: video.id,
          videoUrl: toImageUrl(video.videoPath),
          videoPath: video.videoPath,
          prompt: video.prompt,
          model: video.model,
        };
      },
    },
  ];
}
