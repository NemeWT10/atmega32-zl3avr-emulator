/**
 * Baza wiedzy o symbolach AVR - rejestrach, bitach, makrach i funkcjach.
 *
 * Korzystaja z niej podpowiedzi i dymki w edytorze. Opisy sa pisane dla kogos,
 * kto widzi te nazwy pierwszy raz w zyciu: co to jest, po co istnieje i co sie
 * stanie, jesli sie tego uzyje zle. Same nazwy z datasheetu nikomu nie pomagaja.
 *
 * Zrodlo faktow: docs/zrodla-txt/atmega32_datasheet.md oraz instrukcje
 * laboratoryjne w docs/zrodla-txt/.
 */

export type SymbolKind = 'register' | 'bit' | 'macro' | 'function' | 'type' | 'vector' | 'header'

export interface SymbolDoc {
  name: string
  kind: SymbolKind
  /** Jedno zdanie - to trafia na liste podpowiedzi. */
  summary: string
  /** Rozwiniecie: po co to jest i jak sie tego uzywa. */
  detail?: string
  /** Skad pochodzi symbol - student czesto nie wie, ze to nie jest slowo kluczowe C. */
  origin: string
  /** Przyklad uzycia. */
  example?: string
  /** Pulapka zwiazana z tym symbolem. */
  trap?: string
  /** Rejestr, do ktorego nalezy bit. */
  register?: string
  /** Numer bitu. */
  bit?: number
}

const AVR_IO = '<avr/io.h> · ATmega32'
const AVR_INTERRUPT = '<avr/interrupt.h>'
const UTIL_DELAY = '<util/delay.h>'

/** Buduje opisy bitow rejestru z listy nazw (bit 0 na koncu tablicy). */
function bits(register: string, names: (string | null)[], describe: (name: string, bit: number) => string): SymbolDoc[] {
  const docs: SymbolDoc[] = []
  names.forEach((name, index) => {
    if (!name) return
    const bit = names.length - 1 - index
    docs.push({
      name,
      kind: 'bit',
      register,
      bit,
      summary: `${register}, bit ${bit} — ${describe(name, bit)}`,
      origin: AVR_IO,
      example: `${register} |= (1 << ${name});`,
    })
  })
  return docs
}

// ---------------------------------------------------------------------------
// Porty wejscia/wyjscia
// ---------------------------------------------------------------------------

const PORT_DOCS: SymbolDoc[] = (['A', 'B', 'C', 'D'] as const).flatMap((port) => [
  {
    name: `PORT${port}`,
    kind: 'register' as const,
    summary: `Rejestr wyjściowy portu ${port}.`,
    detail:
      `Dla linii ustawionej jako WYJŚCIE (bit w DDR${port} = 1) wartość bitu trafia wprost na pin: ` +
      `1 to napięcie zasilania, 0 to masa.\n\n` +
      `Dla linii ustawionej jako WEJŚCIE ten sam bit włącza (1) lub wyłącza (0) wewnętrzny ` +
      `rezystor podciągający. Bez niego niepodłączone wejście „pływa” i czyta przypadkowe wartości.`,
    origin: AVR_IO,
    example: `DDR${port} = 0xFF;      // cały port jako wyjście\nPORT${port} = 0b00000001; // zapal pierwszą diodę`,
  },
  {
    name: `DDR${port}`,
    kind: 'register' as const,
    summary: `Kierunek linii portu ${port}: 1 = wyjście, 0 = wejście.`,
    detail:
      `Data Direction Register. Po resecie ma wartość 0, czyli wszystkie linie są wejściami — ` +
      `dlatego program, który zapomni ustawić DDR, nie zapali żadnej diody, mimo że poprawnie ` +
      `wpisuje wartości do PORT${port}.`,
    origin: AVR_IO,
    example: `DDR${port} |= (1 << P${port}0);  // sama linia 0 jako wyjście`,
    trap: `Najczęstszy błąd pierwszego laboratorium: ustawienie PORT${port} bez ustawienia DDR${port}.`,
  },
  {
    name: `PIN${port}`,
    kind: 'register' as const,
    summary: `Odczyt rzeczywistego stanu linii portu ${port}.`,
    detail:
      `Stan wejść czyta się WYŁĄCZNIE z PIN${port}, nigdy z PORT${port}. PORT${port} pokazuje to, ` +
      `co program chciał wystawić, a PIN${port} to, co faktycznie jest na wyprowadzeniu.\n\n` +
      `Przycisk zwierający linię do masy daje zero, dlatego warunki pisze się „na odwrót”: ` +
      `\`if ((PIN${port} & (1 << P${port}0)) == 0)\` znaczy „wciśnięty”.`,
    origin: AVR_IO,
    example: `if (!(PIN${port} & (1 << P${port}0))) { /* przycisk wciśnięty */ }`,
    trap: `ATmega32 NIE obsługuje przełączania linii przez zapis do PIN${port} — to funkcja nowszych układów.`,
  },
  ...Array.from({ length: 8 }, (_, bit) => ({
    name: `P${port}${bit}`,
    kind: 'bit' as const,
    register: `PORT${port}`,
    bit,
    summary: `Numer linii ${bit} portu ${port} (wartość ${bit}).`,
    detail: `To zwykła stała równa ${bit}. Służy do czytelnego zapisu masek bitowych.`,
    origin: AVR_IO,
    example: `PORT${port} |= (1 << P${port}${bit});`,
  })),
])

