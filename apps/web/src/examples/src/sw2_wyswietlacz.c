/*
 * Sterownik wyswietlacza HD44780 w trybie 4-bitowym, sterowany wskaznikami.
 *
 * Tryb 4-bitowy oznacza, ze kazdy bajt idzie do wyswietlacza w dwoch krokach:
 * najpierw starsza polowa (bity 7..4), potem mlodsza (bity 3..0). Kosztuje to
 * dwa razy wiecej operacji, ale zajmuje o cztery wyprowadzenia mikrokontrolera
 * mniej - a wyprowadzen zawsze brakuje.
 *
 * Linia RS mowi wyswietlaczowi, jak potraktowac przeslany bajt:
 *   RS = 0 -> rozkaz (wyczysc ekran, ustaw kursor, ...)
 *   RS = 1 -> znak do wyswietlenia
 *
 * Linia E (Enable) to sygnal "teraz czytaj". Wyswietlacz przepisuje stan linii
 * danych w chwili, gdy E opada z jedynki do zera. Dlatego dane ustawiamy przy
 * E = 1, a dopiero potem zdejmujemy E.
 *
 * Linia R/W (odczyt / zapis) jest na plytce ZL3AVR przylutowana do masy, wiec
 * z wyswietlacza mozna tylko pisac. Nie da sie zapytac go, czy jest gotowy -
 * zamiast tego po kazdej operacji odczekujemy z zapasem.
 */

#define F_CPU 8000000L
#include <avr/io.h>
#include <util/delay.h>
#include "wyswietlacz.h"

/*
 * Ktore bity portu ida do ktorych wyprowadzen wyswietlacza.
 * Zmieniajac te szesc liczb, przenosimy wyswietlacz na inne linie portu.
 */
#define LCD_RS 0
#define LCD_EN 1
#define LCD_D4 4
#define LCD_D5 5
#define LCD_D6 6
#define LCD_D7 7

/* Wyswietlacz nie mowi, w ktorym wierszu stoi kursor - musimy to pamietac sami. */
static volatile uint8_t aktualnyWiersz = 0;

void write_LCD_4_bits(uint8_t polbajt, volatile uint8_t *port)
{
	/* Zeruje cztery linie danych, nie ruszajac RS i E. */
	*port &= ~((1 << LCD_D4) | (1 << LCD_D5) | (1 << LCD_D6) | (1 << LCD_D7));

	*port |= (1 << LCD_EN); /* poczatek impulsu zatwierdzajacego */
	_delay_us(50);

	if (polbajt & 0b0001) *port |= (1 << LCD_D4);
	if (polbajt & 0b0010) *port |= (1 << LCD_D5);
	if (polbajt & 0b0100) *port |= (1 << LCD_D6);
	if (polbajt & 0b1000) *port |= (1 << LCD_D7);

	_delay_us(50);          /* dane musza byc stabilne przed opadnieciem E */
	*port &= ~(1 << LCD_EN); /* zbocze opadajace - wyswietlacz czyta linie */
	_delay_us(100);          /* czas na wykonanie operacji przez sterownik */
}

void write_command_LCD(uint8_t rozkaz, volatile uint8_t *port)
{
	*port &= ~(1 << LCD_RS); /* RS = 0 -> to jest rozkaz */
	write_LCD_4_bits(rozkaz >> 4, port);
	write_LCD_4_bits(rozkaz & 0x0F, port);
}

void LCD_write_char(uint8_t znak, volatile uint8_t *port)
{
	*port |= (1 << LCD_RS); /* RS = 1 -> to jest znak */
	write_LCD_4_bits(znak >> 4, port);
	write_LCD_4_bits(znak & 0x0F, port);
}

void LCD_init(volatile uint8_t *ddr, volatile uint8_t *port)
{
	/* Wszystkie uzywane linie jako wyjscia, w stanie niskim. */
	*ddr  |= (1 << LCD_EN) | (1 << LCD_RS) |
	         (1 << LCD_D4) | (1 << LCD_D5) | (1 << LCD_D6) | (1 << LCD_D7);
	*port &= ~((1 << LCD_EN) | (1 << LCD_RS) |
	           (1 << LCD_D4) | (1 << LCD_D5) | (1 << LCD_D6) | (1 << LCD_D7));

	_delay_ms(50); /* wyswietlacz po wlaczeniu zasilania potrzebuje chwili */

	/*
	 * Sekwencja przejscia w tryb 4-bitowy. Po wlaczeniu zasilania wyswietlacz
	 * pracuje na osmiu bitach, wiec pierwsze rozkazy trzeba mu podac tak,
	 * zeby zrozumial je niezaleznie od trybu.
	 */
	write_command_LCD(0b00110011, port);
	write_command_LCD(0b00110010, port);

	write_command_LCD(0b00101000, port); /* interfejs 4-bitowy, 2 wiersze, znaki 5x8 */
	write_command_LCD(0b00000110, port); /* po zapisie kursor idzie w prawo, ekran stoi */
	write_command_LCD(0b00001100, port); /* ekran wlaczony, kursor niewidoczny */

	LCD_clear(port);
}

void LCD_clear(volatile uint8_t *port)
{
	write_command_LCD(0x01, port);
	_delay_ms(2); /* rozkaz czyszczenia trwa najdluzej - okolo 1,5 ms */
	aktualnyWiersz = 0;
}

void set_LCD(int x, int y, volatile uint8_t *port)
{
	aktualnyWiersz = (uint8_t)x;
	/*
	 * Drugi wiersz nie zaczyna sie pod adresem 16, tylko 0x40. Adresy obu
	 * wierszy nie leza obok siebie - to czesta przyczyna "znikajacego" tekstu.
	 */
	write_command_LCD((0x40 * x + y) | 0x80, port);
}

void LCD_write_text(char *tekst, volatile uint8_t *port, uint8_t aktualnaKolumna)
{
	uint8_t kolumna = aktualnaKolumna;
	for (int i = 0; tekst[i] != '\0'; i++)
	{
		if (kolumna > 15) /* koniec wiersza - przechodzimy do drugiego */
		{
			aktualnyWiersz = (aktualnyWiersz == 0) ? 1 : 0;
			set_LCD(aktualnyWiersz, 0, port);
			kolumna = 0;
		}
		LCD_write_char((uint8_t)tekst[i], port);
		kolumna++;
	}
}

void LCD_clear_y(int y, volatile uint8_t *port)
{
	if (y >= 16) return;
	set_LCD(aktualnyWiersz, y, port);
	for (int i = y; i <= 15; i++)
	{
		LCD_write_char(' ', port);
	}
}
