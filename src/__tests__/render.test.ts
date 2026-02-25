import { describe, it, expect, vi } from 'vitest';
import type { VizcomClient } from '../client.js';
import { renderTools } from '../tools/render.js';

describe('render_sketch tool', () => {
  it('submits render prompt and polls for result', async () => {
    const mockClient = {
      mutationWithUpload: vi.fn().mockResolvedValueOnce({
        createPrompt: { prompt: { id: 'p-1' } },
      }),
      query: vi.fn().mockResolvedValueOnce({
        prompt: {
          id: 'p-1',
          outputs: {
            nodes: [{ id: 'o-1', imagePath: 'https://cdn.vizcom.ai/render.png', failureReason: null }],
          },
        },
      }),
    } as unknown as VizcomClient;

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
