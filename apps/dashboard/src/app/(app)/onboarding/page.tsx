import './onboarding.css';
import type { WidgetSettings } from '@lumina/shared';
import { fetchAnalyticsSummary, fetchDomains, fetchWidgetConfig } from '@/lib/api';
import { deriveOnboarding } from '@/lib/onboarding';
import { OnboardingWizard } from './OnboardingWizard';

/** True once the merchant has tailored the widget away from the shipped defaults. */
function isConfigured(s: WidgetSettings): boolean {
  return (
    s.buttonText !== 'Try in your room' ||
    Object.keys(s.theme).length > 0 ||
    Object.keys(s.i18n).length > 0 ||
    s.resultCta !== null ||
    s.watermark === false
  );
}

export default async function OnboardingPage() {
  const [settings, domains, summary] = await Promise.all([
    fetchWidgetConfig(),
    fetchDomains(),
    fetchAnalyticsSummary(),
  ]);

  const onboarding = deriveOnboarding({
    widgetConfigured: settings ? isConfigured(settings) : false,
    // Proxy until the catalog count lands in Phase C: any product with try-on activity.
    hasProducts: (summary?.topProducts.length ?? 0) > 0,
    installed: domains.length > 0 || (summary?.impressions ?? 0) > 0,
    hasGeneration: (summary?.generations ?? 0) > 0,
  });

  return <OnboardingWizard onboarding={onboarding} />;
}
