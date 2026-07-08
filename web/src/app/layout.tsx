import type { Metadata, Viewport } from 'next';
import { auth } from '@/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'Puzzle Geeks',
  description: 'Track your speed puzzling. Beat your times.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Puzzle Geeks', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0b0e14',
};

// Runs before paint: theme from localStorage (visitor) falls back to midnight.
const themeScript = `
try {
  var t = localStorage.getItem('pg-theme');
  if (t === 'midnight' || t === 'cozy') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const serverTheme = session?.user?.theme === 'cozy' ? 'cozy' : 'midnight';
  return (
    <html lang="en" data-theme={serverTheme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ServiceWorkerRegister />
        <ThemeProvider initialTheme={serverTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
