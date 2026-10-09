export interface ShellToken {
  text: string;
  kind: 'plain' | 'comment' | 'string' | 'variable' | 'operator' | 'keyword';
}
/** Lightweight display-only lexer; diagnostics use Bash's parser, never this highlighter. */
export function highlightShell(source: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  const pattern =
    /#[^\n]*|'[^']*'|"(?:\\[\s\S]|[^"\\])*"|\$\{[^}]*\}|\$[\w?@#*!$-]+|&&|\|\||[;|<>]|\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|export|return|cd|sudo)\b/g;
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > offset)
      tokens.push({ text: source.slice(offset, match.index), kind: 'plain' });
    const text = match[0];
    const kind = text.startsWith('#')
      ? 'comment'
      : /^['"]/.test(text)
        ? 'string'
        : text.startsWith('$')
          ? 'variable'
          : /^[;&|<>]/.test(text)
            ? 'operator'
            : 'keyword';
    tokens.push({ text, kind });
    offset = match.index + text.length;
  }
  tokens.push({ text: source.slice(offset), kind: 'plain' });
  return tokens;
}
