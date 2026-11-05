/**
 * Forgiving search helpers: people type dish names the way they hear them ("pandesal", "karekare",
 * "spagetti"), not the way a recipe book spells them ("Pan de Sal", "Kare-Kare", "Spaghetti").
 * Everything here is plain functions so it can be tested without a browser.
 */

/** Lowercase, no accents, letters and digits separated by single spaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Normalised with no spaces at all: "Pan de Sal", "pandesal" and "pan-de-sal" all become "pandesal". */
export const compact = (s: string) => normalize(s).replace(/ /g, '')

/** Edit distance counting a swap of two neighbours as one mistake ("teh" -> "the"). Stops early past `max`. */
export function distance(a: string, b: string, max = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2: number[] = []
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prev2[j - 2] ?? Infinity) + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev2.length = 0
    prev2.push(...prev)
    prev = cur
  }
  return prev[b.length]
}

/** How many typos to forgive in a word of this length. Short words must be exact. */
export const allowedTypos = (len: number) => (len <= 4 ? 0 : len <= 7 ? 1 : 2)

/** Does the typed word plausibly mean this dictionary word? (exact, prefix of a longer word, or a small typo) */
export function wordMatches(typed: string, word: string): boolean {
  if (typed === word) return true
  if (typed.length >= 3 && word.startsWith(typed)) return true
  if (typed.length >= 5 && distance(typed, word, allowedTypos(typed.length)) <= allowedTypos(typed.length)) return true
  return false
}

/**
 * Split one run-together word into known words: "pandesal" -> "pan de sal".
 * Prefers fewer, longer words. Returns null when it cannot be split or is already a known word.
 */
export function segment(run: string, vocab: ReadonlySet<string>): string | null {
  if (run.length < 5 || run.length > 30 || vocab.has(run)) return null
  const best: (string[] | null)[] = new Array(run.length + 1).fill(null)
  best[0] = []
  for (let end = 1; end <= run.length; end++) {
    for (let start = Math.max(0, end - 12); start < end; start++) {
      const head = best[start]
      if (!head) continue
      const w = run.slice(start, end)
      if (w.length < 2 || !vocab.has(w)) continue
      const cand = [...head, w]
      const cur = best[end]
      // fewer words wins; ties go to the split with the longer shortest word
      if (!cur || cand.length < cur.length) best[end] = cand
    }
  }
  const out = best[run.length]
  return out && out.length > 1 && out.length <= 4 ? out.join(' ') : null
}

/** Filipino and other dishes people often spell their own way. canonical = the usual written name. */
type Alias = { canonical: string; spellings: string[]; similar?: string[] }

