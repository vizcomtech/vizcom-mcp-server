# Vizcom MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone npm package that exposes Vizcom's creative workflow to LLM agents via MCP.

**Architecture:** Stdio-based MCP server that authenticates with the Vizcom GraphQL API using JWT tokens obtained via email/password login. Tools call GraphQL mutations over HTTP and poll for async results. No Vizcom backend changes required.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod`, Node.js `fetch`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.ts`

**Step 1: Initialize package.json**

```json
{
  "name": "@vizcom/mcp-server",
  "version": "0.1.0",
  "private": false,
  "description": "MCP server for Vizcom — exposes AI design tools to LLM agents",
  "type": "module",
  "bin": {
    "vizcom-mcp-server": "dist/index.js"
  },
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "login": "tsx src/auth/login.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
.env
*.tgz
```

**Step 4: Create minimal entry point**

Create `src/index.ts`:

```typescript
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function main() {
  const server = new McpServer({
    name: 'vizcom',
    version: '0.1.0',
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Vizcom MCP server running');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

**Step 5: Install dependencies and verify it builds**

Run: `pnpm install && pnpm build`
Expected: Compiles to `dist/` with no errors

**Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore src/index.ts pnpm-lock.yaml
git commit -m "feat: scaffold MCP server project"
```

---

### Task 2: GraphQL Client

**Files:**
- Create: `src/client.ts`
- Create: `src/__tests__/client.test.ts`

**Step 1: Write the test**

Create `src/__tests__/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VizcomClient } from '../client.js';

describe('VizcomClient', () => {
  let client: VizcomClient;

  beforeEach(() => {
    client = new VizcomClient({
      apiUrl: 'https://app.vizcom.ai/api/v1',
      authToken: 'test-token',
      organizationId: 'test-org-id',
    });
  });

  it('sends GraphQL queries with auth headers', async () => {
    const mockResponse = { data: { viewer: { id: '123' } } };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => mockResponse,
    } as Response);

    const result = await client.query<{ viewer: { id: string } }>(
      'query { viewer { id } }'
    );

    expect(result.viewer.id).toBe('123');
    expect(fetch).toHaveBeenCalledWith(
      'https://app.vizcom.ai/api/v1/graphql',
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
      json: async () => ({
        errors: [{ message: 'Not authorized' }],
      }),
    } as Response);

    await expect(client.query('query { viewer { id } }')).rejects.toThrow(
      'Not authorized'
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/client.test.ts`
Expected: FAIL — `VizcomClient` not found

**Step 3: Implement the client**

Create `src/client.ts`:

```typescript
interface VizcomClientConfig {
  apiUrl: string;
  authToken: string;
  organizationId: string;
}

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export class VizcomClient {
  private config: VizcomClientConfig;

  constructor(config: VizcomClientConfig) {
    this.config = config;
  }

  get organizationId(): string {
    return this.config.organizationId;
  }

  async query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.config.apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
        'x-organization-id': this.config.organizationId,
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors?.length) {
      const msg = result.errors.map((e) => e.message).join(', ');
      throw new Error(msg);
    }

    if (!result.data) {
      throw new Error('No data returned from GraphQL');
    }

    return result.data;
  }

  async mutationWithUpload<T = unknown>(
    query: string,
    variables: Record<string, unknown>,
    files: Map<string, { buffer: Buffer; filename: string; mimetype: string }>
  ): Promise<T> {
    const formData = new FormData();

    const operations = JSON.stringify({ query, variables });
    formData.append('operations', operations);

    const fileMap: Record<string, string[]> = {};
    let index = 0;
    for (const [variablePath] of files) {
      fileMap[String(index)] = [variablePath];
      index++;
    }
    formData.append('map', JSON.stringify(fileMap));

    index = 0;
    for (const [, file] of files) {
      formData.append(
        String(index),
        new Blob([file.buffer], { type: file.mimetype }),
        file.filename
      );
      index++;
    }

    const response = await fetch(`${this.config.apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.authToken}`,
        'x-organization-id': this.config.organizationId,
      },
      body: formData,
    });

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors?.length) {
      const msg = result.errors.map((e) => e.message).join(', ');
      throw new Error(msg);
    }

    return result.data as T;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git commit -m "feat: add GraphQL client with auth headers and file upload"
```