// ---------------------------------------------------------------------------
// Timery
// ---------------------------------------------------------------------------

const TIMER_DOCS: SymbolDoc[] = [
  {
    name: 'TCCR0',
    kind: 'register',
    summary: 'Konfiguracja licznika TC0: tryb pracy, źródło zegara i preskaler.',
    detail:
      'Bity CS02:CS00 wybierają preskaler (podział zegara procesora), a WGM01:WGM00 tryb pracy.\n\n' +
      'Preskaler: 001 = bez podziału, 010 = /8, 011 = /64, 100 = /256, 101 = /1024.\n' +
      'Tryb: WGM01 = 1 przy WGM00 = 0 to CTC, czyli zliczanie do wartości OCR0 i zerowanie licznika.',
    origin: AVR_IO,
    example: 'TCCR0 |= (1 << WGM01);            // tryb CTC\nTCCR0 |= (1 << CS02);             // preskaler 256',
  },
  {
    name: 'TCNT0',
    kind: 'register',
    summary: 'Bieżąca wartość 8-bitowego licznika TC0.',
    detail:
      'Licznik zwiększa się o jeden co każdy takt preskalera. Można go zapisać, żeby zacząć ' +
      'odliczanie od wybranej wartości — tak realizuje się odmierzanie czasu w trybie Normal.',
    origin: AVR_IO,
    example: 'TCNT0 = 131;   // odliczaj od 131 do przepełnienia',
  },
  {
    name: 'OCR0',
    kind: 'register',
    summary: 'Wartość, z którą porównywany jest licznik TC0.',
    detail:
      'W trybie CTC licznik dolicza do OCR0, ustawia flagę OCF0 i zeruje się. Okres wynosi ' +
      '(1 + OCR0) taktów preskalera, więc czas między przerwaniami to (1 + OCR0) · preskaler / f_zegara.\n\n' +
      'OCR0 mieści wartości 0–255. Jeśli wzór daje więcej, trzeba zwiększyć preskaler.',
    origin: AVR_IO,
    example: '// 10 ms przy 1 MHz i preskalerze 256:\nOCR0 = 38;',
  },
  {
    name: 'TIMSK',
    kind: 'register',
    summary: 'Maska przerwań WSZYSTKICH timerów (TC0, TC1 i TC2 razem).',
    detail:
      'W ATmega32 jest jeden wspólny rejestr maski dla wszystkich liczników — inaczej niż ' +
      'w ATmega328P, gdzie każdy timer ma własny TIMSK0/1/2. Ustawienie bitu włącza dane przerwanie, ' +
      'ale dodatkowo potrzebne jest globalne zezwolenie funkcją sei().',
    origin: AVR_IO,
    example: 'TIMSK |= (1 << OCIE1A);   // przerwanie porównania TC1 kanał A\nsei();                    // globalne zezwolenie',
  },
  {
    name: 'TIFR',
    kind: 'register',
    summary: 'Flagi przerwań wszystkich timerów.',
    detail:
      'Sprzęt ustawia flagę, gdy nastąpi przepełnienie (TOV) albo porównanie (OCF). ' +
      'Flagę kasuje się, ZAPISUJĄC W NIĄ JEDYNKĘ — to wygląda odwrotnie do intuicji, ale tak działa sprzęt.\n\n' +
      'Przy pracy na przerwaniach flaga kasuje się sama w chwili wejścia w procedurę obsługi.',
    origin: AVR_IO,
    example: 'if (TIFR & (1 << OCF0)) {\n    TIFR = (1 << OCF0);   // skasowanie flagi\n}',
    trap: 'Zapis `TIFR &= ~(1 << OCF0)` NIE kasuje flagi — wpisuje zera, a te nie mają żadnego skutku.',
  },
  {
    name: 'TCCR1A',
    kind: 'register',
    summary: 'Konfiguracja licznika TC1 — zachowanie wyjść OC1A/OC1B i dolne bity trybu.',
    origin: AVR_IO,
  },
  {
    name: 'TCCR1B',
    kind: 'register',
    summary: 'Konfiguracja licznika TC1 — preskaler i górne bity trybu pracy.',
    detail:
      'Bity CS12:CS10 wybierają preskaler tak samo jak w TC0. Bit WGM12 włącza tryb CTC ' +
      'z wartością szczytową w OCR1A.',
    origin: AVR_IO,
    example: 'TCCR1B |= (1 << WGM12);   // CTC\nTCCR1B |= (1 << CS12);    // preskaler 256',
  },
  {
    name: 'TCNT1',
    kind: 'register',
    summary: 'Bieżąca wartość 16-bitowego licznika TC1.',
    detail:
      'Rejestr jest 16-bitowy, a magistrala 8-bitowa, więc dostęp odbywa się przez ukryty rejestr ' +
      'pomocniczy TEMP. Kompilator generuje właściwą kolejność sam — wystarczy pisać `TCNT1 = 61630;`.',
    origin: AVR_IO,
    example: 'TCNT1 = 61630;   // odliczanie od zadanej wartości',
  },
  {
    name: 'OCR1A',
    kind: 'register',
    summary: 'Wartość porównania kanału A licznika TC1 (16 bitów).',
    detail:
      'W trybie CTC wyznacza okres: (1 + OCR1A) taktów preskalera. Przy zegarze 1 MHz ' +
      'i preskalerze 256 wartość 3905 daje dokładnie jedną sekundę.',
    origin: AVR_IO,
    example: 'OCR1A = 3905;   // 1 s przy 1 MHz i preskalerze 256',
  },
  { name: 'OCR1B', kind: 'register', summary: 'Wartość porównania kanału B licznika TC1 (16 bitów).', origin: AVR_IO },
  { name: 'ICR1', kind: 'register', summary: 'Rejestr przechwytywania / wartość szczytowa TC1 w części trybów.', origin: AVR_IO },
  { name: 'TCCR2', kind: 'register', summary: 'Konfiguracja licznika TC2 (8-bitowego, z własnym zestawem preskalerów).', origin: AVR_IO },
  { name: 'TCNT2', kind: 'register', summary: 'Bieżąca wartość licznika TC2.', origin: AVR_IO },
  { name: 'OCR2', kind: 'register', summary: 'Wartość porównania licznika TC2.', origin: AVR_IO },

  ...bits('TCCR0', ['FOC0', 'WGM00', 'COM01', 'COM00', 'WGM01', 'CS02', 'CS01', 'CS00'], (name) => {
    if (name.startsWith('CS')) return 'wybór preskalera'
    if (name.startsWith('WGM')) return 'wybór trybu pracy licznika'
    if (name.startsWith('COM')) return 'zachowanie wyprowadzenia OC0 przy porównaniu'
    return 'wymuszenie porównania (tryby bez PWM)'
  }),
  ...bits('TCCR1B', ['ICNC1', 'ICES1', null, 'WGM13', 'WGM12', 'CS12', 'CS11', 'CS10'], (name) => {
    if (name.startsWith('CS')) return 'wybór preskalera'
    if (name.startsWith('WGM')) return 'wybór trybu pracy licznika'
    return 'konfiguracja przechwytywania'
  }),
  ...bits('TCCR1A', ['COM1A1', 'COM1A0', 'COM1B1', 'COM1B0', 'FOC1A', 'FOC1B', 'WGM11', 'WGM10'], (name) =>
    name.startsWith('COM') ? 'zachowanie wyprowadzenia OC1x przy porównaniu' : 'wybór trybu pracy licznika',
  ),
  ...bits('TIMSK', ['OCIE2', 'TOIE2', 'TICIE1', 'OCIE1A', 'OCIE1B', 'TOIE1', 'OCIE0', 'TOIE0'], (name) =>
    name.startsWith('OCIE') ? 'zezwolenie na przerwanie porównania' : 'zezwolenie na przerwanie przepełnienia',
  ),
  ...bits('TIFR', ['OCF2', 'TOV2', 'ICF1', 'OCF1A', 'OCF1B', 'TOV1', 'OCF0', 'TOV0'], (name) =>
    name.startsWith('OCF') ? 'flaga porównania (kasuj zapisem jedynki)' : 'flaga przepełnienia (kasuj zapisem jedynki)',
  ),
]

