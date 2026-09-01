/*
 * SW4 - transmisja szeregowa i licznik pracujace jednoczesnie na przerwaniach.
 *
 * Program robi dwie rzeczy naraz, nie przeszkadzajac sobie:
 *
 *   - dioda na PA0 miga rowno co pol sekundy, odmierzane licznikiem TC0,
 *   - znaki przychodzace z komputera przez lacze szeregowe zapalaja i gasza
 *     pozostale diody, a program odsyla potwierdzenie tekstem.
 *
 * Kluczowa rzecz do zrozumienia: petla glowna nie czeka na nic. Nie ma w niej
 * ani jednego _delay_ms() ani petli "czekaj na znak". Obie rzeczy zglaszaja
 * sie same przez przerwania, czyli krotkie funkcje wywolywane przez sprzet
 * w momencie, gdy cos sie wydarzy. Gdyby odmierzac czas przez _delay_ms(),
 * program przez caly czas opoznienia bylby gluchy na klawiature komputera.
 *
 * Obsluga polecen:
 *   '1'..'7' - przelaczaja diode o tym numerze
 *   's'      - zapala wszystkie diody oprocz migajacej
 *   'c'      - gasi wszystkie diody oprocz migajacej
 *   inny     - program odpowiada komunikatem o bledzie
 *
 * Polaczenia:
 *   port A -> JP22 (diody LED)
 *   lacze szeregowe idzie sciezkami na plytce - potrzebna zworka JP4 "RxD Enable",
 *   bez niej odbior nie dziala, a wysylanie owszem
 *
 * UWAGA - zegar: predkosc transmisji policzono dla 4 MHz. Fabrycznie
 * mikrokontroler tyka 1 MHz, wiec bez zmiany fuse bitow bedzie nadawal
 * cztery razy wolniej niz trzeba i terminal pokaze same smieci.
 * Ustaw zegar na wewnetrzny RC 4 MHz.
 */

#define F_CPU 4000000UL
#define BAUDRATE 9600UL
/* Wartosc dzielnika predkosci - wzor z dokumentacji ATmega32. */
#define BAUD_PRESCALLER ((F_CPU / (BAUDRATE * 16UL)) - 1)

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>

/*
 * Zmienne dzielone miedzy przerwaniem a petla glowna musza byc volatile.
 * Bez tego kompilator moglby uznac, ze skoro petla glowna ich nie zmienia,
 * to nie ma sensu ich ponownie czytac - i program przestalby reagowac.
 */
volatile char ostatniZnak = 0;
volatile uint8_t nowyZnak = 0;
volatile uint8_t licznikMilisekund = 0;

/* Przerwanie zglaszane, gdy przyszedl kompletny znak z lacza szeregowego. */
ISR(USART_RXC_vect)
{
	ostatniZnak = UDR; /* odczyt UDR kasuje zgloszenie */
	nowyZnak = 1;
}

/* Przerwanie zglaszane, gdy licznik TC0 doliczyl do wartosci w OCR0. */
ISR(TIMER0_COMP_vect)
{
	licznikMilisekund++;
}

static void USART_Init(void)
{
	/* Dzielnik predkosci zajmuje dwa rejestry - najpierw starszy bajt. */
	UBRRH = (uint8_t)(BAUD_PRESCALLER >> 8);
	UBRRL = (uint8_t)(BAUD_PRESCALLER);

	/* Wlaczamy nadajnik, odbiornik i przerwanie od odbioru. */
	UCSRB = (1 << TXEN) | (1 << RXEN) | (1 << RXCIE);

	/*
	 * Ramka: 8 bitow danych, bez parzystosci, jeden bit stopu.
	 * Bit URSEL musi byc ustawiony, bo UCSRC dzieli adres z UBRRH -
	 * to on rozstrzyga, do ktorego z nich naprawde trafi zapis.
	 * Zapomnienie o nim to klasyczna pomylka: zamiast ustawic format ramki,
	 * program po cichu psuje predkosc transmisji.
	 */
	UCSRC = (1 << URSEL) | (1 << UCSZ1) | (1 << UCSZ0);
}

static void USART_putchar(char znak)
{
	/* Czekamy, az bufor nadawczy zwolni sie po poprzednim znaku. */
	while ((UCSRA & (1 << UDRE)) == 0);
	UDR = znak;
}

static void USART_putstring(const char *tekst)
{
	while (*tekst) USART_putchar(*tekst++);
}

/*
 * Licznik TC0 w trybie CTC: liczy w gore, a po osiagnieciu wartosci z OCR0
 * zeruje sie i zglasza przerwanie. Przy zegarze 4 MHz i podziale przez 64
 * jeden krok licznika trwa 16 mikrosekund, wiec 250 krokow (OCR0 = 249)
 * daje rowno 4 milisekundy.
 */
static void timer0_init(void)
{
	TCNT0 = 0;
	OCR0  = 249;
	TCCR0 = (1 << WGM01) | (1 << CS01) | (1 << CS00); /* tryb CTC, podzial przez 64 */
	TIMSK |= (1 << OCIE0);                            /* zgoda na przerwanie porownania */
}

static void komunikatPrzycisk(char znak)
{
	USART_putstring("Nacisnieto przycisk: ");
	USART_putchar(znak);
	USART_putstring("\r\n");
}

int main(void)
{
	DDRA = 0xFF; /* caly port diod jako wyjscie */

	/* Krotki test: wszystkie diody zapalone, potem zgaszone. */
	PORTA = 0xFF;
	_delay_ms(500);
	PORTA = 0x00;

	USART_Init();
	timer0_init();
	sei(); /* dopiero teraz zezwalamy na przerwania - wczesniej nie ma czego obslugiwac */

	USART_putstring("ZL3AVR gotowy. Wcisnij 1-7, s albo c.\r\n");

	while (1)
	{
		/* 125 przerwan po 4 ms daje pol sekundy. */
		if (licznikMilisekund >= 125)
		{
			licznikMilisekund = 0;
			PORTA ^= (1 << PA0); /* operator ^= przelacza bit na przeciwny */
		}

		if (nowyZnak)
		{
			nowyZnak = 0;
			char znak = ostatniZnak;

			switch (znak)
			{
				case '1': PORTA ^= (1 << PA1); komunikatPrzycisk(znak); break;
				case '2': PORTA ^= (1 << PA2); komunikatPrzycisk(znak); break;
				case '3': PORTA ^= (1 << PA3); komunikatPrzycisk(znak); break;
				case '4': PORTA ^= (1 << PA4); komunikatPrzycisk(znak); break;
				case '5': PORTA ^= (1 << PA5); komunikatPrzycisk(znak); break;
				case '6': PORTA ^= (1 << PA6); komunikatPrzycisk(znak); break;
				case '7': PORTA ^= (1 << PA7); komunikatPrzycisk(znak); break;

				case 's': /* zapal wszystko poza migajaca dioda PA0 */
					PORTA |= 0b11111110;
					komunikatPrzycisk(znak);
					break;

				case 'c': /* zgas wszystko poza migajaca dioda PA0 */
					PORTA &= 0b00000001;
					komunikatPrzycisk(znak);
					break;

				default:
					USART_putstring("Nieznane polecenie.\r\n");
					break;
			}
		}
	}
}
