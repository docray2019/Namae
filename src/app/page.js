'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, LEARN_COMPONENTS, normalizeRomaji } from '@/lib/japan/components'
import { decompose, mapEmbedUrl } from '@/lib/japan/parser'

const ROLE_LABEL = { prefix: 'Préfixe', core: 'Nom principal', suffix: 'Suffixe' }
const EXAMPLES = ['Tokyo', 'Kyoto', '金沢', 'Hiroshima', 'Shinjuku', 'Taitō', 'Nagasaki', '明治神宮', 'Fukuoka']
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

// Reverse-geocoding via Nominatim (OpenStreetMap) — libre, sans clé. On demande
// le japonais (`accept-language=ja`) : pour les lieux où OSM a une étiquette
// `name:ja`, on récupère directement les kanji prêts à décomposer.
async function reverseGeocode(lat, lng, zoom) {
  const z = Math.min(18, Math.max(10, Math.round(zoom)))
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${z}&accept-language=ja`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const d = await res.json()
    const a = d?.address || {}
    return (
      d?.name ||
      a.attraction || a.tourism || a.shrine || a.temple ||
      a.neighbourhood || a.suburb || a.quarter || a.city_district ||
      a.town || a.village || a.city ||
      ''
    ) || null
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
//    le centre de la carte via Nominatim (libellé japonais quand dispo). Leaflet
//    est chargé à la volée depuis unpkg (libre, pas de clé, pas de npm dep).
function MapPicker({ runRef }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [hint, setHint] = useState('Pinch pour zoomer, glisse pour déplacer — le lieu au centre est analysé.')

  useEffect(() => {
    let map = null
    let cancelled = false
    let debounce = null
    let lastQuery = null

    async function ensureLeaflet() {
      if (window.L) return
      if (!document.getElementById('leaflet-css')) {
        const css = document.createElement('link')
        css.id = 'leaflet-css'
        css.rel = 'stylesheet'
        css.href = LEAFLET_CSS
        document.head.appendChild(css)
      }
      await new Promise((resolve, reject) => {
        const existing = document.getElementById('leaflet-js')
        if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return }
        const s = document.createElement('script')
        s.id = 'leaflet-js'
        s.src = LEAFLET_JS
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
    }

    async function init() {
      try {
        await ensureLeaflet()
      } catch {
        if (!cancelled) setHint('Impossible de charger la carte (réseau ?).')
        return
      }
      if (cancelled || !containerRef.current) return
      const L = window.L
      map = L.map(containerRef.current, { center: [35.6762, 139.6503], zoom: 11, zoomControl: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map)
      setLoading(false)

      map.on('moveend', () => {
        clearTimeout(debounce)
        debounce = setTimeout(async () => {
          const c = map.getCenter()
          const z = map.getZoom()
          setHint('Identification du lieu au centre…')
          const name = await reverseGeocode(c.lat, c.lng, z)
          if (!name) { setHint('Aucun lieu nommé au centre — déplace ou zoome encore.'); return }
          const key = name + '@' + z
          if (key === lastQuery) { setHint(`📍 ${name}`); return }
          lastQuery = key
          setHint(`📍 ${name}`)
          runRef.current?.(name)
        }, 600)
      })
    }

    init()
    return () => {
      cancelled = true
      clearTimeout(debounce)
      map?.remove()
    }
  }, [runRef])

  return (
    <div className="map-picker">
      <div ref={containerRef} className="map-picker-canvas" />
      <div className="map-picker-crosshair" aria-hidden>⊕</div>
      {loading && <div className="map-picker-loading">Chargement de la carte…</div>}
      <div className="map-picker-hint">{hint}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  Mode EXPLORER
// ════════════════════════════════════════════════════════════════════════
function Explorer({ query, setQuery, submitted, run, runRef }) {
  const result = useMemo(() => decompose(submitted), [submitted])
  const recognized = useMemo(() => {
    if (!result) return []
    const seen = new Set()
    const list = []
    for (const p of result.parts) {
      if (p.comp && !seen.has(p.comp.k)) { seen.add(p.comp.k); list.push(p) }
    }
    return list
  }, [result])

  return (
    <div>
      <MapPicker runRef={runRef} />
      <p className="howto">
        💡 Ou colle le nom d’un lieu depuis <strong>Google Maps</strong> ci-dessous
        (le bouton <strong>📋 Coller</strong> en haut à droite résout aussi les liens Maps).
      </p>
      <div className="search">
        <input
          id="namae-input"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="Nom d’un lieu japonais (romaji ou kanji) — ex. Kamakura, 渋谷…"
          autoFocus
        />
        <button className="search-btn" onClick={() => run()}>Analyser</button>
      </div>

      <div className="chips">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" onClick={() => run(ex)}>{ex}</button>
        ))}
      </div>

      {result && (
        <>
          <div className="card">
            <div className="card-head">
              <span className="card-title">
                {result.input}
                {result.resolvedKanji && <span className="resolved"> → {result.resolvedKanji}</span>}
              </span>
              <span className="card-sub">
                {result.recognized > 0
                  ? `${result.recognized} composant${result.recognized > 1 ? 's' : ''} reconnu${result.recognized > 1 ? 's' : ''}`
                  : 'aucun composant reconnu'}
              </span>
            </div>

            <div className="segments">
              {result.parts.map((p, i) => (
                <Segment key={i} part={p} />
              ))}
            </div>

            {recognized.length === 0 && (
              <p className="empty">
                Aucun préfixe ni suffixe connu n’a été repéré. Essayez l’écriture en kanji
                (ex. <button className="inline-ex" onClick={() => run('渋谷')}>渋谷</button>) ou un
                autre lieu.
              </p>
            )}
          </div>

          {recognized.length > 0 && (
            <div className="details">
              <h3 className="section-h">Idéogrammes & étymologie</h3>
              {recognized.map((p, i) => (
                <div key={i}>
                  <KanjiCard comp={p.comp} big reading={p.reading} />
                  {p.alts.length > 0 && (
                    <div className="alts">
                      Autres lectures possibles de « {p.comp.romaji[0]} » :{' '}
                      {p.alts.map((a) => `${a.k} (${a.fr.split(',')[0]})`).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="map-wrap">
            <h3 className="section-h">Sur la carte</h3>
            <iframe
              key={submitted}
              className="map"
              title={`Carte de ${result.input}`}
              src={mapEmbedUrl(result.resolvedKanji || result.input)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <p className="disclaimer">
            ⚠️ Outil pédagogique. La toponymie japonaise est souvent ambiguë (lectures
            multiples, rendaku) : la décomposition proposée est une <em>meilleure
            interprétation</em>, pas une vérité unique.
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
//  Page
// ════════════════════════════════════════════════════════════════════════
export default function NamaePage() {
  const [tab, setTab] = useState('explore')
  // Sur ouverture via Web Share Target, on ne veut PAS analyser « Tokyo » par
  // défaut : on attend le résultat du share. Sinon, démo avec Tokyo.
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return 'Tokyo'
    const p = new URLSearchParams(window.location.search)
    return (p.get('name') || p.get('text') || p.get('url')) ? '' : 'Tokyo'
  })
  const [submitted, setSubmitted] = useState(query)
  const [toast, setToast] = useState(null)
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

  function run(value) {
    const v = (value ?? query).trim()
    if (!v) return
    setQuery(v)

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

  // Parcours : l'utilisateur a copié un nom dans Maps/Citymapper → on le colle et on l'analyse.
  async function pasteAndAnalyze() {
    setTab('explore')
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('unsupported')
      const text = (await navigator.clipboard.readText()) || ''
      const name = firstUsefulLine(text)
      if (name) {
        run(name)
        showToast(`Collé : « ${name} »`)
        return
      }
      // Pas de nom direct — peut-être une URL Maps courte ? run() saura la résoudre.
      const urlMatch = text.match(/https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps|g\.co\/kgs)\S*/i)
      if (urlMatch) { run(urlMatch[0]); return }
      showToast('Presse-papiers : aucun nom de lieu détecté.')
    } catch {
      showToast('Autorisez le presse-papiers, ou collez dans le champ (Ctrl/Cmd + V).')
      const el = document.getElementById('namae-input')
      if (el) el.focus()
    }
  }

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
    const focusInput = () => {
      showToast('Lien Maps reçu — tapez le nom du lieu dans le champ ↓')
      setTimeout(() => document.getElementById('namae-input')?.focus(), 80)
    }

    // 1) Nom trouvable côté client (titre / texte / URL longue Maps) → on lance.
    const name = firstUsefulLine(payload)
    if (name) { run(name); showToast(`Reçu : « ${name} »`); cleanUrl(); return }

    // 2) URL Maps courte → on délègue à run() qui appelle le résolveur serveur.
    const urlMatch = payload.match(/https?:\/\/\S+/i)
    if (urlMatch) { run(urlMatch[0]); cleanUrl(); return }

    // 3) Rien d'exploitable → fallback champ texte.
    focusInput()
    cleanUrl()
  }, [])

  return (
    <>
      <style>{CSS}</style>

      <button className="paste-fab" onClick={pasteAndAnalyze} title="Coller depuis le presse-papiers et analyser">
        📋 <span>Coller</span>
      </button>
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
          <button className={`tab ${tab === 'learn' ? 'on' : ''}`} onClick={() => setTab('learn')}>📖 Apprendre</button>
          <button className={`tab ${tab === 'quiz' ? 'on' : ''}`} onClick={() => setTab('quiz')}>🎯 Quiz</button>
        </nav>

        <main className="main">
          {tab === 'explore' && <Explorer query={query} setQuery={setQuery} submitted={submitted} run={run} runRef={runRef} />}
          {tab === 'learn' && <Learn />}
          {tab === 'quiz' && <Quiz />}
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

/* Bouton flottant « Coller » (top-most, haut droite) */
.paste-fab {
  position: fixed; top: 16px; right: 16px; z-index: 1000;
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
  background: #f472b6; color: #0f1623; border: none;
  padding: 12px 18px; border-radius: 999px; cursor: pointer;
  box-shadow: 0 8px 24px rgba(244,114,182,.35); transition: transform .12s, filter .12s;
}
.paste-fab:hover { filter: brightness(1.07); transform: translateY(-1px); }
.paste-fab:active { transform: translateY(0); }

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
.map-picker-canvas .leaflet-tile-pane { filter: brightness(0.75) saturate(0.85); }
.map-picker-crosshair {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 28px; color: #f472b6; font-weight: 700;
  text-shadow: 0 0 4px #0f1623, 0 0 8px #0f1623;
  pointer-events: none; z-index: 500; user-select: none;
}
.map-picker-loading {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 13px; color: #94a3b8;
}
.map-picker-hint {
  font-size: 12.5px; color: #94a3b8; line-height: 1.5;
  margin-top: 8px; padding: 0 4px;
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
  .paste-fab { padding: 12px; }
  .paste-fab span { display: none; }
  .brand-jp, .brand-name { font-size: 32px; }
  .seg-kanji { font-size: 36px; }
  .quiz-glyph { font-size: 72px; }
  .learn-grid { grid-template-columns: 1fr; }
}
`