// ---------------------------------------------------------------------------
// USART
// ---------------------------------------------------------------------------

const USART_DOCS: SymbolDoc[] = [
  {
    name: 'UDR',
    kind: 'register',
    summary: 'Rejestr danych USART — zapis wysyła bajt, odczyt pobiera odebrany.',
    detail:
      'To fizycznie dwa różne rejestry pod jednym adresem: zapis trafia do bufora nadawczego, ' +
      'odczyt pobiera z odbiorczego.\n\n' +
      'Przed zapisem trzeba poczekać na bit UDRE, przed odczytem na RXC.',
    origin: AVR_IO,
    example: 'while (!(UCSRA & (1 << UDRE)));\nUDR = znak;',
  },
  {
    name: 'UCSRA',
    kind: 'register',
    summary: 'Rejestr stanu USART: gotowość nadajnika i odbiornika, błędy transmisji.',
    origin: AVR_IO,
  },
  {
    name: 'UCSRB',
    kind: 'register',
    summary: 'Włączanie nadajnika, odbiornika i przerwań USART.',
    origin: AVR_IO,
    example: 'UCSRB = (1 << RXEN) | (1 << TXEN) | (1 << RXCIE);',
  },
  {
    name: 'UCSRC',
    kind: 'register',
    summary: 'Format ramki: liczba bitów danych, bit parzystości, liczba bitów stopu.',
    detail:
      'UCSRC leży pod TYM SAMYM adresem co UBRRH. O tym, który rejestr jest zapisywany, decyduje ' +
      'bit URSEL (najstarszy). Zapis bez URSEL trafia do UBRRH i psuje prędkość transmisji.',
    origin: AVR_IO,
    example: 'UCSRC = (1 << URSEL) | (1 << UCSZ1) | (1 << UCSZ0);   // 8 bitów danych',
    trap: 'Pominięcie `(1 << URSEL)` to klasyczny błąd — zamiast formatu ramki ustawia się starszy bajt UBRR.',
  },
  {
    name: 'UBRRL',
    kind: 'register',
    summary: 'Młodszy bajt dzielnika prędkości transmisji.',
    detail:
      'Wartość liczy się ze wzoru UBRR = f_zegara / (16 · prędkość) − 1.\n\n' +
      'UWAGA: we wzorze występuje RZECZYWISTA częstotliwość zegara, a `F_CPU` w kodzie jest tylko ' +
      'deklaracją dla kompilatora. Jeśli się rozjadą, układ nadaje z inną prędkością niż terminal ' +
      'i na ekranie pojawiają się śmieci.',
    origin: AVR_IO,
    example: '#define BAUD_PRESCALER (F_CPU / 16 / 9600 - 1)\nUBRRL = BAUD_PRESCALER;',
  },
  { name: 'UBRRH', kind: 'register', summary: 'Starszy bajt dzielnika prędkości — adres współdzielony z UCSRC.', origin: AVR_IO },

  ...bits('UCSRA', ['RXC', 'TXC', 'UDRE', 'FE', 'DOR', 'UPE', 'U2X', 'MPCM'], (name) => {
    switch (name) {
      case 'RXC': return 'odebrano bajt, można czytać UDR'
      case 'TXC': return 'nadawanie zakończone'
      case 'UDRE': return 'bufor nadawczy pusty, można pisać do UDR'
      case 'FE': return 'błąd ramki — najczęściej objaw złej prędkości transmisji'
      case 'DOR': return 'przepełnienie bufora odbiorczego'
      case 'UPE': return 'błąd kontroli parzystości'
      case 'U2X': return 'podwojenie prędkości transmisji'
      default: return 'tryb wieloprocesorowy'
    }
  }),
  ...bits('UCSRB', ['RXCIE', 'TXCIE', 'UDRIE', 'RXEN', 'TXEN', 'UCSZ2', 'RXB8', 'TXB8'], (name) => {
    switch (name) {
      case 'RXCIE': return 'zezwolenie na przerwanie „odebrano bajt”'
      case 'TXCIE': return 'zezwolenie na przerwanie „nadano bajt”'
      case 'UDRIE': return 'zezwolenie na przerwanie „bufor pusty”'
      case 'RXEN': return 'włączenie odbiornika'
      case 'TXEN': return 'włączenie nadajnika'
      default: return 'ustawienia formatu ramki'
    }
  }),
  ...bits('UCSRC', ['URSEL', 'UMSEL', 'UPM1', 'UPM0', 'USBS', 'UCSZ1', 'UCSZ0', 'UCPOL'], (name) => {
    switch (name) {
      case 'URSEL': return 'wybór rejestru: 1 = zapis do UCSRC, 0 = zapis do UBRRH'
      case 'UMSEL': return 'tryb synchroniczny (0 = asynchroniczny)'
      case 'USBS': return 'liczba bitów stopu'
      default: return 'format ramki'
    }
  }),
]

