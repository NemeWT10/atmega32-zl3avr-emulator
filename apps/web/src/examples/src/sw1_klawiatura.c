/*
 * Sterownik klawiatury matrycowej 4x4 dzialajacy na dowolnym porcie.
 *
 * Klawiatura matrycowa to 16 przyciskow w siatce 4 wiersze x 4 kolumny.
 * Zamiast 16 wyprowadzen mikrokontrolera zuzywa 8: cztery linie wierszy
 * i cztery linie kolumn. Przycisk zwiera swoj wiersz ze swoja kolumna.
 *
 * Odczyt polega na skanowaniu: kolumny sa wyjsciami, wiersze wejsciami
 * z pull-upami. Podajemy stan niski na JEDNA kolumne, reszta zostaje wysoka.
 * Jesli teraz ktorys wiersz czyta zero, to znaczy, ze wcisnieto przycisk
 * lezacy na przecieciu tego wiersza i tej wlasnie kolumny.
 *
 * Podzial portu:
 *   PA0..PA3 (mlodsze cztery bity) - wiersze, wejscia z pull-upami
 *   PA4..PA7 (starsze cztery bity) - kolumny, wyjscia
 */

#define F_CPU 1000000L
#include <avr/io.h>
#include <util/delay.h>
#include "klawiatura.h"

/* Ile milisekund czekamy miedzy dwoma odczytami przy eliminacji drgan stykow. */
#define CZAS_DRGAN_MS 15

/*
 * Zamiana numeru portu na wskazniki do jego trzech rejestrow.
 *
 * Rejestry portow leza pod stalymi adresami, wiec mozna trzymac do nich
 * wskazniki i wybierac port dopiero w czasie dzialania programu. Slowo
 * volatile mowi kompilatorowi, ze zawartosc moze zmienic sie "sama"
 * (bo zmienia ja uklad peryferyjny), wiec nie wolno buforowac odczytow.
 */
static void wybierzPort(uint8_t nrPortu,
                        volatile uint8_t **ddr,
                        volatile uint8_t **port,
                        volatile uint8_t **pin)
{
	switch (nrPortu)
	{
		case 2:  *ddr = &DDRB; *port = &PORTB; *pin = &PINB; break;
		case 3:  *ddr = &DDRC; *port = &PORTC; *pin = &PINC; break;
		case 4:  *ddr = &DDRD; *port = &PORTD; *pin = &PIND; break;
		default: *ddr = &DDRA; *port = &PORTA; *pin = &PINA; break;
	}
}

void set_ddr(uint8_t nrPortu)
{
	volatile uint8_t *ddr, *port, *pin;
	wybierzPort(nrPortu, &ddr, &port, &pin);

	*ddr  = 0xF0; /* 0b11110000: bity 4..7 wyjscia (kolumny), 0..3 wejscia (wiersze) */
	*port = 0xFF; /* pull-upy na wejsciach + stan wysoki na wyjsciach */
}

void initWyjscie(uint8_t nrPortu)
{
	volatile uint8_t *ddr, *port, *pin;
	wybierzPort(nrPortu, &ddr, &port, &pin);

	*ddr  = 0xFF; /* wszystkie osiem linii jako wyjscia */
	*port = 0x00; /* wszystkie w stanie niskim */
}

/*
 * Odczytuje jedna kolumne i zwraca numer wcisnietego w niej klawisza (0 = zaden).
 * Gdy w kolumnie wcisnieto wiecej niz jeden klawisz, zwieksza *bledne.
 */
static uint8_t skanujKolumne(volatile uint8_t *port, volatile uint8_t *pin,
                             uint8_t kolumna, uint8_t *bledne)
{
	*port |= 0xF0;                  /* wszystkie kolumny w stan wysoki */
	*port &= ~(1 << (kolumna + 4)); /* wybrana kolumna w stan niski */
	_delay_ms(1);                   /* chwila na ustalenie sie napiec na liniach */

	/*
	 * Eliminacja drgan stykow. Styk mechaniczny przy zwarciu odbija sie
	 * kilka-kilkanascie milisekund i w tym czasie linia skacze miedzy 0 i 1.
	 * Czytamy wiec dwa razy w odstepie kilkunastu milisekund i ufamy odczytowi
	 * tylko wtedy, gdy oba wyszly identycznie.
	 */
	uint8_t odczyt1 = *pin & 0x0F; /* maska: interesuja nas tylko wiersze */
	_delay_ms(CZAS_DRGAN_MS);
	uint8_t odczyt2 = *pin & 0x0F;
	if (odczyt1 != odczyt2) return 0;

	switch (odczyt1)
	{
		case 0b00001111: return 0;                /* nic nie wcisnieto */
		case 0b00001110: return 4 * 0 + kolumna + 1; /* wiersz 1 */
		case 0b00001101: return 4 * 1 + kolumna + 1; /* wiersz 2 */
		case 0b00001011: return 4 * 2 + kolumna + 1; /* wiersz 3 */
		case 0b00000111: return 4 * 3 + kolumna + 1; /* wiersz 4 */
		default:
			/* Zero na wiecej niz jednym wierszu = kilka klawiszy naraz. */
			*bledne += 2;
			return 0;
	}
}

uint8_t getkey(uint8_t nrPortu, uint8_t rozmiar)
{
	volatile uint8_t *ddr, *port, *pin;
	wybierzPort(nrPortu, &ddr, &port, &pin);

	uint8_t wynik = 0;
	uint8_t wcisnietych = 0;

	if (rozmiar == 0)
	{
		/* Mala klawiatura: fizycznie istnieje tylko pierwsza kolumna. */
		uint8_t klawisz = skanujKolumne(port, pin, 0, &wcisnietych);
		if (klawisz != 0)
		{
			wynik = klawisz;
			wcisnietych++;
		}
	}
	else
	{
		for (uint8_t kolumna = 0; kolumna < 4; kolumna++)
		{
			uint8_t klawisz = skanujKolumne(port, pin, kolumna, &wcisnietych);
			if (klawisz != 0)
			{
				wynik = klawisz;
				wcisnietych++;
			}
		}
	}

	/* Dwa klawisze naraz to sytuacja niejednoznaczna - zglaszamy "nic". */
	if (wcisnietych >= 2) wynik = 0;
	return wynik;
}
