export interface TextMatch {
  start: number;
  end: number;
}
export function findText(content: string, query: string, matchCase = false): TextMatch[] {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, matchCase ? 'gu' : 'giu');
  return Array.from(content.matchAll(pattern), (m) => ({
    start: m.index!,
    end: m.index! + m[0].length,
  }));
}
export function replaceText(content: string, matches: TextMatch[], replacement: string): string {
  let end = 0;
  const parts: string[] = [];
  for (const match of matches) {
    parts.push(content.slice(end, match.start), replacement);
    end = match.end;
  }
  parts.push(content.slice(end));
  return parts.join('');
}
