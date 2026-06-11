'use client';

import { useEffect, useRef } from 'react';
import type { WidgetSettings } from '@lumina/shared';
import { mountWidgetPreview, type PreviewView } from '@lumina/widget/preview';

/**
 * Mounts the **real** widget UI (the same components shipped to storefronts) into a Shadow root via
 * `@lumina/widget/preview`, themed from the merchant's unsaved settings. Because it is the widget, the
 * preview can't drift. The widget brings its own preact, so this is a plain React→DOM bridge.
 */
export function RealWidgetPreview({
  settings,
  view,
  onViewChange,
}: {
  settings: WidgetSettings;
  view: PreviewView;
  onViewChange?: (view: PreviewView) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return mountWidgetPreview(el, {
      view,
      settings: {
        theme: settings.theme,
        buttonText: settings.buttonText,
        locale: settings.locale,
        i18n: settings.i18n,
        watermark: settings.watermark,
        resultCta: settings.resultCta,
      },
      onViewChange,
    });
  }, [settings, view, onViewChange]);

  return <div ref={ref} className="real-widget-preview" />;
}
