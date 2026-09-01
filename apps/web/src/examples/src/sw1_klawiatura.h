#ifndef KLAWIATURA_H_
#define KLAWIATURA_H_

#include <stdint.h>

/*
 * Sterownik klawiatury matrycowej 4x4 z portem wybieranym w czasie dzialania.
 *
 * Numeracja portow uzywana przez wszystkie trzy funkcje:
 *   1 -> port A, 2 -> port B, 3 -> port C, 4 -> port D
 */

/* Ustawia port pod klawiature: PA0..PA3 (wiersze) jako wejscia z pull-upami,
   PA4..PA7 (kolumny) jako wyjscia. */
void set_ddr(uint8_t nrPortu);

/* Ustawia caly port jako wyjscie w stanie niskim - np. pod linijke diod. */
void initWyjscie(uint8_t nrPortu);

/*
 * Zwraca numer wcisnietego klawisza.
 *   rozmiar = 1 -> pelna matryca 4x4, wynik 1..16
 *   rozmiar = 0 -> tylko pierwsza kolumna, wynik 1, 5, 9 albo 13
 * Zwraca 0, gdy nie wcisnieto nic albo gdy wcisnieto wiecej niz jeden klawisz.
 */
uint8_t getkey(uint8_t nrPortu, uint8_t rozmiar);

#endif /* KLAWIATURA_H_ */
