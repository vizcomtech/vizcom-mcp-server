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
        'List subfolders and workbenches within a folder. Use the root folder ID from list_teams to start browsing.',
      inputSchema: z.object({
        folderId: z.string().uuid().describe('Folder ID to browse'),
      }),
      handler: async ({ folderId }) => {
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
        return {
          id: folderData.folder.id,
          name: folderData.folder.name,
          childFolders: folderData.folder.childFolders.nodes,
          workbenches: wbData.workbenches.nodes,
        };
      },
    },
    {
      name: 'get_workbench',
      description: 'Get workbench details including its drawings.',
      inputSchema: z.object({
        workbenchId: z.string().uuid().describe('Workbench ID'),
      }),
      handler: async ({ workbenchId }) => {
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
        return {
          id: wb.id,
          name: wb.name,
          createdAt: wb.createdAt,
          updatedAt: wb.updatedAt,
          drawings: wb.drawings.nodes.map((d) => ({
            id: d.id,
            name: d.name,
            width: d.drawingWidth,
            height: d.drawingHeight,
          })),
        };
      },
    },
    {
      name: 'get_drawing',
      description:
        'Get a drawing with its layers and recent generation history.',
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID'),
      }),
      handler: async ({ drawingId }) => {
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
        return data.drawing;
      },
    },
  ];
}
