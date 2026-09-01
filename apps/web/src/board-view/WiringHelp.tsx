import { useState } from 'react'

/**
 * Ikona „?” w rogu plytki - podreczna sciaga z laczenia przewodow.
 *
 * Prowadzenie przewodu to najwazniejsza czynnosc w tym widoku, a jednoczesnie
 * jedyna, ktorej nie widac, dopoki sie jej nie zacznie. Panel pomocy opisuje
 * wskazany element, poradnik siedzi w osobnej zakladce - a tu, przy samym
 * rysunku, dyzuruje krotka sciaga z ANIMOWANYM pokazem.
 *
 * Pokaz jest rysunkiem wektorowym z animacja CSS, a nie plikiem GIF:
 * wideo trzeba by wyrenderowac i utrzymywac w zgodzie z wygladem plytki
 * przy kazdej zmianie, a wektor uzywa tych samych ksztaltow i kolorow,
 * ktore rysuje sama plytka. Do tego jest ostry przy kazdym powiekszeniu,
 * wazy tyle, co kilkadziesiat linii tekstu, i nie zuzywa ani odrobiny
 * mocy, gdy dymek jest zamkniety - komponent wtedy w ogole nie istnieje.
 */
export function WiringHelp() {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="wiring-help"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      {open && (
        <div className="wiring-help-card">
          <WiringDemo />
          <ol className="wiring-help-steps">
            <li>
              <strong>Kliknij szpilkę</strong> — podnosisz przewód, płytka się przygasza,
              a wolne szpilki dostają obrączki.
            </li>
            <li>
              <strong>Kliknij drugą szpilkę</strong> — żyła się dorysowuje. Podgląd przy celu
              pokazuje dokładnie to połączenie, które powstanie.
            </li>
          </ol>
          <ul className="wiring-help-notes">
            <li>
              <strong>Esc</strong> albo kliknięcie w tło odkłada przewód.
            </li>
            <li>
              <strong>Kliknięcie żyły</strong> wypina ją; „Cofnij” przywraca.
            </li>
            <li>
              <strong>Shift + przeciągnięcie</strong> zaznacza kilka szpilek naraz — wiązka
              wchodzi od klikniętej szpilki w dół, żyła po żyle.
            </li>
            <li>Między kliknięciami możesz przybliżać i przesuwać płytkę.</li>
          </ul>
        </div>
      )}
      <button
        type="button"
        className="wiring-help-button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title="Jak łączyć przewody?"
      >
        ?
      </button>
    </div>
  )
}

/** Trasy zyl w pokazie: pojedyncza (rzad 0) i wiazka trzech (rzedy 1-3). */
const DEMO_WIRE_1 = 'M 40 24 C 85 52, 175 52, 220 24'
const DEMO_BUNDLE = [
  'M 40 48 C 85 74, 175 74, 220 48',
  'M 40 72 C 85 98, 175 98, 220 72',
  'M 40 96 C 85 118, 175 118, 220 96',
]

/**
 * Zapetlony pokaz w dwoch aktach, na jednej osi czasu (10 s, procenty w CSS):
 *
 *   AKT 1 - kursor klika szpilke po lewej, plytka sie przygasza, kursor
 *   jedzie do szpilki po prawej, pojawia sie podglad, klik - zyla sie
 *   dorysowuje.
 *
 *   AKT 2 - kursor zaznacza prostokatem trzy szpilki po lewej (wiazka),
 *   klika pierwsza wolna szpilke po prawej - i trzy zyly wchodza naraz,
 *   jedna pod druga.
 */
function WiringDemo() {
  const pins = [0, 1, 2, 3]
  return (
    <svg className="wdemo" viewBox="0 0 260 128" aria-hidden="true">
      <rect x="2" y="2" width="256" height="124" rx="10" className="wdemo-board" />
      {pins.map((row) => (
        <rect key={`l${row}`} x={34} y={18 + row * 24} width={12} height={12} rx={2} className="wdemo-pad" />
      ))}
      {pins.map((row) => (
        <rect key={`r${row}`} x={214} y={18 + row * 24} width={12} height={12} rx={2} className="wdemo-pad" />
      ))}

      {/* przygaszenie plytki na czas prowadzenia (dwa okna czasowe) */}
      <rect x="2" y="2" width="256" height="124" rx="10" className="wdemo-dim" />

      {/* akt 1: obraczki wolnych szpilek, pierscien zrodla i celu */}
      {pins.map((row) => (
        <circle key={`o${row}`} cx={220} cy={24 + row * 24} r={9} className="wdemo-open wdemo-open-1" />
      ))}
      <circle cx={40} cy={24} r={10} className="wdemo-source wdemo-source-1" />
      <circle cx={220} cy={24} r={10} className="wdemo-target wdemo-target-1" />
      <path d={DEMO_WIRE_1} className="wdemo-preview wdemo-preview-1" pathLength={100} />
      <path d={DEMO_WIRE_1} className="wdemo-wire wdemo-wire-1" pathLength={100} />

      {/* akt 2: prostokat zaznaczenia, zrodla wiazki, cel i trzy zyly */}
      <rect x={28} y={40} width={26} height={68} className="wdemo-marquee" />
      {[48, 72, 96].map((cy) => (
        <circle key={`s${cy}`} cx={40} cy={cy} r={10} className="wdemo-source wdemo-source-2" />
      ))}
      {[48, 72, 96].map((cy) => (
        <circle key={`t${cy}`} cx={220} cy={cy} r={9} className="wdemo-open wdemo-open-2" />
      ))}
      <circle cx={220} cy={48} r={10} className="wdemo-target wdemo-target-2" />
      {DEMO_BUNDLE.map((d, order) => (
        <path
          key={`p${order}`}
          d={d}
          className={`wdemo-preview wdemo-preview-2 wdemo-strand-${order}`}
          pathLength={100}
        />
      ))}
      {DEMO_BUNDLE.map((d, order) => (
        <path
          key={`w${order}`}
          d={d}
          className={`wdemo-wire wdemo-wire-2 wdemo-strand-${order}`}
          pathLength={100}
        />
      ))}

      {/* rozblyski klikniec: zrodlo, cel aktu 1, cel wiazki */}
      <circle cx={40} cy={24} r={8} className="wdemo-click wdemo-click-a" />
      <circle cx={220} cy={24} r={8} className="wdemo-click wdemo-click-b" />
      <circle cx={220} cy={48} r={8} className="wdemo-click wdemo-click-c" />

      {/* kursor */}
      <g className="wdemo-cursor">
        <path d="M 0 0 L 0 15 L 4.2 11.6 L 7.2 18 L 10 16.6 L 7 10.4 L 12.4 10.4 Z" />
      </g>
    </svg>
  )
}
