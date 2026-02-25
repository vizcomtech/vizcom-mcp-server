import { describe, it, expect, vi } from 'vitest';
import { pollForResult } from '../utils/polling.js';
import type { VizcomClient } from '../client.js';

describe('pollForResult', () => {
  it('returns immediately when prompt is already completed', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({
        prompt: {
          id: 'p-1',
          status: 'completed',
          promptOutputs: {
            nodes: [{ id: 'o-1', imagePath: 'https://cdn.vizcom.ai/image.png' }],
          },
        },
      }),
    } as unknown as VizcomClient;

    const result = await pollForResult(mockClient, 'p-1');
    expect(result.status).toBe('completed');
    expect(result.outputs[0].imagePath).toBe('https://cdn.vizcom.ai/image.png');
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it('polls multiple times until completed', async () => {
    const pending = {
      prompt: {
        id: 'p-1',
        status: 'pending',
        promptOutputs: { nodes: [] },
      },
    };
    const completed = {
      prompt: {
        id: 'p-1',
        status: 'completed',
        promptOutputs: {
          nodes: [{ id: 'o-1', imagePath: 'https://cdn.vizcom.ai/image.png' }],
        },
      },
    };

    const mockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(completed),
    } as unknown as VizcomClient;

    const result = await pollForResult(mockClient, 'p-1', {
      intervalMs: 10,
      maxAttempts: 5,
    });
    expect(result.status).toBe('completed');
    expect(mockClient.query).toHaveBeenCalledTimes(3);
  });

  it('throws on failure', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({
        prompt: {
          id: 'p-1',
          status: 'failed',
          promptOutputs: {
            nodes: [{ id: 'o-1', failureReason: 'Prompt blocked' }],
          },
        },
      }),
    } as unknown as VizcomClient;

    await expect(pollForResult(mockClient, 'p-1')).rejects.toThrow(
      'Prompt blocked'
    );
  });
});
