/**
 * Gotowe programy demonstracyjne - kody z instrukcji laboratoryjnych
 * skompilowane PRAWDZIWYM avr-gcc (tools/build-golden.sh).
 *
 * Sluza dwom celom: pozwalaja obejrzec dzialanie plytki, zanim gotowy bedzie
 * kompilator w przegladarce (SPIKE-1), i stanowia wzorzec, z ktorym mozna
 * porownac wlasny program.
 */

/*
  Pusty projekt startowy. Lezy poza katalogami `src/` i `hex/`, bo w odroznieniu
  od cwiczen jest w calosci napisany na potrzeby tego narzedzia - i tylko dlatego
  moze byc objety licencja MIT razem z reszta kodu (patrz LICENSE, punkt 2).

  Jego plik HEX zlozono recznie z czterech instrukcji (LDI, dwa OUT i RJMP
  w petli), a nie avr-gcc jak pozostale przyklady: program jest na tyle maly,
  ze da sie go zapisac wprost, a dzieki temu pusty projekt startuje takze wtedy,
  gdy zadnego kompilatora nie ma pod reka. Test `starter-example.test.ts`
  sprawdza w symulatorze, ze zapala wszystkie osiem diod.
*/
import starterHex from './start/start_leds.hex?raw'
import starterSource from './start/main.c?raw'

import lab1 from './hex/lab1_gpio_led.hex?raw'
import lab2 from './hex/lab2_keypad.hex?raw'
import lab3 from './hex/lab3_7seg.hex?raw'
import lab4 from './hex/lab4_timer0.hex?raw'
import lab5 from './hex/lab5_interrupts.hex?raw'
import lab6 from './hex/lab6_uart.hex?raw'
import lab7 from './hex/lab7_frames.hex?raw'
import lab8 from './hex/lab8_lcd.hex?raw'
import sw1 from './hex/sw1_keypad_port.hex?raw'
import sw2 from './hex/sw2_lcd_pointers.hex?raw'
import sw3 from './hex/sw3_lcd_cgram.hex?raw'
import sw4 from './hex/sw4_usart_timer.hex?raw'

import lab1Source from './src/lab1_main.c?raw'
import lab2Source from './src/lab2_main.c?raw'
import lab3Source from './src/lab3_main.c?raw'
import lab4Source from './src/lab4_main.c?raw'
import lab5Source from './src/lab5_main.c?raw'
import lab6Source from './src/lab6_main.c?raw'
import lab7Source from './src/lab7_main.c?raw'
import lab7Script from './src/lab7_script.py?raw'
import lab8Source from './src/lab8_main.c?raw'
import queueSource from './src/queue.c?raw'
import queueHeader from './src/queue.h?raw'

import sw1Source from './src/sw1_main.c?raw'
import sw1Keypad from './src/sw1_klawiatura.c?raw'
import sw1KeypadHeader from './src/sw1_klawiatura.h?raw'
import sw2Source from './src/sw2_main.c?raw'
import sw2Display from './src/sw2_wyswietlacz.c?raw'
import sw2DisplayHeader from './src/sw2_wyswietlacz.h?raw'
import sw2Keypad from './src/sw2_klawiatura.c?raw'
import sw2KeypadHeader from './src/sw2_klawiatura.h?raw'
import sw3Source from './src/sw3_main.c?raw'
import sw4Source from './src/sw4_main.c?raw'

import type { ProjectFile } from '../ide/project'

/** Pliki kolejki uzywane przez przyklady z transmisja szeregowa. */
const QUEUE: ProjectFile[] = [
  { path: 'queue.c', content: queueSource },
  { path: 'queue.h', content: queueHeader },
]

/**
 * Pusty projekt startowy. Ma wlasny identyfikator, bo poza lista wyboru
 * siega po niego takze przycisk w pasku narzedzi.
 */
export const STARTER_ID = 'start'

