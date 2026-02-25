interface VizcomClientConfig {
  apiUrl: string;
  authToken: string;
  organizationId: string;
}

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

function persistedBody(
  sha256Hash: string,
  variables?: Record<string, unknown>
) {
  return {
    extensions: { persistedQuery: { sha256Hash } },
    query: '',
    variables: variables ?? {},
  };
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
    hash: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.config.apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
        'x-organization-id': this.config.organizationId,
      },
      body: JSON.stringify(persistedBody(hash, variables)),
    });

    const text = await response.text();
    let result: GraphQLResponse<T>;
    try {
      result = JSON.parse(text) as GraphQLResponse<T>;
    } catch {
      throw new Error(`API returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }

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
    hash: string,
    variables: Record<string, unknown>,
    files: Map<string, { buffer: Buffer; filename: string; mimetype: string }>
  ): Promise<T> {
    const formData = new FormData();

    const operations = JSON.stringify(persistedBody(hash, variables));
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
        new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
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

    const text = await response.text();
    let result: GraphQLResponse<T>;
    try {
      result = JSON.parse(text) as GraphQLResponse<T>;
    } catch {
      throw new Error(`API returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }

    if (result.errors?.length) {
      const msg = result.errors.map((e) => e.message).join(', ');
      throw new Error(msg);
    }

    return result.data as T;
  }
}
