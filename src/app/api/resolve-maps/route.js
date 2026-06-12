// Route serveur qui résout un lien court Google Maps (maps.app.goo.gl, goo.gl/maps)
// vers son URL longue, dont on extrait le nom du lieu. Permet au Web Share Target
// de fonctionner même quand Maps n'envoie qu'un lien opaque (le navigateur ne
// peut pas suivre la redirection à cause de CORS — le serveur, si).
//
// Aucun secret, aucune clé API : on fait juste un fetch HTTP qui suit les 3xx.

const ALLOWED_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|maps\.google\.com|www\.google\.com|g\.co)$/i

function extractName(finalUrl) {
  try {
    const u = new URL(finalUrl)
    const place = u.pathname.match(/\/maps\/place\/([^/@]+)/)
    if (place) return decodeURIComponent(place[1]).replace(/\+/g, ' ').split(',')[0].trim()
    const q = u.searchParams.get('q') || u.searchParams.get('query')
    if (q) return q.split(',')[0].trim()
  } catch {}
  return null
}

export async function GET(request) {
  const u = new URL(request.url).searchParams.get('u')
  if (!u) return Response.json({ error: 'missing url' }, { status: 400 })

  let parsed
  try { parsed = new URL(u) } catch { return Response.json({ error: 'invalid url' }, { status: 400 }) }
  if (!ALLOWED_HOSTS.test(parsed.hostname)) {
    return Response.json({ error: 'unsupported host' }, { status: 400 })
  }

  try {
    const res = await fetch(u, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile',
        'Accept-Language': 'fr,en;q=0.7',
      },
    })
    const name = extractName(res.url)
    return Response.json({ name, finalUrl: res.url })
  } catch {
    return Response.json({ error: 'fetch failed' }, { status: 500 })
  }
}
