/**
 * Wysyla GOTOWY katalog `apps/web/dist` na Vercela.
 *
 * DLACZEGO NIE PO PROSTU `vercel deploy`
 *
 * Zwykle wdrozenie kaze Vercelowi zbudowac projekt u siebie - a tam nie ma ani
 * obrazow Dockera z kompilatorem AVR, ani 62 MB artefaktow (sa w `.gitignore`,
 * bo to wynik budowy, nie zrodlo). Wdrozenie z chmury dawaloby aplikacje bez
 * kompilatora w przegladarce, czyli bez glownej funkcji.
 *
 * Proba wylaczenia tego przez `installCommand` w `vercel.json` nie pomaga:
 * ustawienia projektu po stronie Vercela maja pierwszenstwo i krok instalacji
 * i tak rusza, konczac sie bledem.
 *
 * Dlatego uzywamy „Build Output API”: skladamy katalog `.vercel/output`
 * z gotowa zawartoscia i naglowkami, a `--prebuilt` mowi Vercelowi, ze niczego
 * nie ma budowac - ma tylko rozlozyc to, co dostal.
 *
 * Naglowki maja JEDNO zrodlo prawdy: `apps/web/public/vercel.json`. Stad
 * przepisujemy je do postaci, ktorej oczekuje Build Output API, zeby nie
 * powstala druga lista, ktora zaraz sie rozjedzie.
 *
 * KOLEJNOSC MA ZNACZENIE: `vercel link` odtwarza katalog `.vercel` od zera,
 * wiec musi pojsc PRZED zlozeniem `.vercel/output` - inaczej kasuje przygotowane
 * pliki i wdrozenie konczy sie „no prebuilt output found”.
 *
 * Uzycie:
 *   npm run build
 *   node tools/deploy-vercel.mjs
 */
import { cp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'apps', 'web', 'dist')
/*
  Katalog roboczy to `apps/web`, a nie osobny folder.

  Vercel CLI sam wybiera korzen projektu, idac w gore w poszukiwaniu `package.json` -
  i przy katalogu wewnatrz repozytorium wybiera wlasnie `apps/web`. Tam tez zaklada
  powiazanie i tam szuka `.vercel/output`. Skladanie wyjscia gdzie indziej konczy sie
  komunikatem „no prebuilt output found”, mimo ze pliki lezaly gotowe.
*/
const stage = join(root, 'apps', 'web')
const output = join(stage, '.vercel', 'output')
const project = process.env.VERCEL_PROJECT ?? 'zl3avr-emulator'

try {
  await stat(join(dist, 'index.html'))
} catch {
  console.error('Brak apps/web/dist — uruchom najpierw `npm run build`.')
  process.exit(1)
}

/**
 * Uruchomienie CLI.
 *
 * `shell: true` jest na Windowsie konieczne: `npx` to tam plik wsadowy, a Node
 * odmawia uruchomienia go wprost (`spawn EINVAL`).
 */
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'vercel', ...args], {
      cwd: stage,
      stdio: 'inherit',
      shell: true,
    })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`vercel ${args[0]} zakonczyl sie kodem ${code}`)),
    )
  })
}

// --- 1. czyste wyjscie i powiazanie z projektem ---------------------------
// Kasujemy WYLACZNIE `.vercel/output` - `stage` to katalog ze zrodlami aplikacji.
await rm(output, { recursive: true, force: true })
console.log(`Powiazanie z projektem „${project}”…`)
await run(['link', '--yes', '--project', project])
await rm(join(stage, '.env.local'), { force: true })

// --- 2. naglowki z vercel.json -> trasy Build Output API -------------------
const config = JSON.parse(await readFile(join(dist, 'vercel.json'), 'utf8'))
const routes = config.headers.map((rule) => ({
  // `vercel.json` uzywa wzorcow sciezkowych, Build Output API - wyrazen
  // regularnych. Wzorce, ktorych uzywamy, znacza w obu zapisach to samo.
  src: '^' + rule.source + '$',
  headers: Object.fromEntries(rule.headers.map((h) => [h.key, h.value])),
  // Bez tego dopasowanie konczy obsluge zadania i plik nigdy nie zostaje wydany.
  continue: true,
}))

// --- 3. zlozenie wyjscia ---------------------------------------------------
await mkdir(output, { recursive: true })
await cp(dist, join(output, 'static'), { recursive: true })
// Sam `vercel.json` nie jest juz potrzebny i nie ma powodu, zeby lezal
// publicznie pod adresem strony.
await rm(join(output, 'static', 'vercel.json'), { force: true })
await rm(join(output, 'static', '.vercel'), { recursive: true, force: true })
await writeFile(join(output, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2))
console.log(`Przygotowano ${output}`)

// --- 4. wyslanie -----------------------------------------------------------
console.log('\nWysylam…\n')
await run(['deploy', '--prebuilt', '--prod', '--yes'])
