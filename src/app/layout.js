export const metadata = {
  title: 'Namae 名前 — Étymologie des lieux japonais',
  description:
    'Décomposez les noms de lieux japonais en préfixe, nom principal et suffixe pour en comprendre l’étymologie. Apprentissage des idéogrammes et quiz.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Namae',
  appleWebApp: { capable: true, title: 'Namae', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg' }],
  },
}

export const viewport = {
  themeColor: '#0f1623',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, padding: 0, background: '#0f1623' }}>{children}</body>
    </html>
  )
}
