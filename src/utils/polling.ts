import type { VizcomClient } from '../client.js';
import { QUERIES } from '../queries.js';

interface PromptOutput {
  id: string;
  imagePath?: string | null;
  failureReason?: string | null;
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
        outputs: {
          nodes: Array<{
            id: string;
            imagePath: string | null;
            failureReason: string | null;
          }>;
        };
      };
    }>(QUERIES.prompt, { id: promptId });

    const { prompt } = data;
    const outputs = prompt.outputs.nodes;

    const failed = outputs.find((o) => o.failureReason);
    if (failed) {
      throw new Error(failed.failureReason ?? 'Generation failed');
    }

    const completed = outputs.filter((o) => o.imagePath);
    if (completed.length > 0) {
      return {
        promptId: prompt.id,
        status: 'completed',
        outputs,
      };
    }

    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `Generation timed out after ${(maxAttempts * intervalMs) / 1000}s. Check status with prompt ID: ${promptId}`
  );
}
