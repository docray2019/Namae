// Dictionnaire des morphèmes (composants étymologiques) des noms de lieux japonais.
// Chaque entrée décrit un idéogramme (ou groupe) fréquent dans la toponymie japonaise :
// son/ses lecture(s) en romaji telles qu'elles apparaissent dans les noms, sa lecture
// kana, sa catégorie, son rôle habituel (préfixe / suffixe / les deux), son sens en
// français, un exemple réel et le nombre de traits (pour l'apprentissage de l'écriture).
//
// NB : la toponymie est souvent ambiguë (rendaku, lectures multiples). Cet outil est une
// aide pédagogique « meilleure interprétation possible », pas un dictionnaire faisant
// autorité.

export const CATEGORIES = {
  religion:   { label: 'Religion',              color: '#a78bfa', emoji: '⛩️' },
  eau:        { label: 'Eau',                   color: '#38bdf8', emoji: '🌊' },
  relief:     { label: 'Relief & terrain',      color: '#d4a373', emoji: '⛰️' },
  vegetation: { label: 'Végétation & champs',   color: '#4ade80', emoji: '🌳' },
  urbain:     { label: 'Ville & voies',         color: '#2dd4bf', emoji: '🏙️' },
  direction:  { label: 'Direction & position',  color: '#fb923c', emoji: '🧭' },
  qualite:    { label: 'Taille & qualité',      color: '#f472b6', emoji: '✨' },
  admin:      { label: 'Administratif',         color: '#94a3b8', emoji: '🗾' },
}

