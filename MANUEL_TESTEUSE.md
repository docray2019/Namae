# Namae 名前 — Manuel de la testeuse

Bienvenue 🌸 ! Ce document t'explique en quelques minutes comment utiliser et
tester l'app Namae sur ton mobile. Lis-le une fois, garde-le pour t'y référer
quand tu hésites sur un point, et n'hésite pas à me remonter tout ce qui te
paraît bizarre — même les détails.

---

## 1. À quoi sert Namae

Namae **décompose les noms de lieux japonais** et t'explique leur étymologie en
français. Tu lui donnes un nom (par exemple **東京**, **Shibuya**, **Hokkaidō**)
et elle te répond avec :

- la lecture en alphabet latin (rōmaji),
- le découpage en **préfixe / nom principal / suffixe**,
- le sens et la lecture de chaque kanji,
- une explication étymologique,
- l'histoire des lectures (kun'yomi vs on'yomi),
- une analogie en français quand c'est pertinent,
- une anecdote culturelle,
- et la carte Google Maps du lieu.

Sous le capot, c'est Claude Opus 4.7 (l'IA d'Anthropic) qui rédige l'analyse
à la demande.

---

## 2. Installation sur ton mobile (Android Chrome)

### 2.1. Installer Namae comme une app

1. Ouvre **Chrome** sur ton téléphone.
2. Va sur **`https://namaejapan.vercel.app`**.
3. Attends que la page soit chargée (5-10 s à la première visite, car les
   tuiles Google Maps et le manifest PWA mettent un peu de temps).
4. Menu **`⋮`** en haut à droite → **fais défiler vers le bas** → tu verras
   `Installer l'application` ou `Ajouter à l'écran d'accueil`. Tape dessus.
5. Une popup confirme le nom (Namae). Confirme → l'icône **名** rose apparaît
   dans ton tiroir d'apps.
