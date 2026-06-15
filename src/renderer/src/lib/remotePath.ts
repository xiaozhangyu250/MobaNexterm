export function posixDirname(path: string): string {
  if (!path) return '.';
  const stripped = path.replace(/\/+$/, '');
  if (!stripped) return '/';
  const separator = stripped.lastIndexOf('/');
  if (separator === -1) return '.';
  if (separator === 0) return '/';
  return stripped.slice(0, separator);
}

export function posixNormalize(path: string): string {
  const isAbsolute = path.startsWith('/');
  const segments = path.split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(segment);
    }
  }

  const joined = stack.join('/');
  if (isAbsolute) return joined ? `/${joined}` : '/';
  return joined || '.';
}

export function posixJoin(parent: string, child: string): string {
  if (!child) return posixNormalize(parent || '.');
  if (child.startsWith('/')) return posixNormalize(child);

  const normalizedParent = posixNormalize(parent || '.');
  if (normalizedParent === '/') return posixNormalize(`/${child}`);
  if (normalizedParent === '.') return posixNormalize(child);
  return posixNormalize(`${normalizedParent}/${child}`);
}

export function joinRemote(cwd: string, name: string): string {
  if (name === '..') {
    if (!cwd || cwd === '/') return '/';
    return posixDirname(cwd);
  }
  if (name === '.') return cwd || '.';
  return posixJoin(cwd || '.', name);
}