// ---------------------------------------------------------------------------
// Przerwania i sterowanie
// ---------------------------------------------------------------------------

const SYSTEM_DOCS: SymbolDoc[] = [
  {
    name: 'SREG',
    kind: 'register',
    summary: 'Rejestr stanu procesora — znaczniki wyniku i globalne zezwolenie na przerwania.',
    origin: AVR_IO,
  },
  {
    name: 'MCUCR',
    kind: 'register',
    summary: 'Sterowanie trybami uśpienia i sposobem wyzwalania przerwań INT0/INT1.',
    origin: AVR_IO,
  },
  {
    name: 'MCUCSR',
    kind: 'register',
    summary: 'Przyczyna ostatniego zerowania oraz bit JTD wyłączający interfejs JTAG.',
    detail:
      'Dwukrotny zapis bitu JTD w ciągu czterech taktów wyłącza JTAG programowo i uwalnia ' +
      'linie PC2–PC5. To alternatywa dla zmiany fuse bitu JTAGEN.',
    origin: AVR_IO,
    example: 'MCUCSR |= (1 << JTD);\nMCUCSR |= (1 << JTD);   // drugi zapis musi nastąpić od razu',
  },
  {
    name: 'GICR',
    kind: 'register',
    summary: 'Zezwolenia na przerwania zewnętrzne INT0, INT1 i INT2.',
    detail: 'W ATmega32 nazywa się GICR, a nie EIMSK jak w nowszych układach.',
    origin: AVR_IO,
  },
  { name: 'GIFR', kind: 'register', summary: 'Flagi przerwań zewnętrznych (kasowane zapisem jedynki).', origin: AVR_IO },

  {
    name: 'ISR',
    kind: 'macro',
    summary: 'Definiuje procedurę obsługi przerwania dla wskazanego wektora.',
    detail:
      'Procedura wykonuje się automatycznie, gdy sprzęt zgłosi przerwanie i jest ono odblokowane ' +
      '(bit w TIMSK/GICR oraz globalne zezwolenie sei()).\n\n' +
      'Wewnątrz obsługi przerwania warto robić jak najmniej — długie opóźnienia blokują resztę programu. ' +
      'Zmienne dzielone z pętlą główną deklaruje się jako `volatile`.',
    origin: AVR_INTERRUPT,
    example: 'ISR(TIMER1_COMPA_vect) {\n    PORTC ^= 0xFF;\n}',
    trap: 'Bez `#include <avr/interrupt.h>` makro ISR nie istnieje i kompilator zgłosi błąd.',
  },
  {
    name: 'sei',
    kind: 'function',
    summary: 'Globalnie zezwala na przerwania (ustawia bit I w SREG).',
    detail: 'Bez sei() żadne przerwanie się nie wykona, nawet jeśli jest odblokowane w TIMSK.',
    origin: AVR_INTERRUPT,
    example: 'sei();',
  },
  {
    name: 'cli',
    kind: 'function',
    summary: 'Globalnie blokuje przerwania (zeruje bit I w SREG).',
    detail:
      'Używane na czas konfiguracji peryferiów oraz przy odczycie zmiennych wielobajtowych ' +
      'dzielonych z procedurą przerwania.',
    origin: AVR_INTERRUPT,
    example: 'cli();\n// konfiguracja\nsei();',
  },
  {
    name: '_delay_ms',
    kind: 'function',
    summary: 'Opóźnienie programowe w milisekundach.',
    detail:
      'Realizowane pustą pętlą wyliczoną przez kompilator z wartości `F_CPU`. Procesor nic w tym ' +
      'czasie nie robi.\n\n' +
      'Jeżeli `F_CPU` nie odpowiada rzeczywistemu zegarowi z fuse bitów, opóźnienie będzie ' +
      'proporcjonalnie za krótkie lub za długie.',
    origin: UTIL_DELAY,
    example: '#define F_CPU 1000000UL\n#include <util/delay.h>\n_delay_ms(500);',
    trap: 'Argument musi być stałą znaną w czasie kompilacji — zmienna nie zadziała poprawnie.',
  },
  {
    name: '_delay_us',
    kind: 'function',
    summary: 'Opóźnienie programowe w mikrosekundach.',
    origin: UTIL_DELAY,
    example: '_delay_us(5);',
  },
  {
    name: 'F_CPU',
    kind: 'macro',
    summary: 'Deklaracja częstotliwości zegara dla kompilatora — NIE ustawia zegara układu.',
    detail:
      'To zwykła stała, z której kompilator wylicza pętle opóźniające i dzielnik prędkości USART.\n\n' +
      'Rzeczywistą częstotliwość wyznaczają FUSE BITY (fabrycznie wewnętrzny oscylator 1 MHz). ' +
      'Jeśli obie wartości się różnią, program działa, ale w złym tempie: opóźnienia są nie takie, ' +
      'a transmisja szeregowa sypie śmieciami.',
    origin: 'definicja w kodzie albo w ustawieniach projektu',
    example: '#define F_CPU 1000000UL   // musi zgadzać się z fuse bitami!',
    trap:
      'Wartość skopiowana z cudzego projektu prawie zawsze jest zła. Jeśli w kodzie stoi na przykład ' +
      '`F_CPU 400000000UL`, a układ tyka 1 MHz, wszystkie opóźnienia będą 400 razy za krótkie — ' +
      'i nic tego nie zasygnalizuje poza dziwnym zachowaniem programu.',
  },
  {
    name: 'volatile',
    kind: 'type',
    summary: 'Zabrania kompilatorowi optymalizować dostęp do zmiennej.',
    detail:
      'Konieczne dla zmiennych zmienianych w przerwaniu, a czytanych w pętli głównej. ' +
      'Bez tego kompilator może uznać, że wartość się nie zmienia, i wczytać ją tylko raz — ' +
      'program zawiesi się na warunku, który nigdy się nie spełni.',
    origin: 'język C',
    example: 'volatile uint16_t licznik = 0;',
  },
]