export const ALIASES: Alias[] = [
  { canonical: 'pan de sal', spellings: ['pandesal', 'pan desal', 'pandesal bread', 'pan de sal'], similar: ['bread', 'bread roll', 'bun'] },
  { canonical: 'ensaymada', spellings: ['ensaimada', 'ensaymada', 'ensaymadang'], similar: ['sweet bread', 'brioche', 'bread'] },
  { canonical: 'kare-kare', spellings: ['karekare', 'kare kare', 'kare-kare'], similar: ['oxtail', 'peanut'] },
  { canonical: 'pancit', spellings: ['pansit', 'pancit canton', 'pancit bihon', 'pansit canton', 'pancit guisado'], similar: ['noodle', 'noodles'] },
  { canonical: 'lechon', spellings: ['litson', 'letson', 'lechon kawali', 'lechon baboy', 'litsong'], similar: ['roast pork', 'pork'] },
  { canonical: 'sinigang', spellings: ['sinigan', 'sinigang na baboy', 'sinigang na hipon'], similar: ['sour soup', 'tamarind', 'soup'] },
  { canonical: 'adobo', spellings: ['adobong', 'adobong manok', 'chicken adobo', 'pork adobo', 'adobo manok'], similar: ['chicken', 'pork'] },
  { canonical: 'halo-halo', spellings: ['halohalo', 'halo halo', 'halo-halo'], similar: ['dessert', 'ice cream'] },
  { canonical: 'leche flan', spellings: ['lecheflan', 'leche-flan', 'leche flan', 'letchi flan', 'flan'], similar: ['custard', 'caramel', 'flan'] },
  { canonical: 'bicol express', spellings: ['bicolexpress', 'bikol express', 'bicol-express', 'bikolexpress'], similar: ['coconut', 'chili pork'] },
  { canonical: 'tinola', spellings: ['tinolang manok', 'tinolang', 'tinola manok'], similar: ['chicken soup', 'ginger chicken'] },
  { canonical: 'longganisa', spellings: ['longanisa', 'longaniza', 'lucanica', 'longganiza'], similar: ['sausage'] },
  { canonical: 'tocino', spellings: ['tosino', 'tocinong baboy'], similar: ['cured pork', 'bacon'] },
  { canonical: 'sisig', spellings: ['sizzling sisig', 'sisig baboy'], similar: ['pork', 'grilled pork'] },
  { canonical: 'arroz caldo', spellings: ['arrozcaldo', 'arroz-caldo', 'lugaw', 'goto', 'congee'], similar: ['rice porridge', 'porridge', 'congee'] },
  { canonical: 'champorado', spellings: ['tsampurado', 'champurado', 'chocolate porridge'], similar: ['chocolate', 'porridge'] },
  { canonical: 'bibingka', spellings: ['bibinka', 'bibingkang'], similar: ['rice cake', 'coconut'] },
  { canonical: 'puto', spellings: ['putong', 'kutsinta', 'cuchinta', 'puto cheese'], similar: ['rice cake', 'steamed'] },
  { canonical: 'ube halaya', spellings: ['ubehalaya', 'ube jam', 'halayang ube', 'ube'], similar: ['purple yam', 'jam', 'dessert'] },
  { canonical: 'turon', spellings: ['banana lumpia', 'turon saging', 'turrón'], similar: ['banana', 'spring roll'] },
  { canonical: 'lumpia', spellings: ['lumpiang shanghai', 'shanghai lumpia', 'lumpia shanghai', 'spring rolls'], similar: ['spring roll', 'egg roll'] },
  { canonical: 'siomai', spellings: ['shumai', 'siu mai', 'shaomai', 'shomai'], similar: ['dumpling', 'dumplings'] },
  { canonical: 'siopao', spellings: ['bao', 'baozi', 'steamed bun'], similar: ['bun', 'dumpling'] },
  { canonical: 'dinuguan', spellings: ['dinuguang', 'dinardaraan'], similar: ['pork stew', 'stew'] },
  { canonical: 'laing', spellings: ['gabi', 'taro leaves'], similar: ['coconut', 'taro'] },
  { canonical: 'pinakbet', spellings: ['pakbet', 'pinakbet tagalog'], similar: ['vegetable', 'eggplant'] },
  { canonical: 'bulalo', spellings: ['beef shank soup', 'bulalong'], similar: ['beef soup', 'beef'] },
  { canonical: 'nilaga', spellings: ['nilagang baka', 'nilagang baboy', 'nilagang'], similar: ['beef soup', 'boiled'] },
  { canonical: 'kaldereta', spellings: ['caldereta', 'kalderetang baka', 'kalderetang kambing'], similar: ['stew', 'beef stew'] },
  { canonical: 'mechado', spellings: ['mechadong baka'], similar: ['beef stew', 'stew'] },
  { canonical: 'afritada', spellings: ['apritada', 'afritadang manok'], similar: ['chicken stew', 'tomato'] },
  { canonical: 'menudo', spellings: ['menudong baboy'], similar: ['pork stew', 'stew'] },
  { canonical: 'paksiw', spellings: ['paksiw na isda', 'paksiw na lechon'], similar: ['vinegar', 'fish'] },
  { canonical: 'escabeche', spellings: ['escabecheng isda', 'eskabetse'], similar: ['sweet and sour', 'fish'] },
  { canonical: 'empanada', spellings: ['empanadas', 'impanada'], similar: ['pastry', 'turnover'] },
  { canonical: 'tapsilog', spellings: ['tapa', 'tapsi', 'silog'], similar: ['beef', 'fried rice', 'egg'] },
  { canonical: 'taho', spellings: ['tahoo'], similar: ['tofu', 'dessert'] },
  { canonical: 'spaghetti', spellings: ['spagetti', 'spagheti', 'spaghetty', 'spagetty'], similar: ['pasta'] },
  { canonical: 'fried rice', spellings: ['friedrice', 'sinangag', 'garlic rice'], similar: ['rice'] },
  { canonical: 'carbonara', spellings: ['carbonarra', 'carbonera'], similar: ['pasta', 'bacon'] },
  { canonical: 'lasagna', spellings: ['lasagne', 'lasanya', 'lazagna'], similar: ['pasta', 'baked pasta'] },
]

