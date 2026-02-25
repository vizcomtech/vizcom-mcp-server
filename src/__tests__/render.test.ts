import { describe, it, expect, vi } from 'vitest';
import type { VizcomClient } from '../client.js';
import { renderTools } from '../tools/render.js';
import { generateTools } from '../tools/generate.js';

describe('render_sketch tool', () => {
  it('submits render prompt and polls for result', async () => {
    const mockClient = {
      mutationWithUpload: vi.fn().mockResolvedValueOnce({
        createPrompt: { prompt: { id: 'p-1' } },
      }),
      query: vi.fn().mockResolvedValueOnce({
        prompt: {
          id: 'p-1',
          status: 'completed',
          promptOutputs: {
            nodes: [{ id: 'o-1', imagePath: 'https://cdn.vizcom.ai/render.png' }],
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

describe('generate_image tool', () => {
  it('submits text-to-image prompt and polls for result', async () => {
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({
          createPrompt: { prompt: { id: 'p-2' } },
        })
        .mockResolvedValueOnce({
          prompt: {
            id: 'p-2',
            status: 'completed',
            promptOutputs: {
              nodes: [{ id: 'o-2', imagePath: 'https://cdn.vizcom.ai/gen.png' }],
            },
          },
        }),
    } as unknown as VizcomClient;

    const tools = generateTools(mockClient);
    const tool = tools.find((t) => t.name === 'generate_image')!;

    const result = await tool.handler({
      drawingId: 'd-1',
      prompt: 'Minimalist desk lamp concept',
    });

    expect(result).toHaveProperty('status', 'completed');
  });
});
