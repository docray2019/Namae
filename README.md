# Namae 名前

**Comprenez l'étymologie des noms de lieux japonais.** Namae prend le nom d'un lieu
(en romaji ou en kanji), le décompose en **préfixe · nom principal · suffixe**, et
explique chaque idéogramme. Application autonome — *aucune dépendance externe, aucune
clé API requise.*

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Fonctionnalités

- **🔍 Explorer** — Saisissez (ou collez) un lieu : `Tokyo → 東京` = 東 *est* + 京
  *capitale*. La décomposition est colorée par catégorie, chaque idéogramme est détaillé
  (lecture, kana, sens, exemple, nombre de traits), et une **carte Google Maps** s'affiche
  (embed sans clé API).
- **📋 Coller** — Un bouton flottant lit le presse-papiers : copiez le nom depuis
  **Google Maps** ou **Citymapper**, touchez « Coller », l'analyse se lance.
- **📖 Apprendre** — Galerie des ~75 morphèmes toponymiques (寺 -ji *temple*, 町 -chō,
  橋 -bashi *pont*, 通 -dōri *avenue*, 園 -en *jardin*, 川 -gawa *rivière*…), filtrable par
  catégorie, avec l'écriture claire de chaque idéogramme.
- **🎯 Quiz** — QCM dans les deux sens (kanji → sens, sens → kanji), avec score.

## 🚀 Lancer en local

```bash
npm install
npm run dev      # http://localhost:3000
```

Compiler pour la production :

```bash
npm run build
npm start
```

> ℹ️ Le bouton **« Coller »** lit le presse-papiers via `navigator.clipboard`, qui n'est
> disponible qu'en **contexte sécurisé** (HTTPS ou `localhost`). Partout ailleurs, un repli
> permet de coller manuellement dans le champ.

## ☁️ Déployer sur Vercel

1. Poussez ce dépôt sur GitHub.
2. Sur [vercel.com](https://vercel.com) → **New Project** → importez le dépôt.
3. Vercel détecte Next.js automatiquement — aucune variable d'environnement requise.
   **Deploy.** ✅

## 🗂️ Structure

```
src/
├─ app/
│  ├─ layout.js          # layout racine + metadata
│  └─ page.js            # l'application (Explorer / Apprendre / Quiz)
└─ lib/japan/
   ├─ components.js      # dictionnaire des morphèmes + gazetteer romaji→kanji
   └─ parser.js          # décomposition (kanji par caractère, romaji préfixe/suffixe)
```

## ⚠️ Avertissement

La toponymie japonaise est souvent ambiguë (lectures multiples, *rendaku*). La
décomposition proposée est une **meilleure interprétation** à but pédagogique, pas une
vérité linguistique unique.

## Licence

MIT
