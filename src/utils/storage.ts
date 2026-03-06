import type { VizcomClient } from '../client.js';
import { QUERIES } from '../queries.js';

const STORAGE_CDN = 'https://storage.vizcom.ai';

export function toImageUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${STORAGE_CDN}/${path}`;
}

export async function fetchImageAsBase64(path: string): Promise<string> {
  const url = toImageUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

export async function fetchImageBuffer(path: string): Promise<Buffer> {
  const url = toImageUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function pollCdnForFile(
  path: string,
  intervalMs = 3000,
  maxAttempts = 80
): Promise<string> {
  const url = toImageUrl(path);
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) return url;
    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error(
    `File not available after ${(maxAttempts * intervalMs) / 1000}s. It may still be processing — try export_image or export_3d_model with the path later.`
  );
}

/**
 * Fetch the source image for a drawing server-side.
 * Returns the image buffer from the top visible layer (or thumbnail fallback).
 */
export async function fetchDrawingImageBuffer(
  client: VizcomClient,
  drawingId: string
): Promise<Buffer> {
  const data = await client.query<{
    drawing: {
      thumbnailPath: string | null;
      layers: {
        nodes: Array<{
          imagePath: string | null;
          visible: boolean;
        }>;
      };
    };
  }>(QUERIES.drawingById, { id: drawingId });

  const visibleLayer = data.drawing.layers.nodes.find(
    (l) => l.visible && l.imagePath
  );
  const imagePath = visibleLayer?.imagePath ?? data.drawing.thumbnailPath;

  if (!imagePath) {
    throw new Error(
      'Drawing has no image. Draw a sketch or import an image in the Vizcom UI first.'
    );
  }

  return fetchImageBuffer(imagePath);
}
