'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, LEARN_COMPONENTS, normalizeRomaji } from '@/lib/japan/components'
import { decompose, mapEmbedUrl } from '@/lib/japan/parser'

const ROLE_LABEL = { prefix: 'Préfixe', core: 'Nom principal', suffix: 'Suffixe' }
const EXAMPLES = ['Tokyo', 'Kyoto', '金沢', 'Hiroshima', 'Shinjuku', 'Taitō', 'Nagasaki', '明治神宮', 'Fukuoka']
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'

// ── Stockage local (historique des analyses + préférences) ─────────────────
const HISTORY_KEY = 'namae_history_v1'
const HISTORY_MAX = 50

function loadHistory() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveHistoryEntry(entry) {
  if (typeof window === 'undefined' || !entry?.kanji) return
  try {
    const list = loadHistory()
    const dedup = list.filter((e) => e.kanji !== entry.kanji)
    dedup.unshift({
      kanji: entry.kanji,
      romaji: entry.romaji || null,
      short_fr: entry.short_fr || null,
      timestamp: Date.now(),
    })
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(dedup.slice(0, HISTORY_MAX)))
  } catch {}
}

function clearHistoryStorage() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(HISTORY_KEY) } catch {}
}

function formatRelativeTime(ts) {
  if (!ts) return ''
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return 'à l’instant'
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`
  if (diff < 86400 * 7) return `il y a ${Math.round(diff / 86400)} j`
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Reverse-geocoding via Nominatim (OpenStreetMap) — libre, sans clé. On demande
// les détails de nommage (`namedetails=1`) pour récupérer en une seule requête
// les variantes `name:ja` (kanji, ce qu'on décompose) et `name:en` (lecture
// latine à afficher à côté).
async function reverseGeocode(lat, lng, zoom) {
  const z = Math.min(18, Math.max(10, Math.round(zoom)))
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&namedetails=1&lat=${lat}&lon=${lng}&zoom=${z}&accept-language=ja`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const d = await res.json()
    const a = d?.address || {}
    const nd = d?.namedetails || {}
    const ja =
      nd['name:ja'] || nd.name ||
      d?.name ||
      a.attraction || a.tourism || a.shrine || a.temple ||
      a.neighbourhood || a.suburb || a.quarter || a.city_district ||
      a.town || a.village || a.city ||
      ''
    const en =
      nd['name:en'] || nd['int_name'] || nd['name:rm'] || nd['alt_name'] || ''
    return ja ? { ja, en: en || null } : null
  } catch {
    return null
  }
}

// Maps/Citymapper collent souvent « Nom\nAdresse » ou « Nom · Type · Ville » —
// on garde la 1re ligne utile (non-URL) et son 1er segment. Pour les URLs Maps
// reconnues, on essaie d'en extraire le nom du lieu.
function extractFromMapsUrl(url) {
  try {
    const u = new URL(url)
    const place = u.pathname.match(/\/maps\/place\/([^/@]+)/)
    if (place) return decodeURIComponent(place[1]).replace(/\+/g, ' ').split(',')[0].trim()
    const q = u.searchParams.get('q') || u.searchParams.get('query')
    if (q) return q.split(',')[0].trim()
  } catch {}
  return ''
}

function firstUsefulLine(raw) {
  const s = (raw || '').trim()
  if (!s) return ''
  for (const line of s.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    if (/^https?:\/\//i.test(line)) {
      const fromUrl = extractFromMapsUrl(line)
      if (fromUrl) return fromUrl
      continue // lien court opaque (maps.app.goo.gl, goo.gl/maps…) → on ignore
    }
    return line.split(/\s+[·•|]\s+/)[0].trim()
  }
  return ''
}

function catColor(comp) {
  return comp ? CATEGORIES[comp.cat].color : '#64748b'
}

// ── Pastille d'un segment (préfixe / nom principal / suffixe) ───────────────
function Segment({ part }) {
  const color = catColor(part.comp)
  return (
    <div className="seg" style={{ borderColor: color }}>
      <div className="seg-role" style={{ color }}>{ROLE_LABEL[part.role]}</div>
      <div className="seg-kanji" style={{ color }}>{part.comp ? part.comp.k : part.text}</div>
      <div className="seg-reading">{part.comp ? (part.reading || part.comp.romaji[0]) : part.text}</div>
      <div className="seg-fr">{part.comp ? part.comp.fr.split(',')[0] : '— inconnu —'}</div>
    </div>
  )
}

