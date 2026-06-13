import '../generations/generations.css';
import './studio.css';
import type { ReactNode } from 'react';
import { StudioTabs } from './StudioTabs';

/**
 * Studio (#8) — the in-dashboard "try in your room" workspace for the physical store. The section has
 * an Overview, a New-visualization wizard, and a navigable client rubric (with per-client render
 * history). `generations.css` is imported here so all sub-routes can reuse the render-card grid +
 * before/after slider.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="studio">
      <StudioTabs />
      {children}
    </div>
  );
}