---

### Task 3: Credentials Storage

**Files:**
- Create: `src/auth/credentials.ts`
- Create: `src/__tests__/credentials.test.ts`

**Step 1: Write the test**

Create `src/__tests__/credentials.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  type Credentials,
} from '../auth/credentials.js';

// Override the credentials path for tests
vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os');
  return { ...actual, homedir: () => '/tmp/vizcom-test-home' };
});

describe('credentials', () => {
  const credDir = '/tmp/vizcom-test-home/.vizcom';
  const credFile = path.join(credDir, 'credentials.json');

  beforeEach(() => {
    fs.mkdirSync(credDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync('/tmp/vizcom-test-home', { recursive: true, force: true });
  });

  it('returns null when no credentials file exists', () => {
    fs.rmSync(credFile, { force: true });
    expect(loadCredentials()).toBeNull();
  });

  it('saves and loads credentials', () => {
    const creds: Credentials = {
      apiUrl: 'https://app.vizcom.ai/api/v1',
      authToken: 'test-jwt',
      organizationId: 'org-123',
      userId: 'user-123',
      email: 'test@example.com',
    };
    saveCredentials(creds);

    const loaded = loadCredentials();
    expect(loaded).toEqual(creds);
  });

  it('clears credentials', () => {
    saveCredentials({
      apiUrl: 'https://app.vizcom.ai/api/v1',
      authToken: 'test-jwt',
      organizationId: 'org-123',
      userId: 'user-123',
      email: 'test@example.com',
    });
    clearCredentials();
    expect(loadCredentials()).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/credentials.test.ts`
Expected: FAIL — module not found

**Step 3: Implement credentials storage**

Create `src/auth/credentials.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface Credentials {
  apiUrl: string;
  authToken: string;
  organizationId: string;
  userId: string;
  email: string;
}

function credentialsPath(): string {
  return path.join(os.homedir(), '.vizcom', 'credentials.json');
}

export function loadCredentials(): Credentials | null {
  const filePath = credentialsPath();
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: Credentials): void {
  const filePath = credentialsPath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
}

export function clearCredentials(): void {
  const filePath = credentialsPath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/credentials.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/auth/credentials.ts src/__tests__/credentials.test.ts
git commit -m "feat: add credentials storage (~/.vizcom/credentials.json)"
```

---

### Task 4: CLI Login Command

**Files:**
- Create: `src/auth/login.ts`
- Create: `src/__tests__/login.test.ts`

**Step 1: Write the test**

Create `src/__tests__/login.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { loginWithCredentials } from '../auth/login.js';

describe('loginWithCredentials', () => {
  it('returns credentials on successful login', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      organizations: {
        nodes: [{ id: 'org-123', name: 'Test Org' }],
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        data: {
          login: {
            authToken: 'jwt-token-123',
            user: mockUser,
          },
        },
      }),
    } as Response);

    const result = await loginWithCredentials(
      'https://app.vizcom.ai/api/v1',
      'test@example.com',
      'password123'
    );

    expect(result.authToken).toBe('jwt-token-123');
    expect(result.userId).toBe('user-123');
    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].name).toBe('Test Org');
  });

  it('throws on invalid credentials', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        errors: [{ message: 'Invalid email or password' }],
      }),
    } as Response);

    await expect(
      loginWithCredentials(
        'https://app.vizcom.ai/api/v1',
        'bad@example.com',
        'wrong'
      )
    ).rejects.toThrow('Invalid email or password');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/login.test.ts`
Expected: FAIL — module not found

**Step 3: Implement login**

Create `src/auth/login.ts`:

