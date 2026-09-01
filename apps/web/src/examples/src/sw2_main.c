/*
 * SW2 - wyswietlacz LCD i klawiatura obslugiwane przez wskazniki do rejestrow.
 *
 * Program pokazuje trzy rzeczy naraz:
 *   1. dlugi napis, ktory sam zawija sie do drugiego wiersza,
 *   2. wlasny znak zaprojektowany bit po bicie i zapisany w pamieci CGRAM,
 *   3. numer wcisnietego klawisza, odswiezany na biezaco.
 *
 * Sterowniki wyswietlacza i klawiatury nie wiedza, do ktorego portu sa
 * podlaczone - dostaja wskazniki do rejestrow. Przeniesienie wyswietlacza
 * na inny port to zmiana dwoch linii w main(), a nie przepisywanie sterownika.
 *
 * Polaczenia:
 *   port B -> JP29 (LCD 4-bit): RS=PB0, E=PB1, D4..D7 = PB4..PB7
 *   port A -> JP23 (klawiatura): PA0..PA3 wiersze, PA4..PA7 kolumny
 *
 * UWAGA - zegar: program zaklada 8 MHz. Fabrycznie mikrokontroler tyka
 * 1 MHz, wiec bez zmiany fuse bitow wszystkie opoznienia beda osiem razy
 * za dlugie: napis pojawi sie, ale animacja i reakcja na klawisze beda
 * wyraznie spowolnione. Ustaw zegar na wewnetrzny RC 8 MHz.
 */

#define F_CPU 8000000L
#include <avr/io.h>
#include <util/delay.h>
#include "wyswietlacz.h"
#include "klawiatura.h"

int main(void)
{
	/* Wskazniki do rejestrow portu, do ktorego podlaczono wyswietlacz. */
	volatile uint8_t *lcdDdr  = &DDRB;
	volatile uint8_t *lcdPort = &PORTB;

	/* To samo dla klawiatury - inny port, ten sam sposob. */
	volatile uint8_t *klawDdr  = &DDRA;
	volatile uint8_t *klawPort = &PORTA;
	volatile uint8_t *klawPin  = &PINA;

	LCD_init(lcdDdr, lcdPort);
	LCD_clear(lcdPort);

	/* Napis dluzszy niz 16 znakow - sterownik przenosi go do drugiego wiersza. */
	set_LCD(0, 0, lcdPort);
	LCD_write_text("Bardzo dlugi tekst do wyswietlenia", lcdPort, 0);
	_delay_ms(2000);

	/*
	 * Wlasny znak. Wyswietlacz ma osiem komorek pamieci CGRAM na znaki
	 * zaprojektowane przez nas. Kazdy znak to osiem wierszy po piec punktow -
	 * jedynka zapala punkt. Ponizsza tabela to po prostu rysunek strzalki
	 * narysowany zerami i jedynkami.
	 */
	uint8_t znak[8] = {
		0b00000,
		0b00000,
		0b00100,
		0b00100,
		0b01110,
		0b00100,
		0b00100,
		0b00000
	};

	/* Rozkaz 0x40 przestawia zapis z ekranu na pamiec znakow wlasnych. */
	write_command_LCD(0x40 + (0 << 3), lcdPort);
	for (uint8_t i = 0; i < 8; i++) LCD_write_char(znak[i], lcdPort);

	/* Zaraz za nim, bez zmiany adresu, zapisujemy jego negatyw jako znak nr 1. */
	for (uint8_t i = 0; i < 8; i++) LCD_write_char(~znak[i], lcdPort);

	/* Migniecie znakiem: raz normalnie, raz w negatywie. */
	LCD_clear(lcdPort);
	set_LCD(0, 15, lcdPort);
	LCD_write_char(0, lcdPort);
	_delay_ms(700);
	set_LCD(0, 15, lcdPort);
	LCD_write_char(1, lcdPort);
	_delay_ms(700);

	/* Stala czesc ekranu, do ktorej dopisujemy numer klawisza. */
	LCD_clear(lcdPort);
	set_LCD(1, 0, lcdPort);
	LCD_write_text("Przycisk nr:", lcdPort, 0);

	set_ddr2(klawDdr, klawPort);
	uint8_t poprzedniKlawisz = 0;

	while (1)
	{
		uint8_t klawisz = getkey2(klawPort, klawPin, 1);

		/*
		 * Przepisujemy ekran tylko przy zmianie. Bez tego warunku wyswietlacz
		 * dostawalby ten sam znak setki razy na sekunde i wyraznie by migotal.
		 */
		if (klawisz != 0 && klawisz != poprzedniKlawisz)
		{
			LCD_clear_y(12, lcdPort);
			set_LCD(1, 12, lcdPort);
			if (klawisz >= 10) LCD_write_char('0' + (klawisz / 10), lcdPort);
			LCD_write_char('0' + (klawisz % 10), lcdPort);
			poprzedniKlawisz = klawisz;
		}
	}
}
