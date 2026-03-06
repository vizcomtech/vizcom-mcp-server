import { describe, it, expect, vi } from 'vitest';
import type { VizcomClient } from '../client.js';
import { renderTools } from '../tools/render.js';

describe('render_sketch tool', () => {
  it('submits render prompt and polls for result', async () => {
    const mockClient = {
      mutationWithUpload: vi.fn()
        // createPrompt
        .mockResolvedValueOnce({ createPrompt: { prompt: { id: 'p-1' } } })
        // placeOutputAsDrawing: createDrawings
        .mockResolvedValueOnce({ createDrawings: { drawings: [{ id: 'd-2', name: 'Render' }] } }),
      query: vi.fn()
        // pollForResult
        .mockResolvedValueOnce({
          prompt: {
            id: 'p-1',
            outputs: {
              nodes: [{ id: 'o-1', imagePath: 'renders/render.png', failureReason: null }],
            },
          },
        })
        // placeOutputAsDrawing: get workbenchId
        .mockResolvedValueOnce({
          drawing: { workbenchId: 'wb-1' },
        }),
    } as unknown as VizcomClient;

    // Mock fetch for fetchImageBuffer in placeOutputAsDrawing
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const tools = renderTools(mockClient);
    const tool = tools.find((t) => t.name === 'render_sketch')!;

    const result = await tool.handler({
      drawingId: 'd-1',
      prompt: 'Modern desk lamp, white ceramic',
      sourceImageBase64: 'iVBORw0KGgo=',
    });

    expect(result).toHaveProperty('status', 'completed');
  });
});
