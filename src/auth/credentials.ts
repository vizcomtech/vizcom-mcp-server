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
