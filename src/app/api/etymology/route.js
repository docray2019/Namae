// Route serveur : décomposition étymologique d'un lieu japonais via Claude Opus 4.7.
//
// Entrée : POST JSON { kanji?: string, latin?: string }
//   On accepte l'un OU l'autre (ou les deux) — Nominatim donne souvent les deux,
//   mais l'utilisateur peut aussi taper un nom au clavier.
// Sortie : JSON structuré décrit ci-dessous, à rendre directement par le front.
//
// Variable d'env requise (Vercel → Settings → Environment Variables) :
//   ANTHROPIC_API_KEY = sk-ant-…
//
// Modèle : claude-opus-4-7 (demandé explicitement). Adaptive thinking activé,
// effort "high" pour la qualité pédagogique. Le system prompt est gros et
// stable → on le marque cache_control:ephemeral pour amortir le coût sur les
// requêtes successives.

import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `Tu es un expert de la toponymie japonaise et tu rédiges des fiches étymologiques en français pour des francophones curieux qui découvrent la culture japonaise.

L'utilisateur te donne un nom de lieu (en kanji et/ou en alphabet latin). Tu produis une analyse étymologique sous forme STRICTEMENT JSON valide, sans markdown, sans balise de code, sans aucun texte hors-JSON.

Règles :

1. Si on te donne seulement le nom en alphabet latin, identifie le kanji canonique du lieu réel et utilise-le.
2. Si on te donne seulement le kanji, génère la romanisation Hepburn standard avec macrons : ō, ū, ē, ā (ex. Tōkyō, Ōsaka, Kyōto). N'utilise PAS la double voyelle (« Tokyo », « ou »).
3. Découpe le nom en segments cohérents : préfixe(s), nom principal, suffixe(s) administratifs. Un segment peut être plusieurs kanji (ex. 廿日 « le 20 du mois ») ou un seul (市 « ville »). Respecte l'ordre des kanji.
4. Pour chaque segment, fournis :
   - "text" : le ou les kanji du segment
   - "reading" : la lecture EFFECTIVE de ce segment DANS CE COMPOSÉ, en Hepburn avec macrons (pas la lecture isolée canonique du kanji)
   - "role" : "prefix" | "core" | "suffix" (un seul rôle par segment)
   - "fr" : sens contextuel en français, 5 mots max
   - "note" : explication pédagogique brève (1-2 phrases) sur le rôle de ce segment dans ce composé précis
5. Sois honnête sur les ambiguïtés. Cas classique : 廿日市市 (Hatsukaichi-shi) contient deux 市 — le premier signifie « marché » (lecture ichi), le second « ville » au sens administratif (-shi). Si une telle ambiguïté existe, explique-la dans la note du segment concerné.
6. "short_fr" : sens littéral global du nom en une phrase concise (ex. « la municipalité (-shi) du marché du 20 »).
7. "etymology_fr" : 2 à 4 phrases d'explication étymologique et/ou historique en français accessible.
8. "notable" : anecdote, contexte historique, ou repère culturel (1-2 phrases). Chaîne vide si rien de saillant.
9. Si tu ne reconnais pas le lieu ou si l'entrée n'est pas un toponyme japonais, renvoie quand même un JSON valide avec "kanji" et "romaji" vides et "short_fr" expliquant le souci.

Format de sortie OBLIGATOIRE (JSON pur, rien d'autre, pas de \`\`\`json) :

{
  "kanji": "東京",
  "romaji": "Tōkyō",
  "short_fr": "« la capitale de l'Est »",
  "parts": [
    {"text": "東", "reading": "tō", "role": "prefix", "fr": "est", "note": "Le point cardinal est. Dans ce composé, lecture sino-japonaise « tō », pas la kun'yomi isolée « higashi »."},
    {"text": "京", "reading": "kyō", "role": "core", "fr": "capitale", "note": "« Capitale impériale ». Au moment où Edo devient siège du pouvoir en 1868, on la renomme Tōkyō, littéralement « capitale de l'Est », en miroir de Kyōto (« capitale »)."}
  ],
  "etymology_fr": "Tōkyō est issu de la fusion de 東 (tō, est) et 京 (kyō, capitale). Le nom est moderne : il date de 1868, lorsque l'empereur Meiji déplace sa capitale d'Edo, qui devient « la capitale de l'Est » par opposition à Kyōto, ancien centre impérial à l'ouest.",
  "notable": "Edo, le nom précédent, signifie « la porte de l'estuaire » — référence au site originel du bourg, à l'embouchure de la rivière Sumida."
}`

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'no_api_key', message: 'ANTHROPIC_API_KEY absente côté serveur — ajoute-la dans Vercel → Settings → Environment Variables.' }, { status: 500 })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const kanji = (payload?.kanji || '').toString().trim()
  const latin = (payload?.latin || '').toString().trim()
  if (!kanji && !latin) return Response.json({ error: 'missing_input' }, { status: 400 })

  const userMessage = [
    kanji && `Nom en kanji : ${kanji}`,
    latin && `Nom en alphabet latin : ${latin}`,
  ].filter(Boolean).join('\n')

  const client = new Anthropic()

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: [{
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{ role: 'user', content: userMessage }],
    })

    if (response.stop_reason === 'refusal') {
      return Response.json({ error: 'refused', stop_details: response.stop_details ?? null }, { status: 502 })
    }

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock) return Response.json({ error: 'empty_response' }, { status: 502 })

    let data
    try {
      data = JSON.parse(textBlock.text)
    } catch {
      // Le modèle a parfois entouré la sortie d'un bloc de code malgré la consigne.
      const stripped = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
      try { data = JSON.parse(stripped) } catch {
        return Response.json({ error: 'unparseable_json', raw: textBlock.text.slice(0, 600) }, { status: 502 })
      }
    }

    return Response.json({
      ...data,
      usage: response.usage ? {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      } : undefined,
    })
  } catch (err) {
    return Response.json({ error: 'api_error', message: err?.message || String(err) }, { status: 502 })
  }
}