6. Pose l'icône sur ton écran d'accueil par appui long depuis le tiroir
   (ou laisse-la dans le tiroir, c'est selon ton goût).

> ⚠️ **Sur Pixel** : l'option « Installer l'application » est cachée tout en
> bas du menu Chrome, en dessous de « Paramètres ». Si tu ne la vois pas, la
> page n'a pas encore été reconnue comme installable — recharge.

### 2.2. Activer le partage depuis Google Maps

Une fois Namae installée, **redémarre une fois ton téléphone** pour qu'Android
indexe son `share_target`. Ensuite :

1. Ouvre l'app **Google Maps**.
2. Cherche un lieu (« Tokyo Tower », « 渋谷駅 », etc.) et sélectionne-le.
3. Tape sur **Partager** dans sa fiche.
4. Dans la share sheet, fais défiler — tu verras l'icône **Namae 名**.
5. Tape dessus → Namae s'ouvre directement sur l'analyse du lieu.

C'est ÇA le flow principal qu'on veut tester. Si Namae n'apparaît PAS dans
la share sheet, c'est une régression — préviens-moi.

---

## 3. Les autres façons d'analyser un lieu

Dans l'onglet **🔍 Explorer**, en plus du partage depuis Maps :

### 3.1. Taper un nom (avec autocomplétion)

Dans le champ de recherche au milieu :

- Tape les premières lettres en alphabet latin (`tokyo`, `shi`, `kyot`…).
- Une liste descend avec des propositions au Japon : **kanji** en gros (rose),
  **nom latin** (blanc), adresse complète (italique gris).
- Tap sur la bonne ligne → analyse lancée immédiatement.

L'autocomplétion vient de Nominatim (OpenStreetMap) — c'est libre et sans clé,
mais ça peut renvoyer des résultats inattendus pour les noms ambigus. Si tu
préfères forcer une analyse exacte, tape le nom complet + Entrée (ou bouton
**Analyser**).

### 3.2. Coller depuis le presse-papiers

Le bouton **📋** à gauche du champ lit ton presse-papiers et lance l'analyse.
Ça marche pour :

- un nom (« Hiroshima »),
- un lien Google Maps (`https://maps.app.goo.gl/...`),
- des coordonnées au format `35.66, 139.70`.

### 3.3. Taper directement en kanji ou kana

Si tu as un clavier japonais activé : tape directement `渋谷` et Enter. Namae
saute Nominatim et envoie directement à l'IA.

---

## 4. Les cinq onglets

### 🔍 Explorer

C'est l'onglet principal. Tu y verras :

- Le **howto** rose en haut.
- Le champ de recherche + bouton Analyser.
- Une fois une analyse lancée :
  - **Titre** : kanji + romaji + sens littéral (italique rose).
  - **Bande de segments** : préfixe (orange), nom principal (rose), suffixe
    (pilule turquoise compacte). C'est le résumé visuel.
  - **Décomposition détaillée** : une carte par segment avec son glyphe
    grand format, sa lecture, son sens, et une note de l'IA. Les badges
    **KUN** (vert) et **ON** (bleu) sont **cliquables** — ils déplient
    une mini-explication qui montre aussi le contraste sur le même kanji.
  - **Étymologie** : 2-4 phrases d'explication historique.
  - **Comprendre les lectures** : synthèse kun/on pour ce nom précis.
  - **Une analogie en français** : encadré italique rose, exemple
    « eau / aqua- ».
  - **À noter** : anecdote ou contexte historique.
  - **Sur la carte** : Google Maps embed du lieu.

> 💡 Dans les textes de l'IA, des mots comme **ateji**, **jukujikun**,
> **rendaku**, **kun'yomi**, **on'yomi** apparaissent en **lien rose pointillé
> ↗**. Touche dessus pour basculer directement sur l'explication détaillée
> dans l'onglet Lectures.

### 📚 Lectures

Cours d'introduction à l'écriture japonaise. Sous-nav en haut avec 6 sous-pages :

| Sous-page | Contenu |
|---|---|
| **漢字 Kanji** | Origines, chiffres clés, exemples pictographiques (山, 川, 木, 日), composition par radicaux. |
| **ひらがな Hiragana** | Histoire, usage, tableau gojūon, dakuten/handakuten. |
| **カタカナ Katakana** | Histoire, usage, tableau gojūon, comparatif hiragana ↔ katakana. |
| **Aa Rōmaji** | Trois systèmes (Hepburn, Kunrei-shiki, Nihon-shiki), macrons, limites. |
| **訓・音 Kun ↔ On** | Pourquoi un kanji a deux lectures. Schémas + cas Hokkaidō + ateji Sumida. |
| **当て字 Ateji & Juku.** | Les deux mécanismes typiques des toponymes japonais. |

À tester surtout : que **les liens internes** (boutons roses « 📚 Tout
comprendre… ») bien basculer entre les sous-pages.

### 📖 Apprendre

Galerie statique des ~80 morphèmes les plus fréquents en toponymie : un par
carte, filtrable par catégorie (Eau, Relief, Religion, etc.).

Ce mode n'utilise pas l'IA — c'est une référence rapide. Test : que les filtres
de catégories marchent et que les fiches s'affichent proprement.

### 🎯 Quiz

10 questions à choix multiples sur le sens des kanji (parfois kanji → sens,
parfois sens → kanji). Score à la fin, bouton « Rejouer ».

Ce mode est local, sans IA. Test : que les réponses sont validées correctement
(les bonnes en vert, les mauvaises en rouge).

### 👤 Mon espace

- **📱 Depuis Google Maps sur mobile** : rappel des étapes pour partager
  depuis Maps (étapes adaptées Android/iOS via détection du User-Agent).
- **📝 Mes dernières analyses** : historique des 50 derniers lieux analysés,
  stocké uniquement sur ton téléphone (localStorage). Clic sur une carte →
  relance l'analyse. Bouton « Tout effacer » pour vider l'historique.
- **🌍 Importer depuis Polarsteps** : si tu utilises Polarsteps pour tracer
  tes voyages, entre ton username (profil public) → on récupère toutes tes
  étapes au Japon. Clic sur une étape → analyse. ⚠️ API non officielle,
  peut casser à tout moment.

---

## 5. Que tester en particulier

### Priorité haute

- [ ] **Le partage Maps → Namae** marche sur ton Pixel Fold. C'est le flow
      principal — si ça casse on est perdus.
- [ ] **L'analyse d'un toponyme inattendu** : essaie un lieu qui sort des
      gros classiques, par exemple ta ville préférée du Tōhoku, un petit
      village, un sanctuaire. L'IA doit identifier le kanji et faire son
      découpage.
- [ ] **Les liens cliquables** sur ateji, jukujikun, etc. dans les analyses
      basculent bien vers la sous-page Lectures correspondante.
- [ ] **L'historique** : analyse 3-4 lieux, va dans « Mon espace », vérifie
      qu'ils sont bien listés. Clique sur une vieille entrée → l'analyse se
      relance.

### Priorité moyenne

- [ ] **Autocomplétion** : tape « Shi » dans le champ → la liste descend
      avec « 渋谷区 — Shibuya », « 静岡県 — Shizuoka », etc.
- [ ] **Coller un lien Maps** : copie un lien depuis Maps (« Copier le lien »
      dans la share sheet), va dans Namae, tape 📋 → résolution + analyse.
- [ ] **Coordonnées** : colle « 35.6762, 139.6503 » dans le champ →
      reverse-geocode + analyse de Tokyo.
- [ ] **Les badges kun/on** : touche-les dans une fiche, l'explication
      déplie et montre le contraste sur 海 (umi ↔ kai).

### Priorité basse

- [ ] Le **quiz** marche, score correct.
- [ ] L'onglet **Apprendre** affiche les fiches, les filtres marchent.
- [ ] **Polarsteps** : si tu as un compte public, essaie l'import.

---

## 6. Limites connues

- L'**iframe Google Maps en bas** de chaque analyse est une boîte noire :
  on ne peut pas mettre de bouton dedans, c'est Google qui contrôle.
- L'**API Polarsteps n'est pas officielle**, peut casser sans préavis.
- Les **toponymes très rares** peuvent dérouter l'IA (mauvaise identification
  du kanji, kun/on incertain) — si tu vois une analyse qui te paraît douteuse,
  garde un screenshot.
