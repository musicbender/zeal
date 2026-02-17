export interface ProjectIcon {
  rects: { x: number; y: number; w: number; h: number; fill: string }[];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generateIcon(seed: string): ProjectIcon {
  const hash = hashString(seed);
  const rectCount = 2 + (hash % 3);
  const fills = ['#6a6a68', '#8a8a88', '#5a5a58', '#7a7a78'];
  const rects: ProjectIcon['rects'] = [];

  for (let i = 0; i < rectCount; i++) {
    const subHash = hashString(seed + i);
    rects.push({
      x: 2 + (subHash % 10),
      y: 2 + ((subHash >> 4) % 10),
      w: 2 + ((subHash >> 8) % 4),
      h: 2 + ((subHash >> 12) % 4),
      fill: fills[(subHash >> 16) % fills.length]!,
    });
  }

  return { rects };
}