```typescript
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { saveCredentials } from './credentials.js';

interface LoginResult {
  authToken: string;
  userId: string;
  email: string;
  organizations: Array<{ id: string; name: string }>;
}

export async function loginWithCredentials(
  apiUrl: string,
  email: string,
  password: string
): Promise<LoginResult> {
  const response = await fetch(`${apiUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        mutation Login($input: LoginInput!) {
          login(input: $input) {
            authToken
            user {
              id
              email
              name
              organizations { nodes { id name } }
            }
          }
        }
      `,
      variables: { input: { email, password } },
    }),
  });

  const result = await response.json() as {
    data?: {
      login: {
        authToken: string;
        user: {
          id: string;
          email: string;
          name: string;
          organizations: { nodes: Array<{ id: string; name: string }> };
        };
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }

  if (!result.data?.login) {
    throw new Error('Login failed: no data returned');
  }

  const { authToken, user } = result.data.login;

  return {
    authToken,
    userId: user.id,
    email: user.email,
    organizations: user.organizations.nodes,
  };
}

async function main() {
  const apiUrl = process.env.VIZCOM_API_URL ?? 'https://app.vizcom.ai/api/v1';
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const email = await rl.question('Email: ');
    const password = await rl.question('Password: ');

    const result = await loginWithCredentials(apiUrl, email, password);

    if (result.organizations.length === 0) {
      console.error('No organizations found for this account.');
      process.exit(1);
    }

    let organizationId: string;
    if (result.organizations.length === 1) {
      organizationId = result.organizations[0].id;
      console.log(`Organization: ${result.organizations[0].name}`);
    } else {
      console.log('\nSelect an organization:');
      result.organizations.forEach((org, i) => {
        console.log(`  ${i + 1}. ${org.name}`);
      });
      const choice = await rl.question('Choice: ');
      const idx = parseInt(choice, 10) - 1;
      if (idx < 0 || idx >= result.organizations.length) {
        console.error('Invalid choice.');
        process.exit(1);
      }
      organizationId = result.organizations[idx].id;
    }

    saveCredentials({
      apiUrl,
      authToken: result.authToken,
      organizationId,
      userId: result.userId,
      email: result.email,
    });

    console.log(`\n✓ Logged in as ${result.email}`);
    console.log('Credentials saved to ~/.vizcom/credentials.json');
  } catch (error) {
    if (error instanceof Error && error.message.includes('password')) {
      console.error(`\n✗ ${error.message}`);
      console.error('\nIf you signed up with Google/SSO, set a password first:');
      console.error('  1. Go to https://app.vizcom.ai/forgot-password');
      console.error('  2. Enter your email to receive a reset link');
      console.error('  3. Set a password, then run this command again');
    } else {
      console.error(`\nLogin failed: ${error instanceof Error ? error.message : error}`);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run if invoked directly
const isDirectRun = process.argv[1]?.includes('login');
if (isDirectRun) {
  main();
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/login.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/auth/login.ts src/__tests__/login.test.ts
git commit -m "feat: add CLI login command with email/password auth"
```

---

### Task 5: Polling Utility

**Files:**
- Create: `src/utils/polling.ts`
- Create: `src/__tests__/polling.test.ts`

**Step 1: Write the test**

Create `src/__tests__/polling.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/polling.test.ts`
Expected: FAIL — module not found

**Step 3: Implement polling**

Create `src/utils/polling.ts`:

```typescript
import type { VizcomClient } from '../client.js';

const POLL_QUERY = `
  query GetPromptStatus($id: UUID!) {
    prompt(id: $id) {
      id
      status
      promptOutputs(first: 10) {
        nodes {
          id
          imagePath
          failureReason
        }
      }
    }
  }
`;

interface PromptOutput {
  id: string;
  imagePath?: string;
  failureReason?: string;
}

interface PollResult {
  promptId: string;
  status: string;
  outputs: PromptOutput[];
}

interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
}

export async function pollForResult(
  client: VizcomClient,
  promptId: string,
  options?: PollOptions
): Promise<PollResult> {
  const intervalMs = options?.intervalMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 60;

  for (let i = 0; i < maxAttempts; i++) {
    const data = await client.query<{
      prompt: {
        id: string;
        status: string;
        promptOutputs: { nodes: PromptOutput[] };
      };
    }>(POLL_QUERY, { id: promptId });

    const { prompt } = data;

    if (prompt.status === 'completed') {
      return {
        promptId: prompt.id,
        status: 'completed',
        outputs: prompt.promptOutputs.nodes,
      };
    }

    if (prompt.status === 'failed') {
      const reason =
        prompt.promptOutputs.nodes[0]?.failureReason ?? 'Generation failed';
      throw new Error(reason);
    }

    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `Generation timed out after ${(maxAttempts * intervalMs) / 1000}s. Check status with prompt ID: ${promptId}`
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/polling.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/polling.ts src/__tests__/polling.test.ts
git commit -m "feat: add polling utility for async generation results"
```

---

### Task 6: Browse Tools

**Files:**
- Create: `src/tools/browse.ts`
- Create: `src/__tests__/browse.test.ts`

**Step 1: Write the test**

Create `src/__tests__/browse.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { VizcomClient } from '../client.js';
import { browseTools } from '../tools/browse.js';

function mockClient(data: unknown): VizcomClient {
  return { query: vi.fn().mockResolvedValueOnce(data) } as unknown as VizcomClient;
}

describe('browseTools', () => {
  it('get_current_user returns user with organizations', async () => {
    const client = mockClient({
      viewer: {
        id: 'u-1',
        email: 'test@example.com',
        name: 'Test',
        organizations: { nodes: [{ id: 'org-1', name: 'My Org' }] },
      },
    });

    const tools = browseTools(client);
    const tool = tools.find((t) => t.name === 'get_current_user')!;
    const result = await tool.handler({});

    expect(result).toHaveProperty('id', 'u-1');
    expect(result).toHaveProperty('organizations');
  });

  it('list_folders returns folder contents', async () => {
    const client = mockClient({
      folder: {
        id: 'f-1',
        name: 'Root',
        childFolders: { nodes: [{ id: 'f-2', name: 'Subfolder' }] },
        workbenches: { nodes: [{ id: 'w-1', name: 'My Workbench' }] },
      },
    });

    const tools = browseTools(client);
    const tool = tools.find((t) => t.name === 'list_folders')!;
    const result = await tool.handler({ folderId: 'f-1' });

    expect(result).toHaveProperty('childFolders');
    expect(result).toHaveProperty('workbenches');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/browse.test.ts`
Expected: FAIL — module not found

**Step 3: Implement browse tools**

Create `src/tools/browse.ts`:

```typescript
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
```

**Step 4: Create shared types file**

Create `src/types.ts`:

```typescript
import type { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/browse.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tools/browse.ts src/types.ts src/__tests__/browse.test.ts
git commit -m "feat: add browse tools (user, teams, folders, workbenches, drawings)"
```

---

### Task 7: Modify Tool (Hero Feature)

**Files:**
- Create: `src/tools/modify.ts`
- Create: `src/__tests__/modify.test.ts`

**Step 1: Write the test**

Create `src/__tests__/modify.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/modify.test.ts`
Expected: FAIL — module not found

**Step 3: Implement modify tool**

Create `src/tools/modify.ts`:

```typescript
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';

const CREATE_EDIT_PROMPT = `
  mutation CreateEditPrompt($input: CreateEditPromptInput!) {
    createEditPrompt(input: $input) {
      prompt { id }
      usageData { left used planLimit }
    }
  }
`;

export function modifyTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'modify_image',
      description: `Modify an existing image using AI. Describe the changes you want in the prompt.
Optionally provide a mask (base64 PNG where white = area to change) for targeted edits.
Supports "standard" and "pro" quality modes (pro requires a paid plan).
This is Vizcom's most-used feature — use it for iterating on designs.`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to modify'),
        prompt: z
          .string()
          .describe('Description of the changes to make'),
        sourceImageBase64: z
          .string()
          .describe('Base64-encoded source image (PNG/JPEG)'),
        maskBase64: z
          .string()
          .optional()
          .describe('Base64-encoded mask image (white = area to change)'),
        qualityMode: z
          .enum(['standard', 'pro'])
          .optional()
          .default('standard')
          .describe('Quality mode: "standard" or "pro" (pro requires paid plan)'),
        outputsCount: z
          .number()
          .min(1)
          .max(4)
          .optional()
          .default(1)
          .describe('Number of variations to generate (1-4)'),
      }),
      handler: async ({
        drawingId,
        prompt,
        sourceImageBase64,
        maskBase64,
        qualityMode,
        outputsCount,
      }) => {
        const sourceBuffer = Buffer.from(sourceImageBase64 as string, 'base64');
        const promptId = randomUUID();

        const files = new Map<
          string,
          { buffer: Buffer; filename: string; mimetype: string }
        >();
        files.set('variables.input.data', {
          buffer: sourceBuffer,
          filename: 'source.png',
          mimetype: 'image/png',
        });

        const variables: Record<string, unknown> = {
          input: {
            id: promptId,
            drawingId,
            prompt,
            outputsCount: outputsCount ?? 1,
            qualityMode: qualityMode ?? 'standard',
            data: null, // replaced by file upload
            mask: maskBase64 ? null : undefined,
          },
        };

        if (maskBase64) {
          const maskBuffer = Buffer.from(maskBase64 as string, 'base64');
          files.set('variables.input.mask', {
            buffer: maskBuffer,
            filename: 'mask.png',
            mimetype: 'image/png',
          });
        }

        await client.mutationWithUpload<{
          createEditPrompt: { prompt: { id: string } };
        }>(CREATE_EDIT_PROMPT, variables, files);

        return await pollForResult(client, promptId);
      },
    },
  ];
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/modify.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/modify.ts src/__tests__/modify.test.ts
git commit -m "feat: add modify_image tool (Vizcom's core edit feature)"
```

---

### Task 8: Render & Generate Tools

**Files:**
- Create: `src/tools/render.ts`
- Create: `src/tools/generate.ts`
- Create: `src/__tests__/render.test.ts`

**Step 1: Write the test**

Create `src/__tests__/render.test.ts`:

```typescript
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
      mutationWithUpload: vi.fn().mockResolvedValueOnce({
        createPrompt: { prompt: { id: 'p-2' } },
      }),
      query: vi.fn().mockResolvedValueOnce({
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/render.test.ts`
Expected: FAIL — modules not found

**Step 3: Implement render tool**

Create `src/tools/render.ts`:

```typescript
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';

const CREATE_PROMPT = `
  mutation CreatePrompt($input: CreatePromptInput!) {
    createPrompt(input: $input) {
      prompt { id }
      usageData { left used planLimit }
    }
  }
`;

export function renderTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'render_sketch',
      description: `Turn a sketch into a photorealistic rendered visualization.
Provide a source sketch image and a text prompt describing the desired look.
Use influenceLevel to control how closely the output follows the sketch (0 = loose, 1 = strict).`,
      inputSchema: z.object({
        drawingId: z.string().uuid().describe('Drawing ID to render into'),
        prompt: z.string().describe('Description of the desired render'),
        sourceImageBase64: z
          .string()
          .describe('Base64-encoded sketch image (PNG/JPEG)'),
        influenceLevel: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .default(0.5)
          .describe('How closely the output follows the sketch (0-1)'),
        outputsCount: z
          .number()
          .min(1)
          .max(4)
          .optional()
          .default(1)
          .describe('Number of variations (1-4)'),
      }),
      handler: async ({
        drawingId,
        prompt,
        sourceImageBase64,
        influenceLevel,
        outputsCount,
      }) => {
        const sourceBuffer = Buffer.from(sourceImageBase64 as string, 'base64');
        const promptId = randomUUID();

        const files = new Map<
          string,
          { buffer: Buffer; filename: string; mimetype: string }
        >();
        files.set('variables.input.data', {
          buffer: sourceBuffer,
          filename: 'source.png',
          mimetype: 'image/png',
        });

        await client.mutationWithUpload<{
          createPrompt: { prompt: { id: string } };
        }>(CREATE_PROMPT, {
          input: {
            id: promptId,
            drawingId,
            prompt,
            imageInferenceType: 'RENDER',
            sourceImageInfluence: influenceLevel ?? 0.5,
            outputsCount: outputsCount ?? 1,
            data: null,
          },
        }, files);

        return await pollForResult(client, promptId);
      },
    },
  ];
}
```

**Step 4: Implement generate tool**

Create `src/tools/generate.ts`:

```typescript
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';
import { pollForResult } from '../utils/polling.js';