/** Skad pochodzi przyklad - pozwala pogrupowac liste wyboru. */
export type ExampleGroup = 'Start' | 'Technika mikroprocesorowa' | 'Systemy wbudowane'

export interface Example {
  id: string
  label: string
  group: ExampleGroup
  description: string
  hex: string
  /** Preset polaczen, przy ktorym program ma sens. */
  preset: string
  /** Na co zwrocic uwage - pulapka dydaktyczna zwiazana z cwiczeniem. */
  note?: string
  /**
   * Kod zrodlowy, z ktorego zbudowano ten plik HEX.
   *
   * Wczytujemy go do projektu razem z programem, zeby dalo sie go przeczytac,
   * zmienic i zbudowac na nowo. Bez tego przyklad jest czarna skrzynka:
   * cos sie dzieje na plytce, ale nie wiadomo dlaczego.
   */
  files: ProjectFile[]
}

export const EXAMPLES: Example[] = [
  {
    id: STARTER_ID,
    group: 'Start',
    label: 'Pusty projekt — diody na porcie A',
    description:
      'Czysta kartka do własnego programu: port A jest już połączony z diodami, a wszystkie osiem świeci.',
    hex: starterHex,
    preset: 'start',
    files: [{ path: 'main.c', content: starterSource }],
    note: 'Przewody i diody są gotowe — pisz wewnątrz pętli while (1) i naciśnij „Zbuduj i wgraj” (F7).',
  },
  {
    id: 'lab1',
    group: 'Technika mikroprocesorowa',
    label: 'L1 — wąż świetlny na diodach',
    description: 'Sekwencje z zadania 7: przesuwanie zapalonych diod w obie strony.',
    hex: lab1,
    preset: 'l1',
    files: [{ path: 'main.c', content: lab1Source }],
  },
  {
    id: 'lab2',
    group: 'Technika mikroprocesorowa',
    label: 'L2 — kalkulator na klawiaturze 4×4',
    description: 'Wciśnij cyfrę, działanie (A/B/C/D), drugą cyfrę i #. Wynik pojawi się na diodach.',
    hex: lab2,
    preset: 'l2',
    files: [{ path: 'main.c', content: lab2Source }],
  },
  {
    id: 'lab3',
    group: 'Technika mikroprocesorowa',
    label: 'L3 — licznik na wyświetlaczu 7-segmentowym',
    description: 'PD0 zatrzymuje, PD1 zeruje, PD2 uruchamia licznik.',
    hex: lab3,
    preset: 'l3',
    files: [{ path: 'main.c', content: lab3Source }],
  },
  {
    id: 'lab4',
    group: 'Technika mikroprocesorowa',
    label: 'L4 — timer TC0 jako podstawa czasu',
    description: 'Programowa funkcja delay_ms oparta na fladze przepełnienia TC0.',
    hex: lab4,
    preset: 'l4',
    files: [{ path: 'main.c', content: lab4Source }],
  },
  {
    id: 'lab5',
    group: 'Technika mikroprocesorowa',
    label: 'L5 — przerwania TC1',
    description: 'Diody na porcie C przełączane w przerwaniu porównania TIMER1_COMPA.',
    hex: lab5,
    preset: 'l5',
    files: [{ path: 'main.c', content: lab5Source }],
    note: 'Fabryczny fuse JTAGEN blokuje PC2–PC5. Wyłącz go w oknie fuse bitów, żeby ożywić cały port C.',
  },
  {
    id: 'lab6',
    group: 'Technika mikroprocesorowa',
    label: 'L6 — echo przez USART',
    description: 'Znaki z terminala wracają echem; "s" zapala wszystkie diody, "c" gasi.',
    hex: lab6,
    preset: 'l6',
    files: [{ path: 'main.c', content: lab6Source }, ...QUEUE],
    note: 'Zegar ustawiono na 4 MHz — dla tej prędkości policzono transmisję. Przestaw go na 1 MHz, żeby zobaczyć, jak wygląda rozjazd.',
  },
  {
    id: 'lab7',
    group: 'Technika mikroprocesorowa',
    label: 'L7 — ramki binarne',
    description: 'Co sekundę wysyłana jest ramka sensor_data_frame_t; odebrany bajt steruje diodami.',
    hex: lab7,
    preset: 'l7',
    // Razem z programem plytki wczytujemy skrypt „komputera PC”. Bez niego
    // cwiczenie jest polowa zadania: widac bajty w terminalu, ale nie widac,
    // co znacza - a caly sens ramek dwojkowych lezy po stronie odbiorcy.
    files: [
      { path: 'main.c', content: lab7Source },
      ...QUEUE,
      { path: 'script.py', content: lab7Script },
    ],
    note: 'Format ramki dla Pythona: "<HLhfB".',
  },
  {
    id: 'lab8',
    group: 'Technika mikroprocesorowa',
    label: 'L8-9 — wyświetlacz LCD',
    description: 'Napisy, znak własny w CGRAM i przewijanie okna klawiszami 2, 3, 4, 5.',
    hex: lab8,
    preset: 'l8',
    files: [{ path: 'main.c', content: lab8Source }],
  },

  {
    id: 'sw1',
    group: 'Systemy wbudowane',
    label: 'SW1 — klawiatura z portem wybieranym parametrem',
    description:
      'Numer wciśniętego klawisza (1–16) pojawia się na diodach dwójkowo. Ten sam sterownik obsługuje każdy z czterech portów.',
    hex: sw1,
    preset: 'sw1',
    files: [
      { path: 'main.c', content: sw1Source },
      { path: 'klawiatura.c', content: sw1Keypad },
      { path: 'klawiatura.h', content: sw1KeypadHeader },
    ],
  },
  {
    id: 'sw2',
    group: 'Systemy wbudowane',
    label: 'SW2 — LCD i klawiatura sterowane wskaźnikami',
    description:
      'Długi napis zawijany do drugiego wiersza, własny znak w CGRAM i numer klawisza odświeżany na bieżąco.',
    hex: sw2,
    preset: 'sw2',
    files: [
      { path: 'main.c', content: sw2Source },
      { path: 'wyswietlacz.c', content: sw2Display },
      { path: 'wyswietlacz.h', content: sw2DisplayHeader },
      { path: 'klawiatura.c', content: sw2Keypad },
      { path: 'klawiatura.h', content: sw2KeypadHeader },
    ],
    note: 'Zegar został ustawiony na 8 MHz — kod tego wymaga. Przy fabrycznym 1 MHz wszystko trwałoby osiem razy dłużej.',
  },
  {
    id: 'sw3',
    group: 'Systemy wbudowane',
    label: 'SW3 — własne znaki CGRAM przy innym podłączeniu',
    description:
      'Animacja z trzech znaków zaprojektowanych bit po bicie. Linie danych wyświetlacza siedzą na PB2–PB5, nie na PB4–PB7.',
    hex: sw3,
    preset: 'sw3',
    files: [{ path: 'main.c', content: sw3Source }],
    note: 'Podłącz wyświetlacz dokładnie tak, jak mówią definicje w kodzie — inne linie oznaczają pusty ekran.',
  },
  {
    id: 'sw4',
    group: 'Systemy wbudowane',
    label: 'SW4 — USART i licznik TC0 jednocześnie',
    description:
      'Dioda PA0 miga co pół sekundy z licznika, a znaki 1–7, s i c z terminala sterują pozostałymi diodami.',
    hex: sw4,
    preset: 'sw4',
    files: [{ path: 'main.c', content: sw4Source }],
    note: 'Zegar ustawiono na 4 MHz, a zworkę JP4 zwarto — bez nich terminal pokazywałby śmieci albo płytka nie odbierałaby znaków.',
  },
]
