'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * Product thumbnail that degrades to a neutral placeholder when the merchant's image URL fails to load
 * (dead/expired/hotlink-blocked source) — so a bad URL never shows a broken-image glyph.
 */
export function ProductThumb({ src, className = 'prod-thumb' }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <span className={`${className} prod-thumb-fallback`} aria-hidden>
        <Icon name="products" size={16} strokeWidth={1.8} />
      </span>
    );
  }
  return (
    <img className={className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}