// role : 'prefix' (plutôt en début), 'suffix' (plutôt en fin), 'both'
// romaji : variantes de lecture rencontrées dans les noms (rendaku inclus).
//          La 1re est la lecture canonique affichée.
export const COMPONENTS = [
  // ── Religion ─────────────────────────────────────────────────────────────
  { k: '寺',   romaji: ['ji', 'dera', 'tera'], kana: 'じ・てら', cat: 'religion', role: 'suffix', strokes: 6,
    fr: 'temple bouddhiste', ex: 'Kinkaku-ji 金閣寺 — le Pavillon d’or (Kyōto)',
    note: 'Marque un temple bouddhiste. Se lit -ji en composition, -dera/-tera isolé.' },
  { k: '神社', romaji: ['jinja'], kana: 'じんじゃ', cat: 'religion', role: 'suffix', strokes: 16,
    fr: 'sanctuaire shintō', ex: 'Fushimi Inari-jinja 伏見稲荷神社',
    note: '神 « divinité » + 社 « lieu de culte ». Désigne un sanctuaire shintō.' },
  { k: '宮',   romaji: ['gu', 'miya', 'guu'], kana: 'ぐう・みや', cat: 'religion', role: 'both', strokes: 10,
    fr: 'sanctuaire, palais', ex: 'Ōmiya 大宮 — « grand sanctuaire »',
    note: 'Grand sanctuaire ou résidence impériale. -gū en suffixe (Meiji-jingū).' },
  { k: '社',   romaji: ['sha', 'yashiro'], kana: 'しゃ・やしろ', cat: 'religion', role: 'suffix', strokes: 7,
    fr: 'sanctuaire, autel', ex: 'Izumo-taisha 出雲大社',
    note: 'Lieu de culte shintō. -taisha = « grand sanctuaire ».' },
  { k: '神',   romaji: ['kami', 'kana', 'kan', 'jin'], kana: 'かみ・じん', cat: 'religion', role: 'both', strokes: 9,
    fr: 'divinité, dieu, esprit', ex: 'Kana-gawa 神奈川, Kan-da 神田',
    note: 'Les kami du shintō. Lectures variées : kami-, kana-, kan-, jin-.' },

  // ── Eau ──────────────────────────────────────────────────────────────────
  { k: '川',   romaji: ['gawa', 'kawa'], kana: 'かわ・がわ', cat: 'eau', role: 'suffix', strokes: 3,
    fr: 'rivière, cours d’eau', ex: 'Edo-gawa 江戸川',
    note: 'Pictogramme d’un cours d’eau. Variante voisée -gawa très fréquente.' },
  { k: '河',   romaji: ['kawa', 'gawa', 'ga'], kana: 'かわ・が', cat: 'eau', role: 'suffix', strokes: 8,
    fr: 'fleuve, grande rivière', ex: 'Yodo-gawa 淀川 (parfois 河)',
    note: 'Synonyme de 川 pour les fleuves plus larges.' },
  { k: '海',   romaji: ['umi', 'kai'], kana: 'うみ・かい', cat: 'eau', role: 'both', strokes: 9,
    fr: 'mer', ex: 'Hokkai-dō 北海道 — « route de la mer du Nord »',
    note: 'La mer. Élément du nom de l’île de Hokkaidō (北海道).' },
  { k: '浜',   romaji: ['hama', 'bama'], kana: 'はま・ばま', cat: 'eau', role: 'suffix', strokes: 10,
    fr: 'plage, grève, rivage', ex: 'Yoko-hama 横浜 — « grève latérale »',
    note: 'Plage ou rivage. Forme traditionnelle : 濱.' },
  { k: '港',   romaji: ['minato', 'ko', 'kou'], kana: 'みなと・こう', cat: 'eau', role: 'both', strokes: 12,
    fr: 'port', ex: 'Minato-ku 港区 (Tōkyō)',
    note: 'Port maritime ou fluvial.' },
  { k: '湾',   romaji: ['wan'], kana: 'わん', cat: 'eau', role: 'suffix', strokes: 12,
    fr: 'baie, golfe', ex: 'Tōkyō-wan 東京湾 — la baie de Tōkyō',
    note: 'Baie ou golfe.' },
  { k: '池',   romaji: ['ike'], kana: 'いけ', cat: 'eau', role: 'suffix', strokes: 6,
    fr: 'étang, bassin', ex: 'Ike-bukuro 池袋 — « étang en poche »',
    note: 'Étang ou bassin.' },
  { k: '沼',   romaji: ['numa'], kana: 'ぬま', cat: 'eau', role: 'suffix', strokes: 8,
    fr: 'marais, étang marécageux', ex: 'Numazu 沼津',
    note: 'Marais ou plan d’eau peu profond.' },
  { k: '滝',   romaji: ['taki'], kana: 'たき', cat: 'eau', role: 'suffix', strokes: 13,
    fr: 'cascade, chute d’eau', ex: 'Shira-taki 白滝 — « cascade blanche »',
    note: 'Cascade. Forme traditionnelle : 瀧.' },
  { k: '泉',   romaji: ['izumi', 'sen'], kana: 'いずみ・せん', cat: 'eau', role: 'suffix', strokes: 9,
    fr: 'source', ex: 'Onsen 温泉 — « source chaude »',
    note: 'Source naturelle ; 温泉 (onsen) = source thermale.' },
  { k: '沢',   romaji: ['zawa', 'sawa'], kana: 'さわ・ざわ', cat: 'eau', role: 'suffix', strokes: 7,
    fr: 'ruisseau de montagne, marécage', ex: 'Kana-zawa 金沢 — « marais doré »',
    note: 'Ruisseau ou vallon humide. Forme traditionnelle : 澤.' },
  { k: '井',   romaji: ['i'], kana: 'い', cat: 'eau', role: 'both', strokes: 4,
    fr: 'puits', ex: 'Fuku-i 福井 — « puits de la chance »',
    note: 'Puits d’eau ; représente la margelle d’un puits.' },
  { k: '水',   romaji: ['mizu', 'sui'], kana: 'みず・すい', cat: 'eau', role: 'both', strokes: 4,
    fr: 'eau', ex: 'Shi-mizu 清水 — « eau pure »',
    note: 'L’eau ; pictogramme d’un courant.' },
  { k: '堀',   romaji: ['bori', 'hori'], kana: 'ほり・ぼり', cat: 'eau', role: 'suffix', strokes: 11,
    fr: 'douve, canal', ex: 'Dōton-bori 道頓堀 (Ōsaka)',
    note: 'Canal ou fossé creusé. Forme : 濠.' },
  { k: '江',   romaji: ['e', 'kou'], kana: 'え・こう', cat: 'eau', role: 'both', strokes: 6,
    fr: 'crique, estuaire', ex: 'Edo 江戸 — « porte de l’estuaire »',
    note: 'Bras d’eau, crique. Élément de 江戸 (ancien nom de Tōkyō).' },

  // ── Relief & terrain ─────────────────────────────────────────────────────
  { k: '山',   romaji: ['yama', 'san', 'zan'], kana: 'やま・さん', cat: 'relief', role: 'both', strokes: 3,
    fr: 'montagne', ex: 'Fuji-san 富士山 — le mont Fuji',
    note: 'Pictogramme de trois pics. -san/-zan pour les monts ; Yama- en préfixe.' },
  { k: '岳',   romaji: ['take', 'dake'], kana: 'たけ・だけ', cat: 'relief', role: 'suffix', strokes: 8,
    fr: 'haut sommet, pic', ex: 'Yari-ga-take 槍ヶ岳',
    note: 'Sommet élevé et escarpé.' },
  { k: '谷',   romaji: ['tani', 'dani', 'ya'], kana: 'たに・や', cat: 'relief', role: 'suffix', strokes: 7,
    fr: 'vallée, vallon', ex: 'Shibu-ya 渋谷 — « vallée âpre »',
    note: 'Vallée. Lecture -ya dans certains noms (Shibuya, Setagaya).' },
  { k: '坂',   romaji: ['saka', 'zaka'], kana: 'さか・ざか', cat: 'relief', role: 'suffix', strokes: 7,
    fr: 'pente, côte', ex: 'Aka-saka 赤坂 — « pente rouge »',
    note: 'Pente ou côte. Variante 阪 (Ōsaka 大阪).' },
  { k: '原',   romaji: ['hara', 'bara', 'wara'], kana: 'はら・ばら', cat: 'relief', role: 'suffix', strokes: 10,
    fr: 'plaine, lande', ex: 'Akiha-bara 秋葉原 — « plaine aux feuilles d’automne »',
    note: 'Plaine ou prairie sauvage.' },
  { k: '野',   romaji: ['no', 'ya'], kana: 'の・や', cat: 'relief', role: 'suffix', strokes: 11,
    fr: 'plaine, champ, lande', ex: 'Naga-no 長野 — « longue plaine »',
    note: 'Plaine cultivable ou friche. Ueno 上野, Nakano 中野.' },
  { k: '岡',   romaji: ['oka', 'gaoka'], kana: 'おか', cat: 'relief', role: 'suffix', strokes: 8,
    fr: 'colline', ex: 'Fuku-oka 福岡 — « colline de la chance »',
    note: 'Colline ; -ga-oka très fréquent (Jiyūgaoka).' },
  { k: '丘',   romaji: ['oka', 'kyu'], kana: 'おか・きゅう', cat: 'relief', role: 'suffix', strokes: 5,
    fr: 'colline, butte', ex: 'Hibari-ga-oka ひばりヶ丘',
    note: 'Colline (synonyme courant de 岡).' },
  { k: '台',   romaji: ['dai', 'tai'], kana: 'だい・たい', cat: 'relief', role: 'suffix', strokes: 5,
    fr: 'plateau, terrasse, hauteur', ex: 'Sen-dai 仙台',
    note: 'Plateau ou terrain surélevé.' },
  { k: '塚',   romaji: ['zuka', 'tsuka'], kana: 'つか・づか', cat: 'relief', role: 'suffix', strokes: 12,
    fr: 'tertre, tumulus', ex: 'Hira-tsuka 平塚 — « tertre plat »',
    note: 'Monticule funéraire ou de terre.' },
  { k: '崎',   romaji: ['saki', 'zaki'], kana: 'さき・ざき', cat: 'relief', role: 'suffix', strokes: 11,
    fr: 'cap, promontoire', ex: 'Naga-saki 長崎 — « long promontoire »',
    note: 'Cap ou pointe de terre. Variante 埼 (Saitama).' },
  { k: '岬',   romaji: ['misaki'], kana: 'みさき', cat: 'relief', role: 'suffix', strokes: 8,
    fr: 'cap', ex: 'Ashizuri-misaki 足摺岬',
    note: 'Cap, extrémité de terre avançant dans la mer.' },
  { k: '島',   romaji: ['jima', 'shima', 'tou'], kana: 'しま・じま', cat: 'relief', role: 'suffix', strokes: 10,
    fr: 'île', ex: 'Hiro-shima 広島 — « large île »',
    note: 'Île. Variante 嶋. -tō pour les îles lointaines (Hachijō-jima).' },
  { k: '根',   romaji: ['ne'], kana: 'ね', cat: 'relief', role: 'suffix', strokes: 10,
    fr: 'racine, base, pied (de montagne)', ex: 'Hako-ne 箱根',
    note: 'Racine ; au figuré, base d’un relief.' },
  { k: '石',   romaji: ['ishi', 'koku', 'seki'], kana: 'いし・せき', cat: 'relief', role: 'both', strokes: 5,
    fr: 'pierre, rocher', ex: 'Ishi-kawa 石川 — « rivière de pierres »',
    note: 'Pierre ou roche.' },
  { k: '平',   romaji: ['daira', 'taira', 'hira'], kana: 'たいら・ひら', cat: 'relief', role: 'both', strokes: 5,
    fr: 'plat, plaine', ex: 'Matsu-daira 松平',
    note: 'Terrain plat ou paisible.' },
  { k: '口',   romaji: ['guchi', 'kuchi'], kana: 'くち・ぐち', cat: 'relief', role: 'suffix', strokes: 3,
    fr: 'entrée, embouchure, bouche', ex: 'Yama-guchi 山口 — « entrée de la montagne »',
    note: 'Ouverture, accès. Aussi « sortie » de gare (西口 = sortie ouest).' },
  { k: '袋',   romaji: ['bukuro', 'fukuro'], kana: 'ふくろ・ぶくろ', cat: 'relief', role: 'suffix', strokes: 11,
    fr: 'sac, poche, cul-de-sac', ex: 'Ike-bukuro 池袋',
    note: 'Forme en « poche » du terrain.' },

  // ── Végétation & champs ──────────────────────────────────────────────────
  { k: '田',   romaji: ['ta', 'da'], kana: 'た・だ', cat: 'vegetation', role: 'both', strokes: 5,
    fr: 'rizière, champ', ex: 'Kan-da 神田 — « rizière des dieux »',
    note: 'Rizière irriguée ; pictogramme d’un champ quadrillé.' },
  { k: '森',   romaji: ['mori'], kana: 'もり', cat: 'vegetation', role: 'suffix', strokes: 12,
    fr: 'forêt', ex: 'Ao-mori 青森 — « forêt verte »',
    note: 'Forêt dense (trois arbres 木).' },
  { k: '林',   romaji: ['bayashi', 'hayashi', 'rin'], kana: 'はやし・ばやし', cat: 'vegetation', role: 'suffix', strokes: 8,
    fr: 'bois, bosquet', ex: 'Koba-yashi 小林',
    note: 'Bois (deux arbres 木), moins dense qu’une forêt.' },
  { k: '木',   romaji: ['ki', 'gi', 'boku'], kana: 'き・ぎ', cat: 'vegetation', role: 'both', strokes: 4,
    fr: 'arbre, bois', ex: 'Roppon-gi 六本木 — « six arbres »',
    note: 'Arbre ; pictogramme d’un tronc et de branches.' },
  { k: '松',   romaji: ['matsu', 'matsu'], kana: 'まつ', cat: 'vegetation', role: 'both', strokes: 8,
    fr: 'pin', ex: 'Taka-matsu 高松 — « grand pin »',
    note: 'Pin, symbole de longévité.' },
  { k: '草',   romaji: ['kusa', 'gusa', 'so'], kana: 'くさ・そう', cat: 'vegetation', role: 'both', strokes: 9,
    fr: 'herbe', ex: 'Asa-kusa 浅草 — « herbe rase »',
    note: 'Herbe, végétation basse.' },
  { k: '葉',   romaji: ['ba', 'ha', 'you'], kana: 'は・ば', cat: 'vegetation', role: 'suffix', strokes: 12,
    fr: 'feuille, feuillage', ex: 'Chi-ba 千葉 — « mille feuilles »',
    note: 'Feuille d’arbre.' },

  // ── Ville & voies ────────────────────────────────────────────────────────
  { k: '町',   romaji: ['cho', 'machi', 'chou'], kana: 'ちょう・まち', cat: 'urbain', role: 'suffix', strokes: 7,
    fr: 'quartier, bourg, ville', ex: 'Muromachi 室町',
    note: 'Quartier urbain ou petite ville. -chō ou -machi selon les régions.' },
  { k: '駅',   romaji: ['eki'], kana: 'えき', cat: 'urbain', role: 'suffix', strokes: 14,
    fr: 'gare', ex: 'Tōkyō-eki 東京駅 — la gare de Tōkyō',
    note: 'Gare ferroviaire (à l’origine, relais de poste).' },
  { k: '橋',   romaji: ['bashi', 'hashi'], kana: 'はし・ばし', cat: 'urbain', role: 'suffix', strokes: 16,
    fr: 'pont', ex: 'Nihon-bashi 日本橋 — « le pont du Japon »',
    note: 'Pont. Point zéro des routes de l’époque d’Edo.' },
  { k: '通',   romaji: ['dori', 'tori', 'tsu'], kana: 'とおり・どおり', cat: 'urbain', role: 'suffix', strokes: 10,
    fr: 'avenue, rue passante', ex: 'Ō-dōri 大通 — « la grande avenue » (Sapporo)',
    note: 'Rue ou avenue où l’on circule.' },
  { k: '筋',   romaji: ['suji'], kana: 'すじ', cat: 'urbain', role: 'suffix', strokes: 12,
    fr: 'rue (axe nord-sud, Ōsaka)', ex: 'Midō-suji 御堂筋 (Ōsaka)',
    note: 'Désigne les grandes rues d’Ōsaka (筋 = « ligne, axe »).' },
  { k: '道',   romaji: ['do', 'michi', 'dou'], kana: 'みち・どう', cat: 'urbain', role: 'both', strokes: 12,
    fr: 'route, voie, chemin', ex: 'Hokkai-dō 北海道',
    note: 'Voie ou route ; aussi « voie » au sens spirituel (柔道 jūdō).' },
  { k: '園',   romaji: ['en', 'sono', 'zono'], kana: 'えん・その', cat: 'urbain', role: 'suffix', strokes: 13,
    fr: 'jardin, parc', ex: 'Kōraku-en 後楽園',
    note: 'Jardin aménagé ou parc.' },
  { k: '公園', romaji: ['koen', 'kouen'], kana: 'こうえん', cat: 'urbain', role: 'suffix', strokes: 17,
    fr: 'parc public', ex: 'Ueno-kōen 上野公園',
    note: '公 « public » + 園 « jardin ». Parc municipal ouvert à tous.' },
  { k: '城',   romaji: ['jo', 'shiro', 'gi', 'jou'], kana: 'じょう・しろ', cat: 'urbain', role: 'suffix', strokes: 9,
    fr: 'château, forteresse', ex: 'Ōsaka-jō 大阪城 — le château d’Ōsaka',
    note: 'Château fort. Lecture -gi dans Ibaraki 茨城.' },
  { k: '屋',   romaji: ['ya', 'oku'], kana: 'や・おく', cat: 'urbain', role: 'suffix', strokes: 9,
    fr: 'maison, boutique, toit', ex: 'Nago-ya 名古屋',
    note: 'Bâtiment ou commerce ; au figuré, lieu d’habitation.' },
  { k: '宿',   romaji: ['juku', 'shuku', 'yado'], kana: 'じゅく・しゅく', cat: 'urbain', role: 'suffix', strokes: 11,
    fr: 'relais de poste, étape', ex: 'Shin-juku 新宿 — « nouveau relais »',
    note: 'Bourg-étape sur les anciennes routes (Harajuku, Shinjuku).' },
  { k: '銀座', romaji: ['ginza'], kana: 'ぎんざ', cat: 'urbain', role: 'suffix', strokes: 24,
    fr: 'quartier (« atelier d’argent »)', ex: 'Ginza 銀座 (Tōkyō)',
    note: '銀 « argent » + 座 « guilde/atelier ». Ancien hôtel des monnaies.' },
  { k: '戸',   romaji: ['to', 'do', 'be', 'ko'], kana: 'と・ど・こ', cat: 'urbain', role: 'both', strokes: 4,
    fr: 'porte, accès', ex: 'Kō-be 神戸 — « porte des dieux »',
    note: 'Porte ou entrée ; aussi « foyer/ménage » dans les registres.' },

  // ── Direction & position ─────────────────────────────────────────────────
  { k: '東',   romaji: ['higashi', 'to', 'azuma', 'tou'], kana: 'ひがし・とう', cat: 'direction', role: 'prefix', strokes: 8,
    fr: 'est', ex: 'Tōkyō 東京 — « la capitale de l’Est »',
    note: 'Le point cardinal est ; le soleil 日 derrière un arbre 木.' },
  { k: '西',   romaji: ['nishi', 'sai', 'sei'], kana: 'にし・さい', cat: 'direction', role: 'prefix', strokes: 6,
    fr: 'ouest', ex: 'Nishi-Shinjuku 西新宿',
    note: 'Le point cardinal ouest.' },
  { k: '南',   romaji: ['minami', 'nan'], kana: 'みなみ・なん', cat: 'direction', role: 'prefix', strokes: 9,
    fr: 'sud', ex: 'Minami-Alps 南アルプス',
    note: 'Le point cardinal sud.' },
  { k: '北',   romaji: ['kita', 'hoku', 'hok'], kana: 'きた・ほく', cat: 'direction', role: 'prefix', strokes: 5,
    fr: 'nord', ex: 'Hokkai-dō 北海道 — « route de la mer du Nord »',
    note: 'Le point cardinal nord.' },
  { k: '中',   romaji: ['naka', 'chu', 'chuu'], kana: 'なか・ちゅう', cat: 'direction', role: 'both', strokes: 4,
    fr: 'centre, milieu, intérieur', ex: 'Naka-no 中野 — « plaine du milieu »',
    note: 'Le centre ; un trait traversant une cible.' },
  { k: '上',   romaji: ['kami', 'ue', 'jo', 'kazu'], kana: 'かみ・うえ', cat: 'direction', role: 'both', strokes: 3,
    fr: 'haut, amont, dessus', ex: 'Ue-no 上野 — « plaine d’en haut »',
    note: 'Vers le haut ou l’amont ; aussi « supérieur ».' },
  { k: '下',   romaji: ['shimo', 'shita', 'ge'], kana: 'しも・した', cat: 'direction', role: 'both', strokes: 3,
    fr: 'bas, aval, dessous', ex: 'Shimo-kitazawa 下北沢',
    note: 'Vers le bas ou l’aval.' },
  { k: '前',   romaji: ['mae', 'zen'], kana: 'まえ・ぜん', cat: 'direction', role: 'suffix', strokes: 9,
    fr: 'devant, avant', ex: 'Eki-mae 駅前 — « devant la gare »',
    note: 'Position « devant » un repère.' },
  { k: '内',   romaji: ['uchi', 'nai', 'uti'], kana: 'うち・ない', cat: 'direction', role: 'both', strokes: 4,
    fr: 'intérieur, dedans', ex: 'Marunouchi 丸の内 — « dans le cercle (des douves) »',
    note: 'L’intérieur d’une enceinte.' },

  // ── Taille & qualité ─────────────────────────────────────────────────────
  { k: '大',   romaji: ['o', 'oo', 'dai', 'oh', 'ou'], kana: 'おお・だい', cat: 'qualite', role: 'prefix', strokes: 3,
    fr: 'grand', ex: 'Ō-saka 大阪 — « grande pente »',
    note: 'Grand, important ; un personnage bras écartés.' },
  { k: '小',   romaji: ['ko', 'o', 'sho', 'kvo'], kana: 'こ・しょう', cat: 'qualite', role: 'prefix', strokes: 3,
    fr: 'petit', ex: 'Oda-wara 小田原 — « petite rizière en plaine »',
    note: 'Petit, mineur.' },
  { k: '高',   romaji: ['taka', 'daka', 'ko', 'kou'], kana: 'たか・こう', cat: 'qualite', role: 'both', strokes: 10,
    fr: 'haut, élevé', ex: 'Taka-matsu 高松 — « grand pin »',
    note: 'Élevé ; pictogramme d’une tour.' },
  { k: '長',   romaji: ['naga', 'cho', 'chou'], kana: 'なが・ちょう', cat: 'qualite', role: 'both', strokes: 8,
    fr: 'long, aîné, chef', ex: 'Naga-no 長野 — « longue plaine »',
    note: 'Long ; aussi « chef, aîné ».' },
  { k: '広',   romaji: ['hiro', 'ko', 'kou'], kana: 'ひろ・こう', cat: 'qualite', role: 'prefix', strokes: 5,
    fr: 'large, vaste', ex: 'Hiro-shima 広島 — « large île »',
    note: 'Large, étendu. Forme traditionnelle : 廣.' },
  { k: '新',   romaji: ['shin', 'nii', 'ara', 'nis'], kana: 'しん・にい', cat: 'qualite', role: 'prefix', strokes: 13,
    fr: 'nouveau, neuf', ex: 'Shin-Yokohama 新横浜',
    note: 'Nouveau ; préfixe des gares « shinkansen » et quartiers récents.' },
  { k: '古',   romaji: ['furu', 'ko', 'go'], kana: 'ふる・こ', cat: 'qualite', role: 'both', strokes: 5,
    fr: 'vieux, ancien', ex: 'Furu-kawa 古川 — « vieille rivière »',
    note: 'Ancien, vétuste.' },
  { k: '本',   romaji: ['hon', 'moto'], kana: 'ほん・もと', cat: 'qualite', role: 'both', strokes: 5,
    fr: 'principal, origine, vrai', ex: 'Hon-gō 本郷 — « bourg d’origine »',
    note: 'Souche, racine, principal ; un trait à la base d’un arbre 木.' },
  { k: '白',   romaji: ['shira', 'shiro', 'haku'], kana: 'しろ・はく', cat: 'qualite', role: 'both', strokes: 5,
    fr: 'blanc', ex: 'Shira-kawa 白川 — « rivière blanche »',
    note: 'Blanc, clair, pur.' },
  { k: '青',   romaji: ['ao', 'sei', 'sho'], kana: 'あお・せい', cat: 'qualite', role: 'both', strokes: 8,
    fr: 'bleu-vert', ex: 'Ao-mori 青森 — « forêt verte »',
    note: 'Bleu ou vert (les deux nuances).' },
  { k: '赤',   romaji: ['aka', 'seki', 'shaku'], kana: 'あか・せき', cat: 'qualite', role: 'both', strokes: 7,
    fr: 'rouge', ex: 'Aka-saka 赤坂 — « pente rouge »',
    note: 'Rouge.' },
  { k: '金',   romaji: ['kana', 'kin', 'kane'], kana: 'かな・きん', cat: 'qualite', role: 'both', strokes: 8,
    fr: 'or, métal', ex: 'Kana-zawa 金沢 — « marais doré »',
    note: 'Or, métal, argent (monnaie).' },
  { k: '福',   romaji: ['fuku'], kana: 'ふく', cat: 'qualite', role: 'prefix', strokes: 13,
    fr: 'bonheur, chance', ex: 'Fuku-oka 福岡 — « colline de la chance »',
    note: 'Prospérité, fortune (nom auspicieux).' },
  { k: '千',   romaji: ['chi', 'sen'], kana: 'ち・せん', cat: 'qualite', role: 'prefix', strokes: 3,
    fr: 'mille (abondance)', ex: 'Chi-ba 千葉 — « mille feuilles »',
    note: 'Mille ; évoque l’abondance.' },

  // ── Administratif ────────────────────────────────────────────────────────
  { k: '京',   romaji: ['kyo', 'kei', 'kyou'], kana: 'きょう・けい', cat: 'admin', role: 'both', strokes: 8,
    fr: 'capitale', ex: 'Kyō-to 京都, Tō-kyō 東京',
    note: 'Capitale impériale.' },
  { k: '都',   romaji: ['to', 'tsu', 'miyako'], kana: 'と・みやこ', cat: 'admin', role: 'suffix', strokes: 11,
    fr: 'métropole, capitale', ex: 'Kyō-to 京都, Tōkyō-to 東京都',
    note: 'Métropole ; statut administratif de Tōkyō.' },
  { k: '市',   romaji: ['shi'], kana: 'し', cat: 'admin', role: 'suffix', strokes: 5,
    fr: 'ville (municipalité)', ex: 'Yokohama-shi 横浜市',
    note: 'Ville au sens administratif ; à l’origine « marché ».' },
  { k: '区',   romaji: ['ku'], kana: 'く', cat: 'admin', role: 'suffix', strokes: 4,
    fr: 'arrondissement', ex: 'Shibuya-ku 渋谷区',
    note: 'Arrondissement d’une grande ville.' },
  { k: '町',   romaji: ['machi', 'cho'], kana: 'まち・ちょう', cat: 'admin', role: 'suffix', strokes: 7,
    fr: 'bourg, commune', ex: 'Voir aussi la catégorie Ville',
    note: 'Unité administrative « bourg » (lecture -machi).' , dup: true },
  { k: '村',   romaji: ['mura', 'son', 'zon'], kana: 'むら・そん', cat: 'admin', role: 'suffix', strokes: 7,
    fr: 'village', ex: 'Shirakawa-mura 白川村',
    note: 'Village (plus petit qu’une commune 町).' },
  { k: '県',   romaji: ['ken'], kana: 'けん', cat: 'admin', role: 'suffix', strokes: 9,
    fr: 'préfecture', ex: 'Kanagawa-ken 神奈川県',
    note: 'Préfecture (43 sur 47 divisions du Japon).' },
  { k: '府',   romaji: ['fu'], kana: 'ふ', cat: 'admin', role: 'suffix', strokes: 8,
    fr: 'préfecture urbaine', ex: 'Ōsaka-fu 大阪府, Kyōto-fu 京都府',
    note: 'Statut particulier d’Ōsaka et Kyōto.' },
  { k: '郡',   romaji: ['gun', 'kohori'], kana: 'ぐん', cat: 'admin', role: 'suffix', strokes: 10,
    fr: 'district (rural)', ex: 'Aso-gun 阿蘇郡',
    note: 'District regroupant des bourgs et villages.' },
]

