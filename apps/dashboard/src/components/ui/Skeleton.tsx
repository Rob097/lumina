import type { CSSProperties } from 'react';

/** Loading placeholder using the design's shimmer (.skeleton). */
export function Skeleton({
  width,
  height = 14,
  radius,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="skeleton"
      style={{ display: 'block', width: width ?? '100%', height, borderRadius: radius, ...style }}
    />
  );
}
