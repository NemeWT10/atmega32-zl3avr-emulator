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

await mkdir(to, { recursive: true })
for (const name of NEEDED) {
  await cp(join(from, name), join(to, name))
}

const copied = await readdir(to)
console.log(`Pyodide: skopiowano ${copied.length} plikow do apps/web/public/pyodide/`)
