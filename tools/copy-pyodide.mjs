// Kopiuje srodowisko uruchomieniowe Pythona (Pyodide) do katalogu wydawanego
// razem z aplikacja.
//
// Pyodide to okolo 14 MB: silnik CPythona skompilowany do WebAssembly plus jego
// biblioteka standardowa. Nie bierzemy go z zewnetrznego serwera, bo caly projekt
// ma dzialac z jednego adresu i bez internetu - tak samo jak edytor Monaco.
//
// Pliki nie trafiaja do repozytorium (sa w .gitignore); odtwarza je to polecenie,
// uruchamiane przed `npm run dev` i przed budowaniem.
import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'pyodide')
const to = join(root, 'apps', 'web', 'public', 'pyodide')

// Tylko to, czego potrzebuje przegladarka. Reszta paczki to typy, mapy zrodel
// i przykladowe strony konsoli - kilka megabajtow bez zastosowania u nas.
const NEEDED = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]

try {
  await stat(from)
} catch {
  console.error('Brak katalogu node_modules/pyodide - uruchom najpierw `npm install`.')
  process.exit(1)
}

/**
 * Kopiuje plik tylko wtedy, gdy go nie ma albo rozni sie rozmiarem.
 *
 * DLACZEGO NIE ZAWSZE: na Windowsie nadpisanie pliku, ktory obserwuje serwer
 * deweloperski, konczy sie bledem EBUSY - i to nie zwyklym niepowodzeniem
 * kopiowania, tylko wywroceniem calego procesu Vite (obserwator zglasza blad,
 * ktorego nikt nie przechwytuje). Objaw: `npm run build` uruchomiony przy
 * wlaczonym `npm run dev` gasi serwer deweloperski.
 *
 * Pliki Pyodide sa niezmienne w obrebie wersji paczki, wiec ponowne kopiowanie
 * i tak niczego by nie zmienilo.
 */
async function copyIfNeeded(name) {
  const source = join(from, name)
  const target = join(to, name)
  const sourceInfo = await stat(source)
  const targetInfo = await stat(target).catch(() => null)
  if (targetInfo && targetInfo.size === sourceInfo.size) return false
  await cp(source, target)
  return true
}

await mkdir(to, { recursive: true })
let copied = 0
for (const name of NEEDED) {
  if (await copyIfNeeded(name)) copied++
}

const present = await readdir(to)
console.log(
  copied > 0
    ? `Pyodide: skopiowano ${copied} z ${present.length} plikow do apps/web/public/pyodide/`
    : `Pyodide: ${present.length} plikow bylo juz na miejscu, nic nie kopiowano.`,
)
