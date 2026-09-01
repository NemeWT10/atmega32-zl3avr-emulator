/*
 * SW1 - klawiatura matrycowa 4x4 z portem wybieranym parametrem.
 *
 * Program czyta klawiature podlaczona do portu A i wypisuje numer wcisnietego
 * klawisza (1..16) na linijce osmiu diod podlaczonej do portu B - w postaci
 * dwojkowej, czyli klawisz nr 5 zapala diody o wagach 4 i 1.
 *
 * Ta sama funkcja getkey() obsluguje kazdy z czterech portow - port podaje sie
 * jej jako liczbe. Dzieki temu zmiana podlaczenia klawiatury na inne zlacze
 * nie wymaga przepisywania sterownika, tylko zmiany jednego argumentu.
 *
 * Polaczenia:
 *   port A -> JP23 (klawiatura): PA0..PA3 wiersze, PA4..PA7 kolumny
 *   port B -> JP22 (diody LED)
 *
 * Zegar: 1 MHz - wewnetrzny oscylator RC, ustawienie fabryczne. Nie trzeba
 * niczego zmieniac w fuse bitach.
 */

#define F_CPU 1000000L
#include <avr/io.h>
#include <util/delay.h>
#include "klawiatura.h"

/* Numery portow tak, jak rozumie je sterownik klawiatury. */
#define PORT_KLAWIATURY 1 /* 1 = port A */
#define PORT_DIOD       2 /* 2 = port B */

/* 1 = pelna matryca 4x4, 0 = tylko pierwsza kolumna (zworka JP3). */
#define PELNA_KLAWIATURA 1

int main(void)
{
	set_ddr(PORT_KLAWIATURY);      /* wiersze na wejscia z pull-upami, kolumny na wyjscia */
	initWyjscie(PORT_DIOD);        /* caly port diod jako wyjscie, poczatkowo zgaszony */

	while (1)
	{
		PORTB = getkey(PORT_KLAWIATURY, PELNA_KLAWIATURA);
	}
}