// On retire les doublons d'affichage (le 町 administratif réutilise la fiche urbaine).
export const LEARN_COMPONENTS = COMPONENTS.filter((c) => !c.dup)

// Variantes graphiques / formes traditionnelles renvoyant vers le même idéogramme.
const KANJI_ALIASES = {
  阪: '坂', 嶋: '島', 嶌: '島', 濱: '浜', 澤: '沢', 廣: '広',
  瀧: '滝', 埼: '崎', 龍: '滝', 圓: '園', 國: '国',
}

// Gazetteer : lieux célèbres dont la romanisation est ambiguë. On les résout vers
// leurs kanji (découpage fiable) pour afficher une étymologie exacte même saisis en
// romaji. Clés normalisées (sans macron, minuscules).
//
// Forme : { k: '<kanji>', r: ['<lecture1>', '<lecture2>', ...] }
//   k : graphie en kanji.
//   r : lectures contextuelles, alignées token-par-token avec le découpage de
//       decomposeKanji (les composants à 2 kanji reconnus comptent pour 1 token).
//       Omettre `r` revient à utiliser la lecture canonique de chaque composant.
// Rétro-compat : si la valeur est une chaîne, on la traite comme { k: value }.
export const GAZETTEER = {
  tokyo:        { k: '東京',   r: ['tō', 'kyō'] },
  kyoto:        { k: '京都',   r: ['kyō', 'to'] },
  osaka:        { k: '大阪',   r: ['ō', 'saka'] },
  kobe:         { k: '神戸',   r: ['kō', 'be'] },
  nagoya:       { k: '名古屋', r: ['na', 'go', 'ya'] },
  yokohama:     { k: '横浜',   r: ['yoko', 'hama'] },
  kawasaki:     { k: '川崎',   r: ['kawa', 'saki'] },
  saitama:      { k: '埼玉',   r: ['sai', 'tama'] },
  chiba:        { k: '千葉',   r: ['chi', 'ba'] },
  shibuya:      { k: '渋谷',   r: ['shibu', 'ya'] },
  shinjuku:     { k: '新宿',   r: ['shin', 'juku'] },
  ueno:         { k: '上野',   r: ['ue', 'no'] },
  asakusa:      { k: '浅草',   r: ['asa', 'kusa'] },
  akihabara:    { k: '秋葉原', r: ['aki', 'ha', 'bara'] },
  ikebukuro:    { k: '池袋',   r: ['ike', 'bukuro'] },
  harajuku:     { k: '原宿',   r: ['hara', 'juku'] },
  roppongi:     { k: '六本木', r: ['rop', 'pon', 'gi'] },
  ginza:        { k: '銀座',   r: ['ginza'] },
  shinagawa:    { k: '品川',   r: ['shina', 'gawa'] },
  meguro:       { k: '目黒',   r: ['me', 'guro'] },
  setagaya:     { k: '世田谷', r: ['se', 'ta', 'gaya'] },
  nihonbashi:   { k: '日本橋', r: ['ni', 'hon', 'bashi'] },
  odaiba:       { k: '台場',   r: ['o', 'daiba'] },
  marunouchi:   { k: '丸の内', r: ['maru', 'uchi'] },
  shimokitazawa:{ k: '下北沢', r: ['shimo', 'kita', 'zawa'] },
  kichijoji:    { k: '吉祥寺', r: ['kichi', 'jō', 'ji'] },
  nagano:       { k: '長野',   r: ['naga', 'no'] },
  nagasaki:     { k: '長崎',   r: ['naga', 'saki'] },
  niigata:      { k: '新潟',   r: ['nii', 'gata'] },
  sapporo:      { k: '札幌',   r: ['sap', 'poro'] },
  sendai:       { k: '仙台',   r: ['sen', 'dai'] },
  fukuoka:      { k: '福岡',   r: ['fuku', 'oka'] },
  hiroshima:    { k: '広島',   r: ['hiro', 'shima'] },
  kanazawa:     { k: '金沢',   r: ['kana', 'zawa'] },
  hakone:       { k: '箱根',   r: ['hako', 'ne'] },
  nikko:        { k: '日光',   r: ['nik', 'kō'] },
  nara:         { k: '奈良',   r: ['na', 'ra'] },
  kamakura:     { k: '鎌倉',   r: ['kama', 'kura'] },
  yokosuka:     { k: '横須賀', r: ['yoko', 'su', 'ka'] },
  takamatsu:    { k: '高松',   r: ['taka', 'matsu'] },
  matsuyama:    { k: '松山',   r: ['matsu', 'yama'] },
  kumamoto:     { k: '熊本',   r: ['kuma', 'moto'] },
  kagoshima:    { k: '鹿児島', r: ['ka', 'go', 'shima'] },
  shizuoka:     { k: '静岡',   r: ['shizu', 'oka'] },
  hamamatsu:    { k: '浜松',   r: ['hama', 'matsu'] },
  kitakyushu:   { k: '北九州', r: ['kita', 'kyū', 'shū'] },
  okinawa:      { k: '沖縄',   r: ['oki', 'nawa'] },
  naha:         { k: '那覇',   r: ['na', 'ha'] },
  aomori:       { k: '青森',   r: ['ao', 'mori'] },
  akita:        { k: '秋田',   r: ['aki', 'ta'] },
  morioka:      { k: '盛岡',   r: ['mori', 'oka'] },
  dotonbori:    { k: '道頓堀', r: ['dō', 'ton', 'bori'] },
  kinkakuji:    { k: '金閣寺', r: ['kin', 'kaku', 'ji'] },
  ginkakuji:    { k: '銀閣寺', r: ['gin', 'kaku', 'ji'] },
  fujisan:      { k: '富士山', r: ['fu', 'ji', 'san'] },
  mtfuji:       { k: '富士山', r: ['fu', 'ji', 'san'] },
  fuji:         { k: '富士山', r: ['fu', 'ji', 'san'] },
  edo:          { k: '江戸',   r: ['e', 'do'] },
  hokkaido:     { k: '北海道', r: ['hok', 'kai', 'dō'] },
  honshu:       { k: '本州',   r: ['hon', 'shū'] },
  kyushu:       { k: '九州',   r: ['kyū', 'shū'] },
  shikoku:      { k: '四国',   r: ['shi', 'koku'] },
}