// ── Fiche détaillée d'un idéogramme ────────────────────────────────────────
// `reading` (optionnel) : lecture contextuelle dans le composé (ex. « tō »
// pour 東 dans Tōkyō). Quand fournie, on l'affiche en grand et on relègue
// les lectures canoniques dans la ligne « autres lectures ».
function KanjiCard({ comp, big, reading }) {
  const cat = CATEGORIES[comp.cat]
  const main = reading || comp.romaji[0]
  const others = reading
    ? comp.romaji.filter((r) => normalizeRomaji(r) !== normalizeRomaji(reading))
    : comp.romaji.slice(1)
  return (
    <div className="kcard" style={{ borderColor: cat.color }}>
      <div className="kcard-glyph" style={{ color: cat.color }}>{comp.k}</div>
      <div className="kcard-body">
        <div className="kcard-top">
          <span className="kcard-romaji">{main}</span>
          <span className="kcard-kana">{comp.kana}</span>
          <span className="kcard-cat" style={{ background: cat.color }}>{cat.emoji} {cat.label}</span>
        </div>
        <div className="kcard-fr">{comp.fr}</div>
        {big && <div className="kcard-note">{comp.note}</div>}
        {big && <div className="kcard-ex">📍 {comp.ex}</div>}
        <div className="kcard-meta">
          ✍️ {comp.strokes} traits
          {others.length > 0 && (
            <span> · {reading ? 'autres lectures' : 'lectures'} : {others.join(', ')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Carte interactive : l'utilisateur centre le lieu visé, on reverse-geocode
//    le centre via Nominatim (kanji + romaji). MapLibre GL JS rend des tuiles
//    vectorielles d'OpenFreeMap (libre, sans clé) : on récrit le style des
//    labels pour empiler `name:ja` au-dessus et `name:en` (ou `name:latin`)
//    en-dessous, donc chaque étiquette est bilingue sur la carte elle-même.
function MapPicker({ runRef }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [hint, setHint] = useState('Pinch pour zoomer, glisse pour déplacer — le lieu au centre sera analysé.')
  // Lieu candidat identifié par Nominatim au centre de la carte. L'utilisateur
  // confirme via le bouton « Analyser ce lieu » avant qu'on appelle l'API Opus
  // (qui est payante), pour éviter un appel par pan.
  const [candidate, setCandidate] = useState(null) // { ja, en } | null

  useEffect(() => {
    let map = null
    let cancelled = false
    let debounce = null
    // Liste des layers symboliques de la carte qui portent un texte (labels) —
    // peuplée après le chargement du style. On l'utilise pour interroger
    // uniquement les étiquettes effectivement rendues à l'écran.
    let labelLayerIds = []

    async function ensureMaplibre() {
      if (window.maplibregl) return
      if (!document.getElementById('maplibre-css')) {
        const css = document.createElement('link')
        css.id = 'maplibre-css'
        css.rel = 'stylesheet'
        css.href = MAPLIBRE_CSS
        document.head.appendChild(css)
      }
      await new Promise((resolve, reject) => {
        const existing = document.getElementById('maplibre-js')
        if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return }
        const s = document.createElement('script')
        s.id = 'maplibre-js'
        s.src = MAPLIBRE_JS
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
    }

    function bilingualTextField() {
      return [
        'case',
        ['all', ['has', 'name:ja'], ['any', ['has', 'name:en'], ['has', 'name:latin']]],
        [
          'format',
          ['get', 'name:ja'], {},
          '\n', {},
          ['coalesce', ['get', 'name:en'], ['get', 'name:latin']], { 'font-scale': 0.75 },
        ],
        ['coalesce', ['get', 'name:ja'], ['get', 'name:latin'], ['get', 'name:en'], ['get', 'name']],
      ]
    }

    function applyBilingualLabels() {
      const layers = map.getStyle().layers || []
      const ids = []
      for (const layer of layers) {
        if (layer.type !== 'symbol') continue
        if (!layer.layout || !('text-field' in layer.layout)) continue
        ids.push(layer.id)
        try { map.setLayoutProperty(layer.id, 'text-field', bilingualTextField()) } catch {}
      }
      labelLayerIds = ids
    }

    // Cherche dans les labels EFFECTIVEMENT rendus par MapLibre celui dont
    // l'ancre est la plus proche du centre. On ignore les features sans
    // géométrie de Point (routes, polygones administratifs) — ce sont des
    // labels secondaires peu utiles à l'étymologie. Si la mire vise au beau
    // milieu de Hiroshima alors que seul « 広島市 » est tracé, c'est ce
    // label qu'on récupère — pas un quartier invisible.
    function findVisibleLabelAtCenter() {
      if (!labelLayerIds.length) return null
      let features
      try { features = map.queryRenderedFeatures({ layers: labelLayerIds }) }
      catch { return null }
      if (!features?.length) return null
      const c = map.project(map.getCenter())
      let best = null
      let bestDist = Infinity
      for (const f of features) {
        const p = f.properties || {}
        const ja = p['name:ja'] || p.name
        if (!ja) continue
        if (f.geometry?.type !== 'Point') continue
        const px = map.project({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })
        const dx = px.x - c.x, dy = px.y - c.y
        const d = Math.hypot(dx, dy)
        if (d < bestDist) { bestDist = d; best = f }
      }
      if (!best) return null
      const p = best.properties || {}
      return {
        ja: p['name:ja'] || p.name,
        en: p['name:en'] || p['name:latin'] || null,
      }
    }

    async function init() {
      try { await ensureMaplibre() } catch {
        if (!cancelled) setHint('Impossible de charger la carte (réseau ?).')
        return
      }
      if (cancelled || !containerRef.current) return
      const ml = window.maplibregl
      map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [139.6503, 35.6762],
        zoom: 10,
        attributionControl: true,
      })
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        setLoading(false)
        applyBilingualLabels()
      })
      map.on('styledata', () => { if (map.isStyleLoaded()) applyBilingualLabels() })

      // Au repos du geste, on identifie le lieu au centre. Stratégie en deux temps :
      //   1) on regarde le label EFFECTIVEMENT rendu par MapLibre le plus proche
      //      du centre — c'est ce que l'utilisateur voit. Pas d'appel réseau.
      //   2) si rien de visible (zoom trop large, océan…), repli sur Nominatim.
      // L'analyse Opus n'est jamais lancée tant que le bouton n'est pas cliqué.
      map.on('movestart', () => setCandidate(null))
      map.on('moveend', () => {
        clearTimeout(debounce)
        debounce = setTimeout(async () => {
          // 1) Lecture des labels rendus
          const visible = findVisibleLabelAtCenter()
          if (visible) {
            setCandidate(visible)
            setHint(visible.en ? `📍 ${visible.ja} — ${visible.en}` : `📍 ${visible.ja}`)
            return
          }
          // 2) Repli Nominatim
          const c = map.getCenter()
          const z = map.getZoom()
          setHint('Identification du lieu au centre…')
          const found = await reverseGeocode(c.lat, c.lng, z)
          if (!found) { setHint('Aucun lieu nommé visible — déplace ou zoome encore.'); setCandidate(null); return }
          setCandidate({ ja: found.ja, en: found.en })
          setHint(found.en ? `📍 ${found.ja} — ${found.en}` : `📍 ${found.ja}`)
        }, 600)
      })
    }

    init()
    return () => {
      cancelled = true
      clearTimeout(debounce)
      map?.remove()
    }
  }, [])

  return (
    <div className="map-picker">
      <div ref={containerRef} className="map-picker-canvas" />

      {/* Étiquette centrale qui suit le centre de la carte : kanji + romaji du
          lieu courant. Remplace la mire — elle indique la cible ET donne le
          résultat de l'identification d'un coup d'œil. */}
      <div className="map-picker-overlay" aria-live="polite">
        {candidate ? (
          <>
            <div className="map-picker-overlay-ja">{candidate.ja}</div>
            {candidate.en && <div className="map-picker-overlay-en">{candidate.en}</div>}
          </>
        ) : (
          <div className="map-picker-overlay-placeholder">⊙ centre la cible sur un lieu</div>
        )}
      </div>

      {loading && <div className="map-picker-loading">Chargement de la carte…</div>}

      {candidate ? (
        <div className="map-picker-confirm-wrap">
          <button
            className="map-picker-confirm"
            onClick={() => runRef.current?.(candidate.ja, candidate.en)}
            title="Lance l'analyse étymologique de ce lieu (appel API)"
          >
            ✓ Analyser ce lieu
          </button>
        </div>
      ) : (
        <div className="map-picker-hint">{hint}</div>
      )}
    </div>
  )
}

const HAS_KANJI = /[㐀-鿿豈-﫿]/

const ROLE_COLOR = { prefix: '#fb923c', core: '#f472b6', suffix: '#2dd4bf' }

// Pastille compacte d'un segment renvoyé par l'IA (préfixe / nom principal / suffixe).
// Les suffixes sont volontairement plus petits et badgés — ils ne portent pas
// l'identité du lieu, juste sa fonction administrative ou topographique.
function AiSegment({ part }) {
  const color = ROLE_COLOR[part.role] || '#64748b'
  const isSuffix = part.role === 'suffix'
  const reading = isSuffix && part.reading ? `-${part.reading}` : part.reading
  return (
    <div className={`seg ${isSuffix ? 'is-suffix' : ''}`} style={{ borderColor: color, ...(isSuffix ? { background: `${color}1a` } : null) }}>
      <div className="seg-role" style={{ color }}>{ROLE_LABEL[part.role] || part.role}</div>
      <div className="seg-kanji" style={{ color }}>{part.text}</div>
      <div className="seg-reading">{reading}</div>
      <div className="seg-fr">{part.fr}</div>
    </div>
  )
}

// Fiche détaillée d'un segment, avec note pédagogique de l'IA, lectures kun/on
// et explication du choix de lecture dans ce composé précis. Les badges « kun »
// et « on » sont cliquables : ils déplient une définition courte du concept,
// utile au lecteur qui ne maîtrise pas encore les deux familles de lectures.
function AiPartCard({ part, onShowReadings }) {
  const color = ROLE_COLOR[part.role] || '#64748b'
  const isSuffix = part.role === 'suffix'
  const reading = isSuffix && part.reading ? `-${part.reading}` : part.reading
  const hasReadings = part.kun || part.on
  const [openExplain, setOpenExplain] = useState(null) // 'kun' | 'on' | null
  const toggle = (which) => setOpenExplain((cur) => (cur === which ? null : which))
  return (
    <div className={`kcard ${isSuffix ? 'is-suffix' : ''}`} style={{ borderColor: color, ...(isSuffix ? { background: `${color}14` } : null) }}>
      <div className="kcard-glyph" style={{ color }}>{part.text}</div>
      <div className="kcard-body">
        <div className="kcard-top">
          <span className="kcard-romaji">{reading}</span>
          <span className="kcard-cat" style={{ background: color }}>{ROLE_LABEL[part.role] || part.role}</span>
        </div>
        <div className="kcard-fr">{part.fr}</div>
        {part.note && <div className="kcard-note">{part.note}</div>}
        {hasReadings && (
          <div className="kcard-readings">
            <div className="krd-head">Lectures du kanji <span className="krd-hint">(clique sur kun / on)</span></div>
            {part.kun && (
              <div className="krd-row">
                <button
                  type="button"
                  className={`krd-tag krd-kun ${openExplain === 'kun' ? 'on' : ''}`}
                  onClick={() => toggle('kun')}
                  aria-expanded={openExplain === 'kun'}
                  aria-label="Qu’est-ce que la kun’yomi ?"
                >kun</button>
                <span className="krd-val">{part.kun}</span>
              </div>
            )}
            {part.on && (
              <div className="krd-row">
                <button
                  type="button"
                  className={`krd-tag krd-on ${openExplain === 'on' ? 'on' : ''}`}
                  onClick={() => toggle('on')}
                  aria-expanded={openExplain === 'on'}
                  aria-label="Qu’est-ce que la on’yomi ?"
                >on</button>
                <span className="krd-val">{part.on}</span>
              </div>
            )}
            {openExplain === 'kun' && (
              <div className="krd-explain krd-explain-kun">
                <strong>Kun’yomi (訓読み)</strong> — lecture <em>« japonaise native »</em>. C’est la prononciation
                d’origine japonaise du kanji, qui rendait dans l’écriture chinoise importée un mot déjà existant
                en japonais. On l’utilise typiquement quand le kanji est <strong>seul</strong> ou dans un mot
                d’origine purement japonaise. Ex. <span className="krd-ex">海 → umi (« la mer »)</span>.
                {onShowReadings && (
                  <button type="button" className="krd-more" onClick={onShowReadings}>
                    📚 Tout comprendre kun ↔ on avec Hokkaidō →
                  </button>
                )}
              </div>
            )}
            {openExplain === 'on' && (
              <div className="krd-explain krd-explain-on">
                <strong>On’yomi (音読み)</strong> — lecture <em>« sino-japonaise »</em>. C’est l’approximation
                japonaise de la prononciation chinoise médiévale du caractère, emportée avec le caractère lors
                de son emprunt. On la trouve surtout dans les <strong>composés savants</strong> de deux kanji
                ou plus. Ex. <span className="krd-ex">海洋 → kaiyō (« l’océan ») — 海 se lit kai</span>.
                {onShowReadings && (
                  <button type="button" className="krd-more" onClick={onShowReadings}>
                    📚 Tout comprendre kun ↔ on avec Hokkaidō →
                  </button>
                )}
              </div>
            )}
            {part.reading_choice_fr && (
              <div className="krd-choice">→ {part.reading_choice_fr}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  Mode EXPLORER
// ════════════════════════════════════════════════════════════════════════
function Explorer({ query, setQuery, submitted, submittedLatin, run, runRef, onShowReadings, onAnalyzed }) {
  // L'analyse étymologique est déléguée à un appel serveur (Claude Opus 4.7).
  // On envoie kanji + latin séparés quand on les a (typiquement depuis la carte
  // via Nominatim), sinon on devine d'après le script de l'entrée.
  const [analysis, setAnalysis] = useState({ loading: false, data: null, error: null })

  useEffect(() => {
    if (!submitted) { setAnalysis({ loading: false, data: null, error: null }); return }
    const looksKanji = HAS_KANJI.test(submitted)
    const body = looksKanji
      ? { kanji: submitted, latin: submittedLatin || null }
      : { kanji: null, latin: submittedLatin || submitted }

    const controller = new AbortController()
    setAnalysis({ loading: true, data: null, error: null })
    fetch('/api/etymology', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j) throw new Error(j?.message || j?.error || `HTTP ${r.status}`)
        if (j.error) throw new Error(j.message || j.error)
        return j
      })
      .then((data) => {
        setAnalysis({ loading: false, data, error: null })
        // Sauvegarde dans l'historique local (utilisé par l'onglet « Mon espace »).
        saveHistoryEntry(data)
        onAnalyzed?.()
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setAnalysis({ loading: false, data: null, error: err.message || 'Erreur inconnue' })
      })
    return () => controller.abort()
  }, [submitted, submittedLatin])

  const data = analysis.data

  return (
    <div>
      <MapPicker runRef={runRef} />
      <p className="howto">
        💡 Centre un lieu sur la carte (le nom s’affiche au centre) puis clique <strong>« Analyser ce lieu »</strong>.
      </p>

      {analysis.loading && (
        <div className="card ai-loading">
          <div className="ai-spinner" aria-hidden />
          <span>Analyse étymologique en cours… (Claude Opus 4.7)</span>
        </div>
      )}

      {analysis.error && (
        <div className="card ai-error">
          <strong>Erreur d’analyse</strong> — {analysis.error}
          <div className="ai-error-hint">
            Vérifie que <code>ANTHROPIC_API_KEY</code> est bien configurée dans Vercel → Settings → Environment Variables, puis réessaie.
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="card">
            <div className="card-head">
              <span className="card-title">
                {data.kanji || submitted}
                {data.romaji && <span className="latin"> — {data.romaji}</span>}
              </span>
              <span className="card-sub">{data.parts?.length || 0} segment{(data.parts?.length || 0) > 1 ? 's' : ''} analysé{(data.parts?.length || 0) > 1 ? 's' : ''}</span>
            </div>

            {data.short_fr && <p className="ai-short">{data.short_fr}</p>}

            <div className="segments">
              {(data.parts || []).map((p, i) => (
                <AiSegment key={i} part={p} />
              ))}
            </div>
          </div>

          {(data.parts || []).length > 0 && (
            <div className="details">
              <h3 className="section-h">Décomposition détaillée</h3>
              {data.parts.map((p, i) => (
                <AiPartCard key={i} part={p} onShowReadings={onShowReadings} />
              ))}
            </div>
          )}

          {data.etymology_fr && (
            <div className="ai-block">
              <h3 className="section-h">Étymologie</h3>
              <p className="ai-prose">{data.etymology_fr}</p>
            </div>
          )}

          {data.pedagogy_fr && (
            <div className="ai-block">
              <h3 className="section-h">Comprendre les lectures</h3>
              <p className="ai-prose">{data.pedagogy_fr}</p>
            </div>
          )}

          {data.analogy_fr && (
            <div className="ai-block ai-analogy">
              <h3 className="section-h">Une analogie en français</h3>
              <p className="ai-prose">{data.analogy_fr}</p>
            </div>
          )}

          {data.notable && (
            <div className="ai-block">
              <h3 className="section-h">À noter</h3>
              <p className="ai-prose">{data.notable}</p>
            </div>
          )}

          <div className="map-wrap">
            <h3 className="section-h">Sur la carte</h3>
            <iframe
              key={submitted}
              className="map"
              title={`Carte de ${data.kanji || submitted}`}
              src={mapEmbedUrl(data.kanji || submitted)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <p className="disclaimer">
            ⚠️ Outil pédagogique. Analyse étymologique générée par <strong>Claude Opus 4.7</strong>.
            La toponymie japonaise est souvent ambiguë : la décomposition proposée est une <em>meilleure
            interprétation</em>, pas une vérité unique. Recoupe avec une source académique pour les usages sérieux.
          </p>
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  Mode APPRENDRE
// ════════════════════════════════════════════════════════════════════════
function Learn() {
  const [filter, setFilter] = useState('all')
  const list = useMemo(
    () => (filter === 'all' ? LEARN_COMPONENTS : LEARN_COMPONENTS.filter((c) => c.cat === filter)),
    [filter]
  )

  return (
    <div>
      <div className="chips">
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          Tout ({LEARN_COMPONENTS.length})
        </button>
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <button
            key={key}
            className={`chip ${filter === key ? 'on' : ''}`}
            onClick={() => setFilter(key)}
            style={filter === key ? { background: cat.color, borderColor: cat.color, color: '#0f1623' } : { borderColor: cat.color }}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      <div className="learn-grid">
        {list.map((c) => (
          <KanjiCard key={c.k + c.romaji[0]} comp={c} big />
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  Mode QUIZ
// ════════════════════════════════════════════════════════════════════════
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQuiz(n = 10) {
  const pool = shuffle(LEARN_COMPONENTS).slice(0, n)
  return pool.map((target) => {
    const others = shuffle(LEARN_COMPONENTS.filter((c) => c.k !== target.k && c.fr !== target.fr)).slice(0, 3)
    const askKanji = Math.random() < 0.5
    const options = shuffle([target, ...others])
    return {
      askKanji, // true: montre le kanji, demande le sens
      target,
      prompt: askKanji ? target.k : target.fr,
      promptSub: askKanji ? `${target.romaji[0]} · ${target.kana}` : 'Quel idéogramme correspond ?',
      options: options.map((o) => ({ key: o.k, label: askKanji ? o.fr : o.k, correct: o.k === target.k })),
    }
  })
}

function Quiz() {
  const [quiz, setQuiz] = useState(() => buildQuiz())
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const q = quiz[idx]

  function pick(opt) {
    if (picked) return
    setPicked(opt)
    if (opt.correct) setScore((s) => s + 1)
  }

  function next() {
    if (idx + 1 >= quiz.length) { setDone(true); return }
    setIdx(idx + 1)
    setPicked(null)
  }

  function restart() {
    setQuiz(buildQuiz())
    setIdx(0)
    setPicked(null)
    setScore(0)
    setDone(false)
  }

  if (done) {
    const pct = Math.round((score / quiz.length) * 100)
    const msg = pct === 100 ? '完璧 ! Parfait !' : pct >= 70 ? 'よくできました — Bravo !' : pct >= 40 ? 'Pas mal, continuez !' : 'がんばって — Entraînez-vous encore !'
    return (
      <div className="quiz-done">
        <div className="quiz-score">{score} / {quiz.length}</div>
        <div className="quiz-pct">{pct}%</div>
        <p className="quiz-msg">{msg}</p>
        <button className="search-btn" onClick={restart}>Rejouer</button>
      </div>
    )
  }

  return (
    <div className="quiz">
      <div className="quiz-bar">
        <span>Question {idx + 1} / {quiz.length}</span>
        <span>Score : {score}</span>
      </div>
      <div className="quiz-progress"><div style={{ width: `${(idx / quiz.length) * 100}%` }} /></div>

      <div className="quiz-q">
        <div className="quiz-q-label">{q.askKanji ? 'Que signifie cet idéogramme ?' : 'Quel idéogramme signifie :'}</div>
        <div className={q.askKanji ? 'quiz-glyph' : 'quiz-word'}>{q.prompt}</div>
        <div className="quiz-q-sub">{q.promptSub}</div>
      </div>

      <div className="quiz-options">
        {q.options.map((opt) => {
          let cls = 'quiz-opt'
          if (picked) {
            if (opt.correct) cls += ' correct'
            else if (opt === picked) cls += ' wrong'
            else cls += ' dim'
          }
          return (
            <button key={opt.key} className={cls + (q.askKanji ? '' : ' glyph')} onClick={() => pick(opt)} disabled={!!picked}>
              {opt.label}
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="quiz-feedback">
          <KanjiCard comp={q.target} big />
          <button className="search-btn" onClick={next}>
            {idx + 1 >= quiz.length ? 'Voir le résultat' : 'Question suivante →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  Mode LECTURES — explication kun'yomi / on'yomi, exemplifiée sur 海 + Hokkaidō
// ════════════════════════════════════════════════════════════════════════
function ReadingsExplainer() {
  return (
    <div className="readings-page">
      <h2 className="readings-title">Kun'yomi & On'yomi <span className="readings-jp">訓読み・音読み</span></h2>
      <p className="readings-lede">
        Pourquoi un même kanji peut-il se lire de deux façons selon le mot ?
        Et pourquoi entend-on <em>kai</em> dans Hokkaidō plutôt que <em>umi</em> ?
        On déroule tout, en partant du kanji 海.
      </p>

      <section className="readings-section">
        <h3 className="readings-h">1. D'où vient cette double lecture ?</h3>
        <p>
          Vers le <strong>Ve siècle</strong>, le Japon emprunte l'écriture chinoise.
          Mais les Japonais parlaient déjà — leur propre langue (le japonais ancien) n'avait
          rien à voir avec le chinois. Quand ils ont importé les caractères chinois, ils ont
          fait <strong>deux choses en même temps</strong> :
        </p>
        <ul>
          <li>Associer chaque caractère à un mot japonais déjà existant qui avait le même sens
              → c'est la <strong>kun'yomi</strong> (« lecture sémantique », native).</li>
          <li>Garder aussi une approximation japonaise de la prononciation chinoise du caractère
              → c'est la <strong>on'yomi</strong> (« lecture sonore », importée).</li>
        </ul>
        <p>
          Du coup, presque chaque kanji standard a <strong>au moins deux lectures</strong>.
          La question, c'est : laquelle utiliser dans quel cas ?
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">2. Le cas du kanji 海 (la mer)</h3>
        <div className="kanji-spotlight">
          <div className="kanji-spotlight-glyph">海</div>
          <div className="kanji-spotlight-body">
            <div className="kanji-spotlight-fr">la mer</div>
            <div className="kanji-spotlight-readings">
              <div className="ksr-row">
                <span className="ksr-tag ksr-kun">kun</span>
                <span className="ksr-val">umi</span>
                <span className="ksr-kana">うみ</span>
                <span className="ksr-comment">— le mot japonais natif pour « la mer »</span>
              </div>
              <div className="ksr-row">
                <span className="ksr-tag ksr-on">on</span>
                <span className="ksr-val">kai</span>
                <span className="ksr-kana">かい</span>
                <span className="ksr-comment">— l'écho japonais du <em>hǎi</em> chinois</span>
              </div>
            </div>
          </div>
        </div>
        <p>
          Les deux lectures coexistent et désignent toutes les deux <strong>la même chose</strong> :
          la mer. Ce qui change, c'est <strong>le registre</strong> : <em>umi</em> est le mot quotidien,
          <em>kai</em> est la brique des composés savants.
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">3. La règle pratique</h3>
        <div className="rule-grid">
          <div className="rule-card rule-kun">
            <div className="rule-card-head">→ Kun'yomi (umi)</div>
            <div className="rule-card-when">Quand 海 est <strong>seul</strong> ou dans un mot d'origine <strong>purement japonaise</strong>.</div>
            <ul className="rule-card-ex">
              <li><span className="ex-jp">海</span> <span className="ex-rom">umi</span> — la mer</li>
              <li><span className="ex-jp">海辺</span> <span className="ex-rom">umibe</span> — le bord de mer</li>
              <li><span className="ex-jp">青海</span> <span className="ex-rom">aoumi</span> — la mer bleue</li>
            </ul>
          </div>
          <div className="rule-card rule-on">
            <div className="rule-card-head">→ On'yomi (kai)</div>
            <div className="rule-card-when">Quand 海 est dans un <strong>composé sino-japonais</strong> (souvent 2+ kanji, registre lettré, vocabulaire administratif ou savant).</div>
            <ul className="rule-card-ex">
              <li><span className="ex-jp">海洋</span> <span className="ex-rom">kaiyō</span> — l'océan</li>
              <li><span className="ex-jp">日本海</span> <span className="ex-rom">Nihonkai</span> — la mer du Japon</li>
              <li><span className="ex-jp">北海道</span> <span className="ex-rom">Hokkaidō</span> — la « route de la mer du Nord »</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="readings-section readings-hokkaido">
        <h3 className="readings-h">4. Pourquoi Hokkaidō et pas Kita-umi-michi ?</h3>
        <p>
          Hokkaidō est un nom <strong>moderne</strong> : il a été forgé en 1869, à l'époque Meiji, pour
          remplacer l'ancien nom de l'île d'Ezo. Le moule est <em>sino-japonais</em> — celui des
          grandes circonscriptions administratives (les anciens <em>kaidō</em>, « routes »).
          Donc les trois kanji prennent leur on'yomi :
        </p>
        <div className="hokkaido-breakdown">
          <div className="hb-row">
            <div className="hb-kanji">北</div>
            <div className="hb-vs">
              <div className="hb-on"><span className="ksr-tag ksr-on">on</span> hoku → hok</div>
              <div className="hb-kun"><span className="ksr-tag ksr-kun">kun</span> kita</div>
            </div>
            <div className="hb-meaning">nord</div>
          </div>
          <div className="hb-row">
            <div className="hb-kanji">海</div>
            <div className="hb-vs">
              <div className="hb-on"><span className="ksr-tag ksr-on">on</span> <strong>kai</strong></div>
              <div className="hb-kun"><span className="ksr-tag ksr-kun">kun</span> umi</div>
            </div>
            <div className="hb-meaning">mer</div>
          </div>
          <div className="hb-row">
            <div className="hb-kanji">道</div>
            <div className="hb-vs">
              <div className="hb-on"><span className="ksr-tag ksr-on">on</span> dō</div>
              <div className="hb-kun"><span className="ksr-tag ksr-kun">kun</span> michi</div>
            </div>
            <div className="hb-meaning">route, région</div>
          </div>
        </div>
        <div className="hb-result">
          <div className="hb-result-label">Lecture choisie (composé sino-japonais) :</div>
          <div className="hb-result-jp">北海道 → <strong>Hok·kai·dō</strong></div>
          <div className="hb-result-note">
            Si on lisait Hokkaidō en pures kun'yomi, on dirait « kita-umi-michi » : grammaticalement faisable,
            mais ça sonnerait comme un commentaire descriptif (« la route maritime du nord ») et pas comme
            un nom de province. Le japonais administratif <em>est</em> sino-japonais, comme le français
            administratif aime le latin (« infraction » plutôt que « faute »).
          </div>
        </div>
      </section>

      <section className="readings-section readings-analogy">
        <h3 className="readings-h">5. L'analogie qui sauve : eau / aqua-</h3>
        <p>
          En français, on a déjà ce mécanisme — sans s'en rendre compte. Le mot quotidien et le préfixe
          savant ne sont pas le même mot, mais désignent la même chose :
        </p>
        <table className="analogy-table">
          <thead>
            <tr><th>Sens</th><th>Mot courant</th><th>Composés savants</th></tr>
          </thead>
          <tbody>
            <tr><td>eau</td><td>l'<strong>eau</strong></td><td><strong>aqua</strong>tique, <strong>aqua</strong>relle, <strong>aqua</strong>duc</td></tr>
            <tr><td>terre</td><td>la <strong>terre</strong></td><td><strong>géo</strong>logie, <strong>géo</strong>graphie</td></tr>
            <tr><td>œil</td><td>un <strong>œil</strong></td><td><strong>ophtalmo</strong>logue, <strong>opti</strong>que</td></tr>
            <tr><td>la mer</td><td><strong>umi</strong> (海)</td><td><strong>kai</strong>yō (海洋), Hok<strong>kai</strong>dō (北海道)</td></tr>
          </tbody>
        </table>
        <p>
          La logique est exactement la même : la langue importe du vocabulaire savant d'un autre fonds
          (latin pour le français, chinois pour le japonais), et garde le mot natif pour le quotidien.
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">6. Mémo express</h3>
        <ul className="memo-list">
          <li><strong>Kanji seul ou avec hiragana de relation</strong> (の, を, を) → en général <em>kun'yomi</em>.</li>
          <li><strong>Deux kanji collés</strong>, surtout dans un registre administratif/savant → en général <em>on'yomi</em>.</li>
          <li><strong>Noms de lieux et noms de famille</strong> → exception : beaucoup ont leurs propres
              lectures, parfois irrégulières (<em>jukujikun</em>). Ex. 神戸 = Kōbe, pas « kami-to » ni « shin-ko ».</li>
          <li><strong>Phénomène de rendaku</strong> : la première consonne du second segment peut « se voiser »
              (k → g, h → b, s → z…). Ex. 川 <em>kawa</em> tout seul, mais 江戸<strong>川</strong> <em>Edogawa</em>.</li>
        </ul>
      </section>

      <p className="readings-coda">
        Tu peux maintenant relire l'analyse étymologique d'un lieu et comprendre <strong>pourquoi</strong>
        telle lecture est employée à chaque endroit du nom — pas juste la noter. Reviens à l'onglet
        🔍 <em>Explorer</em> et observe les badges <span className="krd-tag krd-kun" style={{cursor: 'default'}}>kun</span> /
        <span className="krd-tag krd-on" style={{cursor: 'default', marginLeft: 4}}>on</span> avec un œil neuf.
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  Mode MON ESPACE — historique local + import Polarsteps
// ════════════════════════════════════════════════════════════════════════
function Profile({ onAnalyze, historyTick }) {
  const [history, setHistory] = useState([])
  const [psUsername, setPsUsername] = useState('')
  const [psState, setPsState] = useState({ loading: false, data: null, error: null })

  useEffect(() => { setHistory(loadHistory()) }, [historyTick])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const u = window.localStorage.getItem('namae_ps_username')
      if (u) setPsUsername(u)
    } catch {}
  }, [])

  function fetchPolarsteps() {
    const u = psUsername.trim()
    if (!u) return
    try { window.localStorage.setItem('namae_ps_username', u) } catch {}
    setPsState({ loading: true, data: null, error: null })
    fetch(`/api/polarsteps?username=${encodeURIComponent(u)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j) throw new Error(j?.message || j?.error || `HTTP ${r.status}`)
        if (j.error) throw new Error(j.error === 'user_not_found' ? `Utilisateur « ${u} » introuvable ou profil privé.` : (j.message || j.error))
        return j
      })
      .then((data) => setPsState({ loading: false, data, error: null }))
      .catch((err) => setPsState({ loading: false, data: null, error: err.message || 'Erreur inconnue' }))
  }

  function clearAll() {
    if (!window.confirm('Effacer toutes les analyses sauvegardées ?')) return
    clearHistoryStorage()
    setHistory([])
  }

  return (
    <div className="profile-page">
      <h2 className="readings-title">Mon espace</h2>

      {/* ───── Historique des analyses ───── */}
      <section className="profile-section">
        <div className="profile-section-head">
          <h3 className="readings-h">📝 Mes dernières analyses</h3>
          {history.length > 0 && (
            <button className="profile-clear" onClick={clearAll}>Tout effacer</button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="profile-empty">
            Aucune analyse pour l’instant. Centre un lieu sur la carte de l’<em>Explorer</em>
            et clique <strong>« Analyser ce lieu »</strong> — il s’ajoutera ici automatiquement.
          </p>
        ) : (
          <ul className="hist-list">
            {history.map((e, i) => (
              <li key={i}>
                <button className="hist-item" onClick={() => onAnalyze(e.kanji, e.romaji)} title="Relancer l’analyse">
                  <div className="hist-jp">{e.kanji}</div>
                  <div className="hist-body">
                    {e.romaji && <div className="hist-rom">{e.romaji}</div>}
                    {e.short_fr && <div className="hist-short">{e.short_fr}</div>}
                  </div>
                  <div className="hist-when">{formatRelativeTime(e.timestamp)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="profile-help">
          L’historique est stocké uniquement <strong>sur ton appareil</strong> (localStorage du navigateur).
          Aucun envoi serveur, aucun compte requis.
        </p>
      </section>

      {/* ───── Import Polarsteps ───── */}
      <section className="profile-section">
        <h3 className="readings-h">🌍 Importer depuis Polarsteps</h3>
        <p className="profile-blurb">
          Si tu utilises <a href="https://polarsteps.com" target="_blank" rel="noreferrer">Polarsteps</a>
          pour tracer tes voyages, on peut récupérer toutes tes <strong>étapes au Japon</strong> et te laisser
          analyser leur étymologie d’un clic. Ça marche pour les profils <strong>publics</strong>.
        </p>
        <div className="ps-form">
          <input
            type="text"
            className="ps-input"
            value={psUsername}
            onChange={(e) => setPsUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchPolarsteps()}
            placeholder="ton-username-polarsteps"
            autoComplete="off"
            spellCheck="false"
          />
          <button className="ps-btn" onClick={fetchPolarsteps} disabled={psState.loading || !psUsername.trim()}>
            {psState.loading ? 'Chargement…' : 'Charger mes étapes'}
          </button>
        </div>
        {psState.error && (
          <div className="ps-error">{psState.error}</div>
        )}
        {psState.data && (
          <div className="ps-result">
            <p className="ps-summary">
              {psState.data.first_name && <>Bonjour <strong>{psState.data.first_name}</strong> · </>}
              <strong>{psState.data.total_japan_steps}</strong> étape{psState.data.total_japan_steps > 1 ? 's' : ''} au Japon
              sur {psState.data.total_trips} voyage{psState.data.total_trips > 1 ? 's' : ''}.
            </p>
            {psState.data.steps.length === 0 ? (
              <p className="profile-empty">Aucune étape au Japon dans ce profil.</p>
            ) : (
              <ul className="hist-list">
                {psState.data.steps.map((s) => {
                  const name = s.name || (s.display_name || '').split(',')[0].trim()
                  return (
                    <li key={s.id}>
                      <button
                        className="hist-item"
                        onClick={() => onAnalyze(null, name)}
                        title="Analyser l’étymologie de cette étape"
                      >
                        <div className="hist-body">
                          <div className="hist-rom">{name || '(sans nom)'}</div>
                          {s.trip_name && <div className="hist-short">{s.trip_name}</div>}
                        </div>
                        <div className="hist-when">
                          {s.start_time ? new Date(s.start_time * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
        <p className="profile-help">
          ⚠️ L’API Polarsteps n’est <strong>pas officielle</strong> — elle peut changer ou être bloquée à tout moment.
          Le nom d’utilisateur reste sur ton appareil, on ne le stocke nulle part côté serveur.
        </p>
      </section>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  Page
// ════════════════════════════════════════════════════════════════════════
export default function NamaePage() {
  const [tab, setTab] = useState('explore')
  // Aucune analyse au chargement : on attend une action utilisateur (clic sur
  // le bouton « Analyser ce lieu » de la carte, ou un Web Share Target entrant).
  // Évite un appel Opus parasite à chaque ouverture / refresh de la page.
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  // Variante en alphabet latin du dernier lieu analysé, quand connue (renvoyée
  // par Nominatim via `name:en`). Affichée à côté du kanji dans la fiche.
  const [submittedLatin, setSubmittedLatin] = useState(null)
  const [toast, setToast] = useState(null)
  // Tick incrémenté à chaque analyse réussie — permet au composant Profile
  // de rafraîchir sa liste localStorage en temps réel.
  const [historyTick, setHistoryTick] = useState(0)
  // Référence stable vers run(), pour que les handlers Leaflet (créés une seule
  // fois au montage) appellent toujours la dernière version.
  const runRef = useRef(null)

  function showToast(msg) {
    setToast(msg)
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => setToast(null), 3600)
  }

  function isMapsUrl(s) {
    return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps|g\.co\/kgs)/i.test(s)
  }

  function run(value, latin = null) {
    const v = (value ?? query).trim()
    if (!v) return
    setQuery(v)
    setSubmittedLatin(latin)

    // Cas spécial : URL Maps collée dans le champ — on la résout côté serveur
    // avant d'analyser. Évite à l'utilisateur d'avoir à extraire le nom à la main.
    if (isMapsUrl(v)) {
      setSubmitted('') // n'affiche pas l'analyse de l'URL pendant la résolution
      showToast('Résolution du lien Maps…')
      fetch(`/api/resolve-maps?u=${encodeURIComponent(v)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.name) {
            setQuery(data.name)
            setSubmitted(data.name)
            showToast(`Résolu : « ${data.name} »`)
          } else {
            showToast('Lien non résolu — tape le nom à la main.')
          }
        })
        .catch(() => showToast('Échec de la résolution — réessaie ou tape le nom.'))
      return
    }

    setSubmitted(v)
  }
  runRef.current = run


  // Web Share Target + PWA :
  //   • Enregistre le service worker (requis pour rendre l'app installable, donc
  //     pour apparaître dans la share sheet du système).
  //   • Si l'app a été ouverte via un partage (URL `?name=…&text=…&url=…`),
  //     extrait le nom du lieu et lance l'analyse — puis nettoie l'URL pour
  //     que recharger ne re-déclenche pas.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const params = new URLSearchParams(window.location.search)
    const payload = [params.get('name'), params.get('text'), params.get('url')]
      .filter(Boolean).join('\n')
    if (!payload) return
    setTab('explore')

    const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname)

    // 1) Nom trouvable côté client (titre / texte / URL longue Maps) → on lance.
    const name = firstUsefulLine(payload)
    if (name) { run(name); showToast(`Reçu : « ${name} »`); cleanUrl(); return }

    // 2) URL Maps courte → on délègue à run() qui appelle le résolveur serveur.
    const urlMatch = payload.match(/https?:\/\/\S+/i)
    if (urlMatch) { run(urlMatch[0]); cleanUrl(); return }

    // 3) Rien d'exploitable → message.
    showToast('Lien Maps reçu — pioche un lieu sur la carte.')
    cleanUrl()
  }, [])

  return (
    <>
      <style>{CSS}</style>

      {toast && <div className="toast">{toast}</div>}

      <div className="page">
        <header className="header">
          <div className="brand">
            <span className="brand-jp">名前</span>
            <span className="brand-name">Namae</span>
          </div>
          <p className="tagline">
            Comprenez l’étymologie des lieux japonais : préfixe · nom principal · suffixe
          </p>
        </header>

        <nav className="tabs">
          <button className={`tab ${tab === 'explore' ? 'on' : ''}`} onClick={() => setTab('explore')}>🔍 Explorer</button>
          <button className={`tab ${tab === 'readings' ? 'on' : ''}`} onClick={() => setTab('readings')}>📚 Lectures</button>
          <button className={`tab ${tab === 'learn' ? 'on' : ''}`} onClick={() => setTab('learn')}>📖 Apprendre</button>
          <button className={`tab ${tab === 'quiz' ? 'on' : ''}`} onClick={() => setTab('quiz')}>🎯 Quiz</button>
          <button className={`tab ${tab === 'profile' ? 'on' : ''}`} onClick={() => setTab('profile')}>👤 Mon espace</button>
        </nav>

        <main className="main">
          {tab === 'explore' && <Explorer query={query} setQuery={setQuery} submitted={submitted} submittedLatin={submittedLatin} run={run} runRef={runRef} onShowReadings={() => setTab('readings')} onAnalyzed={() => setHistoryTick((t) => t + 1)} />}
          {tab === 'readings' && <ReadingsExplainer />}
          {tab === 'learn' && <Learn />}
          {tab === 'quiz' && <Quiz />}
          {tab === 'profile' && <Profile historyTick={historyTick} onAnalyze={(ja, en) => { setTab('explore'); runRef.current?.(ja || en, en || null) }} />}
        </main>

        <footer className="footer">名前 Namae · aide pédagogique à la toponymie japonaise</footer>
      </div>
    </>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600;700&family=Noto+Serif+JP:wght@400;600&display=swap');
* { box-sizing: border-box; }
.page {
  font-family: 'DM Sans', sans-serif;
  background: radial-gradient(1200px 600px at 50% -10%, #1c2740 0%, #0f1623 55%);
  color: #e8edf5;
  min-height: 100vh;
  margin: 0;
  padding: 40px 20px 64px;
  max-width: 920px;
  margin: 0 auto;
}
.header { text-align: center; margin-bottom: 28px; }
.brand { display: inline-flex; align-items: baseline; gap: 12px; }
.brand-jp { font-family: 'Noto Serif JP', serif; font-size: 40px; color: #f472b6; }
.brand-name { font-family: 'DM Serif Display', serif; font-size: 40px; color: #e8edf5; }
.tagline { font-size: 15px; color: #94a3b8; margin: 10px auto 0; max-width: 520px; line-height: 1.5; }

.tabs { display: flex; gap: 8px; justify-content: center; margin-bottom: 28px; flex-wrap: wrap; }
.tab {
  font-family: inherit; font-size: 14.5px; font-weight: 500;
  background: #161e2e; color: #94a3b8; border: 1px solid #2a3a54;
  padding: 10px 18px; border-radius: 999px; cursor: pointer; transition: all .15s;
}
.tab:hover { color: #e8edf5; border-color: #3b4d6b; }
.tab.on { background: #f472b6; color: #0f1623; border-color: #f472b6; font-weight: 600; }

.main { min-height: 300px; }


.toast {
  position: fixed; top: 70px; right: 16px; z-index: 1000; max-width: min(360px, calc(100vw - 32px));
  font-family: 'DM Sans', sans-serif; font-size: 13.5px; line-height: 1.5;
  background: #1c2740; color: #e8edf5; border: 1px solid #3b4d6b;
  padding: 12px 16px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.35);
  animation: toastIn .2s;
}
@keyframes toastIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; } }

.howto {
  font-size: 13.5px; color: #cbd5e1; line-height: 1.6;
  background: rgba(244,114,182,.07); border: 1px solid rgba(244,114,182,.25);
  border-radius: 12px; padding: 12px 16px; margin: 0 0 16px;
}
.howto strong { color: #f9a8d4; font-weight: 600; }

/* Sélecteur de lieu par carte (Leaflet + Nominatim) */
.map-picker { position: relative; margin: 0 0 16px; }
.map-picker-canvas {
  width: 100%; height: 320px;
  border: 1px solid #2a3a54; border-radius: 14px; overflow: hidden;
  background: #161e2e;
}
.map-picker-canvas .maplibregl-canvas { filter: brightness(0.85) contrast(1.05); }
.maplibregl-ctrl-attrib { font-size: 10px; opacity: 0.7; }

/* Étiquette centrale superposée à la carte (remplace la mire). */
.map-picker-overlay {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center;
  pointer-events: none; z-index: 500; user-select: none;
  text-align: center;
}
.map-picker-overlay-ja {
  font-family: 'Noto Serif JP', serif;
  font-size: 38px; line-height: 1.1; font-weight: 600;
  color: #f472b6;
  text-shadow:
    0 0 3px #0f1623, 0 0 6px #0f1623, 0 0 10px #0f1623,
    -1px -1px 0 rgba(15,22,35,.9), 1px 1px 0 rgba(15,22,35,.9);
}
.map-picker-overlay-en {
  font-family: 'DM Serif Display', serif;
  font-size: 16px; font-style: italic;
  color: #fdf2f8; margin-top: 2px;
  text-shadow: 0 0 3px #0f1623, 0 0 6px #0f1623, -1px -1px 0 rgba(15,22,35,.9), 1px 1px 0 rgba(15,22,35,.9);
}
.map-picker-overlay-placeholder {
  font-size: 13px; font-weight: 500;
  color: rgba(244,114,182,.85);
  text-shadow: 0 0 4px #0f1623, 0 0 8px #0f1623;
  letter-spacing: .02em;
}
.map-picker-loading {
  position: absolute; top: 18px; left: 50%; transform: translateX(-50%);
  font-size: 13px; color: #e8edf5;
  background: rgba(15,22,35,.75); padding: 4px 12px; border-radius: 999px;
}
.map-picker-hint {
  font-size: 13px; color: #94a3b8; line-height: 1.5;
  margin-top: 10px; padding: 0 4px;
}
.map-picker-confirm-wrap {
  display: flex; justify-content: center; margin-top: 12px;
  animation: foundIn .2s ease-out;
}
@keyframes foundIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.map-picker-confirm {
  font-family: inherit; font-size: 15px; font-weight: 600;
  background: #f472b6; color: #0f1623; border: none;
  padding: 11px 26px; border-radius: 999px; cursor: pointer;
  box-shadow: 0 6px 18px rgba(244,114,182,.30);
  transition: filter .15s, transform .12s;
}
.map-picker-confirm:hover { filter: brightness(1.07); transform: translateY(-1px); }
.map-picker-confirm:active { transform: translateY(0); }

@media (max-width: 560px) {
  .map-picker-overlay-ja { font-size: 32px; }
  .map-picker-overlay-en { font-size: 14px; }
}

/* Recherche */
.search { display: flex; gap: 10px; margin-bottom: 14px; }
.search-input {
  flex: 1; font-family: inherit; font-size: 16px;
  background: #161e2e; color: #e8edf5; border: 1px solid #2a3a54;
  border-radius: 12px; padding: 14px 16px; outline: none;
}
.search-input:focus { border-color: #f472b6; }
.search-btn {
  font-family: inherit; font-size: 15px; font-weight: 600;
  background: #f472b6; color: #0f1623; border: none;
  border-radius: 12px; padding: 0 22px; cursor: pointer; transition: filter .15s;
}
.search-btn:hover { filter: brightness(1.08); }

.chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
.chip {
  font-family: inherit; font-size: 13.5px;
  background: transparent; color: #cbd5e1; border: 1px solid #2a3a54;
  padding: 7px 13px; border-radius: 999px; cursor: pointer; transition: all .15s;
}
.chip:hover { border-color: #f472b6; color: #fff; }
.chip.on { background: #f472b6; color: #0f1623; border-color: #f472b6; font-weight: 600; }

/* Carte de décomposition */
.card {
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 16px;
  padding: 22px; margin-bottom: 24px;
}
.card-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.card-title { font-family: 'DM Serif Display', serif; font-size: 24px; }
.resolved { font-family: 'Noto Serif JP', serif; color: #f472b6; }
.latin { font-family: 'DM Serif Display', serif; color: #94a3b8; font-size: 0.78em; font-style: italic; }
.card-sub { font-size: 13px; color: #94a3b8; }

.segments { display: flex; gap: 12px; flex-wrap: wrap; align-items: stretch; }
.seg {
  flex: 1; min-width: 120px; text-align: center;
  background: #0f1623; border: 2px solid; border-radius: 14px; padding: 16px 12px;
}
.seg-role { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
.seg-kanji { font-family: 'Noto Serif JP', serif; font-size: 44px; line-height: 1; margin-bottom: 8px; }
.seg-reading { font-size: 14px; color: #e8edf5; font-weight: 500; }
.seg-fr { font-size: 12.5px; color: #94a3b8; margin-top: 2px; }

/* Suffixes : plus petits et clairement badgés (fond teinté + bordure forte). */
.seg.is-suffix {
  flex: 0 0 auto; min-width: 110px;
  padding: 10px 18px;
  border-width: 1.5px;
  border-radius: 999px;
  align-self: center;
}
.seg.is-suffix .seg-role { font-size: 10px; margin-bottom: 4px; }
.seg.is-suffix .seg-kanji { font-size: 26px; margin-bottom: 4px; line-height: 1; }
.seg.is-suffix .seg-reading { font-size: 11px; font-weight: 600; opacity: 0.95; }
.seg.is-suffix .seg-fr { font-size: 10.5px; margin-top: 1px; opacity: 0.85; }

.kcard.is-suffix { padding: 10px 14px; }
.kcard.is-suffix .kcard-glyph { font-size: 36px; width: 48px; }
.kcard.is-suffix .kcard-romaji { font-size: 15px; }

.empty { color: #94a3b8; font-size: 14px; margin: 16px 0 0; line-height: 1.6; }
.inline-ex { background: none; border: none; color: #f472b6; cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }

.section-h { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin: 0 0 12px; }
.details { margin-bottom: 24px; }

/* Fiche idéogramme */
.kcard {
  display: flex; gap: 16px; align-items: center;
  background: #161e2e; border: 1px solid; border-left-width: 4px; border-radius: 12px;
  padding: 14px 16px; margin-bottom: 12px;
}
.kcard-glyph { font-family: 'Noto Serif JP', serif; font-size: 52px; line-height: 1; flex-shrink: 0; width: 64px; text-align: center; }
.kcard-body { flex: 1; min-width: 0; }
.kcard-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.kcard-romaji { font-weight: 700; font-size: 17px; }
.kcard-kana { font-family: 'Noto Serif JP', serif; color: #cbd5e1; font-size: 14px; }
.kcard-cat { font-size: 11px; font-weight: 600; color: #0f1623; padding: 2px 8px; border-radius: 999px; }
.kcard-fr { font-size: 15px; color: #e8edf5; margin-bottom: 4px; }
.kcard-note { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 4px; }
.kcard-ex { font-size: 13px; color: #cbd5e1; margin-bottom: 4px; }
.kcard-meta { font-size: 12px; color: #64748b; }
.alts { font-size: 12.5px; color: #94a3b8; margin: -4px 0 12px 8px; padding-left: 12px; border-left: 2px solid #2a3a54; }

/* Blocs spécifiques à l'analyse IA */
.ai-short { font-family: 'DM Serif Display', serif; color: #f9a8d4; font-size: 18px; line-height: 1.5; margin: 0 0 18px; font-style: italic; }
.ai-block { margin-bottom: 24px; }
.ai-prose { font-size: 14.5px; color: #e8edf5; line-height: 1.65; margin: 0; }
.ai-loading {
  display: flex; align-items: center; gap: 12px;
  font-size: 14px; color: #94a3b8;
}
.ai-spinner {
  width: 16px; height: 16px;
  border: 2px solid #2a3a54; border-top-color: #f472b6; border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.ai-error {
  border-color: #f87171 !important; background: rgba(248,113,113,.08);
  font-size: 14px; color: #fca5a5; line-height: 1.55;
}
.ai-error code { background: rgba(15,22,35,.6); padding: 1px 6px; border-radius: 4px; font-size: 12.5px; }
.ai-error-hint { font-size: 12.5px; color: #94a3b8; margin-top: 8px; line-height: 1.5; }

/* Tableau kun/on dans la fiche détaillée. */
.kcard-readings {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px dashed #2a3a54;
  font-size: 13px;
}
.krd-head {
  font-size: 10.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .08em; color: #94a3b8; margin-bottom: 6px;
}
.krd-hint { text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 10.5px; color: #64748b; margin-left: 4px; }
.krd-row { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.krd-tag {
  display: inline-block; min-width: 36px;
  font-family: inherit;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 3px 7px; border-radius: 5px; text-align: center;
  border: 1px solid transparent; cursor: pointer; transition: filter .12s, transform .12s, border-color .12s;
}
.krd-tag:hover { filter: brightness(1.15); transform: translateY(-1px); }
.krd-tag:active { transform: translateY(0); }
.krd-kun { background: rgba(74,222,128,.18); color: #4ade80; }
.krd-on  { background: rgba(56,189,248,.18); color: #38bdf8; }
.krd-kun.on { border-color: #4ade80; background: rgba(74,222,128,.30); }
.krd-on.on  { border-color: #38bdf8; background: rgba(56,189,248,.30); }
.krd-val { font-family: 'Noto Serif JP', serif; color: #e8edf5; }

.krd-explain {
  margin-top: 8px; padding: 10px 12px;
  font-size: 12.5px; line-height: 1.55; color: #e8edf5;
  border-radius: 8px;
  animation: krdIn .18s ease-out;
}
@keyframes krdIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
.krd-explain-kun { background: rgba(74,222,128,.10); border-left: 3px solid #4ade80; }
.krd-explain-on  { background: rgba(56,189,248,.10); border-left: 3px solid #38bdf8; }
.krd-explain strong { font-weight: 700; }
.krd-explain em { color: #cbd5e1; font-style: italic; }
.krd-ex {
  display: inline-block; margin-left: 4px;
  font-family: 'Noto Serif JP', serif;
  background: rgba(15,22,35,.6); padding: 1px 7px; border-radius: 4px;
}

.krd-choice {
  margin-top: 8px; padding-left: 8px;
  border-left: 2px solid #f472b6;
  font-size: 12.5px; color: #cbd5e1; line-height: 1.5; font-style: italic;
}

/* Bloc analogie : sidebar visuelle pour bien le séparer du reste. */
.ai-analogy .ai-prose {
  background: rgba(244,114,182,.06); border-left: 3px solid #f472b6;
  padding: 12px 14px; border-radius: 0 10px 10px 0; font-style: italic;
}

/* Lien « tout comprendre » dans les encarts kun/on. */
.krd-more {
  display: block; margin-top: 10px;
  font-family: inherit; font-size: 12.5px; font-weight: 600;
  background: rgba(15,22,35,.5); color: #f9a8d4; border: 1px solid rgba(244,114,182,.3);
  padding: 6px 12px; border-radius: 999px; cursor: pointer;
  transition: filter .15s, border-color .15s;
}
.krd-more:hover { filter: brightness(1.1); border-color: #f472b6; }

/* ═══ Page LECTURES ═══════════════════════════════════════════════════ */
.readings-page { font-size: 15px; line-height: 1.7; color: #e8edf5; }
.readings-title {
  font-family: 'DM Serif Display', serif; font-size: 32px; line-height: 1.1;
  margin: 0 0 8px; color: #f472b6;
}
.readings-jp { font-family: 'Noto Serif JP', serif; font-size: 22px; color: #fdf2f8; margin-left: 8px; }
.readings-lede {
  font-size: 15.5px; color: #cbd5e1; line-height: 1.65;
  background: rgba(244,114,182,.06); border-left: 3px solid #f472b6;
  padding: 14px 16px; border-radius: 0 12px 12px 0;
  margin: 0 0 28px;
}

.readings-section { margin-bottom: 30px; }
.readings-h {
  font-family: 'DM Serif Display', serif; font-size: 21px;
  color: #e8edf5; margin: 0 0 10px;
}
.readings-section p { margin: 0 0 12px; }
.readings-section ul { margin: 0 0 12px; padding-left: 22px; }
.readings-section li { margin-bottom: 8px; }

/* Spotlight sur 海 */
.kanji-spotlight {
  display: flex; gap: 18px; align-items: center;
  background: #161e2e; border: 1px solid #2a3a54; border-left: 4px solid #38bdf8;
  border-radius: 14px; padding: 18px 20px; margin: 16px 0;
}
.kanji-spotlight-glyph {
  font-family: 'Noto Serif JP', serif; font-size: 88px; line-height: 1;
  color: #f472b6; flex-shrink: 0;
}
.kanji-spotlight-fr {
  font-family: 'DM Serif Display', serif; font-size: 22px; color: #e8edf5;
  font-style: italic; margin-bottom: 8px;
}
.kanji-spotlight-readings { display: flex; flex-direction: column; gap: 6px; }
.ksr-row { display: flex; align-items: baseline; gap: 8px; font-size: 14px; flex-wrap: wrap; }
.ksr-tag {
  display: inline-block; min-width: 36px;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 3px 7px; border-radius: 5px; text-align: center;
}
.ksr-kun { background: rgba(74,222,128,.18); color: #4ade80; }
.ksr-on  { background: rgba(56,189,248,.18); color: #38bdf8; }
.ksr-val { font-weight: 600; color: #e8edf5; }
.ksr-kana { font-family: 'Noto Serif JP', serif; color: #cbd5e1; }
.ksr-comment { color: #94a3b8; font-style: italic; font-size: 13.5px; }

/* Règle pratique : deux colonnes côte à côte */
.rule-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0;
}
.rule-card {
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 14px;
  padding: 16px;
}
.rule-kun { border-left: 4px solid #4ade80; }
.rule-on  { border-left: 4px solid #38bdf8; }
.rule-card-head { font-weight: 700; margin-bottom: 6px; font-size: 15px; }
.rule-kun .rule-card-head { color: #4ade80; }
.rule-on  .rule-card-head { color: #38bdf8; }
.rule-card-when { font-size: 13.5px; color: #cbd5e1; margin-bottom: 12px; line-height: 1.55; }
.rule-card-ex { list-style: none; padding: 0; margin: 0; }
.rule-card-ex li { display: flex; gap: 10px; align-items: baseline; margin-bottom: 6px; font-size: 13.5px; flex-wrap: wrap; }
.ex-jp { font-family: 'Noto Serif JP', serif; font-size: 18px; color: #e8edf5; flex-shrink: 0; min-width: 60px; }
.ex-rom { color: #cbd5e1; }

/* Hokkaido breakdown */
.readings-hokkaido { background: rgba(56,189,248,.04); border: 1px solid rgba(56,189,248,.18); border-radius: 14px; padding: 18px 20px; }
.hokkaido-breakdown {
  display: flex; flex-direction: column; gap: 8px;
  background: #0f1623; border-radius: 12px; padding: 14px;
  margin: 12px 0;
}
.hb-row {
  display: grid; grid-template-columns: 60px 1fr auto; gap: 16px;
  align-items: center; padding: 8px 6px;
  border-bottom: 1px solid #1c2740;
}
.hb-row:last-child { border-bottom: none; }
.hb-kanji {
  font-family: 'Noto Serif JP', serif; font-size: 46px; line-height: 1;
  color: #f472b6; text-align: center;
}
.hb-vs { display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; }
.hb-on, .hb-kun { display: flex; gap: 8px; align-items: baseline; }
.hb-on strong { color: #38bdf8; font-size: 15px; }
.hb-meaning { color: #94a3b8; font-size: 13.5px; font-style: italic; text-align: right; }

.hb-result {
  background: rgba(56,189,248,.10); border-left: 3px solid #38bdf8;
  border-radius: 0 10px 10px 0; padding: 12px 14px; margin-top: 12px;
}
.hb-result-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-bottom: 4px; font-weight: 600; }
.hb-result-jp { font-family: 'Noto Serif JP', serif; font-size: 24px; color: #e8edf5; margin-bottom: 8px; }
.hb-result-jp strong { color: #38bdf8; }
.hb-result-note { font-size: 13.5px; color: #cbd5e1; line-height: 1.55; }

/* Analogie */
.readings-analogy { }
.analogy-table {
  width: 100%; border-collapse: collapse; font-size: 14px;
  margin: 12px 0; background: #161e2e; border-radius: 12px; overflow: hidden;
}
.analogy-table th, .analogy-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #2a3a54; }
.analogy-table th { background: #1c2740; color: #94a3b8; font-size: 12.5px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
.analogy-table tr:last-child td { border-bottom: none; }
.analogy-table strong { color: #f9a8d4; font-weight: 700; }

/* Mémo */
.memo-list { list-style: none; padding: 0; }
.memo-list li {
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 10px;
  padding: 10px 14px; margin-bottom: 8px; font-size: 14px;
}

.readings-coda {
  text-align: center; font-size: 14px; color: #cbd5e1;
  background: rgba(244,114,182,.05); border: 1px dashed rgba(244,114,182,.25);
  border-radius: 12px; padding: 14px 16px;
  margin-top: 24px;
}

/* ═══ Page MON ESPACE ════════════════════════════════════════════════ */
.profile-page { font-size: 14.5px; line-height: 1.6; color: #e8edf5; }
.profile-section { margin-bottom: 36px; }
.profile-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.profile-section-head .readings-h { margin: 0; }
.profile-clear {
  font-family: inherit; font-size: 12.5px;
  background: transparent; color: #94a3b8; border: 1px solid #2a3a54;
  padding: 5px 10px; border-radius: 999px; cursor: pointer;
  transition: color .15s, border-color .15s;
}
.profile-clear:hover { color: #f87171; border-color: #f87171; }
.profile-empty { color: #94a3b8; font-size: 13.5px; background: #161e2e; border: 1px dashed #2a3a54; border-radius: 12px; padding: 14px 16px; line-height: 1.55; }
.profile-help { font-size: 12px; color: #64748b; margin-top: 10px; line-height: 1.55; }
.profile-blurb { color: #cbd5e1; margin: 0 0 12px; }
.profile-blurb a { color: #f9a8d4; }

.hist-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.hist-item {
  display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center;
  width: 100%; text-align: left; font-family: inherit;
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px;
  padding: 12px 14px; cursor: pointer;
  transition: border-color .15s, background .15s, transform .12s;
}
.hist-item:hover { border-color: #f472b6; background: #1c2740; transform: translateY(-1px); }
.hist-jp { font-family: 'Noto Serif JP', serif; font-size: 28px; color: #f472b6; line-height: 1; text-align: center; }
.hist-body { min-width: 0; }
.hist-rom { font-weight: 600; color: #e8edf5; font-size: 15px; }
.hist-short { font-size: 12.5px; color: #94a3b8; font-style: italic; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
.hist-when { font-size: 11.5px; color: #64748b; white-space: nowrap; }

.ps-form { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
.ps-input {
  flex: 1; min-width: 160px;
  font-family: inherit; font-size: 14.5px;
  background: #161e2e; color: #e8edf5; border: 1px solid #2a3a54;
  border-radius: 10px; padding: 10px 14px; outline: none;
}
.ps-input:focus { border-color: #f472b6; }
.ps-btn {
  font-family: inherit; font-size: 14px; font-weight: 600;
  background: #f472b6; color: #0f1623; border: none;
  border-radius: 10px; padding: 0 18px; cursor: pointer; transition: filter .15s;
}
.ps-btn:hover:not(:disabled) { filter: brightness(1.08); }
.ps-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ps-error {
  color: #fca5a5; background: rgba(248,113,113,.08);
  border: 1px solid rgba(248,113,113,.3); border-radius: 10px;
  padding: 10px 14px; font-size: 13.5px; margin-bottom: 12px;
}
.ps-summary { color: #cbd5e1; margin: 0 0 10px; }

@media (max-width: 560px) {
  .hist-item { grid-template-columns: 44px 1fr; }
  .hist-jp { font-size: 24px; }
  .hist-when { grid-column: 2; margin-top: 2px; }
}

@media (max-width: 560px) {
  .readings-title { font-size: 26px; }
  .readings-jp { font-size: 18px; display: block; margin: 4px 0 0; }
  .kanji-spotlight { flex-direction: column; text-align: center; }
  .kanji-spotlight-glyph { font-size: 72px; }
  .rule-grid { grid-template-columns: 1fr; }
  .hb-row { grid-template-columns: 50px 1fr; row-gap: 4px; }
  .hb-meaning { grid-column: 2; text-align: left; }
  .hb-kanji { font-size: 36px; }
  .hb-result-jp { font-size: 20px; }
  .analogy-table { font-size: 13px; }
  .analogy-table th, .analogy-table td { padding: 8px 10px; }
}

/* Carte */
.map-wrap { margin-bottom: 20px; }
.map { width: 100%; height: 340px; border: 1px solid #2a3a54; border-radius: 14px; }
.disclaimer { font-size: 12.5px; color: #64748b; line-height: 1.6; background: rgba(148,163,184,.06); border: 1px solid #2a3a54; border-radius: 10px; padding: 12px 14px; }
.disclaimer em { color: #94a3b8; font-style: italic; }

/* Apprendre */
.learn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }

/* Quiz */
.quiz-bar { display: flex; justify-content: space-between; font-size: 13.5px; color: #94a3b8; margin-bottom: 8px; }
.quiz-progress { height: 6px; background: #161e2e; border-radius: 999px; overflow: hidden; margin-bottom: 28px; }
.quiz-progress > div { height: 100%; background: #f472b6; transition: width .3s; }
.quiz-q { text-align: center; margin-bottom: 28px; }
.quiz-q-label { font-size: 14px; color: #94a3b8; margin-bottom: 16px; }
.quiz-glyph { font-family: 'Noto Serif JP', serif; font-size: 96px; line-height: 1; color: #f472b6; }
.quiz-word { font-family: 'DM Serif Display', serif; font-size: 34px; color: #e8edf5; max-width: 480px; margin: 0 auto; }
.quiz-q-sub { font-size: 14px; color: #64748b; margin-top: 10px; }
.quiz-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
.quiz-opt {
  font-family: inherit; font-size: 16px; color: #e8edf5;
  background: #161e2e; border: 1.5px solid #2a3a54; border-radius: 12px;
  padding: 18px 16px; cursor: pointer; transition: all .15s; text-align: center;
}
.quiz-opt.glyph { font-family: 'Noto Serif JP', serif; font-size: 40px; }
.quiz-opt:hover:not(:disabled) { border-color: #f472b6; }
.quiz-opt.correct { border-color: #4ade80; background: rgba(74,222,128,.12); color: #4ade80; }
.quiz-opt.wrong { border-color: #f87171; background: rgba(248,113,113,.12); color: #f87171; }
.quiz-opt.dim { opacity: .4; }
.quiz-opt:disabled { cursor: default; }
.quiz-feedback { animation: fade .25s; }
.quiz-feedback .search-btn { display: block; width: 100%; padding: 14px; margin-top: 8px; }
@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; } }

.quiz-done { text-align: center; padding: 40px 0; }
.quiz-score { font-family: 'DM Serif Display', serif; font-size: 56px; color: #f472b6; }
.quiz-pct { font-size: 20px; color: #94a3b8; margin-bottom: 8px; }
.quiz-msg { font-size: 18px; color: #e8edf5; margin-bottom: 24px; }
.quiz-done .search-btn { padding: 14px 32px; }

.footer { text-align: center; font-size: 12px; color: #475569; margin-top: 48px; }

@media (max-width: 560px) {
  .brand-jp, .brand-name { font-size: 32px; }
  .seg-kanji { font-size: 36px; }
  .quiz-glyph { font-size: 72px; }
  .learn-grid { grid-template-columns: 1fr; }
}
`
