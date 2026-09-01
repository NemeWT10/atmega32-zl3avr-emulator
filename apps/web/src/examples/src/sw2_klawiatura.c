/*
 * Klawiatura matrycowa 4x4 - wersja ze wskaznikami do rejestrow portu.
 *
 * Zasada dzialania jest ta sama co zawsze: kolumny sa wyjsciami, wiersze
 * wejsciami z pull-upami. Podajemy zero na jedna kolumne i sprawdzamy,
 * ktory wiersz odpowiedzial zerem.
 */

#define F_CPU 8000000L
#include <avr/io.h>
#include <util/delay.h>
#include "klawiatura.h"

/* Odstep miedzy dwoma odczytami przy eliminacji drgan stykow. */
#define CZAS_DRGAN_MS 15

void set_ddr2(volatile uint8_t *ddr, volatile uint8_t *port)
{
	*ddr  = 0xF0; /* starsze cztery bity wyjscia, mlodsze wejscia */
	*port = 0xFF; /* pull-upy na wejsciach, stan wysoki na wyjsciach */
}

static uint8_t skanujKolumne(volatile uint8_t *port, volatile uint8_t *pin,
                             uint8_t kolumna, uint8_t *bledne)
{
	*port |= 0xF0;
	*port &= ~(1 << (kolumna + 4));
	_delay_ms(1);

	/* Dwa odczyty w odstepie kilkunastu milisekund - drgania styku ustaja. */
	uint8_t odczyt1 = *pin & 0x0F;
	_delay_ms(CZAS_DRGAN_MS);
	uint8_t odczyt2 = *pin & 0x0F;
	if (odczyt1 != odczyt2) return 0;

	switch (odczyt1)
	{
		case 0b00001111: return 0;
		case 0b00001110: return 4 * 0 + kolumna + 1;
		case 0b00001101: return 4 * 1 + kolumna + 1;
		case 0b00001011: return 4 * 2 + kolumna + 1;
		case 0b00000111: return 4 * 3 + kolumna + 1;
		default:
			*bledne += 2; /* kilka klawiszy w jednej kolumnie */
			return 0;
	}
}

uint8_t getkey2(volatile uint8_t *port, volatile uint8_t *pin, uint8_t rozmiar)
{
	uint8_t wynik = 0;
	uint8_t wcisnietych = 0;
	uint8_t ostatniaKolumna = (rozmiar == 0) ? 1 : 4;

	for (uint8_t kolumna = 0; kolumna < ostatniaKolumna; kolumna++)
	{
		uint8_t klawisz = skanujKolumne(port, pin, kolumna, &wcisnietych);
		if (klawisz != 0)
		{
			wynik = klawisz;
			wcisnietych++;
		}
	}

	if (wcisnietych >= 2) wynik = 0;
	return wynik;
}
