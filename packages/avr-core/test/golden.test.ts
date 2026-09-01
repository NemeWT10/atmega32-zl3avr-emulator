/**
 * Golden testy rdzenia: uruchamiamy PRAWDZIWE kody z laboratorium
 * (skompilowane prawdziwym avr-gcc, patrz tools/build-golden.sh)
 * i sprawdzamy, czy emulator zachowuje sie tak jak plytka.
 *
 * To jest kryterium akceptacji projektu zapisane w README - nie zestaw
 * testow jednostkowych na okragle liczby.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Atmega32 } from '../src/mcu'
import { FACTORY_FUSES, HFUSE_BIT, setFuseProgrammed } from '../src/fuses'
import { IO } from '../src/registers'
import { SerialReceiver } from '../src/peripherals/serial-line'

const GOLDEN_DIR = join(__dirname, '..', '..', '..', 'tests', 'golden')

function loadGolden(name: string): string {
  return readFileSync(join(GOLDEN_DIR, `${name}.hex`), 'utf8')
}

/** Uklad zasilony, zaprogramowany, z fabrycznymi fuse (wewn. RC 1 MHz, JTAG wlaczony). */
function bootMcu(name: string, overrides: Partial<Atmega32> = {}): Atmega32 {
  const mcu = new Atmega32()
  mcu.loadHex(loadGolden(name))
  Object.assign(mcu, overrides)
  mcu.powered = true
  return mcu
}

describe('L1 - GPIO i diody LED (main.c)', () => {
  it('ustawia caly port D jako wyjscie i startuje sekwencje od 0b11000000', () => {
    const mcu = bootMcu('lab1_gpio_led')
    mcu.runSeconds(0.01)

    expect(mcu.cpu.getIoDirect(IO.DDRD)).toBe(0xff)
    expect(mcu.readPort('D')).toBe(0b11000000)
  })

  it('przesuwa zapalone diody w prawo co 500 ms (zadanie7)', () => {
    const mcu = bootMcu('lab1_gpio_led')
    mcu.runSeconds(0.01)
    expect(mcu.readPort('D')).toBe(0b11000000)

    const observed: number[] = []
    for (let i = 0; i < 4; i++) {
      mcu.runSeconds(0.5)
      observed.push(mcu.readPort('D'))
    }
    expect(observed).toEqual([0b01100000, 0b00110000, 0b00011000, 0b00001100])
  })

  it('bez zasilania nie wykonuje ani jednego cyklu', () => {
    const mcu = new Atmega32()
    mcu.loadHex(loadGolden('lab1_gpio_led'))
    const executed = mcu.runSeconds(1)
    expect(executed).toBe(0)
    expect(mcu.cpu.cycles).toBe(0)
  })
})

describe('L4 - Timer TC0 (main (3).c)', () => {
  it('konfiguruje TC0 z preskalerem 8 i przelacza bit 0 portu D co sekunde', () => {
    const mcu = bootMcu('lab4_timer0')
    mcu.runSeconds(0.05)

    // timer_initialize_zad5(): prescaler 8 -> CS01, tryb Normal
    expect(mcu.cpu.getIoDirect(IO.TCCR0) & 0x07).toBe(0b010)
    expect(mcu.readPort('D') & 1).toBe(0)

    mcu.runSeconds(1.0)
    expect(mcu.readPort('D') & 1).toBe(1)

    mcu.runSeconds(1.0)
    expect(mcu.readPort('D') & 1).toBe(0)
  })

  it('licznik programowy trzyma sekunde z dokladnoscia lepsza niz 2%', () => {
    const mcu = bootMcu('lab4_timer0')
    mcu.runSeconds(0.05)

    // Zaczekaj na zbocze, dopiero potem mierz pelny polokres.
    while (!(mcu.readPort('D') & 1)) mcu.step()
    const start = mcu.cpu.cycles
    while (mcu.readPort('D') & 1) mcu.step()
    const elapsed = (mcu.cpu.cycles - start) / (mcu.clockHz as number)

    // Petla programowa dokłada narzut na kazde odmierzone 1 ms, wiec sekunda
    // studenta jest ciut dluzsza niz sekunda - dokladnie jak na plytce.
    expect(elapsed).toBeGreaterThan(0.99)
    expect(elapsed).toBeLessThan(1.06)
  })
})

