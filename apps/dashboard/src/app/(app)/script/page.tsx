import './script.css';
import { fetchKeys } from '@/lib/api';
import { InstallGuide, type PubKey } from './InstallGuide';

export default async function ScriptPage() {
  const keys = await fetchKeys();
  const pubKeys: PubKey[] = keys
    .filter((k) => k.kind === 'publishable' && !k.revokedAt)
    .map((k) => ({ env: k.env, prefix: k.prefix }));

  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL ?? 'https://cdn.lumina.app';
  return <InstallGuide pubKeys={pubKeys} cdnUrl={cdnUrl} />;
}
