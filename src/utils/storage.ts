const STORAGE_CDN = 'https://storage.vizcom.ai';

export function toImageUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${STORAGE_CDN}/${path}`;
}

export async function fetchImageAsBase64(path: string): Promise<string> {
  const url = toImageUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

export async function fetchImageBuffer(path: string): Promise<Buffer> {
  const url = toImageUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