describe('L5 - przerwania TC1 i pulapka JTAGEN (main (4).c)', () => {
  it('z fabrycznym JTAGEN linie PC2..PC5 nie reaguja na PORTC', () => {
    const mcu = bootMcu('lab5_interrupts')
    mcu.runSeconds(0.05)

    // Kod ustawia DDRC = 0xFF i PORTC = 0xFF, ale JTAG zajmuje PC2..PC5.
    expect(mcu.cpu.getIoDirect(IO.DDRC)).toBe(0xff)
    for (const bit of [2, 3, 4, 5]) {
      expect(mcu.gpio.getDrive('C', bit)).toBe('pullup')
    }
    for (const bit of [0, 1, 6, 7]) {
      expect(mcu.gpio.getDrive('C', bit)).toBe('high')
    }
  })

  it('po wylaczeniu fuse JTAGEN caly port C zaczyna dzialac', () => {
    const mcu = new Atmega32()
    mcu.setFuses({
      ...FACTORY_FUSES,
      high: setFuseProgrammed(FACTORY_FUSES.high, HFUSE_BIT.JTAGEN, false),
    })
    mcu.loadHex(loadGolden('lab5_interrupts'))
    mcu.powered = true
    mcu.runSeconds(0.05)

    for (let bit = 0; bit < 8; bit++) {
      expect(mcu.gpio.getDrive('C', bit)).toBe('high')
    }
  })

  it('przerwanie TIMER1_COMPA przelacza port C mniej wiecej co sekunde', () => {
    const mcu = new Atmega32()
    mcu.setFuses({
      ...FACTORY_FUSES,
      high: setFuseProgrammed(FACTORY_FUSES.high, HFUSE_BIT.JTAGEN, false),
    })
    mcu.loadHex(loadGolden('lab5_interrupts'))
    mcu.powered = true
    mcu.runSeconds(0.05)

    // OCR1A = 3905, prescaler 256, zegar 1 MHz -> 256 * 3906 / 1e6 = 1,0 s
    expect(mcu.cpu.getIoDirect(IO.TIMSK) & (1 << 4)).toBeTruthy() // OCIE1A
    const before = mcu.readPort('C')
    mcu.runSeconds(1.05)
    expect(mcu.readPort('C')).not.toBe(before)
  })
})

describe('L3 - multipleksowanie wyswietlacza 7-segmentowego (main (2).c)', () => {
  it('cyklicznie uaktywnia kolumny na mlodszych bitach portu A', () => {
    const mcu = bootMcu('lab3_7seg')
    mcu.runSeconds(0.05)

    // Kolumny sa aktywne stanem niskim (tranzystory PNP na wspolnych anodach).
    const seenActiveColumns = new Set<number>()
    for (let i = 0; i < 4000; i++) {
      mcu.runCycles(500)
      const columns = mcu.readPort('A') & 0x0f
      if (columns !== 0x0f) seenActiveColumns.add(columns)
    }

    // Licznik startuje od zera, wiec swieci sie tylko ostatnia cyfra (kolumna 3).
    expect(seenActiveColumns.has(0b0111)).toBe(true)
  })
})

