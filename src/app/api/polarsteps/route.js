// Proxy serveur vers l'API Polarsteps non-officielle.
//
// L'API publique de Polarsteps (utilisée par leur app mobile) expose les
// profils publics sur https://api.polarsteps.com/users/byusername/{username}.
// On ne peut pas l'appeler directement depuis le navigateur (pas de CORS),
// d'où ce proxy.
//
// Limites connues :
//   - Marche uniquement pour les profils publics (compte "public").
//   - L'API n'est pas documentée et peut casser à tout moment.
//   - On ne renvoie que les étapes au Japon (country_code === 'JP') pour
//     rester dans le scope de Namae.

const USERNAME_RE = /^[a-zA-Z0-9._-]{1,60}$/

function pickStep(step, tripName) {
  const lat = step?.location?.lat ?? step?.lat
  const lng = step?.location?.lon ?? step?.lon ?? step?.lng
  return {
    id: step?.id ?? null,
    name: step?.name || null,
    display_name: step?.display_name || null,
    lat, lng,
    country_code: step?.country_code ?? null,
    start_time: step?.start_time ?? null,
    trip_name: tripName,
  }
}

export async function GET(request) {
  const username = (new URL(request.url).searchParams.get('username') || '').trim()
  if (!username) return Response.json({ error: 'missing_username' }, { status: 400 })
  if (!USERNAME_RE.test(username)) return Response.json({ error: 'invalid_username' }, { status: 400 })

  try {
    const res = await fetch(`https://api.polarsteps.com/users/byusername/${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NamaeBot/1.0)',
        Accept: 'application/json',
      },
    })

    if (res.status === 404) return Response.json({ error: 'user_not_found' }, { status: 404 })
    if (!res.ok) return Response.json({ error: 'upstream_error', status: res.status }, { status: 502 })

    const data = await res.json().catch(() => null)
    if (!data) return Response.json({ error: 'invalid_response' }, { status: 502 })

    // L'API renvoie parfois `alltrips`, parfois `trips`, parfois un sous-arbre user — on cherche large.
    const trips =
      data.alltrips || data.trips ||
      data.user?.alltrips || data.user?.trips || []

    const japanSteps = []
    for (const trip of trips) {
      const tripName = trip?.name || null
      const steps = trip?.all_steps || trip?.steps || []
      for (const step of steps) {
        if (step?.country_code === 'JP') {
          japanSteps.push(pickStep(step, tripName))
        }
      }
    }

    // Tri par date décroissante (plus récents en haut).
    japanSteps.sort((a, b) => (b.start_time || 0) - (a.start_time || 0))

    return Response.json({
      username: data.username || data.user?.username || username,
      first_name: data.first_name || data.user?.first_name || null,
      total_japan_steps: japanSteps.length,
      total_trips: trips.length,
      steps: japanSteps,
    })
  } catch (err) {
    return Response.json({ error: 'fetch_failed', message: err?.message || String(err) }, { status: 502 })
  }
}
