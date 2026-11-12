import type {Metadata} from 'next';
import './globals.css';
import './marketing.css';
import './contacts.css';
import './support.css';

export const metadata: Metadata = {
  title: 'Unsaid — Global Shell',
  description:
    'Global operations, finance, catalog, marketing, orders, contacts, and support workspace shell for Unsaid.',
  openGraph: {
    title: 'Unsaid — Global Shell',
    description:
      'Global operations, finance, catalog, marketing, orders, contacts, and support workspace shell for Unsaid.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Unsaid — Global Shell',
    description:
      'Global operations, finance, catalog, marketing, orders, contacts, and support workspace shell for Unsaid.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      {/* Fonts are @import-ed at the top of globals.css (before Tailwind) so
          utility font sizes win the cascade exactly like the original mockups. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
