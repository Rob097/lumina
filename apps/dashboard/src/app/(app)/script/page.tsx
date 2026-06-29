import './script.css';
import { fetchKeys } from '@/lib/api';
import type { PubKey } from './InstallGuide';
import { ScriptInstallView } from './ScriptInstallView';

export default async function ScriptPage() {
  const keys = await fetchKeys();
  const pubKeys: PubKey[] = keys
    .filter((k) => k.kind === 'publishable' && !k.revokedAt)
    .map((k) => ({ env: k.env, prefix: k.prefix, siteKey: k.siteKey }));

  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL ?? 'https://widget.yuzuview.com';
  return <ScriptInstallView pubKeys={pubKeys} cdnUrl={cdnUrl} />;
}
