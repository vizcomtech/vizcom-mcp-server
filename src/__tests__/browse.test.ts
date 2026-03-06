import { describe, it, expect, vi } from 'vitest';
import type { VizcomClient } from '../client.js';
import { browseTools } from '../tools/browse.js';

describe('browseTools', () => {
  it('get_current_user returns user with organizations', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({
        currentUser: {
          id: 'u-1',
          email: 'test@example.com',
          name: 'Test',
          organizations: {
            edges: [{ node: { id: 'org-1', name: 'My Org' } }],
          },
        },
      }),
    } as unknown as VizcomClient;

    const tools = browseTools(client);
    const tool = tools.find((t) => t.name === 'get_current_user')!;
    const result = await tool.handler({});

    expect(result).toHaveProperty('id', 'u-1');
    expect(result).toHaveProperty('organizations');
  });

  it('list_folders returns folder contents', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({
          folder: {
            id: 'f-1',
            name: 'Root',
            childFolders: { nodes: [{ id: 'f-2', name: 'Subfolder' }] },
          },
        })
        .mockResolvedValueOnce({
          workbenches: { nodes: [{ id: 'w-1', name: 'My Workbench' }] },
        }),
    } as unknown as VizcomClient;

    const tools = browseTools(client);
    const tool = tools.find((t) => t.name === 'list_folders')!;
    const result = await tool.handler({ folderId: 'f-1' });

    expect(result).toHaveProperty('childFolders');
    expect(result).toHaveProperty('workbenches');
  });
});
