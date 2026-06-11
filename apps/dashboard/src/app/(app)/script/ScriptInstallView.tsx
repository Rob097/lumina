'use client';

import { useState } from 'react';
import { PlatformPicker } from './PlatformPicker';
import { InstallGuide, type PubKey } from './InstallGuide';

/**
 * Holds the Script & install view state: the platform picker (default) ↔ the script install guide.
 * Server data (publishable keys, CDN URL) is fetched once in the page and threaded through.
 */
export function ScriptInstallView({ pubKeys, cdnUrl }: { pubKeys: PubKey[]; cdnUrl: string }) {
  const [view, setView] = useState<'picker' | 'guide'>('picker');

  if (view === 'guide') {
    return <InstallGuide pubKeys={pubKeys} cdnUrl={cdnUrl} onBack={() => setView('picker')} />;
  }
  return <PlatformPicker onSelectScript={() => setView('guide')} />;
}