const VECTOR_DOCS: SymbolDoc[] = [
  { name: 'TIMER0_OVF_vect', kind: 'vector', summary: 'Przepełnienie licznika TC0.', origin: AVR_INTERRUPT },
  { name: 'TIMER0_COMP_vect', kind: 'vector', summary: 'Porównanie licznika TC0 z OCR0.', origin: AVR_INTERRUPT },
  { name: 'TIMER1_OVF_vect', kind: 'vector', summary: 'Przepełnienie licznika TC1.', origin: AVR_INTERRUPT },
  { name: 'TIMER1_COMPA_vect', kind: 'vector', summary: 'Porównanie TC1 z OCR1A — podstawowe przerwanie okresowe.', origin: AVR_INTERRUPT },
  { name: 'TIMER1_COMPB_vect', kind: 'vector', summary: 'Porównanie TC1 z OCR1B.', origin: AVR_INTERRUPT },
  { name: 'TIMER2_OVF_vect', kind: 'vector', summary: 'Przepełnienie licznika TC2.', origin: AVR_INTERRUPT },
  { name: 'TIMER2_COMP_vect', kind: 'vector', summary: 'Porównanie licznika TC2 z OCR2.', origin: AVR_INTERRUPT },
  { name: 'USART_RXC_vect', kind: 'vector', summary: 'Odebrano bajt przez USART.', origin: AVR_INTERRUPT },
  { name: 'USART_UDRE_vect', kind: 'vector', summary: 'Bufor nadawczy USART opróżniony.', origin: AVR_INTERRUPT },
  { name: 'USART_TXC_vect', kind: 'vector', summary: 'Zakończono nadawanie bajtu.', origin: AVR_INTERRUPT },
  { name: 'INT0_vect', kind: 'vector', summary: 'Przerwanie zewnętrzne INT0 (linia PD2).', origin: AVR_INTERRUPT },
  { name: 'INT1_vect', kind: 'vector', summary: 'Przerwanie zewnętrzne INT1 (linia PD3).', origin: AVR_INTERRUPT },
  { name: 'INT2_vect', kind: 'vector', summary: 'Przerwanie zewnętrzne INT2 (linia PB2).', origin: AVR_INTERRUPT },
]

