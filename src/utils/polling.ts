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
