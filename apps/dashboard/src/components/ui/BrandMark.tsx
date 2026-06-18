/**
 * YuzuView brand marks. The wordmark + glyph are user-facing brand assets (the product is
 * "YuzuView"); code identifiers elsewhere stay `lumina-*`. Rendered as plain <img> from /public
 * so they work in Server Components without next/image config. Height-driven; width auto-scales.
 */

export function BrandWordmark({ height = 30, className }: { height?: number; className?: string }) {
  return (
    <img
      src="/yuzuview-logo.png"
      alt="YuzuView"
      height={height}
      style={{ height, width: 'auto', display: 'block' }}
      className={className}
    />
  );
}

export function BrandGlyph({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/yuzuview-mark.png"
      alt="YuzuView"
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block' }}
      className={className}
    />
  );
}
