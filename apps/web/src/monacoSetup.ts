/**
 * Monaco ladowany LOKALNIE (nie z CDN) i tylko w potrzebnym zakresie.
 *
 * Dlaczego nie domyslny import 'monaco-editor':
 *   - @monaco-editor/react domyslnie ciagnie edytor z jsdelivr, co zepsuloby
 *     prace offline (wersja desktopowa) i uzaleznilo aplikacje od zewnetrznego hosta,
 *   - pelna paczka 'monaco-editor' wciaga ~80 jezykow i serwisy TS/JSON/CSS/HTML
 *     (ok. 3,5 MB). Nam potrzebne sa tylko C/C++ i Python.
 *
 * Wystarczy podstawowy worker edytora: jezyk C nie ma w Monaco dedykowanego
 * serwisu jezykowego, wiec nie ladujemy workerow TS/JSON/CSS/HTML.
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/editor.all.js'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { registerAvrSupport } from './ide/monaco-avr'

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment
  }
}

window.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

loader.config({ monaco })

// Podpowiedzi i dymki rejestrujemy RAZ, przy starcie aplikacji.
// Robienie tego przy montowaniu edytora dublowaloby je przy kazdej zmianie pliku.
registerAvrSupport(monaco)