const HEADER_DOCS: SymbolDoc[] = [
  {
    name: 'avr/io.h',
    kind: 'header',
    summary: 'Nazwy rejestrów i bitów wybranego mikrokontrolera.',
    detail: 'Bez tego nagłówka nazwy typu PORTD czy TCCR0 nie istnieją.',
    origin: 'avr-libc',
    example: '#include <avr/io.h>',
  },
  {
    name: 'util/delay.h',
    kind: 'header',
    summary: 'Opóźnienia programowe _delay_ms i _delay_us.',
    detail: 'Wymaga zdefiniowania F_CPU PRZED włączeniem nagłówka.',
    origin: 'avr-libc',
    example: '#define F_CPU 1000000UL\n#include <util/delay.h>',
  },
  {
    name: 'avr/interrupt.h',
    kind: 'header',
    summary: 'Makro ISR oraz funkcje sei() i cli().',
    origin: 'avr-libc',
    example: '#include <avr/interrupt.h>',
  },
  {
    name: 'avr/delay.h',
    kind: 'header',
    summary: 'Przestarzała nazwa nagłówka opóźnień.',
    detail: 'Działa, ale kompilator ostrzega. Poprawna nazwa to <util/delay.h>.',
    origin: 'avr-libc (wycofane)',
  },
]