- L'**autocomplétion** est limitée par le rate-limit de Nominatim
  (1 req/sec, fair use) — si tu tapes très vite et que plus rien ne propose,
  attends 2-3 s puis re-tape.

---

## 7. Comment me signaler un problème

Pour chaque souci, dis-moi en quelques mots :

1. **Sur quel écran** tu étais (Explorer, Lectures, etc.).
2. **Ce que tu as fait** (tap, partage, défilement…).
3. **Ce que tu attendais** vs **ce qui s'est passé**.
4. Si possible, **un screenshot** — c'est précieux.

Pas besoin de jargon technique. « Le bouton X ne réagit pas quand je tape
dessus » est largement suffisant.

---

## 8. Petits secrets de l'app

- **L'historique des analyses est partagé entre toutes tes sessions Chrome**
  sur le même appareil — mais il ne quitte jamais ton téléphone.
- L'analyse d'un lieu **coûte quelques centimes** à l'API Anthropic — pas la
  peine de spammer 200 fois pour tester, mais 10-20 c'est rien.
- Le mode hors-ligne marche partiellement : Namae installée comme PWA s'ouvre
  même sans réseau (interface), mais les analyses IA et l'autocomplétion ont
  besoin d'Internet.
- Le **shortcut clavier ⌘+V / Ctrl+V** colle directement dans le champ de
  recherche quand il est focus, comme dans n'importe quel champ.

---

Merci d'avoir accepté de tester 🌸. Tes retours sont précieux — ce sont eux
qui me disent quoi affiner.

— l'équipe Namae
