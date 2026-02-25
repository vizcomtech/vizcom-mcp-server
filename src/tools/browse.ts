import { z } from 'zod';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';

export function browseTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'get_current_user',
      description: 'Get the authenticated user and their organizations.',
      inputSchema: z.object({}),
      handler: async () => {
        const data = await client.query<{
          viewer: {
            id: string;
            email: string;
            name: string;
            organizations: {
              nodes: Array<{ id: string; name: string }>;
            };
          };
        }>(`query { viewer { id email name organizations { nodes { id name } } } }`);
        return data.viewer;
      },
    },
    {
      name: 'list_teams',
      description: 'List teams in the current organization.',
      inputSchema: z.object({}),
      handler: async () => {
        const data = await client.query<{
          teams: {
            nodes: Array<{
              id: string;
              name: string;
              rootFolder: { id: string } | null;
            }>;
          };
        }>(`query { teams { nodes { id name rootFolder { id } } } }`);
        return data.teams.nodes;
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
        const data = await client.query<{
          folder: {
            id: string;
            name: string;
            childFolders: {
              nodes: Array<{ id: string; name: string }>;
            };
            workbenches: {
              nodes: Array<{
                id: string;
                name: string;
                updatedAt: string;
              }>;
            };
          };
        }>(
          `query ListFolders($id: UUID!) {
            folder(id: $id) {
              id name
              childFolders { nodes { id name } }
              workbenches(orderBy: UPDATED_AT_DESC) { nodes { id name updatedAt } }
            }
          }`,
          { id: folderId }
        );
        return data.folder;
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
              nodes: Array<{ id: string; name: string; width: number; height: number }>;
            };
          };
        }>(
          `query GetWorkbench($id: UUID!) {
            workbench(id: $id) {
              id name createdAt updatedAt
              drawings { nodes { id name width height } }
            }
          }`,
          { id: workbenchId }
        );
        return data.workbench;
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
                prompt: string;
                status: string;
                imageInferenceType: string;
                createdAt: string;
              }>;
            };
          };
        }>(
          `query GetDrawing($id: UUID!) {
            drawing(id: $id) {
              id name width height
              layers { nodes { id name imagePath visible } }
              prompts(first: 10, orderBy: CREATED_AT_DESC) {
                nodes { id prompt status imageInferenceType createdAt }
              }
            }
          }`,
          { id: drawingId }
        );
        return data.drawing;
      },
    },
  ];
}