export const SYMBOLS: SymbolDoc[] = [
  ...PORT_DOCS,
  ...TIMER_DOCS,
  ...USART_DOCS,
  ...SYSTEM_DOCS,
  ...VECTOR_DOCS,
  ...HEADER_DOCS,
]

const BY_NAME = new Map<string, SymbolDoc>()
for (const symbol of SYMBOLS) {
  if (!BY_NAME.has(symbol.name)) BY_NAME.set(symbol.name, symbol)
}

export function findSymbol(name: string): SymbolDoc | undefined {
  return BY_NAME.get(name)
}

/** Tekst dymka w formacie Markdown - taki, jaki pokazuje Monaco. */
export function symbolToMarkdown(symbol: SymbolDoc): string {
  const parts: string[] = []
  const kindLabel: Record<SymbolKind, string> = {
    register: 'rejestr',
    bit: 'bit',
    macro: 'makro',
    function: 'funkcja',
    type: 'słowo kluczowe',
    vector: 'wektor przerwania',
    header: 'nagłówek',
  }
  parts.push(`**${symbol.name}** — _${kindLabel[symbol.kind]}_`)
  parts.push('')
  parts.push(symbol.summary)
  if (symbol.detail) {
    parts.push('')
    parts.push(symbol.detail)
  }
  if (symbol.example) {
    parts.push('')
    parts.push('```c')
    parts.push(symbol.example)
    parts.push('```')
  }
  if (symbol.trap) {
    parts.push('')
    parts.push(`⚠️ **Uwaga:** ${symbol.trap}`)
  }
  parts.push('')
  parts.push(`_Pochodzenie: ${symbol.origin}_`)
  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Uklad bitow w rejestrach - do podgladu rejestrow w symulatorze
// ---------------------------------------------------------------------------

/**
 * Nazwy bitow rejestrow, od najstarszego (bit 7) do najmlodszego (bit 0).
 * `null` oznacza bit nieuzywany.
 *
 * Dzieki temu podglad rejestru pokazuje nie osiem anonimowych zer i jedynek,
 * tylko konkretne nazwy - a po najechaniu na nie opis, co dany bit robi.
 */
export const REGISTER_BITS: Record<string, (string | null)[]> = {
  SREG: ['I', 'T', 'H', 'S', 'V', 'N', 'Z', 'C'],
  TCCR0: ['FOC0', 'WGM00', 'COM01', 'COM00', 'WGM01', 'CS02', 'CS01', 'CS00'],
  TCCR1A: ['COM1A1', 'COM1A0', 'COM1B1', 'COM1B0', 'FOC1A', 'FOC1B', 'WGM11', 'WGM10'],
  TCCR1B: ['ICNC1', 'ICES1', null, 'WGM13', 'WGM12', 'CS12', 'CS11', 'CS10'],
  TCCR2: ['FOC2', 'WGM20', 'COM21', 'COM20', 'WGM21', 'CS22', 'CS21', 'CS20'],
  TIMSK: ['OCIE2', 'TOIE2', 'TICIE1', 'OCIE1A', 'OCIE1B', 'TOIE1', 'OCIE0', 'TOIE0'],
  TIFR: ['OCF2', 'TOV2', 'ICF1', 'OCF1A', 'OCF1B', 'TOV1', 'OCF0', 'TOV0'],
  UCSRA: ['RXC', 'TXC', 'UDRE', 'FE', 'DOR', 'UPE', 'U2X', 'MPCM'],
  UCSRB: ['RXCIE', 'TXCIE', 'UDRIE', 'RXEN', 'TXEN', 'UCSZ2', 'RXB8', 'TXB8'],
  UCSRC: ['URSEL', 'UMSEL', 'UPM1', 'UPM0', 'USBS', 'UCSZ1', 'UCSZ0', 'UCPOL'],
  GICR: ['INT1', 'INT0', 'INT2', null, null, null, 'IVSEL', 'IVCE'],
  GIFR: ['INTF1', 'INTF0', 'INTF2', null, null, null, null, null],
  MCUCR: ['SE', 'SM2', 'SM1', 'SM0', 'ISC11', 'ISC10', 'ISC01', 'ISC00'],
  MCUCSR: ['JTD', 'ISC2', null, 'JTRF', 'WDRF', 'BORF', 'EXTRF', 'PORF'],
  PORTA: ['PA7', 'PA6', 'PA5', 'PA4', 'PA3', 'PA2', 'PA1', 'PA0'],
  DDRA: ['PA7', 'PA6', 'PA5', 'PA4', 'PA3', 'PA2', 'PA1', 'PA0'],
  PINA: ['PA7', 'PA6', 'PA5', 'PA4', 'PA3', 'PA2', 'PA1', 'PA0'],
  PORTB: ['PB7', 'PB6', 'PB5', 'PB4', 'PB3', 'PB2', 'PB1', 'PB0'],
  DDRB: ['PB7', 'PB6', 'PB5', 'PB4', 'PB3', 'PB2', 'PB1', 'PB0'],
  PINB: ['PB7', 'PB6', 'PB5', 'PB4', 'PB3', 'PB2', 'PB1', 'PB0'],
  PORTC: ['PC7', 'PC6', 'PC5', 'PC4', 'PC3', 'PC2', 'PC1', 'PC0'],
  DDRC: ['PC7', 'PC6', 'PC5', 'PC4', 'PC3', 'PC2', 'PC1', 'PC0'],
  PINC: ['PC7', 'PC6', 'PC5', 'PC4', 'PC3', 'PC2', 'PC1', 'PC0'],
  PORTD: ['PD7', 'PD6', 'PD5', 'PD4', 'PD3', 'PD2', 'PD1', 'PD0'],
  DDRD: ['PD7', 'PD6', 'PD5', 'PD4', 'PD3', 'PD2', 'PD1', 'PD0'],
  PIND: ['PD7', 'PD6', 'PD5', 'PD4', 'PD3', 'PD2', 'PD1', 'PD0'],
}

/** Opis bitu SREG - te nie mieszcza sie w ogolnym schemacie nazw. */
export const SREG_BIT_DOCS: Record<string, string> = {
  I: 'Globalne zezwolenie na przerwania. Dopóki jest zerem, żadne przerwanie się nie wykona. Ustawia je funkcja sei(), zeruje cli().',
  T: 'Pojedynczy bit roboczy do przenoszenia wartości między rejestrami instrukcjami BST i BLD.',
  H: 'Przeniesienie z młodszej połówki bajtu. Używane przy arytmetyce dziesiętnej.',
  S: 'Znak wyniku. Powstaje z połączenia bitów N i V — pozwala porównywać liczby ze znakiem.',
  V: 'Nadmiar przy działaniu na liczbach ze znakiem: wynik nie zmieścił się w zakresie.',
  N: 'Wynik ostatniego działania był ujemny (najstarszy bit wyniku to jedynka).',
  Z: 'Wynik ostatniego działania był równy zeru. Na tym bicie opierają się instrukcje skoku warunkowego.',
  C: 'Przeniesienie poza zakres bajtu — na przykład przy dodawaniu 200 + 100.',
}