const CREATE_PROMPT = `
  mutation CreatePrompt($input: CreatePromptInput!) {
    createPrompt(input: $input) {
      prompt { id }
      usageData { left used planLimit }
    }
  }
`;

export function generateTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'generate_image',
      description: `Generate an image from a text prompt alone — no source sketch needed.
Use this for early ideation and concept exploration.`,
      inputSchema: z.object({
        drawingId: z
          .string()
          .uuid()
          .describe('Drawing ID to generate into'),
        prompt: z
          .string()
          .describe('Text description of the image to generate'),
        outputsCount: z
          .number()
          .min(1)
          .max(4)
          .optional()
          .default(1)
          .describe('Number of variations (1-4)'),
      }),
      handler: async ({ drawingId, prompt, outputsCount }) => {
        const promptId = randomUUID();

        await client.query<{
          createPrompt: { prompt: { id: string } };
        }>(CREATE_PROMPT, {
          input: {
            id: promptId,
            drawingId,
            prompt,
            imageInferenceType: 'RAW_GENERATION',
            outputsCount: outputsCount ?? 1,
            sourceImageInfluence: 0,
          },
        });

        return await pollForResult(client, promptId);
      },
    },
  ];
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/render.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tools/render.ts src/tools/generate.ts src/__tests__/render.test.ts
git commit -m "feat: add render_sketch and generate_image tools"
```

---

### Task 9: Export Tool

**Files:**
- Create: `src/tools/export.ts`

**Step 1: Implement export tool**

Create `src/tools/export.ts`:

```typescript
import { z } from 'zod';
import type { VizcomClient } from '../client.js';
import type { ToolDefinition } from '../types.js';

