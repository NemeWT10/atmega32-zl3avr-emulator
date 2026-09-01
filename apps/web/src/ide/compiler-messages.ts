/**
 * Wyjasnienia komunikatow kompilatora po polsku.
 *
 * Osobny modul, bo korzystaja z niego OBA zaplecza (serwerowy avr-gcc i clang
 * w przegladarce), a wspolny plik z `toolchain.ts` zrobilby zapetlenie importow.
 *
 * Wzorce znaja DWA dialekty. avr-gcc i clang opisuja ten sam problem innymi
 * slowami - „'x' undeclared” kontra „use of undeclared identifier 'x'” - a student
 * ma dostac to samo wyjasnienie niezaleznie od tego, ktory kompilator pracuje.
 */

/**
 * avr-gcc mowi po angielsku i zwiezle - jezykiem kompilatora, nie czlowieka.
 *
 * „called object is not a function or function pointer” to w praktyce
 * najczesciej BRAKUJACY SREDNIK linie wyzej, a „undefined reference” znaczy,
 * ze plik z ta funkcja nie zostal dolaczony do projektu. Bez przetlumaczenia
 * tego na jezyk problemu student widzi sciane tekstu, ktora nic mu nie mowi,
 * i zaczyna zgadywac.
 *
 * NIE podmieniamy oryginalnego komunikatu - zostaje w calosci, bo to on
 * pozwala poszukac dalej i to jego zobaczy student w Microchip Studio.
 * Wyjasnienie dopisujemy obok.
 */
const EXPLANATIONS: { pattern: RegExp; hint: string }[] = [
  {
    pattern: /called object (?:type .* )?is not a function or function pointer/,
    hint:
      'Najczęściej znaczy to, że w POPRZEDNIEJ linii brakuje średnika — bez niego ' +
      'kompilator czyta obie linie jako jedno wyrażenie.',
  },
  {
    pattern: /expected declaration or statement at end of input|expected .\}./,
    hint: 'Brakuje zamykającego nawiasu klamrowego `}`. Sprawdź, czy każde `{` ma swoją parę.',
  },
  {
    pattern: /expected ['`"]?;/,
    hint: 'Brakuje średnika. W C średnik kończy każdą instrukcję.',
  },
  {
    pattern: /['`"](\w+)['`"] undeclared|use of undeclared identifier/,
    hint:
      'Kompilator nie zna tej nazwy. Sprawdź trzy rzeczy: literówkę, brak `#include <avr/io.h>` ' +
      'oraz to, czy nazwa rejestru na pewno istnieje w ATmega32 — układ jest starszy niż ' +
      'ATmega328P i część rejestrów nazywa się inaczej.',
  },
  {
    pattern: /implicit declaration of function|call to undeclared function/,
    hint:
      'Funkcja użyta, zanim kompilator dowiedział się, że istnieje. Dopisz brakujący `#include` ' +
      'albo umieść definicję funkcji nad miejscem użycia.',
  },
  {
    pattern: /undefined reference|undefined symbol|Nie znaleziono definicji/,
    hint:
      'Kompilator zna nazwę, ale nigdzie nie znalazł jej treści. Zwykle brakuje pliku `.c` ' +
      'z tą funkcją (sam nagłówek `.h` nie wystarczy) albo w nazwie jest literówka.',
  },
  {
    pattern: /No such file or directory|file not found/,
    hint:
      'Nie ma takiego pliku nagłówkowego. Pliki z własnego projektu dołącza się w cudzysłowach ' +
      '(`#include "moj.h"`), a biblioteki w nawiasach ostrokątnych (`#include <avr/io.h>`).',
  },
  {
    pattern: /misspelled signal handler/,
    hint:
      'Ta nazwa przerwania nie istnieje w ATmega32, więc funkcja NIE zostanie wywołana — ' +
      'program się zbuduje i po prostu nic nie zrobi. Sprawdź nazwę wektora ' +
      '(np. w ATmega32 jest TIMER0_COMP_vect, a nie TIMER0_COMPA_vect).',
  },
  {
    pattern: /F_CPU not defined/,
    hint:
      'Bez `#define F_CPU` biblioteka opóźnień przyjmuje 1 MHz. Jeśli układ tyka inaczej, ' +
      'wszystkie odczekania będą złe. Definicja musi stać PRZED `#include <util/delay.h>`.',
  },
  {
    pattern: /before ['`"]PROGMEM['`"]|unknown type name ['`"]PROGMEM['`"]/,
    hint: 'Słowo PROGMEM wymaga nagłówka: dopisz `#include <avr/pgmspace.h>`.',
  },
  {
    pattern: /suggest parentheses around assignment used as truth value|using the result of an assignment as a condition/,
    hint: 'W warunku jest `=` (przypisanie) zamiast `==` (porównanie).',
  },
  {
    pattern: /control reaches end of non-void function|non-void function does not return a value/,
    hint: 'Funkcja obiecuje zwrócić wartość, ale kończy się bez `return`.',
  },
  {
    pattern: /is used uninitialized|is uninitialized when used here/,
    hint: 'Zmienna jest czytana, zanim cokolwiek jej przypisano — jej wartość jest przypadkowa.',
  },
  {
    pattern: /too (few|many) arguments to function( call)?/,
    hint: 'Liczba argumentów w wywołaniu nie zgadza się z deklaracją funkcji.',
  },
  {
    pattern: /size of array .* is too large|region ['`"]?data['`"]? overflowed|will not fit in region ['`"]?data/,
    hint: 'To się nie mieści w pamięci RAM — ATmega32 ma jej 2 kB. Zmniejsz tablicę.',
  },
  {
    pattern: /region ['`"]?text['`"]? overflowed|will not fit in region ['`"]?text/,
    hint: 'Program nie mieści się w pamięci Flash — ATmega32 ma jej 32 kB.',
  },
  {
    pattern: /makes (pointer from integer|integer from pointer)/,
    hint: 'Mieszasz adres ze zwykłą liczbą. Sprawdź, gdzie potrzebne jest `&`, a gdzie `*`.',
  },
  {
    pattern: /unused variable/,
    hint: 'Zmienna zadeklarowana, ale nigdzie nieużyta. Zwykle to literówka albo pozostałość po zmianach.',
  },
]

/** Dopisuje do komunikatu wyjasnienie po polsku, jesli je znamy. */
export function explainCompilerMessage(message: string): string | undefined {
  return EXPLANATIONS.find((item) => item.pattern.test(message))?.hint
}
