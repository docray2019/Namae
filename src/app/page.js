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
const MAP_VIEW_KEY = 'namae_map_view_v1'

function loadMapView() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MAP_VIEW_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.lng !== 'number' || typeof v?.lat !== 'number' || typeof v?.zoom !== 'number') return null
    return v
  } catch { return null }
}

function saveMapView(lng, lat, zoom) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ lng, lat, zoom })) } catch {}
}

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
      // On reprend la dernière vue sauvegardée localement (pan + zoom).
      // Première visite ou cache vidé → on retombe sur Tokyo.
      const saved = loadMapView()
      map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: saved ? [saved.lng, saved.lat] : [139.6503, 35.6762],
        zoom: saved ? saved.zoom : 10,
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
        // Mémorisation immédiate de la vue courante (pan + zoom) — utilisé
        // au prochain chargement pour reprendre là où on s'était arrêté.
        const c = map.getCenter()
        saveMapView(c.lng, c.lat, map.getZoom())
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

// Termes techniques rendus cliquables dans les textes renvoyés par Claude
// (notes, reading_choice_fr…). Cliquer envoie vers la bonne sous-page de Lectures.
const GLOSSARY = [
  { term: 'jukujikun', sub: 'atejijuku' },
  { term: '熟字訓',    sub: 'atejijuku' },
  { term: 'ateji',     sub: 'atejijuku' },
  { term: '当て字',    sub: 'atejijuku' },
  { term: 'rendaku',   sub: 'kunon' },
  { term: '連濁',      sub: 'kunon' },
  { term: 'kun’yomi',  sub: 'kunon' },
  { term: "kun'yomi",  sub: 'kunon' },
  { term: '訓読み',    sub: 'kunon' },
  { term: 'on’yomi',   sub: 'kunon' },
  { term: "on'yomi",   sub: 'kunon' },
  { term: '音読み',    sub: 'kunon' },
  { term: 'furigana',  sub: 'hiragana' },
  { term: 'gairaigo',  sub: 'katakana' },
  { term: 'hiragana',  sub: 'hiragana' },
  { term: 'katakana',  sub: 'katakana' },
]

