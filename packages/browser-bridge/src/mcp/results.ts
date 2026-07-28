export type McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export function resultToMcpContent(result: unknown): McpContent[] {
  if (typeof result === 'object' && result !== null && 'dataUrl' in result && typeof (result as { dataUrl: unknown }).dataUrl === 'string') {
    const dataUrl = (result as { dataUrl: string }).dataUrl;
    const [, mimeType = 'image/jpeg', data = ''] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) ?? [];
    return [{ type: 'image', mimeType, data }];
  }
  return [{ type: 'text', text: JSON.stringify(result) }];
}
