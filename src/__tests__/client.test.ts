import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VizcomClient } from '../client.js';

describe('VizcomClient', () => {
  let client: VizcomClient;

  beforeEach(() => {
    client = new VizcomClient({
      apiUrl: 'https://app.vizcom.com/api/v1',
      authToken: 'test-token',
      organizationId: 'test-org-id',
    });
  });

  it('sends GraphQL queries with auth headers', async () => {
    const mockResponse = { data: { viewer: { id: '123' } } };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      text: async () => JSON.stringify(mockResponse),
      status: 200,
    } as Response);

    const result = await client.query<{ viewer: { id: string } }>(
      'query { viewer { id } }'
    );

    expect(result.viewer.id).toBe('123');
    expect(fetch).toHaveBeenCalledWith(
      'https://app.vizcom.com/api/v1/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'x-organization-id': 'test-org-id',
        }),
      })
    );
  });

  it('throws on GraphQL errors', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      text: async () => JSON.stringify({
        errors: [{ message: 'Not authorized' }],
      }),
      status: 200,
    } as Response);

    await expect(client.query('query { viewer { id } }')).rejects.toThrow(
      'Not authorized'
    );
  });
});
