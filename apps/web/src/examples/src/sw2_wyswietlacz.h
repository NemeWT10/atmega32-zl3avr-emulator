#ifndef WYSWIETLACZ_H_
#define WYSWIETLACZ_H_

#include <stdint.h>

/*
 * Sterownik wyswietlacza alfanumerycznego 2x16 (uklad HD44780) w trybie 4-bitowym.
 *
 * Kazda funkcja dostaje wskaznik do rejestru PORTx, do ktorego podlaczono
 * wyswietlacz. Dzieki temu ten sam kod obsluzy wyswietlacz na dowolnym porcie -
 * port wybiera sie w main(), a nie przez przekompilowanie sterownika.
 *
 * Podzial linii wewnatrz portu ustalaja definicje na poczatku wyswietlacz.c.
 */

/* Wysyla polowe bajtu (cztery bity) na linie D4..D7 i zatwierdza ja
   zboczem opadajacym na linii E. */
void write_LCD_4_bits(uint8_t polbajt, volatile uint8_t *port);

/* Wysyla rozkaz do sterownika (linia RS w stanie niskim). */
void write_command_LCD(uint8_t rozkaz, volatile uint8_t *port);

/* Wysyla znak do pamieci obrazu (linia RS w stanie wysokim). */
void LCD_write_char(uint8_t znak, volatile uint8_t *port);

/* Konfiguruje linie portu i wprowadza wyswietlacz w tryb 4-bitowy, 2 wiersze. */
void LCD_init(volatile uint8_t *ddr, volatile uint8_t *port);

/* Czysci ekran i wraca kursorem na poczatek. */
void LCD_clear(volatile uint8_t *port);

/* Ustawia kursor: x = wiersz 0..1, y = kolumna 0..15. */
void set_LCD(int x, int y, volatile uint8_t *port);

/* Wypisuje napis zakonczony zerem. Po 16 znaku przechodzi do drugiego wiersza.
   Argument aktualnaKolumna mowi, od ktorej kolumny zaczyna sie napis. */
void LCD_write_text(char *tekst, volatile uint8_t *port, uint8_t aktualnaKolumna);

/* Wypelnia spacjami od kolumny y do konca biezacego wiersza. */
void LCD_clear_y(int y, volatile uint8_t *port);

#endif /* WYSWIETLACZ_H_ */
