import { describe, it, expect, vi } from 'vitest';
import type { VizcomClient } from '../client.js';
import { modifyTools } from '../tools/modify.js';

describe('modify_image tool', () => {
  it('submits edit prompt and polls for result', async () => {
    const mockClient = {
      mutationWithUpload: vi.fn().mockResolvedValue({
        createEditPrompt: { prompt: { id: 'p-1' } },
      }),
      query: vi.fn()
        // pollForResult call
        .mockResolvedValueOnce({
          prompt: {
            id: 'p-1',
            outputs: {
              nodes: [{ id: 'o-1', imagePath: 'renders/result.png', failureReason: null }],
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

    // Mock mutationWithUpload for createDrawings in placeOutputAsDrawing
    mockClient.mutationWithUpload = vi.fn()
      .mockResolvedValueOnce({ createEditPrompt: { prompt: { id: 'p-1' } } })
      .mockResolvedValueOnce({ createDrawings: { drawings: [{ id: 'd-2', name: 'Result' }] } });

    const tools = modifyTools(mockClient);
    const tool = tools.find((t) => t.name === 'modify_image')!;

    const result = await tool.handler({
      drawingId: 'd-1',
      prompt: 'Make the handle more ergonomic',
      sourceImageBase64: 'iVBORw0KGgo=',
      outputsCount: 1,
    });

    expect(result).toHaveProperty('status', 'completed');
  });
});
