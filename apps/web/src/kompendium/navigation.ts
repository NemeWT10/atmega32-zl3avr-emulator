/**
 * Nawigacja do kompendium z innych widokow.
 *
 * Pomoc na plytce, podglad rejestrow i dymki edytora NIE powielaja wiedzy
 * z kompendium - zamiast tego linkuja do wlasciwego rozdzialu. Jedno zrodlo
 * tresci, wiele wejsc. Odnosnik idzie zdarzeniem okna, bo strony wysylajace
 * (np. rejestracja dymkow Monaco) zyja poza drzewem komponentow Reacta
 * i nie maja jak dostac zwyklego callbacka.
 */

export const KOMPENDIUM_EVENT = 'zl3avr:kompendium'

/** Rozdzialy kompendium - identyfikatory MUSZA zgadzac sie z kompendium.md. */
export const KOMPENDIUM_CHAPTERS: { id: string; label: string }[] = [
  { id: 'bity', label: 'Operacje bitowe' },
  { id: 'porty', label: 'Porty wejścia/wyjścia' },
  { id: 'zegar', label: 'Zegar i F_CPU' },
  { id: 'timery', label: 'Timery (liczniki)' },
  { id: 'przerwania', label: 'Przerwania' },
  { id: 'klawiatura', label: 'Klawiatura matrycowa' },
  { id: 'wyswietlacz-7seg', label: 'Wyświetlacz 7-segmentowy' },
  { id: 'lcd', label: 'Wyświetlacz LCD (HD44780)' },
  { id: 'usart', label: 'USART — łącze szeregowe' },
]

export function chapterLabel(id: string): string {
  return KOMPENDIUM_CHAPTERS.find((chapter) => chapter.id === id)?.label ?? id
}

/** Prosi aplikacje o otwarcie kompendium na wskazanym rozdziale. */
export function openKompendium(chapter?: string): void {
  window.dispatchEvent(new CustomEvent(KOMPENDIUM_EVENT, { detail: { chapter } }))
}

/**
 * Rozdzial pasujacy do symbolu AVR (rejestru, bitu, wektora, funkcji).
 *
 * Reguly ida od najbardziej szczegolnej: nazwa wektora mowi o mechanice
 * przerwan niezaleznie od tego, ktore peryferium je zglasza.
 */
export function chapterForSymbol(name: string): { id: string; label: string } | null {
  const id = (() => {
    if (/_vect$/.test(name)) return 'przerwania'
    if (/^(sei|cli|ISR|SIGNAL|SREG|volatile)$/.test(name)) return 'przerwania'
    if (/^(GICR|GIFR|MCUCR|MCUCSR|INT[012]|INTF[012]|ISC[012][012]?|IVSEL|IVCE|JTD)$/.test(name)) return 'przerwania'
    if (/^(PORT|DDR|PIN)[A-D]$/.test(name) || /^P[A-D][0-7]$/.test(name)) return 'porty'
    if (/^(TCCR|TCNT|OCR|TIMSK|TIFR|ICR)/.test(name)) return 'timery'
    if (/^(TOIE|OCIE|TICIE|OCF|TOV|ICF|WGM|FOC|COM[012]|CS[012])/.test(name)) return 'timery'
    if (/^(UDR|UCSR|UBRR)/.test(name)) return 'usart'
    if (/^(RXC|TXC|UDRE|RXEN|TXEN|RXCIE|TXCIE|UDRIE|UCSZ|URSEL|UMSEL|UPM|USBS|UCPOL|U2X|MPCM|RXB8|TXB8|FE|DOR|PE)$/.test(name)) return 'usart'
    if (/^(F_CPU|_delay_ms|_delay_us)$/.test(name)) return 'zegar'
    if (/^u?int(8|16|32|64)_t$/.test(name)) return 'bity'
    return null
  })()
  return id ? { id, label: chapterLabel(id) } : null
}
