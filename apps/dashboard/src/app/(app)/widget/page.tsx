import './widget.css';
import type { WidgetSettings } from '@lumina/shared';
import { fetchWidgetConfig } from '@/lib/api';
import { WidgetSettingsEditor } from './WidgetSettingsEditor';

const DEFAULTS: WidgetSettings = {
  buttonText: 'Try in your room',
  theme: {},
  locale: 'en',
  i18n: {},
  watermark: true,
  resultCta: null,
  guide: null,
};

export default async function WidgetSettingsPage() {
  const settings = (await fetchWidgetConfig()) ?? DEFAULTS;
  return <WidgetSettingsEditor initial={settings} />;
}