export function exportTools(client: VizcomClient): ToolDefinition[] {
  return [
    {
      name: 'get_generation_status',
      description:
        'Check the status of an in-progress image generation by prompt ID.',
      inputSchema: z.object({
        promptId: z.string().uuid().describe('Prompt ID to check'),
      }),
      handler: async ({ promptId }) => {
        const data = await client.query<{
          prompt: {
            id: string;
            status: string;
            promptOutputs: {
              nodes: Array<{
                id: string;
                imagePath: string | null;
                failureReason: string | null;
              }>;
            };
          };
        }>(
          `query GetPromptStatus($id: UUID!) {
            prompt(id: $id) {
              id status
              promptOutputs { nodes { id imagePath failureReason } }
            }
          }`,
          { id: promptId }
        );
        return data.prompt;
      },
    },
    {
      name: 'export_image',
      description:
        'Get the full URL for a generated image. Pass the imagePath from a generation result.',
      inputSchema: z.object({
        imagePath: z
          .string()
          .describe('Image storage path from a generation result'),
      }),
      handler: async ({ imagePath }) => {
        // imagePath from prompt outputs is already a full URL or a storage key.
        // If it's a relative key, the Vizcom CDN base URL is needed.
        const url = (imagePath as string).startsWith('http')
          ? imagePath
          : `https://storage.vizcom.ai/${imagePath}`;
        return { url, imagePath };
      },
    },
    {
      name: 'create_workbench',
      description: 'Create a new workbench in a folder.',
      inputSchema: z.object({
        folderId: z
          .string()
          .uuid()
          .describe('Folder ID to create the workbench in'),
        name: z.string().describe('Name for the new workbench'),
      }),
      handler: async ({ folderId, name }) => {
        const data = await client.query<{
          createWorkbench: {
            workbench: { id: string; name: string };
          };
        }>(
          `mutation CreateWorkbench($input: CreateWorkbenchInput!) {
            createWorkbench(input: $input) {
              workbench { id name }
            }
          }`,
          { input: { workbench: { folderId, name } } }
        );
        return data.createWorkbench.workbench;
      },
    },
  ];
}
```

**Step 2: Commit**

```bash
git add src/tools/export.ts
git commit -m "feat: add export, status check, and create workbench tools"
```

---

### Task 10: Wire Everything Together

**Files:**
- Modify: `src/index.ts`

**Step 1: Update the entry point to register all tools**

Replace `src/index.ts` with:

```typescript
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { VizcomClient } from './client.js';
import { loadCredentials } from './auth/credentials.js';
import { browseTools } from './tools/browse.js';
import { modifyTools } from './tools/modify.js';
import { renderTools } from './tools/render.js';
import { generateTools } from './tools/generate.js';
import { exportTools } from './tools/export.js';
import type { ToolDefinition } from './types.js';

