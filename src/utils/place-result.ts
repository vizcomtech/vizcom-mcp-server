import type { VizcomClient } from '../client.js';
import { QUERIES } from '../queries.js';
import { fetchImageBuffer } from './storage.js';
import { toImageUrl } from './storage.js';

interface PlacedDrawing {
  drawingId: string;
  name: string;
  imageUrl: string;
}

export async function placeOutputAsDrawing(
  client: VizcomClient,
  drawingId: string,
  output: { imagePath: string | null; imageUrl: string | null }
): Promise<PlacedDrawing | null> {
  if (!output.imagePath) return null;

  // Get the workbench ID from the source drawing
  const data = await client.query<{
    drawing: { workbenchId: string };
  }>(QUERIES.drawingById, { id: drawingId });

  const workbenchId = data.drawing.workbenchId;
  const imageBuffer = await fetchImageBuffer(output.imagePath);

  const files = new Map<string, { buffer: Buffer; filename: string; mimetype: string }>();
  files.set('variables.input.0.image', {
    buffer: imageBuffer,
    filename: 'result.png',
    mimetype: 'image/png',
  });

  const result = await client.mutationWithUpload<{
    createDrawings: {
      drawings: Array<{ id: string; name: string }>;
    };
  }>(QUERIES.CreateDrawings, {
    input: [{
      workbenchId,
      width: 1024,
      height: 1024,
      backgroundColor: '#FFFFFF',
      backgroundVisible: true,
      image: null,
    }],
  }, files);

  const drawing = result.createDrawings.drawings[0];
  return {
    drawingId: drawing.id,
    name: drawing.name,
    imageUrl: toImageUrl(output.imagePath),
  };
}
