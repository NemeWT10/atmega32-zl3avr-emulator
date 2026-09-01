/**
 * Deklaracja typow dla gramatyki C/C++ z paczki Monaco.
 *
 * Paczka wystawia ten modul jako czysty JavaScript (bez .d.ts), a my siegamy
 * po niego, zeby ROZSZERZYC gramatyke o typy <stdint.h> oraz nazwy rejestrow
 * i bitow ATmega32 - patrz ide/monaco-avr.ts.
 */
declare module 'monaco-editor/esm/vs/basic-languages/cpp/cpp' {
  import type { languages } from 'monaco-editor'
  export const conf: languages.LanguageConfiguration
  export const language: languages.IMonarchLanguage
}
