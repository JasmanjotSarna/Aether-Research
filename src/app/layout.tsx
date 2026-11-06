import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { MeshBackground } from '@/components/ui/MeshBackground';
import { RefractionFilter } from '@/components/ui/RefractionFilter';
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from '@/lib/constants';

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_DESCRIPTION}`,
  description: `${APP_TAGLINE} Autonomous AI research intelligence that investigates academic literature, audits claims, and synthesizes publication-grade reports with verified citations.`,
  keywords: [
    'AI Research Agent',
    'Autonomous Intelligence',
    'Literature Review',
    'Citation Verification',
    'Academic Research',
    'Peer-Reviewed Synthesis',
  ],
  authors: [{ name: 'Aether Research Intelligence' }],
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: `${APP_NAME} — ${APP_DESCRIPTION}`,
    description: APP_TAGLINE,
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F7FB' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B12' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=new URLSearchParams(window.location.search);var u=p.get('theme');var stored=u||localStorage.getItem('aether_theme')||'system';var resolved=stored;if(stored==='system'){resolved=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',resolved);document.documentElement.style.colorScheme=resolved;if(resolved==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] selection:bg-[#0A84FF]/25 selection:text-[#0A84FF] relative overflow-x-hidden">
        {/* Liquid Glass Ambient Mesh Orbs */}
        <MeshBackground />

        {/* Liquid Glass Refraction SVG Filter */}
        <RefractionFilter />

        {/* Main Application Content */}
        <div className="relative z-10 flex min-h-screen flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
