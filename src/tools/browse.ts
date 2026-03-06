import { z } from 'zod';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { QUERIES } from '../queries.js';

export function browseTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'get_current_user',
      description: 'Get the authenticated user and their organizations.',
      inputSchema: z.object({}),
      handler: async () => {
        const data = await client.query<{
          currentUser: {
            id: string;
            email: string;
            name: string;
            organizations: {
              edges: Array<{ node: { id: string; name: string } }>;
            };
          };
        }>(QUERIES.currentUser);
        const user = data.currentUser;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizations: user.organizations.edges.map((e) => e.node),
        };
      },
    },
    {
      name: 'list_teams',
      description: 'List teams in the current organization.',
      inputSchema: z.object({}),
      handler: async () => {
        const data = await client.query<{
          organization: {
            teams: {
              nodes: Array<{
                id: string;
                name: string;
                rootFolder: { id: string } | null;
              }>;
            };
          };
        }>(QUERIES.organizationTeams, { id: client.organizationId });
        return data.organization.teams.nodes;
      },
    },
    {
      name: 'list_folders',
      description:
        'List subfolders and workbenches within a folder. Use the root folder ID from list_teams to start browsing. Results are sorted by most recently updated. Use offset to paginate.',
      inputSchema: z.object({
        folderId: z.string().uuid().describe('Folder ID to browse'),
        limit: z.number().min(1).max(50).optional().default(10).describe('Max results to return (default 10, max 50)'),
        offset: z.number().min(0).optional().default(0).describe('Number of results to skip (for pagination)'),
      }),
      handler: async ({ folderId, limit, offset }) => {
        const maxItems = (limit as number) ?? 10;
        const skip = (offset as number) ?? 0;

        const [folderData, wbData] = await Promise.all([
          client.query<{
            folder: {
              id: string;
              name: string;
              childFolders: {
                nodes: Array<{ id: string; name: string }>;
              };
            };
          }>(QUERIES.folder, { id: folderId }),
          client.query<{
            workbenches: {
              nodes: Array<{
                id: string;
                name: string;
                updatedAt: string;
              }>;
            };
          }>(QUERIES.workbenchesByFolderId, { id: folderId }),
        ]);

        const allWorkbenches = wbData.workbenches.nodes;
        const paged = allWorkbenches.slice(skip, skip + maxItems);

        return {
          id: folderData.folder.id,
          name: folderData.folder.name,
          childFolders: folderData.folder.childFolders.nodes,
          workbenches: paged,
          total: allWorkbenches.length,
          showing: `${skip + 1}-${Math.min(skip + maxItems, allWorkbenches.length)} of ${allWorkbenches.length}`,
        };
      },
    },
    {
      name: 'get_workbench',
      description: 'Get workbench details including its drawings. Results are paginated — use offset to see more.',
      inputSchema: z.object({
        workbenchId: z.string().uuid().describe('Workbench ID'),
        limit: z.number().min(1).max(50).optional().default(20).describe('Max drawings to return (default 20, max 50)'),
        offset: z.number().min(0).optional().default(0).describe('Number of drawings to skip (for pagination)'),
      }),
      handler: async ({ workbenchId, limit, offset }) => {
        const maxItems = (limit as number) ?? 20;
        const skip = (offset as number) ?? 0;

        const data = await client.query<{
          workbench: {
            id: string;
            name: string;
            createdAt: string;
            updatedAt: string;
            drawings: {
              nodes: Array<{
                id: string;
                name: string;
                drawingWidth: number;
                drawingHeight: number;
              }>;
            };
          };
        }>(QUERIES.workbenchContent, { id: workbenchId });

        const wb = data.workbench;
        const allDrawings = wb.drawings.nodes;
        const paged = allDrawings.slice(skip, skip + maxItems);

        return {
          id: wb.id,
          name: wb.name,
          createdAt: wb.createdAt,
          updatedAt: wb.updatedAt,
          drawings: paged.map((d) => ({
            id: d.id,
            name: d.name,
            width: d.drawingWidth,
            height: d.drawingHeight,
          })),
          totalDrawings: allDrawings.length,
          showing: `${skip + 1}-${Math.min(skip + maxItems, allDrawings.length)} of ${allDrawings.length}`,
        };
      },
    },
    {
      name: 'get_drawing',
      description:
        'Get a drawing with its layers and recent generation history.',
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID'),
        historyLimit: z.number().min(1).max(20).optional().default(5).describe('Max generation history entries to return (default 5)'),
      }),
      handler: async ({ drawingId, historyLimit }) => {
        const maxHistory = (historyLimit as number) ?? 5;

        const data = await client.query<{
          drawing: {
            id: string;
            name: string;
            width: number;
            height: number;
            layers: {
              nodes: Array<{
                id: string;
                name: string;
                imagePath: string | null;
                visible: boolean;
              }>;
            };
            prompts: {
              nodes: Array<{
                id: string;
                text: string;
                imageInferenceType: string;
                createdAt: string;
                outputs: {
                  nodes: Array<{
                    id: string;
                    imagePath: string | null;
                    failureReason: string | null;
                  }>;
                };
              }>;
            };
          };
        }>(QUERIES.drawingById, { id: drawingId });

        const drawing = data.drawing;
        return {
          ...drawing,
          prompts: {
            nodes: drawing.prompts.nodes.slice(0, maxHistory),
            total: drawing.prompts.nodes.length,
          },
        };
      },
    },
  ];
}