function getCredentialsOrExit() {
  // Check for env var override first (for CI / advanced users)
  if (process.env.VIZCOM_AUTH_TOKEN && process.env.VIZCOM_ORGANIZATION_ID) {
    return {
      apiUrl: process.env.VIZCOM_API_URL ?? 'https://app.vizcom.ai/api/v1',
      authToken: process.env.VIZCOM_AUTH_TOKEN,
      organizationId: process.env.VIZCOM_ORGANIZATION_ID,
    };
  }

  const creds = loadCredentials();
  if (!creds) {
    console.error(
      'Not authenticated. Run: npx @vizcom/mcp-server login'
    );
    process.exit(1);
  }
  return creds;
}

// Handle login subcommand
if (process.argv[2] === 'login') {
  import('./auth/login.js');
} else {
  main();
}

async function main() {
  const creds = getCredentialsOrExit();

  const client = new VizcomClient({
    apiUrl: creds.apiUrl,
    authToken: creds.authToken,
    organizationId: creds.organizationId,
  });

  const server = new McpServer({
    name: 'vizcom',
    version: '0.1.0',
  });

  const allTools: ToolDefinition[] = [
    ...browseTools(client),
    ...modifyTools(client),
    ...renderTools(client),
    ...generateTools(client),
    ...exportTools(client),
  ];

  for (const tool of allTools) {
    server.tool(
      tool.name,
      tool.description,
      { input: tool.inputSchema },
      async ({ input }) => {
        try {
          const result = await tool.handler(input as Record<string, unknown>);
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(result, null, 2) },
            ],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);

          // Provide actionable error messages
          if (message.includes('jwt') || message.includes('token') || message.includes('authorized')) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Your session has expired. Run `npx @vizcom/mcp-server login` to re-authenticate.',
                },
              ],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text' as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Vizcom MCP server running (${allTools.length} tools)`);
}
```

**Step 2: Build and verify**

Run: `pnpm build`
Expected: Compiles with no errors

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire all tools into MCP server entry point"
```

