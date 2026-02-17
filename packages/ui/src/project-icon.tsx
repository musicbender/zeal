import type { ProjectIcon } from '@repo/utils/common/icon';

interface ProjectIconProps {
  icon: ProjectIcon;
}

export function ProjectIconSvg({ icon }: ProjectIconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none">
      {icon.rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
    </svg>
  );
}
