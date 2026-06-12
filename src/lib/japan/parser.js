// Décomposition étymologique d'un nom de lieu japonais.
//
// Deux stratégies :
//  • Entrée en kanji  → découpage caractère par caractère (fiable, chaque idéogramme
//    a un sens connu).
//  • Entrée en romaji → détection d'un suffixe connu en fin de nom et d'un préfixe
//    connu en début, le reste formant le « nom principal ». Approche « meilleure
//    interprétation » : la toponymie romanisée est ambiguë (rendaku, homophonies).

import {
  COMPONENTS,
  GAZETTEER,
  KANJI_MAP,
  ROMAJI_PREFIXES,
  ROMAJI_SUFFIXES,
  gazetteerEntry,
  normalizeRomaji,
} from './components'

const KANJI_RE = /[㐀-鿿豈-﫿]/
const KANA_RE = /[぀-ヿ]/

export function hasKanji(s) {
  return KANJI_RE.test(s || '')
}

export function detectScript(s) {
  const k = KANJI_RE.test(s)
  const kana = KANA_RE.test(s)
  if (k && /[a-zA-Z]/.test(s)) return 'mixed'
  if (k) return 'kanji'
  if (kana) return 'kana'
  if (/[a-zA-Z]/.test(s)) return 'romaji'
  return 'unknown'
}

// Renvoie la liste des autres composants partageant exactement cette lecture romaji
// (pour signaler honnêtement les interprétations alternatives).
function alternatives(rom, chosen) {
  const out = []
  for (const c of COMPONENTS) {
    if (c === chosen || c.dup) continue
    if (c.romaji.some((r) => normalizeRomaji(r) === rom)) out.push(c)
  }
  return out
}

// ── Découpage d'une entrée en kanji ────────────────────────────────────────
// `contextReadings` (optionnel) : tableau de lectures aligné token-par-token
// avec le découpage produit ici. Quand fourni, chaque part reçoit la lecture
// effective dans le composé (« tō » pour 東 dans Tōkyō, plutôt que la kun’yomi
// canonique « higashi »).
function decomposeKanji(input, contextReadings) {
  const chars = [...input].filter((ch) => KANJI_RE.test(ch))
  const tokens = []
  for (let i = 0; i < chars.length; i++) {
    // tente d'abord un composant de 2 caractères (神社, 公園, 銀座…)
    const pair = chars[i] + (chars[i + 1] || '')
    if (chars[i + 1] && KANJI_MAP.has(pair)) {
      tokens.push({ text: pair, comp: KANJI_MAP.get(pair) })
      i++
      continue
    }
    tokens.push({ text: chars[i], comp: KANJI_MAP.get(chars[i]) || null })
  }

  // Attribution des rôles : 1er caractère reconnu = préfixe (si pertinent),
  // dernier = suffixe, le reste = nom principal.
  let prefixIdx = -1
  let suffixIdx = -1
  if (tokens.length > 1) {
    const first = tokens[0]
    if (first.comp && (first.comp.role === 'prefix' || first.comp.role === 'both')) prefixIdx = 0
    const last = tokens[tokens.length - 1]
    if (last.comp && (last.comp.role === 'suffix' || last.comp.role === 'both') && tokens.length - 1 !== prefixIdx) {
      suffixIdx = tokens.length - 1
    }
  }

  // N'attache la lecture contextuelle que si le tableau couvre tous les tokens.
  const readings = Array.isArray(contextReadings) && contextReadings.length === tokens.length
    ? contextReadings
    : null

  const parts = tokens.map((t, i) => ({
    text: t.text,
    comp: t.comp,
    role: i === prefixIdx ? 'prefix' : i === suffixIdx ? 'suffix' : 'core',
    reading: readings ? readings[i] : undefined,
    alts: t.comp ? alternatives(normalizeRomaji(t.comp.romaji[0]), t.comp) : [],
  }))

  return {
    script: 'kanji',
    parts,
    prefix: prefixIdx >= 0 ? parts[prefixIdx] : null,
    suffix: suffixIdx >= 0 ? parts[suffixIdx] : null,
    recognized: parts.filter((p) => p.comp).length,
    total: parts.length,
  }
}

// ── Découpage d'une entrée en romaji ───────────────────────────────────────
function decomposeRomaji(input) {
  const norm = normalizeRomaji(input)

  // 1) suffixe : plus longue lecture connue terminant le nom et laissant un reste.
  let suffix = null
  let coreStr = norm
  for (const { rom, comp } of ROMAJI_SUFFIXES) {
    if (norm.length > rom.length && norm.endsWith(rom)) {
      suffix = { rom, comp }
      coreStr = norm.slice(0, norm.length - rom.length)
      break
    }
  }

  // 2) préfixe : plus longue lecture connue débutant le reste.
  let prefix = null
  for (const { rom, comp } of ROMAJI_PREFIXES) {
    if (!coreStr.startsWith(rom)) continue
    const remaining = coreStr.slice(rom.length)
    // Garde-fous contre les sur-découpages des lectures courtes.
    if (remaining.length === 0 && !suffix) continue
    if (rom.length <= 2 && !suffix && remaining.length < 2) continue
    prefix = { rom, comp }
    coreStr = remaining
    break
  }

  const parts = []
  if (prefix) {
    parts.push({
      text: prefix.rom, comp: prefix.comp, role: 'prefix',
      alts: alternatives(prefix.rom, prefix.comp),
    })
  }
  if (coreStr) {
    parts.push({ text: coreStr, comp: null, role: 'core', alts: [] })
  }
  if (suffix) {
    parts.push({
      text: suffix.rom, comp: suffix.comp, role: 'suffix',
      alts: alternatives(suffix.rom, suffix.comp),
    })
  }

  return {
    script: 'romaji',
    parts,
    prefix: prefix ? parts[0] : null,
    suffix: suffix ? parts[parts.length - 1] : null,
    recognized: (prefix ? 1 : 0) + (suffix ? 1 : 0),
    total: parts.length,
  }
}

// API principale.
export function decompose(rawInput) {
  const input = (rawInput || '').trim()
  if (!input) return null
  const script = detectScript(input)

  if (hasKanji(input)) {
    return { input, script, ...decomposeKanji(input) }
  }

  // Lieu célèbre saisi en romaji → on résout vers ses kanji pour une étymologie exacte.
  const resolved = gazetteerEntry(GAZETTEER[normalizeRomaji(input)])
  if (resolved) {
    return { input, script: 'kanji', resolvedKanji: resolved.k, ...decomposeKanji(resolved.k, resolved.r) }
  }

  return { input, script, ...decomposeRomaji(input) }
}

// Requête de carte Google Maps (embarquée, sans clé API) biaisée vers le Japon.
export function mapEmbedUrl(name) {
  const q = encodeURIComponent(`${name} 日本`)
  return `https://maps.google.com/maps?q=${q}&hl=fr&z=11&output=embed`
}
