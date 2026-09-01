import { useEffect } from 'react'
import type { Board } from '@zl3avr/board'

/**
 * Sterowanie klawiatura matrycowa z klawiatury komputera.
 *
 * Bez tego wiekszosci cwiczen po prostu nie da sie wykonac: trzymanie klawisza
 * mysza uniemozliwia jednoczesne wcisniecie drugiego, a przy skanowaniu matrycy
 * trzeba przytrzymac klawisz przez kilka pelnych rund - mysz zwalnia go za szybko.
 *
 * Uklad odpowiada nadrukowi na klawiaturze:
 *
 *     1 2 3 A          na klawiaturze komputera:  1 2 3 A
 *     4 5 6 B                                     4 5 6 B
 *     7 8 9 C                                     7 8 9 C
 *     * 0 # D                                     * 0 # D
 *
 * Gwiazdka i kratka wymagaja na wielu ukladach klawiatury shifta, wiec
 * przyjmujemy tez wygodniejsze zamienniki: przecinek i kropke.
 */

/** Numer klawisza matrycy = wiersz * 4 + kolumna. */
const KEY_BY_CHARACTER: Record<string, number> = {
  '1': 0, '2': 1, '3': 2, a: 3,
  '4': 4, '5': 5, '6': 6, b: 7,
  '7': 8, '8': 9, '9': 10, c: 11,
  '*': 12, '0': 13, '#': 14, d: 15,
  // zamienniki dla znakow wymagajacych shifta
  ',': 12, '.': 14,
}

/** Etykiety do pokazania uzytkownikowi - te same, co nadruk na klawiszach. */
export const KEYBOARD_HINT = '1 2 3 A · 4 5 6 B · 7 8 9 C · * 0 # D'

/** Czy zdarzenie pochodzi z pola tekstowego - wtedy nie przejmujemy klawisza. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function useKeyboardKeypad(board: Board, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    /** Klawisze aktualnie wcisniete - stad wiadomo, co zwolnic przy utracie skupienia. */
    const held = new Set<number>()

    const press = (key: number, pressed: boolean) => {
      if (pressed) {
        if (held.has(key)) return // powtorzenia z autorepetycji ignorujemy
        held.add(key)
      } else {
        held.delete(key)
      }
      board.setKeyPressed(key, pressed)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.altKey || event.metaKey) return
      const key = KEY_BY_CHARACTER[event.key.toLowerCase()]
      if (key === undefined) return
      event.preventDefault()
      press(key, true)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const key = KEY_BY_CHARACTER[event.key.toLowerCase()]
      if (key === undefined) return
      event.preventDefault()
      press(key, false)
    }

    /**
     * Utrata skupienia okna zwalnia wszystkie klawisze. Bez tego przelaczenie
     * karty przegladarki z wcisnietym klawiszem zostawiloby go wcisnietym
     * na zawsze - program widzialby przycisk trzymany bez konca.
     */
    const releaseAll = () => {
      for (const key of held) board.setKeyPressed(key, false)
      held.clear()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [board, enabled])
}