describe('L6 - USART i pulapka F_CPU (main (5).c)', () => {
  /** Okres bitowy terminala PC ustawiony na 9600 bodow, liczony w cyklach MCU. */
  const pcBitCycles = (mcu: Atmega32) => (mcu.clockHz as number) / 9600

  it('przy fabrycznym 1 MHz kod skompilowany dla 4 MHz nadaje czterokrotnie za wolno', () => {
    const mcu = bootMcu('lab6_uart')
    mcu.runSeconds(0.05)

    // BAUD_PRESCALER = 4000000/16/9600 - 1 = 25
    expect(mcu.cpu.getIoDirect(IO.UBRRL)).toBe(25)
    // ...ale realny zegar to 1 MHz, wiec faktyczna predkosc to okolo 2400 bodow.
    expect(mcu.usart.actualBaud).toBeCloseTo(2403.8, 0)
  })

  it('rozjazd predkosci daje w terminalu smieci, a nie wyslany znak', () => {
    const mcu = bootMcu('lab6_uart')
    mcu.runSeconds(0.05)

    const received: number[] = []
    // Terminal PC probkuje wlasnym zegarem 9600 bodow.
    const pc = new SerialReceiver((byte: number) => received.push(byte))

    mcu.usart.receiveFromPc(0x41, pcBitCycles(mcu)) // 'A'
    for (let i = 0; i < 200_000; i++) {
      mcu.step()
      pc.poll(mcu.cpu.cycles, mcu.usart.txLine, pcBitCycles(mcu))
      if (received.length > 0) break
    }

    expect(received.length).toBeGreaterThan(0)
    expect(received[0]).not.toBe(0x41)
  })

  it('po przestawieniu fuse na 4 MHz terminal odbiera dokladnie to, co wyslal', () => {
    const mcu = new Atmega32()
    // SUT_CKSEL: wewnetrzny RC 4 MHz -> CKSEL = 0011
    mcu.setFuses({ low: (FACTORY_FUSES.low & 0xf0) | 0b0011, high: FACTORY_FUSES.high })
    mcu.loadHex(loadGolden('lab6_uart'))
    mcu.powered = true
    mcu.runSeconds(0.05)

    expect(mcu.clockHz).toBe(4_000_000)
    expect(mcu.usart.actualBaud).toBeCloseTo(9615, 0)

    const received: number[] = []
    const pc = new SerialReceiver((byte: number) => received.push(byte))

    mcu.usart.receiveFromPc(0x41, pcBitCycles(mcu))
    for (let i = 0; i < 400_000; i++) {
      mcu.step()
      pc.poll(mcu.cpu.cycles, mcu.usart.txLine, pcBitCycles(mcu))
      if (received.length > 0) break
    }

    // Program odsyla echo odebranego znaku (zadanie 5 z instrukcji).
    expect(received[0]).toBe(0x41)
  })

  it('rozwarta zworka JP4 odcina odbior, nadawanie dziala dalej', () => {
    const mcu = new Atmega32()
    mcu.setFuses({ low: (FACTORY_FUSES.low & 0xf0) | 0b0011, high: FACTORY_FUSES.high })
    mcu.loadHex(loadGolden('lab6_uart'))
    mcu.powered = true
    mcu.usart.rxdEnabled = false
    mcu.runSeconds(0.05)

    mcu.usart.receiveFromPc(0x41, pcBitCycles(mcu))
    mcu.runSeconds(0.05)

    expect(mcu.cpu.getIoDirect(IO.UCSRA) & 0x80).toBe(0) // RXC nigdy sie nie ustawia
  })
})

describe('L8-9 - wyswietlacz LCD (main (7).c)', () => {
  it('steruje liniami LCD na porcie B: EN=PB0, RS=PB1, dane na PB4..PB7', () => {
    const mcu = bootMcu('lab8_lcd')
    mcu.runSeconds(0.3)

    expect(mcu.cpu.getIoDirect(IO.DDRB)).toBe(0xff)
    // Klawiatura jest na porcie A: wiersze wejscia z pull-upami, kolumny wyjscia.
    expect(mcu.cpu.getIoDirect(IO.DDRA)).toBe(0xf0)
  })
})
