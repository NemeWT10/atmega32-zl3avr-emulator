/*
 * SW3 - wlasne znaki w pamieci CGRAM przy innym podlaczeniu wyswietlacza.
 *
 * Program projektuje trzy wlasne znaki, wpisuje je do pamieci wyswietlacza
 * i wyswietla w kolko jeden po drugim w tym samym miejscu ekranu. Oko widzi
 * animacje, choc wyswietlacz caly czas pokazuje tylko jeden znak.
 *
 * Cwiczenie pokazuje dwie rzeczy:
 *
 *   1. Pamiec CGRAM. Wyswietlacz ma na stale wpisany alfabet, ale osiem
 *      komorek zostawia do dyspozycji programisty. Kazdy wlasny znak to osiem
 *      wierszy po piec punktow - rysuje sie go zerami i jedynkami. Znaki te
 *      maja kody od 0 do 7, wiec wypisuje sie je tak samo jak litery.
 *
 *   2. Podlaczenie do innych linii portu niz zwykle. Tutaj linie danych
 *      wyswietlacza siedza na PB2..PB5, a nie na PB4..PB7. Sterownikowi
 *      wystarczy zmiana czterech definicji ponizej - reszta kodu zostaje
 *      bez zmian. Wyswietlacz podlaczony do innych pinow niz mowi program
 *      to zreszta najczestszy powod, dla ktorego ekran zostaje pusty.
 *
 * Polaczenia:
 *   port B -> JP29 (LCD 4-bit): RS=PB0, E=PB1, D4..D7 = PB2..PB5
 *
 * Zegar: 1 MHz - ustawienie fabryczne, nie trzeba ruszac fuse bitow.
 */

#define F_CPU 1000000L
#include <avr/io.h>
#include <util/delay.h>

/* Port, do ktorego podlaczono wyswietlacz. */
#define LCD_DDR  DDRB
#define LCD_PORT PORTB

/* Linie sterujace. */
#define LCD_RS 0
#define LCD_EN 1

/* Linie danych - tu zaczynaja sie od bitu 2, a nie od bitu 4. */
#define LCD_D4 2
#define LCD_D5 3
#define LCD_D6 4
#define LCD_D7 5

/*
 * Wysyla cztery bity na linie danych i zatwierdza je zboczem opadajacym
 * na linii E. Wyswietlacz przepisuje stan linii dokladnie w chwili, gdy E
 * spada z jedynki do zera - dlatego dane ustawiamy jeszcze przy E = 1.
 */
static void write_LCD_4_bits(uint8_t polbajt)
{
	LCD_PORT &= ~((1 << LCD_D4) | (1 << LCD_D5) | (1 << LCD_D6) | (1 << LCD_D7));

	LCD_PORT |= (1 << LCD_EN);
	_delay_us(50);

	if (polbajt & 0b0001) LCD_PORT |= (1 << LCD_D4);
	if (polbajt & 0b0010) LCD_PORT |= (1 << LCD_D5);
	if (polbajt & 0b0100) LCD_PORT |= (1 << LCD_D6);
	if (polbajt & 0b1000) LCD_PORT |= (1 << LCD_D7);

	_delay_us(50);
	LCD_PORT &= ~(1 << LCD_EN);
	_delay_us(100);
}

/* RS = 0 -> wyswietlacz potraktuje bajt jako rozkaz. */
static void write_command_LCD(uint8_t rozkaz)
{
	LCD_PORT &= ~(1 << LCD_RS);
	write_LCD_4_bits(rozkaz >> 4);
	write_LCD_4_bits(rozkaz & 0x0F);
}

/* RS = 1 -> wyswietlacz potraktuje bajt jako znak do pokazania. */
static void LCD_write_char(uint8_t znak)
{
	LCD_PORT |= (1 << LCD_RS);
	write_LCD_4_bits(znak >> 4);
	write_LCD_4_bits(znak & 0x0F);
}

static void LCD_init(void)
{
	LCD_DDR  |= (1 << LCD_EN) | (1 << LCD_RS) |
	            (1 << LCD_D4) | (1 << LCD_D5) | (1 << LCD_D6) | (1 << LCD_D7);
	LCD_PORT &= ~((1 << LCD_EN) | (1 << LCD_RS) |
	              (1 << LCD_D4) | (1 << LCD_D5) | (1 << LCD_D6) | (1 << LCD_D7));

	_delay_ms(50); /* wyswietlacz po wlaczeniu zasilania potrzebuje chwili */

	/* Przejscie z trybu 8-bitowego (domyslnego) na 4-bitowy. */
	write_command_LCD(0b00110011);
	write_command_LCD(0b00110010);

	write_command_LCD(0b00101000); /* 4 bity, 2 wiersze, znaki 5x8 */
	write_command_LCD(0b00000110); /* kursor przesuwa sie w prawo */
	write_command_LCD(0b00001100); /* ekran wlaczony, kursor niewidoczny */
	write_command_LCD(0x01);       /* wyczyszczenie ekranu */
	_delay_ms(2);
}

int main(void)
{
	LCD_init();

	/* Znak nr 0: kwadrat z krzyzykiem w srodku. */
	uint8_t znak0[8] = {
		0b11111,
		0b11011,
		0b10101,
		0b10101,
		0b01110,
		0b10101,
		0b11011,
		0b11111
	};

	/* Znak nr 1: negatyw znaku nr 0 - zapalone punkty zamieniaja sie z gaszonymi. */
	uint8_t znak1[8];
	for (uint8_t i = 0; i < 8; i++) znak1[i] = ~znak0[i];

	/* Znak nr 2: cale pole zapalone. */
	uint8_t znak2[8] = {
		0b11111,
		0b11111,
		0b11111,
		0b11111,
		0b11111,
		0b11111,
		0b11111,
		0b11111
	};

	/*
	 * Rozkaz 0x40 przelacza zapis na pamiec znakow wlasnych. Kolejne znaki leza
	 * co osiem komorek, stad przesuniecie numeru znaku o trzy bity w lewo.
	 */
	write_command_LCD(0x40 + (0 << 3));
	for (uint8_t i = 0; i < 8; i++) LCD_write_char(znak0[i]);

	write_command_LCD(0x40 + (1 << 3));
	for (uint8_t i = 0; i < 8; i++) LCD_write_char(znak1[i]);

	write_command_LCD(0x40 + (2 << 3));
	for (uint8_t i = 0; i < 8; i++) LCD_write_char(znak2[i]);

	/* Rozkaz 0x80 wraca zapisem na ekran, na pierwsza pozycje. */
	write_command_LCD(0x80);

	while (1)
	{
		/*
		 * Po kazdym znaku kursor przesuwa sie w prawo, wiec przed kolejnym
		 * trzeba go cofnac rozkazem 0x80. Bez tego znaki ustawialyby sie
		 * w rzadek zamiast podmieniac w miejscu.
		 */
		LCD_write_char(0);
		_delay_ms(400);
		write_command_LCD(0x80);

		LCD_write_char(1);
		_delay_ms(400);
		write_command_LCD(0x80);

		LCD_write_char(2);
		_delay_ms(400);
		write_command_LCD(0x80);
	}
}
