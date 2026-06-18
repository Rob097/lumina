import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import '@lumina/ui/styles.css';
import { Providers, type Env } from '@/lib/providers';

export const metadata = {
  title: 'YuzuView Dashboard',
  description: 'YuzuView merchant control plane',
};

// Set the theme before paint to avoid a flash (reads localStorage / system preference).
const THEME_SCRIPT = `try{var t=localStorage.getItem('lumina-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const env: Env = (await cookies()).get('lumina-env')?.value === 'test' ? 'test' : 'live';
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers initialEnv={env}>{children}</Providers>
      </body>
    </html>
  );
}