// Wrap les occurrences d'un terme du glossaire dans un bouton qui change
// la sous-page Lectures. Insensible à la casse, respecte la frontière de mot.
function Glossarized({ text, onGoTo }) {
  if (!text) return null
  if (!onGoTo) return text
  const pattern = GLOSSARY.map((g) => g.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp(`(?<![A-Za-zÀ-ÿ])(${pattern})(?![A-Za-zÀ-ÿ])`, 'gi')
  const out = []
  let lastIdx = 0
  let m, i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index))
    const matched = m[0]
    const entry = GLOSSARY.find((g) => g.term.toLowerCase() === matched.toLowerCase())
    out.push(
      <button
        key={`g${i++}`}
        type="button"
        className="gloss-link"
        onClick={() => onGoTo(entry?.sub || 'atejijuku')}
        title="Cliquer pour ouvrir l’explication"
      >{matched}</button>
    )
    lastIdx = m.index + matched.length
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx))
  return <>{out}</>
}

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
function AiPartCard({ part, onShowReadings, onGoToReadingsSub }) {
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
        {part.note && <div className="kcard-note"><Glossarized text={part.note} onGoTo={onGoToReadingsSub} /></div>}
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
                <div className="krd-mirror">
                  <span className="ksr-tag ksr-on">vs on</span>
                  Le même kanji 海 se prononce <strong>kai</strong> en on’yomi quand il est dans un
                  composé sino-japonais — ex. <span className="krd-ex">北海道 → Hok·<strong>kai</strong>·dō</span>.
                </div>
                <div className="krd-warning">
                  ⚠️ <strong>Cas des noms propres</strong> (lieux, familles) : ils gardent presque toujours la
                  kun’yomi, même collés à d’autres kanji, parce qu’ils transcrivent un mot japonais natif
                  pré-existant. Ex. <span className="krd-ex">墨田 → <strong>Sumida</strong></span> (et pas
                  « boku-den »), <span className="krd-ex">山田 → <strong>Yamada</strong></span>,
                  <span className="krd-ex">渋谷 → <strong>Shibuya</strong></span>. Le kanji ne fait que
                  noter le son du nom déjà existant.
                </div>
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
                <div className="krd-mirror">
                  <span className="ksr-tag ksr-kun">vs kun</span>
                  Le même kanji 海 se prononce <strong>umi</strong> en kun’yomi quand il est <strong>seul</strong>
                  ou dans un mot natif — ex. <span className="krd-ex">海 → umi (« la mer »)</span>.
                </div>
                <div className="krd-warning">
                  ⚠️ <strong>Cas des noms propres</strong> : un toponyme ou un patronyme japonais natif garde
                  la kun’yomi même s’il combine plusieurs kanji. <span className="krd-ex">山田 → Yamada</span>
                  (et pas san-den), <span className="krd-ex">墨田 → Sumida</span> (et pas boku-den). La règle
                  « 2 kanji = on » ne s’applique pas aux noms propres japonais natifs.
                </div>
                {onShowReadings && (
                  <button type="button" className="krd-more" onClick={onShowReadings}>
                    📚 Tout comprendre kun ↔ on avec Hokkaidō →
                  </button>
                )}
              </div>
            )}
            {part.reading_choice_fr && (
              <div className="krd-choice">→ <Glossarized text={part.reading_choice_fr} onGoTo={onGoToReadingsSub} /></div>
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
// Détecte une paire « lat, lng » saisie ou collée (avec espaces et virgule).
function detectCoords(s) {
  const m = (s || '').match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function Explorer({ query, setQuery, submitted, submittedLatin, run, runRef, onShowReadings, onAnalyzed, showToast, onGoToReadingsSub }) {
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

  // Autocomplétion Nominatim restreinte au Japon (gratuit, sans clé). On tape
  // en latin → liste de propositions « kanji — Latin », clic pour analyser.
  const [suggestions, setSuggestions] = useState([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestLoading, setSuggestLoading] = useState(false)

  useEffect(() => {
    const v = (query || '').trim()
    // Pas d'autocomplétion sur les URL, coordonnées, ou requêtes trop courtes.
    if (v.length < 2 || /^https?:\/\//i.test(v) || detectCoords(v)) {
      setSuggestions([])
      setSuggestLoading(false)
      return
    }
    setSuggestLoading(true)
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(v)}&format=jsonv2&namedetails=1&countrycodes=jp&accept-language=ja&limit=8`
        const r = await fetch(url, { signal: ctrl.signal })
        if (!r.ok) throw new Error('bad')
        const data = await r.json()
        const seen = new Set()
        const items = []
        for (const d of data) {
          const nd = d.namedetails || {}
          const ja = nd['name:ja'] || (d.name && HAS_KANJI.test(d.name) ? d.name : '')
          const en = nd['name:en'] || nd['int_name'] || nd['name:rm'] || nd['alt_name'] || (d.name && !HAS_KANJI.test(d.name) ? d.name : '')
          if (!ja && !en) continue
          const dedup = (ja || '') + '|' + (en || '')
          if (seen.has(dedup)) continue
          seen.add(dedup)
          items.push({ ja, en, full: d.display_name, key: d.place_id })
        }
        setSuggestions(items)
      } catch (e) {
        if (e.name !== 'AbortError') setSuggestions([])
      } finally {
        setSuggestLoading(false)
      }
    }, 400)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [query])

  function pickSuggestion(item) {
    setSuggestOpen(false)
    setQuery(item.ja || item.en || '')
    if (item.ja) run(item.ja, item.en || null)
    else run(item.en)
  }

  // Soumet une valeur tapée / collée. Gère trois cas :
  //   • paire « lat, lng » → reverse-geocode Nominatim → analyse du nom trouvé
  //   • URL Maps           → run() la résoudra côté serveur via /api/resolve-maps
  //   • nom ou kanji       → run() direct
  async function submitTyped(raw) {
    const v = (raw || '').trim()
    if (!v) return
    const coords = detectCoords(v)
    if (coords) {
      showToast?.('Recherche du lieu à ces coordonnées…')
      const found = await reverseGeocode(coords.lat, coords.lng, 13)
      if (found?.ja) {
        run(found.ja, found.en)
        showToast?.(`📍 ${found.en ? `${found.ja} — ${found.en}` : found.ja}`)
      } else {
        showToast?.('Aucun lieu nommé n’a été trouvé à ces coordonnées.')
      }
      return
    }
    run(v)
  }

  return (
    <div>
      <MapPicker runRef={runRef} />
      <p className="howto">
        💡 Centre un lieu sur la carte (le nom s’affiche au centre) puis clique <strong>« Analyser ce lieu »</strong>.
        Ou tape un nom / colle un lien Maps / des coordonnées ci-dessous.
      </p>

      <div className="search-row">
        <button
          type="button"
          className="paste-mini"
          onClick={async () => {
            try {
              const text = (await navigator.clipboard.readText()) || ''
              const v = text.trim()
              if (!v) { showToast?.('Presse-papiers vide.'); return }
              setQuery(v)
              await submitTyped(v)
            } catch {
              showToast?.('Autorisez le presse-papiers, ou colle dans le champ (Ctrl/Cmd + V).')
            }
          }}
          title="Coller depuis le presse-papiers et analyser"
          aria-label="Coller depuis le presse-papiers"
        >📋</button>
        <div className="search-input-wrap">
          <input
            type="text"
            className="search-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true) }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 160)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setSuggestOpen(false); submitTyped(query) } if (e.key === 'Escape') setSuggestOpen(false) }}
            placeholder="Tape un nom (Tokyo, Shibuya, Kyōto…) — propositions automatiques"
            autoComplete="off"
            spellCheck="false"
          />
          {suggestOpen && (suggestLoading || suggestions.length > 0) && (
            <ul className="autocomplete" role="listbox">
              {suggestLoading && suggestions.length === 0 && (
                <li className="ac-loading">Recherche…</li>
              )}
              {suggestions.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className="ac-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(item)}
                  >
                    <span className="ac-jp">{item.ja || '—'}</span>
                    {item.en && <span className="ac-en">{item.en}</span>}
                    {item.full && <span className="ac-full">{item.full}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="search-btn-mini"
          onClick={() => { setSuggestOpen(false); submitTyped(query) }}
          disabled={!query.trim()}
        >Analyser</button>
      </div>

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
                <AiPartCard key={i} part={p} onShowReadings={onShowReadings} onGoToReadingsSub={onGoToReadingsSub} />
              ))}
            </div>
          )}

          {data.etymology_fr && (
            <div className="ai-block">
              <h3 className="section-h">Étymologie</h3>
              <p className="ai-prose"><Glossarized text={data.etymology_fr} onGoTo={onGoToReadingsSub} /></p>
            </div>
          )}

          {data.pedagogy_fr && (
            <div className="ai-block">
              <h3 className="section-h">Comprendre les lectures</h3>
              <p className="ai-prose"><Glossarized text={data.pedagogy_fr} onGoTo={onGoToReadingsSub} /></p>
            </div>
          )}

          {data.analogy_fr && (
            <div className="ai-block ai-analogy">
              <h3 className="section-h">Une analogie en français</h3>
              <p className="ai-prose"><Glossarized text={data.analogy_fr} onGoTo={onGoToReadingsSub} /></p>
            </div>
          )}

          {data.notable && (
            <div className="ai-block">
              <h3 className="section-h">À noter</h3>
              <p className="ai-prose"><Glossarized text={data.notable} onGoTo={onGoToReadingsSub} /></p>
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
//  Mode LECTURES — hub avec 5 sous-pages : Kanji, Hiragana, Katakana, Romaji, Kun↔On
// ════════════════════════════════════════════════════════════════════════
const READINGS_SUBPAGES = [
  { id: 'kanji',     label: 'Kanji',       jp: '漢字' },
  { id: 'hiragana',  label: 'Hiragana',    jp: 'ひらがな' },
  { id: 'katakana',  label: 'Katakana',    jp: 'カタカナ' },
  { id: 'romaji',    label: 'Rōmaji',      jp: 'Aa' },
  { id: 'kunon',     label: 'Kun ↔ On',    jp: '訓・音' },
  { id: 'atejijuku', label: 'Ateji & Juku.', jp: '当て字・熟字訓' },
]

function ReadingsExplainer({ sub, setSub }) {
  return (
    <div className="readings-page">
      <nav className="readings-subnav">
        {READINGS_SUBPAGES.map((p) => (
          <button
            key={p.id}
            className={`rsn ${sub === p.id ? 'on' : ''}`}
            onClick={() => setSub(p.id)}
          >
            <span className="rsn-jp">{p.jp}</span>
            <span className="rsn-fr">{p.label}</span>
          </button>
        ))}
      </nav>
      {sub === 'kanji' && <KanjiPage onGoTo={setSub} />}
      {sub === 'hiragana' && <HiraganaPage />}
      {sub === 'katakana' && <KatakanaPage />}
      {sub === 'romaji' && <RomajiPage />}
      {sub === 'kunon' && <KunOnPage onGoTo={setSub} />}
      {sub === 'atejijuku' && <AtejiJukujikunPage />}
    </div>
  )
}

// ── Sous-page : KANJI ──────────────────────────────────────────────────
function KanjiPage({ onGoTo }) {
  return (
    <>
      <h2 className="readings-title">Les kanji <span className="readings-jp">漢字</span></h2>
      <p className="readings-lede">
        Les kanji sont les caractères chinois importés au Japon vers le Ve siècle.
        Chaque kanji porte un <strong>sens</strong> (et plusieurs lectures).
        Ce sont eux qu’on décompose dans l’<em>Explorer</em> pour comprendre
        l’étymologie d’un nom de lieu.
      </p>

      <section className="readings-section">
        <h3 className="readings-h">L’essentiel en chiffres</h3>
        <div className="stats-grid">
          <div className="stat"><div className="stat-num">~50 000</div><div className="stat-label">kanji recensés au total</div></div>
          <div className="stat"><div className="stat-num">2 136</div><div className="stat-label">jōyō kanji (« usage courant », enseignés à l’école)</div></div>
          <div className="stat"><div className="stat-num">~2 500</div><div className="stat-label">suffisent pour lire un journal</div></div>
          <div className="stat"><div className="stat-num">~1 000</div><div className="stat-label">appris d’ici la fin du primaire (kyōiku kanji)</div></div>
        </div>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Un kanji = un sens, pas un son</h3>
        <p>
          Contrairement à l’alphabet latin où chaque lettre transcrit un son, un kanji
          transcrit avant tout un <strong>concept</strong>. La même idée s’écrit pareil
          mais peut se prononcer de plusieurs façons (voir <button className="inline-link" onClick={() => onGoTo?.('kunon')}>Kun ↔ On</button>).
        </p>
        <div className="kanji-pictograms">
          <div className="kp-card"><div className="kp-glyph">山</div><div className="kp-rom">yama / san</div><div className="kp-fr">montagne</div><div className="kp-note">trois pics stylisés</div></div>
          <div className="kp-card"><div className="kp-glyph">川</div><div className="kp-rom">kawa / sen</div><div className="kp-fr">rivière</div><div className="kp-note">trois traits d’eau qui coulent</div></div>
          <div className="kp-card"><div className="kp-glyph">木</div><div className="kp-rom">ki / boku</div><div className="kp-fr">arbre</div><div className="kp-note">un tronc et des branches</div></div>
          <div className="kp-card"><div className="kp-glyph">日</div><div className="kp-rom">hi / nichi</div><div className="kp-fr">soleil, jour</div><div className="kp-note">un disque avec un point au centre</div></div>
        </div>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Composition : empiler le sens</h3>
        <p>
          Un kanji complexe est souvent composé de plusieurs <strong>radicaux</strong> qui
          empilent leur sens. Le radical principal donne la famille sémantique, les autres
          précisent. Exemple le plus connu :
        </p>
        <div className="combo-flow">
          <div className="combo-step"><div className="combo-glyph">木</div><div className="combo-label">arbre</div></div>
          <div className="combo-arrow">→</div>
          <div className="combo-step"><div className="combo-glyph">林</div><div className="combo-label">bois (2 arbres)</div></div>
          <div className="combo-arrow">→</div>
          <div className="combo-step"><div className="combo-glyph">森</div><div className="combo-label">forêt (3 arbres)</div></div>
        </div>
        <p>
          Et avec d’autres radicaux : 休 = personne (亻) + arbre (木) = « se reposer » (sous un arbre).
          La logique visuelle est souvent transparente quand on connaît le radical principal — c’est
          ce qui rend l’apprentissage des kanji moins arbitraire qu’il n’en a l’air.
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Et pour les noms de lieux ?</h3>
        <p>
          La plupart des toponymes japonais combinent 2 à 4 kanji qui décrivaient à l’origine
          le terrain (vallée, plaine, rivière), la végétation, une direction, ou une fonction
          (temple, port, château). Notre <em>Explorer</em> demande à Claude Opus 4.7 de
          décomposer le nom et d’expliquer le rôle de chaque kanji.
        </p>
        <ul className="ex-list">
          <li><span className="ex-jp">渋谷</span> <strong>Shibuya</strong> — 渋 « âpre » + 谷 « vallée »</li>
          <li><span className="ex-jp">金沢</span> <strong>Kanazawa</strong> — 金 « or » + 沢 « marais »</li>
          <li><span className="ex-jp">広島</span> <strong>Hiroshima</strong> — 広 « large » + 島 « île »</li>
        </ul>
      </section>
    </>
  )
}

// ── Sous-page : HIRAGANA ───────────────────────────────────────────────
const HIRAGANA = [
  ['あ a','い i','う u','え e','お o'],
  ['か ka','き ki','く ku','け ke','こ ko'],
  ['さ sa','し shi','す su','せ se','そ so'],
  ['た ta','ち chi','つ tsu','て te','と to'],
  ['な na','に ni','ぬ nu','ね ne','の no'],
  ['は ha','ひ hi','ふ fu','へ he','ほ ho'],
  ['ま ma','み mi','む mu','め me','も mo'],
  ['や ya','—','ゆ yu','—','よ yo'],
  ['ら ra','り ri','る ru','れ re','ろ ro'],
  ['わ wa','—','—','—','を wo'],
  ['ん n','','','',''],
]

function HiraganaPage() {
  return (
    <>
      <h2 className="readings-title">Les hiragana <span className="readings-jp">ひらがな</span></h2>
      <p className="readings-lede">
        Les hiragana sont un <strong>syllabaire phonétique</strong> japonais — 46 signes de base,
        chacun représente une syllabe (a, ka, shi, mu…). On les utilise pour la grammaire,
        les mots japonais sans kanji, et pour donner la lecture d’un kanji (furigana).
      </p>

      <section className="readings-section">
        <h3 className="readings-h">D’où viennent-ils ?</h3>
        <p>
          Les hiragana sont nés vers le IXe siècle de la <strong>simplification cursive de kanji entiers</strong>
          utilisés pour leur valeur phonétique. Par exemple ひ (hi) vient du kanji 比, cursivé puis stylisé.
          Le syllabaire a été popularisé d’abord par les femmes de la cour Heian — d’où son ancien surnom
          d’« écriture des femmes » (onnade). Murasaki Shikibu a écrit le <em>Dit du Genji</em> presque
          entièrement en hiragana.
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Quand les utilise-t-on ?</h3>
        <ul>
          <li><strong>Terminaisons grammaticales</strong> qui s’ajoutent aux racines kanji (verbes, adjectifs) : 食<strong>べる</strong> (taberu, manger).</li>
          <li><strong>Particules</strong> qui structurent la phrase : は (wa), を (wo), の (no), に (ni)…</li>
          <li><strong>Mots japonais natifs</strong> sans kanji courant ou trop rares : きれい (kirei, joli).</li>
          <li><strong>Furigana</strong> : les petites annotations au-dessus d’un kanji difficile pour en donner la lecture.</li>
        </ul>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Le tableau gojūon</h3>
        <p className="kana-table-legend">Lecture en ligne (de gauche à droite) : voyelle a, i, u, e, o puis enchaînement avec chaque consonne (k, s, t, n, h, m, y, r, w).</p>
        <KanaTable rows={HIRAGANA} variant="kun" />
        <p className="kana-table-note">
          Ajoutez deux petits traits (<em>dakuten</em>) ou un petit rond (<em>handakuten</em>) en haut à droite
          d’un caractère et la consonne se voise : か (ka) → が (ga), し (shi) → じ (ji), は (ha) → ば (ba) / ぱ (pa).
          On obtient ainsi tous les sons manquants.
        </p>
      </section>
    </>
  )
}

// ── Sous-page : KATAKANA ───────────────────────────────────────────────
const KATAKANA = [
  ['ア a','イ i','ウ u','エ e','オ o'],
  ['カ ka','キ ki','ク ku','ケ ke','コ ko'],
  ['サ sa','シ shi','ス su','セ se','ソ so'],
  ['タ ta','チ chi','ツ tsu','テ te','ト to'],
  ['ナ na','ニ ni','ヌ nu','ネ ne','ノ no'],
  ['ハ ha','ヒ hi','フ fu','ヘ he','ホ ho'],
  ['マ ma','ミ mi','ム mu','メ me','モ mo'],
  ['ヤ ya','—','ユ yu','—','ヨ yo'],
  ['ラ ra','リ ri','ル ru','レ re','ロ ro'],
  ['ワ wa','—','—','—','ヲ wo'],
  ['ン n','','','',''],
]

function KatakanaPage() {
  return (
    <>
      <h2 className="readings-title">Les katakana <span className="readings-jp">カタカナ</span></h2>
      <p className="readings-lede">
        Les katakana sont l’autre syllabaire japonais — mêmes 46 sons que les hiragana,
        formes plus anguleuses. Ils servent surtout aux mots d’origine étrangère, aux
        onomatopées et à l’emphase (un peu comme nos <em>italiques</em>).
      </p>

      <section className="readings-section">
        <h3 className="readings-h">D’où viennent-ils ?</h3>
        <p>
          Les katakana ont aussi été créés à partir des kanji vers le IXe siècle, mais selon
          une logique différente : on a gardé <strong>un fragment</strong> (radical, partie haute, partie gauche)
          d’un kanji utilisé pour sa valeur phonétique. Exemple : カ (ka) est le côté gauche de 加.
          À l’origine, ils servaient aux moines bouddhistes comme annotations rapides pour aider
          à lire les textes chinois — d’où leurs formes coupantes et pratiques à graver.
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Quand les utilise-t-on ?</h3>
        <ul>
          <li><strong>Mots empruntés à l’étranger</strong> (gairaigo) : コンピュータ (konpyūta, ordinateur), パン (pan, pain, du portugais).</li>
          <li><strong>Noms étrangers</strong> : アメリカ (Amerika), フランス (Furansu).</li>
          <li><strong>Onomatopées</strong> : ワンワン (wanwan, le woof du chien), ドキドキ (dokidoki, le cœur qui bat).</li>
          <li><strong>Termes scientifiques</strong>, espèces animales ou végétales : ヒト (hito, espèce humaine, par opposition à 人).</li>
          <li><strong>Emphase</strong> ou style « pop » dans la pub, les mangas, les enseignes.</li>
        </ul>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Le tableau gojūon</h3>
        <KanaTable rows={KATAKANA} variant="on" />
        <p className="kana-table-note">
          Mêmes voisements que pour les hiragana : カ (ka) → ガ (ga), シ (shi) → ジ (ji), ハ (ha) → バ (ba) / パ (pa).
          Le katakana ajoute aussi le tiret allongeur ー pour marquer une voyelle longue, courant dans les
          emprunts (コーヒー kōhī, le café).
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Tableau comparatif rapide</h3>
        <table className="kana-compare">
          <thead><tr><th>Son</th><th>Hiragana</th><th>Katakana</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>a</td><td className="kc-jp">あ</td><td className="kc-jp">ア</td><td>hiragana = rond, katakana = anguleux</td></tr>
            <tr><td>i</td><td className="kc-jp">い</td><td className="kc-jp">イ</td><td></td></tr>
            <tr><td>ka</td><td className="kc-jp">か</td><td className="kc-jp">カ</td><td></td></tr>
            <tr><td>shi</td><td className="kc-jp">し</td><td className="kc-jp">シ</td><td>シ ≠ ツ (tsu) — la différence est dans l’angle des traits</td></tr>
            <tr><td>n</td><td className="kc-jp">ん</td><td className="kc-jp">ン</td><td>la seule consonne sans voyelle des deux syllabaires</td></tr>
          </tbody>
        </table>
      </section>
    </>
  )
}

// Tableau gojūon générique pour les deux syllabaires.
function KanaTable({ rows, variant }) {
  return (
    <div className={`kana-table ${variant === 'on' ? 'is-kata' : 'is-hira'}`}>
      {rows.map((row, ri) => (
        <div key={ri} className="kt-row">
          {row.map((cell, ci) => {
            if (!cell) return <div key={ci} className="kt-cell kt-empty" />
            if (cell === '—') return <div key={ci} className="kt-cell kt-dash">—</div>
            const [jp, ...rest] = cell.split(' ')
            const rom = rest.join(' ')
            return (
              <div key={ci} className="kt-cell">
                <div className="kt-jp">{jp}</div>
                <div className="kt-rom">{rom}</div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Sous-page : ROMAJI ─────────────────────────────────────────────────
function RomajiPage() {
  return (
    <>
      <h2 className="readings-title">Le rōmaji <span className="readings-jp">ローマ字</span></h2>
      <p className="readings-lede">
        Le rōmaji (« lettres romaines ») est la transcription du japonais en <strong>alphabet latin</strong>.
        C’est ce qu’on lit sur les panneaux d’aéroport, dans les méthodes de langue, et dans Namae
        à côté de chaque kanji. Mais il existe <strong>plusieurs systèmes</strong> de transcription,
        et ils ne s’accordent pas tous.
      </p>

      <section className="readings-section">
        <h3 className="readings-h">Trois systèmes principaux</h3>
        <div className="rom-systems">
          <div className="rom-card rom-hepburn">
            <div className="rom-card-head">Hepburn <span className="rom-card-tag">le standard international</span></div>
            <p>Conçu par le missionnaire James Hepburn en 1867. Conçu pour qu’un anglophone prononce
              correctement à la lecture. C’est <strong>le système utilisé dans Namae</strong>, sur les
              passeports japonais et la plupart des panneaux touristiques.</p>
            <div className="rom-ex">し = <strong>shi</strong>, ち = <strong>chi</strong>, つ = <strong>tsu</strong>, ふ = <strong>fu</strong>, じ = <strong>ji</strong></div>
          </div>
          <div className="rom-card rom-kunrei">
            <div className="rom-card-head">Kunrei-shiki <span className="rom-card-tag">officiel japonais</span></div>
            <p>Adopté par le gouvernement japonais en 1937. Plus systématique (régulier dans les
              colonnes du tableau gojūon) mais moins intuitif pour un francophone ou un anglophone.</p>
            <div className="rom-ex">し = <strong>si</strong>, ち = <strong>ti</strong>, つ = <strong>tu</strong>, ふ = <strong>hu</strong>, じ = <strong>zi</strong></div>
          </div>
          <div className="rom-card rom-nihon">
            <div className="rom-card-head">Nihon-shiki <span className="rom-card-tag">historique</span></div>
            <p>Encore plus régulier, conserve des distinctions historiques qui n’ont plus cours en
              japonais moderne. Surtout d’intérêt linguistique aujourd’hui.</p>
            <div className="rom-ex">ぢ = <strong>di</strong>, づ = <strong>du</strong> (vs Hepburn ji, zu)</div>
          </div>
        </div>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Les voyelles longues : macrons (ō, ū)</h3>
        <p>
          Le japonais distingue les voyelles courtes et longues. Hepburn marque les longues avec un
          <strong> macron</strong> au-dessus : ō, ū, ē, ā. C’est la convention que Namae utilise systématiquement.
        </p>
        <div className="vowel-grid">
          <div className="vow"><div className="vow-jp">東京</div><div className="vow-ok">Tōkyō ✓</div><div className="vow-ko">Tokyo (toléré mais imprécis)</div></div>
          <div className="vow"><div className="vow-jp">大阪</div><div className="vow-ok">Ōsaka ✓</div><div className="vow-ko">Osaka ou Oosaka</div></div>
          <div className="vow"><div className="vow-jp">北海道</div><div className="vow-ok">Hokkaidō ✓</div><div className="vow-ko">Hokkaido</div></div>
          <div className="vow"><div className="vow-jp">京都</div><div className="vow-ok">Kyōto ✓</div><div className="vow-ko">Kyoto</div></div>
        </div>
        <p className="kana-table-note">
          Dans la vie courante, les versions sans macron sont très répandues (et acceptées) — c’est
          pour ça que Tokyo se lit toujours Tōkyō même quand on l’écrit sans accent. Namae conserve
          les macrons pour rester précis sur la prononciation.
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">Limites du rōmaji</h3>
        <ul>
          <li>Il ne capture pas l’<strong>intonation</strong> (pitch accent) : 箸 hashi « baguettes » et
              橋 hashi « pont » s’écrivent pareil mais se prononcent avec des hauteurs différentes.</li>
          <li>Il fige une prononciation moderne : certaines distinctions historiques disparaissent
              (ぢ et じ se prononcent tous deux <em>ji</em> aujourd’hui).</li>
          <li>Il occulte la structure du mot : 北海道 écrit « Hokkaidō » ne montre plus qu’il s’agit
              de trois kanji distincts. C’est pour ça que Namae affiche toujours <strong>kanji + rōmaji côte à côte</strong>.</li>
        </ul>
      </section>
    </>
  )
}

// ── Sous-page : ATEJI & JUKUJIKUN ──────────────────────────────────────
function AtejiJukujikunPage() {
  return (
    <>
      <h2 className="readings-title">Ateji & Jukujikun <span className="readings-jp">当て字・熟字訓</span></h2>
      <p className="readings-lede">
        Deux mécanismes typiques de la toponymie japonaise. On vous les explique ici
        parce que l’analyse étymologique va vous les mentionner souvent — et la règle
        kun/on classique ne suffit pas à les comprendre. <strong>Le nom existait avant
        l’écriture ; les kanji sont juste un costume.</strong>
      </p>

      <section className="readings-section">
        <h3 className="readings-h">1. Le contexte</h3>
        <p>
          Le japonais avait <strong>déjà des mots</strong> avant l’arrivée de l’écriture
          chinoise au Ve siècle. Quand il a fallu écrire ces vieux mots avec des kanji,
          deux stratégies se sont mises en place — et souvent elles se mélangent.
        </p>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">2. Ateji 当て字 — « coller des kanji sur un son »</h3>
        <p>L’idée : on choisit des kanji <strong>pour leur prononciation</strong>, en
        acceptant que leur sens soit secondaire (ou complètement à côté de la plaque).</p>

        <div className="strat-card strat-a">
          <div className="strat-head">Stratégie A : le sens (PAS de l’ateji)</div>
          <div className="strat-eg"><span className="strat-jp">山</span> <span className="strat-arrow">→</span> <strong>yama</strong> <em>(montagne)</em></div>
          <p>Logique évidente : 山 veut dire « montagne », yama veut dire « montagne ». Le kanji et le son collent.</p>
        </div>

        <div className="strat-card strat-b">
          <div className="strat-head">Stratégie B : le SON seulement (ateji pur)</div>
          <div className="strat-eg"><span className="strat-jp">寿司</span> <span className="strat-arrow">→</span> <strong>sushi</strong></div>
          <p>寿 (longévité) + 司 (gouverner). Aucun de ces sens n’a rapport avec le poisson cru.
          Les kanji ont été choisis parce que <em>su + shi</em> sonne « sushi ». Le sens est cosmétique.</p>
        </div>

        <div className="strat-card strat-c">
          <div className="strat-head">Stratégie C : un mélange (fréquent en toponymie)</div>
          <div className="strat-eg"><span className="strat-jp">大分</span> <span className="strat-arrow">→</span> <strong>Ōita</strong></div>
          <p>大分 évoque « grande division » — un terrain découpé. Justification rationalisée <em>après coup</em>
          pour rendre crédible le choix des kanji. Mais le nom Ōita existait déjà avant qu’on décide
          quels kanji l’écriraient.</p>
        </div>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">3. Jukujikun 熟字訓 — « lire le mot entier, pas les kanji un par un »</h3>
        <p>Normalement, chaque kanji a sa lecture, et on enchaîne :</p>

        <div className="strat-card strat-a">
          <div className="strat-head">Lecture normale</div>
          <div className="strat-eg"><span className="strat-jp">北 + 海 + 道</span> <span className="strat-arrow">→</span> <strong>hoku + kai + dō</strong></div>
          <p>Chaque kanji apporte sa lecture, on additionne. Pas de mystère.</p>
        </div>

        <div className="strat-card strat-jk">
          <div className="strat-head">Mais parfois : lecture du bloc entier</div>
          <div className="strat-eg"><span className="strat-jp">大人</span> <span className="strat-arrow">→</span> <strong>otona</strong> <em>(adulte)</em>, et PAS dai + jin</div>
          <p>Le mot <em>otona</em> existait déjà en japonais (« être grand, mûr »). On a collé
          le bloc 大人 dessus pour l’écrire — mais la lecture ne se décompose PAS kanji par kanji.
          Le groupe entier vaut <em>otona</em>. C’est ça, un <strong>jukujikun</strong>.</p>
        </div>

        <p>D’autres exemples courants :</p>
        <ul className="ex-list">
          <li><span className="ex-jp">今日</span> <strong>kyō</strong> — aujourd’hui (et pas kin + nichi)</li>
          <li><span className="ex-jp">明日</span> <strong>ashita</strong> — demain (et pas mei + nichi)</li>
          <li><span className="ex-jp">紅葉</span> <strong>momiji</strong> — érables d’automne (et pas kō + yō)</li>
          <li><span className="ex-jp">大分</span> <strong>Ōita</strong> — préfecture (et pas dai + bun)</li>
        </ul>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">4. Résumé visuel</h3>
        <div className="summary-box">
          <div className="sb-row">
            <div className="sb-label">Lecture normale</div>
            <div className="sb-eg"><span className="strat-jp">北 + 海 + 道</span> → hoku + kai + dō</div>
          </div>
          <div className="sb-row sb-row-jk">
            <div className="sb-label">Jukujikun</div>
            <div className="sb-eg"><span className="strat-jp">大 + 分</span> → <strong>ōita</strong> <span className="sb-note">(pas dai + bun)</span></div>
          </div>
          <div className="sb-row sb-row-aj">
            <div className="sb-label">Ateji (son)</div>
            <div className="sb-eg"><span className="strat-jp">寿司</span> → <strong>sushi</strong> <span className="sb-note">(kanji pour le son, pas le sens)</span></div>
          </div>
        </div>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">5. Pourquoi ça compte pour les toponymes</h3>
        <p>
          Beaucoup de noms de lieux japonais sont des <strong>mots ancestraux</strong> — plus
          anciens que l’écriture. Quand on les transcrit en kanji, c’est souvent un mélange
          d’<strong>ateji</strong> (choix des kanji pour le son) et de <strong>jukujikun</strong>
          (la lecture du bloc reste figée comme un mot, indépendamment de la lecture des kanji isolés).
        </p>
        <p>
          C’est pour ça que la règle « kanji seul = kun, deux kanji = on » ne marche pas pour
          les toponymes anciens. Le nom préexiste — les kanji ne sont qu’un costume.
        </p>
      </section>
    </>
  )
}

// ── Sous-page : KUN ↔ ON (le contenu détaillé existant) ────────────────
function KunOnPage({ onGoTo }) {
  return (
    <>
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

        <div className="schema schema-history">
          <div className="schema-title">📐 Schéma : comment chaque kanji a fini avec deux lectures</div>
          <div className="sch-flow">
            <div className="sch-node sch-native">
              <div className="sch-when">avant le Ve s.</div>
              <div className="sch-headline">Le japonais parle déjà</div>
              <div className="sch-jp-big">うみ</div>
              <div className="sch-sub">le mot japonais natif pour « la mer »</div>
            </div>
            <div className="sch-arrow-h">→</div>
            <div className="sch-node sch-import">
              <div className="sch-when">≈ Ve s.</div>
              <div className="sch-headline">Import de l'écriture chinoise</div>
              <div className="sch-jp-big">海</div>
              <div className="sch-sub">+ sa prononciation chinoise <em>hǎi</em></div>
            </div>
            <div className="sch-arrow-h">→</div>
            <div className="sch-node sch-merge">
              <div className="sch-when">aujourd'hui</div>
              <div className="sch-headline">海 hérite des deux</div>
              <div className="sch-double">
                <div className="sch-half"><span className="ksr-tag ksr-kun">kun</span> <strong>umi</strong> うみ</div>
                <div className="sch-half"><span className="ksr-tag ksr-on">on</span> <strong>kai</strong> かい</div>
              </div>
            </div>
          </div>
        </div>
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

        <div className="schema schema-decision">
          <div className="schema-title">📐 Schéma : l'arbre de décision pour 海</div>
          <div className="dec-root">
            <div className="dec-glyph">海</div>
            <div className="dec-prompt">Tu vois 海 quelque part. Comment le lis-tu&nbsp;?</div>
          </div>
          <div className="dec-branches">
            <div className="dec-branch dec-kun">
              <div className="dec-q">Le kanji est <strong>seul</strong>, ou suivi de hiragana grammatical (の, を, に…), ou dans un mot purement japonais&nbsp;?</div>
              <div className="dec-answer"><span className="ksr-tag ksr-kun">kun</span> <strong>umi</strong></div>
              <div className="dec-ex">海 (umi), 海辺 (umibe), 海の音 (umi no oto)</div>
            </div>
            <div className="dec-branch dec-kun">
              <div className="dec-q">Le kanji fait partie d'un <strong>nom propre japonais natif</strong> (toponyme ancien, patronyme)&nbsp;?</div>
              <div className="dec-answer"><span className="ksr-tag ksr-kun">kun</span> <strong>la lecture native du nom</strong></div>
              <div className="dec-ex">青海 (Ōmi, toponyme), patronyme 海野 (Unno)</div>
            </div>
            <div className="dec-branch dec-on">
              <div className="dec-q">Le kanji est collé à <strong>1+ autres kanji</strong> dans un <strong>composé sino-japonais</strong> (administratif, savant, scientifique)&nbsp;?</div>
              <div className="dec-answer"><span className="ksr-tag ksr-on">on</span> <strong>kai</strong></div>
              <div className="dec-ex">海洋 (kaiyō), 日本海 (Nihonkai), 北海道 (Hokkaidō)</div>
            </div>
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

      <section className="readings-section readings-toponyms">
        <h3 className="readings-h">6. La grande exception : les noms propres</h3>
        <p>
          C’est <strong>le piège</strong> du japonais pour qui débute. La règle « deux kanji collés
          → on’yomi » donnerait pour 墨田 quelque chose comme <em>boku-den</em>… mais le quartier
          se prononce <strong>Sumida</strong>. Pour 山田 ce serait <em>san-den</em>… mais on dit
          <strong>Yamada</strong>. Que se passe-t-il ?
        </p>
        <p>
          La plupart des toponymes et patronymes japonais sont <strong>antérieurs</strong> à
          l’écriture chinoise. Le nom <em>Sumida</em> (la rivière) existait déjà en japonais
          ancien ; quand on a voulu l’écrire avec des kanji, on a choisi des caractères dont
          la <strong>lecture native (kun)</strong> permettait de noter le son <em>sumi-da</em> :
          墨 (sumi, « encre ») + 田 (da, voisée de <em>ta</em>, « rizière »). Le sens des kanji
          n’a parfois plus rien à voir avec le sens du nom — c’est juste un support phonétique.
        </p>

        <div className="schema schema-ateji">
          <div className="schema-title">📐 Schéma : pourquoi 墨田 = Sumida (et pas boku-den)</div>
          <div className="atj-step">
            <div className="atj-num">1</div>
            <div className="atj-body">
              <div className="atj-h">Le nom existait DÉJÀ en japonais natif</div>
              <div className="atj-row"><span className="atj-jp">すみだ</span><span className="atj-tail">→ « sumida », nom d’une rivière, depuis le japonais ancien</span></div>
            </div>
          </div>
          <div className="atj-arrow">↓</div>
          <div className="atj-step">
            <div className="atj-num">2</div>
            <div className="atj-body">
              <div className="atj-h">On veut l’écrire avec des kanji</div>
              <div className="atj-explain">On cherche des kanji dont la <strong>kun’yomi</strong> peut transcrire les sons <em>sumi</em> et <em>da</em>.</div>
            </div>
          </div>
          <div className="atj-arrow">↓</div>
          <div className="atj-step">
            <div className="atj-num">3</div>
            <div className="atj-body">
              <div className="atj-h">Choix des kanji (le sens devient secondaire)</div>
              <div className="atj-pair">
                <div className="atj-kanji">
                  <div className="atj-glyph">墨</div>
                  <div className="atj-read"><span className="ksr-tag ksr-kun">kun</span> sumi すみ ✓</div>
                  <div className="atj-mean">sens propre : <em>encre</em> (sans rapport)</div>
                </div>
                <div className="atj-plus">+</div>
                <div className="atj-kanji">
                  <div className="atj-glyph">田</div>
                  <div className="atj-read"><span className="ksr-tag ksr-kun">kun</span> ta → <strong>da</strong> (rendaku) ✓</div>
                  <div className="atj-mean">sens propre : <em>rizière</em> (sans rapport)</div>
                </div>
              </div>
            </div>
          </div>
          <div className="atj-arrow">↓</div>
          <div className="atj-result">
            <div className="atj-result-label">Résultat</div>
            <div className="atj-result-ok">
              <div className="atj-result-jp">墨田 → <strong>Sumida</strong></div>
              <div className="atj-result-rule">✓ kun + kun (avec rendaku ta → da)</div>
            </div>
            <div className="atj-result-ko">
              <div className="atj-result-jp">✗ <em>boku·den</em></div>
              <div className="atj-result-rule">la lecture on’yomi mécanique des kanji isolés — fausse ici</div>
            </div>
          </div>
        </div>
        <div className="toponym-grid">
          <div className="toponym-card">
            <div className="toponym-jp">墨田</div>
            <div className="toponym-rom">Sumida</div>
            <div className="toponym-rule">kun + kun</div>
            <div className="toponym-note">et pas boku-den</div>
          </div>
          <div className="toponym-card">
            <div className="toponym-jp">山田</div>
            <div className="toponym-rom">Yamada</div>
            <div className="toponym-rule">kun + kun</div>
            <div className="toponym-note">et pas san-den</div>
          </div>
          <div className="toponym-card">
            <div className="toponym-jp">渋谷</div>
            <div className="toponym-rom">Shibuya</div>
            <div className="toponym-rule">kun + kun</div>
            <div className="toponym-note">et pas jū-koku</div>
          </div>
          <div className="toponym-card">
            <div className="toponym-jp">横浜</div>
            <div className="toponym-rom">Yokohama</div>
            <div className="toponym-rule">kun + kun</div>
            <div className="toponym-note">et pas ō-hin</div>
          </div>
          <div className="toponym-card toponym-card-irr">
            <div className="toponym-jp">神戸</div>
            <div className="toponym-rom">Kōbe</div>
            <div className="toponym-rule">irrégulier (jukujikun)</div>
            <div className="toponym-note">ni kami-to, ni shin-ko</div>
          </div>
          <div className="toponym-card toponym-card-rev">
            <div className="toponym-jp">北海道</div>
            <div className="toponym-rom">Hokkaidō</div>
            <div className="toponym-rule">on + on + on</div>
            <div className="toponym-note">nom administratif Meiji, sino-japonais</div>
          </div>
        </div>
        <p>
          Hokkaidō est la <strong>contre-exception</strong> : c’est un toponyme <em>moderne</em>
          (créé en 1869) sur le moule sino-japonais lettré. D’où les on’yomi.
          Règle de pouce :
        </p>
        <ul>
          <li><strong>Toponyme ancien</strong> (la plupart des villes et quartiers historiques) → kun.</li>
          <li><strong>Toponyme administratif moderne</strong> (forgé à l’époque Meiji ou plus tard) → souvent on.</li>
          <li><strong>Composé savant courant</strong> (hors noms propres) → on.</li>
        </ul>
      </section>

      <section className="readings-section">
        <h3 className="readings-h">7. Mémo express</h3>
        <ul className="memo-list">
          <li><strong>Kanji seul ou avec hiragana de relation</strong> (の, を, に) → en général <em>kun'yomi</em>.</li>
          <li><strong>Deux kanji collés, registre administratif/savant</strong> → en général <em>on'yomi</em>.</li>
          <li><strong>Noms propres japonais natifs (lieux, familles)</strong> → presque toujours <em>kun'yomi</em>,
              même collés à plusieurs kanji. Voir section 6.</li>
          <li><strong>Phénomène de rendaku</strong> : la première consonne du second segment peut « se voiser »
              (k → g, h → b, s → z, t → d…). Ex. 川 <em>kawa</em> tout seul, mais 江戸<strong>川</strong>
              <em>Edogawa</em>. Le 田 dans Sumida se voise de <em>ta</em> en <em>da</em> pour la même raison.</li>
        </ul>
      </section>

      <p className="readings-coda">
        Tu peux maintenant relire l'analyse étymologique d'un lieu et comprendre <strong>pourquoi</strong>
        telle lecture est employée à chaque endroit du nom — pas juste la noter. Reviens à l'onglet
        🔍 <em>Explorer</em> et observe les badges <span className="krd-tag krd-kun" style={{cursor: 'default'}}>kun</span> /
        <span className="krd-tag krd-on" style={{cursor: 'default', marginLeft: 4}}>on</span> avec un œil neuf.
      </p>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  Mode MON ESPACE — historique local + import Polarsteps
// ════════════════════════════════════════════════════════════════════════
function Profile({ onAnalyze, historyTick }) {
  const [history, setHistory] = useState([])
  const [psUsername, setPsUsername] = useState('')
  const [psState, setPsState] = useState({ loading: false, data: null, error: null })

  // Bookmarklet « Analyser sur Namae » à glisser dans la barre de favoris.
  // Quand l'utilisateur est sur une page Google Maps avec un lieu sélectionné,
  // cliquer le bouton ouvre Namae avec le titre de la page (= libellé du header
  // Maps) + l'URL courante. Le useEffect du Share Target côté Namae extrait
  // ensuite le nom et lance l'analyse.
  const bmkAnchorRef = useRef(null)
  useEffect(() => {
    if (typeof window === 'undefined' || !bmkAnchorRef.current) return
    const origin = window.location.origin
    // eslint-disable-next-line no-script-url
    const code = `javascript:(function(){var u=location.href,t=document.title.replace(/\\s*[-—–]\\s*Google\\s*(マップ|Maps?)\\s*$/i,'').trim();if(!/google\\.[^/]+\\/maps|maps\\.app\\.goo\\.gl|maps\\.google\\./i.test(u)){alert('Bookmarklet Namae — \\u00e0 utiliser depuis Google Maps.');return}window.open('${origin}/?text='+encodeURIComponent((t?t+'\\n':'')+u),'_blank')})()`
    bmkAnchorRef.current.setAttribute('href', code)
  }, [])

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

      {/* ───── Bookmarklet Google Maps → Namae ───── */}
      <section className="profile-section">
        <h3 className="readings-h">📍 Depuis Google Maps (desktop)</h3>
        <p className="profile-blurb">
          Tu cherches un lieu sur <a href="https://maps.google.com" target="_blank" rel="noreferrer">Google Maps</a>,
          tu sélectionnes le bon item dans la liste — le libellé apparaît dans le header / bandeau de
          détail. Un bookmarklet bien placé te ramène d’<strong>un seul clic</strong> sur Namae avec
          ce libellé prêt à analyser.
        </p>

        <div className="bmk-grab">
          {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
          <a
            ref={bmkAnchorRef}
            className="bmk-btn"
            draggable="true"
            onClick={(e) => { e.preventDefault(); alert("Glisse ce bouton dans ta barre de favoris — ne le clique pas ici. Une fois installé, va sur Google Maps, choisis ton lieu, puis clique le bookmarklet depuis la barre."); }}
            title="Glisse-moi dans la barre de favoris"
          >
            📍 Analyser sur Namae
          </a>
          <div className="bmk-hint">↑ glisse ce bouton dans ta barre de favoris</div>
        </div>

        <ol className="bmk-steps">
          <li>
            <strong>Installation (une fois)</strong> — affiche ta barre de favoris (Ctrl/Cmd + Maj + B),
            puis fais glisser le bouton rose ci-dessus dedans.
          </li>
          <li>
            <strong>Usage</strong> — sur n’importe quelle page <code>maps.google.com</code> ou
            <code>maps.app.goo.gl</code>, recherche un lieu et clique sur le bon résultat dans la liste.
          </li>
          <li>
            <strong>Bascule</strong> — clique le bookmarklet dans ta barre. Le titre courant de la page
            Maps (= le libellé du header) est transmis à Namae, qui lance l’analyse étymologique
            dans un nouvel onglet.
          </li>
        </ol>
        <p className="profile-help">
          Limite navigateur : on ne peut pas mettre un bouton à l’intérieur de l’iframe Maps elle-même
          (sandboxe cross-origin de Google). Le bookmarklet contourne ça en s’exécutant côté Maps,
          dans ton navigateur. Aucun envoi de données vers nos serveurs : c’est juste une redirection
          vers Namae avec le titre dans l’URL.
        </p>
        <p className="profile-help">
          🤳 <strong>Sur mobile</strong> : utilise plutôt le partage natif. Dans l’app Maps Android,
          <em> Partager → Namae</em> arrive directement à la fiche étymologique (PWA installée).
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
  // Sous-page courante de l'onglet Lectures (état levé pour permettre le
  // deep-linking depuis les liens du glossaire dans les analyses).
  const [readingsSub, setReadingsSub] = useState('kanji')
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
          {tab === 'explore' && <Explorer query={query} setQuery={setQuery} submitted={submitted} submittedLatin={submittedLatin} run={run} runRef={runRef} onShowReadings={() => setTab('readings')} onAnalyzed={() => setHistoryTick((t) => t + 1)} showToast={showToast} onGoToReadingsSub={(sub) => { setReadingsSub(sub); setTab('readings') }} />}
          {tab === 'readings' && <ReadingsExplainer sub={readingsSub} setSub={setReadingsSub} />}
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

/* Ligne de saisie : 📋 + input + Analyser */
.search-row { display: flex; gap: 8px; margin: 0 0 18px; align-items: stretch; }
.paste-mini {
  font-size: 18px; line-height: 1;
  background: #161e2e; color: #f9a8d4; border: 1px solid #2a3a54;
  border-radius: 10px; padding: 0 12px; cursor: pointer;
  transition: border-color .15s, color .15s, background .15s;
}
.paste-mini:hover { border-color: #f472b6; color: #f472b6; background: #1c2740; }
.search-input {
  flex: 1; min-width: 0;
  font-family: inherit; font-size: 14.5px;
  background: #161e2e; color: #e8edf5; border: 1px solid #2a3a54;
  border-radius: 10px; padding: 10px 14px; outline: none;
}
.search-input:focus { border-color: #f472b6; }
.search-input::placeholder { color: #64748b; font-size: 13px; }
.search-btn-mini {
  font-family: inherit; font-size: 14px; font-weight: 600;
  background: #f472b6; color: #0f1623; border: none;
  border-radius: 10px; padding: 0 18px; cursor: pointer; transition: filter .15s;
}
.search-btn-mini:hover:not(:disabled) { filter: brightness(1.08); }
.search-btn-mini:disabled { opacity: 0.45; cursor: not-allowed; }

/* Autocomplétion Nominatim (résultats Japon en JA + EN) */
.search-input-wrap { flex: 1; min-width: 0; position: relative; }
.search-input-wrap .search-input { width: 100%; }
.autocomplete {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 50;
  list-style: none; padding: 4px; margin: 0;
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0,0,0,.45);
  max-height: 340px; overflow-y: auto;
}
.ac-loading { padding: 10px 14px; font-size: 13px; color: #94a3b8; font-style: italic; }
.ac-item {
  width: 100%; text-align: left; display: flex; flex-direction: column; gap: 2px;
  font-family: inherit;
  background: transparent; color: #e8edf5; border: 1px solid transparent;
  padding: 10px 12px; border-radius: 8px; cursor: pointer;
  transition: background .12s, border-color .12s;
}
.ac-item:hover, .ac-item:focus { background: #1c2740; border-color: #f472b6; outline: none; }
.ac-jp { font-family: 'Noto Serif JP', serif; font-size: 17px; color: #f472b6; line-height: 1.2; }
.ac-en { font-weight: 600; color: #e8edf5; font-size: 13.5px; }
.ac-full { font-size: 11.5px; color: #94a3b8; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
.krd-mirror {
  margin-top: 10px; padding: 8px 10px;
  background: rgba(15,22,35,.55);
  border: 1px dashed rgba(148,163,184,.35);
  border-radius: 8px;
  font-size: 12.5px; color: #cbd5e1; line-height: 1.55;
}
.krd-mirror .ksr-tag { margin-right: 8px; vertical-align: middle; }
.krd-warning {
  margin-top: 10px; padding: 10px 12px;
  background: rgba(251,146,60,.08);
  border: 1px solid rgba(251,146,60,.35);
  border-radius: 8px;
  font-size: 12.5px; color: #fde68a; line-height: 1.55;
}
.krd-warning strong { color: #fb923c; }

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

/* Sub-nav (5 onglets : Kanji / Hiragana / Katakana / Rōmaji / Kun↔On) */
.readings-subnav {
  display: flex; gap: 6px; flex-wrap: wrap;
  margin-bottom: 24px;
  border-bottom: 1px solid #2a3a54; padding-bottom: 12px;
}
.rsn {
  display: flex; flex-direction: column; align-items: center;
  font-family: inherit;
  background: #161e2e; color: #94a3b8; border: 1px solid #2a3a54;
  padding: 6px 14px 8px; border-radius: 999px; cursor: pointer;
  transition: all .15s;
}
.rsn:hover { color: #e8edf5; border-color: #3b4d6b; }
.rsn.on { background: #f472b6; border-color: #f472b6; color: #0f1623; }
.rsn-jp { font-family: 'Noto Serif JP', serif; font-size: 13px; line-height: 1; }
.rsn-fr { font-size: 11.5px; font-weight: 600; margin-top: 2px; }
.rsn.on .rsn-jp, .rsn.on .rsn-fr { color: #0f1623; }

/* Page Kanji : stats + pictogrammes + compo */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 12px 0; }
.stat { background: #161e2e; border: 1px solid #2a3a54; border-left: 3px solid #f472b6; border-radius: 12px; padding: 12px 14px; }
.stat-num { font-family: 'DM Serif Display', serif; font-size: 28px; color: #f472b6; line-height: 1.1; }
.stat-label { font-size: 12.5px; color: #cbd5e1; margin-top: 4px; line-height: 1.4; }
.kanji-pictograms { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 14px 0; }
.kp-card { background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px; padding: 14px; text-align: center; }
.kp-glyph { font-family: 'Noto Serif JP', serif; font-size: 56px; color: #f472b6; line-height: 1; margin-bottom: 4px; }
.kp-rom { font-weight: 700; color: #e8edf5; font-size: 13px; }
.kp-fr { color: #cbd5e1; font-size: 13px; margin: 2px 0 4px; }
.kp-note { color: #94a3b8; font-size: 12px; font-style: italic; line-height: 1.4; }
.combo-flow { display: flex; justify-content: center; gap: 10px; align-items: center; margin: 14px 0; flex-wrap: wrap; }
.combo-step { background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px; padding: 12px 16px; text-align: center; }
.combo-glyph { font-family: 'Noto Serif JP', serif; font-size: 44px; color: #4ade80; line-height: 1; margin-bottom: 4px; }
.combo-label { font-size: 12px; color: #cbd5e1; }
.combo-arrow { font-size: 22px; color: #f472b6; font-weight: 700; }
.ex-list { list-style: none; padding: 0; }
.ex-list li { background: #161e2e; border: 1px solid #2a3a54; border-radius: 10px; padding: 10px 14px; margin-bottom: 6px; font-size: 14px; }
.ex-list .ex-jp { font-family: 'Noto Serif JP', serif; font-size: 18px; color: #f472b6; margin-right: 10px; }
.inline-link { background: none; border: none; color: #f9a8d4; cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
.inline-link:hover { color: #f472b6; }

/* Tableaux gojūon hiragana/katakana */
.kana-table { display: flex; flex-direction: column; gap: 6px; background: #0f1623; border: 1px solid #2a3a54; border-radius: 12px; padding: 10px; margin: 10px 0; }
.kt-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.kt-cell {
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 8px;
  padding: 8px 4px; text-align: center; min-height: 56px;
  display: flex; flex-direction: column; justify-content: center;
}
.kt-empty { background: transparent; border: none; }
.kt-dash { color: #475569; display: flex; align-items: center; justify-content: center; }
.kt-jp { font-family: 'Noto Serif JP', serif; font-size: 22px; color: #e8edf5; line-height: 1.1; }
.is-hira .kt-jp { color: #4ade80; }
.is-kata .kt-jp { color: #38bdf8; }
.kt-rom { font-size: 11px; color: #94a3b8; margin-top: 2px; font-weight: 600; }
.kana-table-legend { font-size: 12.5px; color: #94a3b8; font-style: italic; margin: 8px 0; }
.kana-table-note { font-size: 13px; color: #cbd5e1; background: #161e2e; border-left: 3px solid #f472b6; padding: 10px 12px; border-radius: 0 8px 8px 0; margin: 10px 0; line-height: 1.55; }

.kana-compare { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 12px 0; background: #161e2e; border-radius: 12px; overflow: hidden; }
.kana-compare th, .kana-compare td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #2a3a54; }
.kana-compare th { background: #1c2740; color: #94a3b8; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; }
.kana-compare tr:last-child td { border-bottom: none; }
.kc-jp { font-family: 'Noto Serif JP', serif; font-size: 20px; color: #f472b6; text-align: center; }

/* Page Rōmaji */
.rom-systems { display: flex; flex-direction: column; gap: 10px; margin: 12px 0; }
.rom-card { background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px; padding: 14px 16px; }
.rom-hepburn { border-left: 4px solid #f472b6; }
.rom-kunrei  { border-left: 4px solid #fb923c; }
.rom-nihon   { border-left: 4px solid #94a3b8; }
.rom-card-head { font-weight: 700; font-size: 15.5px; margin-bottom: 6px; color: #e8edf5; }
.rom-card-tag { font-weight: 400; font-size: 12px; color: #94a3b8; font-style: italic; margin-left: 8px; }
.rom-card p { margin: 0 0 8px; font-size: 13.5px; color: #cbd5e1; line-height: 1.55; }
.rom-ex { font-family: 'Noto Serif JP', serif; font-size: 14px; color: #cbd5e1; background: #0f1623; border-radius: 6px; padding: 6px 10px; }
.rom-ex strong { color: #f472b6; }
.vowel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin: 12px 0; }
.vow { background: #161e2e; border: 1px solid #2a3a54; border-left: 3px solid #4ade80; border-radius: 10px; padding: 10px 12px; }
.vow-jp { font-family: 'Noto Serif JP', serif; font-size: 22px; color: #f472b6; margin-bottom: 4px; }
.vow-ok { color: #4ade80; font-weight: 600; font-size: 13.5px; }
.vow-ko { color: #94a3b8; font-size: 12px; font-style: italic; margin-top: 2px; }

/* Liens du glossaire (ateji, jukujikun…) dans les textes de l'IA */
.gloss-link {
  font: inherit; font-style: italic; font-weight: 600;
  background: rgba(244,114,182,.12); color: #f9a8d4;
  border: none; border-bottom: 1px dotted #f472b6;
  padding: 0 3px; margin: 0 1px; border-radius: 3px;
  cursor: pointer; transition: background .15s, color .15s;
}
.gloss-link:hover { background: rgba(244,114,182,.25); color: #fff; }
.gloss-link:after { content: ' ↗'; font-size: 0.78em; opacity: 0.65; }

/* Page Ateji & Jukujikun : cartes par stratégie */
.strat-card {
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px;
  padding: 14px 16px; margin: 10px 0;
}
.strat-a  { border-left: 4px solid #4ade80; }
.strat-b  { border-left: 4px solid #fb923c; }
.strat-c  { border-left: 4px solid #f472b6; }
.strat-jk { border-left: 4px solid #38bdf8; background: rgba(56,189,248,.05); }
.strat-head { font-weight: 700; color: #e8edf5; font-size: 14.5px; margin-bottom: 8px; }
.strat-eg { display: flex; align-items: center; gap: 10px; margin: 8px 0 10px; flex-wrap: wrap; font-size: 15px; color: #e8edf5; }
.strat-jp { font-family: 'Noto Serif JP', serif; font-size: 28px; color: #f472b6; line-height: 1; }
.strat-arrow { color: #f472b6; font-weight: 700; font-size: 20px; }
.strat-card p { font-size: 13.5px; color: #cbd5e1; line-height: 1.6; margin: 6px 0 0; }
.strat-card em { color: #fdf2f8; font-style: italic; }

/* Résumé visuel */
.summary-box {
  background: #0f1623; border: 1px solid #2a3a54; border-radius: 12px;
  padding: 14px; margin: 12px 0; font-family: 'DM Mono', 'Courier New', monospace;
}
.sb-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: center; padding: 8px 4px; border-bottom: 1px solid #1c2740; }
.sb-row:last-child { border-bottom: none; }
.sb-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; font-weight: 600; font-family: inherit; }
.sb-row-jk .sb-label { color: #38bdf8; }
.sb-row-aj .sb-label { color: #fb923c; }
.sb-eg { font-size: 14px; color: #e8edf5; line-height: 1.5; }
.sb-eg strong { color: #f472b6; }
.sb-note { color: #94a3b8; font-style: italic; font-size: 12.5px; margin-left: 6px; }

@media (max-width: 560px) {
  .sb-row { grid-template-columns: 1fr; gap: 4px; }
}

@media (max-width: 560px) {
  .readings-subnav { gap: 4px; overflow-x: auto; flex-wrap: nowrap; padding-bottom: 8px; }
  .rsn { flex-shrink: 0; padding: 5px 10px 6px; }
  .kt-cell { min-height: 50px; padding: 6px 2px; }
  .kt-jp { font-size: 18px; }
  .kt-rom { font-size: 10px; }
  .kanji-pictograms { grid-template-columns: repeat(2, 1fr); }
  .stat-num { font-size: 22px; }
}
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

/* Section noms propres */
.readings-toponyms { background: rgba(251,146,60,.04); border: 1px solid rgba(251,146,60,.18); border-radius: 14px; padding: 18px 20px; }
.toponym-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 14px 0; }
.toponym-card {
  background: #161e2e; border: 1px solid #2a3a54; border-left: 4px solid #4ade80;
  border-radius: 12px; padding: 12px 14px;
  text-align: center;
}
.toponym-card-irr { border-left-color: #fb923c; }
.toponym-card-rev { border-left-color: #38bdf8; }
.toponym-jp { font-family: 'Noto Serif JP', serif; font-size: 28px; color: #f472b6; line-height: 1; margin-bottom: 4px; }
.toponym-rom { font-weight: 700; color: #e8edf5; font-size: 14.5px; }
.toponym-rule { font-size: 11px; color: #4ade80; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; margin-top: 4px; }
.toponym-card-irr .toponym-rule { color: #fb923c; }
.toponym-card-rev .toponym-rule { color: #38bdf8; }
.toponym-note { font-size: 11.5px; color: #94a3b8; font-style: italic; margin-top: 4px; }

/* ═══ Schémas pédagogiques ════════════════════════════════════════════ */
.schema {
  margin: 18px 0 8px;
  background: #0f1623; border: 1px solid #2a3a54;
  border-radius: 14px; padding: 16px 18px;
}
.schema-title {
  font-size: 11.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .08em; color: #94a3b8; margin-bottom: 14px;
}

/* Schéma 1 : flux historique */
.sch-flow { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 8px; align-items: stretch; }
.sch-node {
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px;
  padding: 12px; text-align: center; display: flex; flex-direction: column; justify-content: space-between;
}
.sch-native { border-left: 4px solid #4ade80; }
.sch-import { border-left: 4px solid #38bdf8; }
.sch-merge  { border-left: 4px solid #f472b6; }
.sch-when { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: 6px; }
.sch-headline { font-size: 12.5px; font-weight: 600; color: #cbd5e1; margin-bottom: 8px; }
.sch-jp-big { font-family: 'Noto Serif JP', serif; font-size: 36px; color: #e8edf5; line-height: 1; margin: 6px 0; }
.sch-sub { font-size: 11.5px; color: #94a3b8; font-style: italic; line-height: 1.4; }
.sch-double { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.sch-half { font-size: 13px; color: #e8edf5; }
.sch-half .ksr-tag { margin-right: 6px; vertical-align: middle; }
.sch-arrow-h { display: flex; align-items: center; font-size: 22px; color: #f472b6; padding: 0 2px; font-weight: 700; }

/* Schéma 2 : arbre de décision */
.dec-root {
  text-align: center; padding: 10px 14px;
  background: rgba(244,114,182,.06); border: 1px solid rgba(244,114,182,.3); border-radius: 12px;
  margin-bottom: 10px;
}
.dec-glyph { font-family: 'Noto Serif JP', serif; font-size: 38px; color: #f472b6; line-height: 1; margin-bottom: 4px; }
.dec-prompt { font-size: 13px; color: #e8edf5; font-style: italic; }
.dec-branches { display: flex; flex-direction: column; gap: 10px; }
.dec-branch {
  display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start;
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px;
  padding: 12px 14px;
}
.dec-branch.dec-kun { border-left: 4px solid #4ade80; }
.dec-branch.dec-on  { border-left: 4px solid #38bdf8; }
.dec-q { font-size: 13px; color: #cbd5e1; line-height: 1.5; }
.dec-answer { font-size: 13.5px; color: #e8edf5; white-space: nowrap; align-self: center; }
.dec-answer .ksr-tag { margin-right: 6px; vertical-align: middle; }
.dec-ex { grid-column: 1 / -1; font-family: 'Noto Serif JP', serif; font-size: 13.5px; color: #cbd5e1; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #2a3a54; }

/* Schéma 3 : mécanisme ateji pour Sumida */
.schema-ateji { background: rgba(74,222,128,.04); border-color: rgba(74,222,128,.25); }
.atj-step {
  display: grid; grid-template-columns: 44px 1fr; gap: 14px;
  align-items: start;
  background: #161e2e; border: 1px solid #2a3a54; border-radius: 12px;
  padding: 12px 14px;
}
.atj-num {
  width: 32px; height: 32px; border-radius: 50%;
  background: #4ade80; color: #0f1623;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 16px;
}
.atj-h { font-weight: 700; color: #e8edf5; font-size: 14px; margin-bottom: 6px; }
.atj-explain { font-size: 13px; color: #cbd5e1; line-height: 1.55; }
.atj-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.atj-jp { font-family: 'Noto Serif JP', serif; font-size: 26px; color: #f472b6; line-height: 1.1; }
.atj-tail { font-size: 13px; color: #cbd5e1; font-style: italic; }
.atj-arrow {
  text-align: center; font-size: 22px; color: #4ade80; font-weight: 700;
  padding: 4px 0; margin: 4px 0 4px 22px;
}
.atj-pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; margin-top: 8px; }
.atj-kanji {
  background: #0f1623; border: 1px solid #2a3a54; border-radius: 10px;
  padding: 10px; text-align: center;
}
.atj-glyph { font-family: 'Noto Serif JP', serif; font-size: 44px; color: #f472b6; line-height: 1; margin-bottom: 6px; }
.atj-read { font-size: 12.5px; color: #e8edf5; margin-bottom: 4px; }
.atj-read .ksr-tag { margin-right: 6px; vertical-align: middle; }
.atj-mean { font-size: 11px; color: #94a3b8; font-style: italic; }
.atj-plus { font-size: 22px; color: #f472b6; font-weight: 700; }

.atj-result {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  background: #0f1623; border: 1px solid #2a3a54; border-radius: 12px;
  padding: 12px 14px;
}
.atj-result-label {
  grid-column: 1 / -1;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .08em; color: #94a3b8; margin-bottom: 4px;
}
.atj-result-ok, .atj-result-ko { padding: 10px; border-radius: 8px; }
.atj-result-ok { background: rgba(74,222,128,.10); border-left: 3px solid #4ade80; }
.atj-result-ko { background: rgba(248,113,113,.08); border-left: 3px solid #f87171; }
.atj-result-jp { font-family: 'Noto Serif JP', serif; font-size: 22px; color: #e8edf5; margin-bottom: 6px; line-height: 1.2; }
.atj-result-ok .atj-result-jp strong { color: #4ade80; }
.atj-result-ko .atj-result-jp { color: #fca5a5; font-size: 18px; }
.atj-result-rule { font-size: 12px; color: #cbd5e1; line-height: 1.5; }

@media (max-width: 560px) {
  .sch-flow { grid-template-columns: 1fr; }
  .sch-arrow-h { transform: rotate(90deg); justify-self: center; padding: 4px 0; }
  .dec-branch { grid-template-columns: 1fr; }
  .dec-answer { white-space: normal; }
  .atj-pair { grid-template-columns: 1fr; }
  .atj-plus { transform: rotate(90deg); }
  .atj-result { grid-template-columns: 1fr; }
  .atj-jp { font-size: 22px; }
  .atj-result-jp { font-size: 18px; }
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

/* Bookmarklet Google Maps → Namae */
.bmk-grab {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  background: linear-gradient(180deg, rgba(244,114,182,.08) 0%, rgba(244,114,182,.02) 100%);
  border: 1px dashed rgba(244,114,182,.45); border-radius: 14px;
  padding: 20px 16px; margin: 14px 0;
}
.bmk-btn {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: inherit; font-size: 15.5px; font-weight: 700;
  background: #f472b6; color: #0f1623; text-decoration: none;
  padding: 12px 22px; border-radius: 999px;
  box-shadow: 0 6px 18px rgba(244,114,182,.30);
  cursor: grab; user-select: none;
  transition: filter .15s, transform .12s;
}
.bmk-btn:hover { filter: brightness(1.07); transform: translateY(-1px); }
.bmk-btn:active { cursor: grabbing; transform: translateY(0); }
.bmk-hint { font-size: 12.5px; color: #f9a8d4; font-style: italic; }
.bmk-steps {
  margin: 14px 0 0; padding-left: 24px;
  display: flex; flex-direction: column; gap: 10px;
  font-size: 13.5px; color: #cbd5e1; line-height: 1.55;
}
.bmk-steps li::marker { color: #f472b6; font-weight: 700; }
.bmk-steps strong { color: #e8edf5; }
.bmk-steps code {
  background: #0f1623; border: 1px solid #2a3a54; border-radius: 4px;
  padding: 1px 6px; font-size: 12.5px; color: #f9a8d4;
}

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
