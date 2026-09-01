/**
 * Projekt startowy widoczny po uruchomieniu aplikacji.
 *
 * `main.c` to szablon z instrukcji L1 (`docs/zrodla-txt/L1_srodowisko_gpio_led.md`) —
 * celowo BEZ `#define F_CPU`, dokladnie jak w Microchip Studio na zajeciach.
 *
 * Pliki trafiaja do obiektu Project, ktory zapamietuje je w pamieci przegladarki,
 * wiec po odswiezeniu strony praca nie znika.
 */

import type { ProjectFile } from '../ide/project'

export type { ProjectFile }

const MAIN_C = `// Program startowy: wąż świetlny na diodach.
//
// Zanim go uruchomisz, połącz przewodami wybrany port ze złączem diod
// (zakładka "Płytka"). Kolejność żył decyduje o tym, w którą stronę
// będzie wędrować zapalona dioda.

#define F_CPU 1000000UL   // musi zgadzać się z zegarem ustawionym w fuse bitach
#include <avr/io.h>
#include <util/delay.h>

int main(void)
{
    DDRD = 0xFF;             // cały port D jako wyjście
    PORTD = 0b00000001;      // zapal pierwszą diodę

    while (1)
    {
        PORTD = PORTD << 1;  // przesuń zapaloną diodę o jedno miejsce
        if (PORTD == 0)      // po ośmiu przesunięciach zaczynamy od nowa
            PORTD = 0b00000001;

        _delay_ms(200);
    }
}
`

const README_TXT = `Jak zacząć

1. Włącz zasilanie płytki (przycisk na górnym pasku).
2. Przejdź na zakładkę "Płytka" i połącz przewodami port D
   ze złączem diod LED. Możesz też wybrać gotowy zestaw połączeń z listy.
3. Wgraj program.

Co warto wiedzieć na start

Tempo pracy mikrokontrolera NIE wynika z tego, co napiszesz w programie.
Wyznaczają je fuse bity - fabrycznie jest to milion taktów na sekundę.
Wartość F_CPU w kodzie to tylko informacja dla kompilatora, żeby wiedział,
jak długo ma trwać opóźnienie.

Jeśli obie wartości się różnią, program działa, ale w złym tempie.
Edytor ostrzeże cię, gdy tak się stanie.
`

export const demoProject: ProjectFile[] = [
  { path: 'main.c', content: MAIN_C },
  { path: 'przeczytaj-mnie.txt', content: README_TXT },
]