---

### Task 11: README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Create `README.md`:

````markdown
# @vizcom/mcp-server

MCP server for [Vizcom](https://vizcom.ai) — connect your AI assistant to Vizcom's creative design tools.

## Setup

### 1. Authenticate

```bash
npx @vizcom/mcp-server login
```

Enter your Vizcom email and password. If you signed up with Google/SSO, you'll need to set a password first via https://app.vizcom.ai/forgot-password.

### 2. Configure your MCP client

**Claude Desktop / Claude Code:**

```json
{
  "mcpServers": {
    "vizcom": {
      "command": "npx",
      "args": ["-y", "@vizcom/mcp-server"]
    }
  }
}
```

**With environment variables (advanced):**

```json
{
  "mcpServers": {
    "vizcom": {
      "command": "npx",
      "args": ["-y", "@vizcom/mcp-server"],
      "env": {
        "VIZCOM_AUTH_TOKEN": "<your-jwt>",
        "VIZCOM_ORGANIZATION_ID": "<your-org-id>",
        "VIZCOM_API_URL": "https://app.vizcom.ai/api/v1"
      }
    }
  }
}
```

## Available Tools

### Browsing
- **get_current_user** — Get your profile and organizations
- **list_teams** — List teams in your organization
- **list_folders** — Browse folders and workbenches
- **get_workbench** — Get workbench details and drawings
- **get_drawing** — Get drawing layers and generation history

### Creative
- **modify_image** — Modify an existing image with a text prompt (supports masks and pro quality)
- **render_sketch** — Turn a sketch into a photorealistic render
- **generate_image** — Generate an image from text alone

### Utility
- **get_generation_status** — Check on an in-progress generation
- **export_image** — Get the URL for a generated image
- **create_workbench** — Create a new workbench

## Examples

> "Show me my recent workbenches"

> "Take this sketch and render it as a modern desk lamp in white ceramic"

> "Modify this design — make the handle more ergonomic and add a matte black finish"

> "Generate 4 concept variations of a minimalist desk lamp"
````

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions and tool reference"
```

---

### Task 12: Final Verification

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Build**

Run: `pnpm build`
Expected: Compiles with no errors

**Step 3: Verify the binary works**

Run: `node dist/index.js 2>&1 | head -1`
Expected: Either "Not authenticated" message or "Vizcom MCP server running"

**Step 4: Final commit if any cleanup needed**

```bash
git status
# If clean, nothing to do. If files need cleanup:
git add -A && git commit -m "chore: final cleanup"
```
