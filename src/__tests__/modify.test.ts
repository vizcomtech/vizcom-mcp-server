import { describe, it, expect, vi } from 'vitest';
import type { VizcomClient } from '../client.js';
import { modifyTools } from '../tools/modify.js';

describe('modify_image tool', () => {
  it('submits edit prompt and polls for result', async () => {
    const mockClient = {
      mutationWithUpload: vi.fn().mockResolvedValueOnce({
        createEditPrompt: {
          prompt: { id: 'p-1' },
        },
      }),
      query: vi.fn().mockResolvedValueOnce({
        prompt: {
          id: 'p-1',
          status: 'completed',
          promptOutputs: {
            nodes: [{ id: 'o-1', imagePath: 'https://cdn.vizcom.ai/result.png' }],
          },
        },
      }),
    } as unknown as VizcomClient;

    const tools = modifyTools(mockClient);
    const tool = tools.find((t) => t.name === 'modify_image')!;

    const result = await tool.handler({
      drawingId: 'd-1',
      prompt: 'Make the handle more ergonomic',
      sourceImageBase64: 'iVBORw0KGgo=',
      outputsCount: 1,
    });

    expect(mockClient.mutationWithUpload).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('status', 'completed');
  });
});
