export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Center on the invoking window, staying entirely inside its display's work area. */
export function placeEditorWindow(anchor: Rectangle, workArea: Rectangle): Rectangle {
  const width = Math.min(1000, workArea.width);
  const height = Math.min(720, workArea.height);
  return fitWindow(
    {
      x: Math.round(anchor.x + (anchor.width - width) / 2),
      y: Math.round(anchor.y + (anchor.height - height) / 2),
      width,
      height,
    },
    [workArea],
  );
}

export function fitWindow(bounds: Rectangle, areas: Rectangle[]): Rectangle {
  if (!areas.length) return bounds;
  const overlap = (a: Rectangle) =>
    Math.max(0, Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x)) *
    Math.max(0, Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y));
  const area = areas.reduce((best, a) => (overlap(a) > overlap(best) ? a : best));
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  };
}