const aliasKey = (s: string) => compact(s)

/** The alias entry a typed query points at (by exact spelling, or one small typo for longer names). */
export function findAlias(query: string): Alias | null {
  const q = aliasKey(query)
  if (!q) return null
  let best: { a: Alias; d: number } | null = null
  for (const a of ALIASES) {
    for (const s of [a.canonical, ...a.spellings]) {
      const k = aliasKey(s)
      const d = k === q ? 0 : q.length >= 6 ? distance(q, k, 1) : 9
      if (d <= 1 && (!best || d < best.d)) best = { a, d }
    }
  }
  return best?.a ?? null
}

export type Interpretation = {
  /** Strings worth searching for, best first (the typed text is always among them). */
  variants: string[]
  /** What we think the person meant, when it differs from what they typed. */
  meant: string | null
  /** Related search words, for "similar dishes" when the exact dish is missing. */
  similar: string[]
}

/**
 * Work out what the person probably meant. `vocab` is every word that appears in dish names we know;
 * `names` is the list of whole dish names, used to catch plain typos ("chiken adobo").
 */
export function interpret(raw: string, vocab: ReadonlySet<string>, names: readonly string[]): Interpretation {
  const typed = normalize(raw)
  const variants: string[] = []
  const add = (v: string | null | undefined) => {
    const n = v ? normalize(v) : ''
    if (n && !variants.includes(n)) variants.push(n)
  }
  add(typed)

  // What we will report as "you probably meant": the typo-corrected phrase first, then a known dish spelling.
  let fromTypo: string | null = null
  let fromAlias: string | null = null
  let fromSplit: string | null = null
  let fromName: string | null = null

  const alias = findAlias(typed)
  let similar: string[] = []
  if (alias) {
    add(alias.canonical)
    alias.spellings.forEach(add)
    similar = alias.similar ?? []
    if (normalize(alias.canonical) !== typed) fromAlias = alias.canonical
  }

  // "pandesal" -> "pan de sal" using words we know
  const run = compact(typed)
  if (typed.indexOf(' ') < 0) {
    const split = segment(run, vocab)
    if (split) {
      add(split)
      fromSplit = split
    }
  } else {
    // "kare kare" -> "karekare" lets a joined spelling match too
    add(run)
  }

  // Plain typos: fix each word against the known words ("chiken" -> "chicken", "spagetti" -> "spaghetti")
  const fixed = typed
    .split(' ')
    .map((w) => {
      if (w.length < 5 || vocab.has(w)) return w
      let bestWord = w
      let bestD = allowedTypos(w.length) + 1
      for (const v of vocab) {
        if (Math.abs(v.length - w.length) > 2) continue
        const d = distance(w, v, allowedTypos(w.length))
        if (d < bestD) {
          bestD = d
          bestWord = v
        }
      }
      return bestWord
    })
    .join(' ')
  if (fixed !== typed) {
    add(fixed)
    fromTypo = fixed
  }

  // Whole-name closeness catches things like "bicol exprss" that are one word off in a long name
  if (!fromTypo && !fromAlias && !fromSplit && run.length >= 7) {
    let bestName: string | null = null
    let bestD = 3
    for (const n of names) {
      const k = compact(n)
      if (Math.abs(k.length - run.length) > 3) continue
      const d = distance(run, k, 2)
      if (d > 0 && d < bestD) {
        bestD = d
        bestName = n
      }
    }
    if (bestName) {
      add(bestName)
      fromName = bestName
    }
  }

  const meant = fromTypo ?? fromAlias ?? fromSplit ?? fromName
  return { variants, meant: meant && normalize(meant) !== typed ? meant : null, similar }
}
