#ifndef KLAWIATURA_H_
#define KLAWIATURA_H_

#include <stdint.h>

/*
 * Klawiatura matrycowa 4x4 obslugiwana przez wskazniki do rejestrow portu -
 * tak samo jak wyswietlacz. Port wybiera main(), sterownik go nie zna.
 */

/* PA0..PA3 (wiersze) na wejscia z pull-upami, PA4..PA7 (kolumny) na wyjscia. */
void set_ddr2(volatile uint8_t *ddr, volatile uint8_t *port);

/*
 * Zwraca numer wcisnietego klawisza:
 *   rozmiar = 1 -> pelna matryca, wynik 1..16
 *   rozmiar = 0 -> tylko pierwsza kolumna, wynik 1, 5, 9 albo 13
 * Zwraca 0, gdy nie wcisnieto nic albo wcisnieto wiecej niz jeden klawisz.
 */
uint8_t getkey2(volatile uint8_t *port, volatile uint8_t *pin, uint8_t rozmiar);

#endif /* KLAWIATURA_H_ */