// Normalise une entrée du gazetteer (rétro-compat avec l'ancien format string).
export function gazetteerEntry(value) {
  if (!value) return null
  if (typeof value === 'string') return { k: value, r: undefined }
  return value
}

// ── Index de recherche ─────────────────────────────────────────────────────

// kanji (1 ou 2 caractères) -> composant (variantes incluses)
export const KANJI_MAP = (() => {
  const m = new Map()
  for (const c of COMPONENTS) {
    if (!m.has(c.k)) m.set(c.k, c)
  }
  for (const [variant, canonical] of Object.entries(KANJI_ALIASES)) {
    if (m.has(canonical)) m.set(variant, m.get(canonical))
  }
  return m
})()

// Normalise un romaji : minuscules, suppression des macrons et de la ponctuation.
export function normalizeRomaji(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ō -> o, ū -> u, etc.
    .replace(/[\s\-_.·・'’]/g, '')
}

// Construit les listes de morphèmes romaji pour préfixes et suffixes,
// triées par longueur décroissante (pour un appariement « plus long d'abord »).
function buildRomajiList(predicate) {
  const out = []
  for (const c of COMPONENTS) {
    if (c.dup) continue
    if (!predicate(c.role)) continue
    for (const r of c.romaji) {
      const rom = normalizeRomaji(r)
      if (rom) out.push({ rom, comp: c })
    }
  }
  out.sort((a, b) => b.rom.length - a.rom.length)
  return out
}

export const ROMAJI_PREFIXES = buildRomajiList((role) => role === 'prefix' || role === 'both')
export const ROMAJI_SUFFIXES = buildRomajiList((role) => role === 'suffix' || role === 'both')
