<!--
  Kompendium wiedzy do ćwiczeń z ATmega32 — treść zakładki „Kompendium”.

  Warstwa merytoryczna pochodzi ze źródeł projektu (ZASADA #2):
  docs/zrodla-txt/atmega32_datasheet.md, docs/zrodla-txt/hd44780_datasheet.md,
  docs/plytka_zl3avr.md, docs/wymagania_emulacji.md oraz kodów przykładowych.

  Składnia: rozdziały `## Tytuł {#id}` (identyfikator jest adresem odnośników
  z pomocy płytki, podglądu rejestrów i dymków edytora — NIE ZMIENIAĆ bez
  poprawienia odnośników), `###`/`####` śródtytuły, ``` bloki kodu,
  `> ` ramka „zapamiętaj/pułapka”, `{{demo:nazwa}}` animowany pokaz.
  Czyta to mikro-czytnik z guide/readme-section.ts, pilnuje test kompendium.
-->

## Operacje bitowe {#bity}

*Cały kod na mikrokontroler kręci się wokół pojedynczych bitów: jedna dioda,
jeden przycisk, jedno ustawienie w rejestrze to zawsze jeden bit. Te kilka
operatorów wraca w każdym programie, więc warto je oswoić na początku.*

Rejestr to bajt — osiem bitów numerowanych **od 0 (najmłodszy, z prawej) do 7**.
Zapis `0b00000001` to bit 0, `0b10000000` to bit 7. Liczby szesnastkowe czyta
się po pół bajtu: `0xF0` = `0b11110000` (starsza czwórka), `0x0F` = `0b00001111`.

### Maska, czyli „którymi bitami się zajmuję”

Wyrażenie `(1 << n)` przesuwa jedynkę na pozycję `n` i tworzy **maskę** jednego
bitu: `(1 << 3)` = `0b00001000`. Maski można sklejać: `(1 << 0) | (1 << 3)`
= `0b00001001`. Nazwy `PA0`, `PB3` itd. to zwykłe stałe równe numerowi linii,
więc `(1 << PA3)` znaczy dokładnie `(1 << 3)`, tylko czytelniej.

### Cztery ruchy, które załatwiają wszystko

```c
PORTA |= (1 << 3);    // USTAW bit 3, reszty nie ruszaj      (OR)
PORTA &= ~(1 << 3);   // SKASUJ bit 3, reszty nie ruszaj     (AND z negacją)
PORTA ^= (1 << 3);    // PRZEŁĄCZ bit 3 na przeciwny         (XOR)
if (PINA & (1 << 3))  // SPRAWDŹ bit 3: niezerowe = jedynka  (AND)
```

Dlaczego to działa: `|` wstawia jedynki tam, gdzie maska ma jedynki; `&`
zostawia jedynki tylko tam, gdzie mają je obie strony; `~` odwraca maskę
(`~0b00001000` = `0b11110111`), więc `&=` z nią zeruje jeden bit; `^` odwraca
bity wskazane maską.

Przesunięcia służą też do rozbierania i składania liczb: `x >> 4` odsuwa
starszą czwórkę bitów na dół, `(w << 4) | k` skleja dwie czwórki w bajt.

#### Typowe pułapki

- `&` to operator bitowy, `&&` — logiczny. `if (PINA & (1 << 3))` sprawdza bit;
  `if (PINA && (1 << 3))` sprawdza tylko, czy cały rejestr jest niezerowy.
- Kolejność działań: `==` wiąże **mocniej** niż `&`. Zapis
  `if (PINA & MASKA == 0)` liczy najpierw `MASKA == 0` — zawsze pisz
  `if ((PINA & MASKA) == 0)`.
- W rejestrze 8-bitowym nie ma bitu 8: `(1 << 8)` wypada poza rejestr
  i nic nie zmienia. Bity numeruje się od 0 do 7.
- `PORTA = (1 << 3)` **nadpisuje cały rejestr** (bit 3 jedynką, resztę zerami).
  Do zmiany jednego bitu służy `|=` albo `&= ~`.

## Porty wejścia/wyjścia {#porty}

*Port to ośmiopak linii, którymi mikrokontroler dotyka świata. ATmega32 ma
cztery: A, B, C i D. Każdą linią rządzą trzy rejestry — i to od ich zrozumienia
zaczyna się każde ćwiczenie.*

| Rejestr | Rola | Słowami |
|---|---|---|
| `DDRx` | kierunek | 1 = linia jest wyjściem, 0 = wejściem |
| `PORTx` | sterowanie | na wyjściu: 1 = zasilanie, 0 = masa; na wejściu: 1 = włącz rezystor podciągający |
| `PINx` | odczyt | rzeczywisty stan wyprowadzenia — jedyne miejsce, z którego czyta się wejścia |

Po resecie wszystkie te rejestry mają zero: **każda linia jest wejściem bez
podciągania** i „pływa” — czyta przypadkowe wartości i niczego nie wystawia.
Dlatego program zaczyna się od ustawienia kierunków.

```c
DDRA = 0xFF;             // cały port A jako wyjścia
PORTA = 0b00000101;      // linie PA0 i PA2 w stan wysoki

DDRB = 0x00;             // cały port B jako wejścia
PORTB = 0xFF;            // ...z włączonymi rezystorami podciągającymi
if (!(PINB & (1 << PB0))) {
    // przycisk na PB0 wciśnięty (zwiera linię do masy, więc daje 0)
}
```

**Rezystor podciągający (pull-up)** delikatnie „trzyma” wejście przy zasilaniu,
żeby bez sygnału z zewnątrz miało pewną jedynkę. Przycisk czy klawisz zwiera
linię do masy — wciśnięcie czyta się jako **zero**, stąd wykrywanie „na odwrót”
z `!`. Na tej płytce to jedyne podciąganie, jakie masz: ani klawiatura, ani
złącza nie mają własnych rezystorów.

Na płytce ZL3AVR porty wychodzą na złącza szpilkowe: **Port A = JP17,
Port B = JP16, Port C = JP18, Port D = JP19**. Diody (złącze „Diody LED”)
świecą przy **jedynce**, a każda linia obok roli ogólnej ma funkcję specjalną
(np. PD0/PD1 to łącze szeregowe, PB3 to wyjście OC0 licznika).

#### Typowe pułapki

- Zapis do `PORTx` bez ustawienia `DDRx` nie zapali niczego — linie wciąż są
  wejściami, a jedynki włączają tylko podciąganie.
- Stan wejść czyta się z `PINx`. `PORTx` pokazuje to, co program *chciał*
  wystawić, a nie to, co jest na wyprowadzeniu.
- Fabrycznie aktywny fuse **JTAGEN** zabiera linie PC2–PC5 na interfejs JTAG —
  środek portu C „nie działa”, choć kod jest dobry. Wyłącz JTAGEN w oknie
  fuse bitów albo dwukrotnie zapisz bit JTD w MCUCSR.
- W ATmega32 zapis do `PINx` niczego nie przełącza — to funkcja nowszych
  układów. Do przełączania służy `PORTx ^= maska`.

## Zegar i F_CPU {#zegar}

*Najczęstsza zagadka pierwszych zajęć: „opóźnienia trwają nie tyle, ile
napisałem”. Prawie zawsze winne jest to, że w projekcie są DWA zegary —
prawdziwy i deklarowany — i nikt nie pilnuje, żeby się zgadzały.*

Prawdziwe tempo pracy układu ustalają **fuse bity** (CKSEL): fabrycznie
wewnętrzny oscylator RC **1 MHz**, do wyboru też 2, 4 i 8 MHz albo rezonator
zewnętrzny. Na płytce kwarc 16 MHz podłącza się do XTAL dopiero po zwarciu
zworki **JP25** — i po przestawieniu fuse na źródło zewnętrzne.

`#define F_CPU 1000000UL` to tylko **deklaracja dla kompilatora**: na jej
podstawie `_delay_ms()` przelicza milisekundy na pętlę, a programy z USART
liczą prędkość transmisji. Zmiana F_CPU **nie zmienia zegara** — i odwrotnie.

```c
#define F_CPU 1000000UL     // "układ tyka 1 MHz" — musi być NAD includem
#include <util/delay.h>

_delay_ms(500);             // pół sekundy, o ile F_CPU mówi prawdę
```

> **Pułapka:** gdy F_CPU mówi 4 MHz, a fuse zostały na 1 MHz, każde
> `_delay_ms` trwa 4× dłużej, a USART nadaje 4× wolniej i terminal widzi
> śmieci. Emulator ostrzega o tym rozjeździe w edytorze — na prawdziwym
> sprzęcie nikt tego za Ciebie nie zauważy.

#### Typowe pułapki

- `#define F_CPU` musi stać **przed** `#include <util/delay.h>`, inaczej
  nagłówek go nie zobaczy i przyjmie 1 MHz.
- Fuse bity zmienia się w oknie „Fuse bity…” (jak w Microchip Studio:
  Device Programming → Fuses) — nie w kodzie.
- Rozjazd zegara najlepiej widać na diodzie: mruganie „co sekundę” trwające
  cztery sekundy to niemal na pewno F_CPU ≠ fuse.

## Timery (liczniki) {#timery}

*Timer to licznik, który tyka sam, niezależnie od programu. Zamiast wypełniać
czas pustą pętlą `_delay_ms`, mówisz licznikowi „licz takty zegara, a ja
sprawdzę, kiedy doliczysz” — i procesor ma w tym czasie wolne.*

ATmega32 ma trzy liczniki: **TC0** (8-bitowy, liczy 0–255), **TC1**
(16-bitowy, 0–65535) i **TC2** (8-bitowy). Wszystkie trzy dzielą wspólne
rejestry przerwań **TIMSK** i **TIFR** — to znak rozpoznawczy tej rodziny
(w nowszych układach każdy licznik ma własne).

### TC0 — komplet rejestrów

| Rejestr | Rola |
|---|---|
| `TCCR0` | konfiguracja: tryb pracy (WGM01:00), zachowanie wyjścia OC0 (COM01:00), preskaler (CS02:00) |
| `TCNT0` | bieżąca wartość licznika — można ją czytać i nadpisywać |
| `OCR0` | wartość porównania: gdy TCNT0 = OCR0, ustawia się flaga OCF0 |
| `TIMSK` | włączanie przerwań (dla TC0: bity OCIE0 i TOIE0) |
| `TIFR` | flagi zdarzeń (dla TC0: OCF0 — porównanie, TOV0 — przepełnienie) |

**Preskaler** dzieli zegar procesora, żeby licznik tykał wolniej. Bity
CS02:CS00 w TCCR0 wybierają: licznik zatrzymany, zegar bez podziału,
/8, /64, /256, /1024 (albo takty z nóżki T0). Przy 1 MHz i preskalerze 1024
licznik tyka ~976 razy na sekundę.

### Dwa podstawowe tryby

**Normal** — licznik idzie 0…255 i przewraca się na 0, ustawiając flagę
przepełnienia TOV0. Prosty, ale okres jest narzucony (256 taktów licznika).

**CTC** (Clear Timer on Compare) — licznik idzie do wartości `OCR0`,
ustawia flagę OCF0 i wraca do zera. Okres wybierasz sam:

```c
// Flaga OCF0 dokładnie co 1 ms przy F_CPU = 1 MHz:
// 1 000 000 / 8 = 125 000 tyknięć/s; 125 000 / (124+1) = 1000 zdarzeń/s
TCCR0 = (1 << WGM01) | (1 << CS01);   // tryb CTC, preskaler 8
OCR0 = 124;

while (1) {
    while (!(TIFR & (1 << OCF0))) { } // czekaj na doliczenie
    TIFR = (1 << OCF0);               // skasuj flagę ZAPISEM JEDYNKI
    // ...to miejsce odwiedzasz co milisekundę
}
```

A gdy czas jest **za długi nawet dla preskalera 1024** (np. sekunda na
8-bitowym TC0), odlicza się go programowo: licznik robi krótsze zdarzenie —
powiedzmy co 8 ms — a **zmienna globalna** zlicza te zdarzenia do stu
dwudziestu pięciu. Sto dwadzieścia pięć razy po 8 ms to równo sekunda,
a przerwanie pozostaje krótkie.

Takich przeliczeń nie trzeba robić ręcznie: zakładka **Kalkulator timerów**
przyjmuje czas (albo gotowe OCR czy preskaler — cokolwiek podał prowadzący),
pokazuje wszystkie pasujące konfiguracje i składa z wybranej gotową funkcję.
Podział programowy też podpowie sam — dokładnie wtedy, gdy licznik jest
za krótki.

> **Pułapka:** flagi w TIFR kasuje się **zapisem jedynki** na pozycji flagi:
> `TIFR = (1 << OCF0);`. Zapis `TIFR &= ~(1 << OCF0)` nie kasuje niczego —
> w rejestrze flag zero nic nie robi. Ten sam mechanizm dotyczy GIFR.

### TC1 — gdy 255 to za mało

TC1 liczy do 65535 i ma dwa komparatory (OCR1A, OCR1B). W C korzystasz
z niego jak ze zwykłej zmiennej 16-bitowej: `TCNT1 = 0; OCR1A = 12499;` —
avr-libc sam rozkłada zapis na dwa bajty we właściwej kolejności. Tryb CTC
włącza bit WGM12 w `TCCR1B`, preskaler wybierają CS12:CS10 (te same wartości
co w TC0). Przy 1 MHz i preskalerze 64: 15625 tyknięć/s, więc `OCR1A = 15624`
daje zdarzenie równo co sekundę.

#### Typowe pułapki

- `OCR0` i `TCNT0` są 8-bitowe: wartości powyżej 255 się w nich nie mieszczą.
  Dłuższe czasy = większy preskaler albo licznik TC1.
- Rejestry `TIMSK0`, `TCCR0A/B`, `OCR0A` to **inne układy** (np. ATmega328P) —
  kod z internetu z takimi nazwami nie zbuduje się dla ATmega32.
- Zapis do `TCNT0` w biegu może przeskoczyć moment porównania — zwykle
  lepiej pozwolić trybowi CTC zerować licznik samodzielnie.
- Włączenie przerwania licznika (OCIE0/TOIE0) bez procedury ISR restartuje
  program przy pierwszym zdarzeniu — patrz rozdział o przerwaniach.

## Przerwania {#przerwania}

*Przerwanie to „zawołanie” sprzętu: licznik doliczył, znak przyszedł, przycisk
zmienił stan — procesor przerywa główną pętlę, wykonuje krótką procedurę
i wraca, jakby nic się nie stało. Program przestaje sprawdzać wszystko w kółko;
reaguje, kiedy jest na co.*

Żeby przerwanie zadziałało, muszą zgadzać się **trzy rzeczy naraz**:

1. globalne zezwolenie: `sei();` (bit I w rejestrze SREG; `cli()` wyłącza),
2. zezwolenie konkretnego źródła: bit w TIMSK, GICR albo UCSRB,
3. procedura obsługi o **dokładnie właściwej nazwie**: `ISR(NAZWA_vect)`.

```c
#include <avr/interrupt.h>

volatile uint16_t milisekundy = 0;   // zmienna dzielona z przerwaniem

ISR(TIMER1_COMPA_vect) {             // wykonywana co doliczenie TC1
    milisekundy++;
}

int main(void) {
    TCCR1B = (1 << WGM12) | (1 << CS10);  // CTC, bez preskalera
    OCR1A = 999;                          // 1 MHz / (999+1) = co 1 ms
    TIMSK = (1 << OCIE1A);                // odblokuj to jedno przerwanie
    sei();                                // ...i przerwania w ogóle
    while (1) { /* główna pętla ma wolne */ }
}
```

Zmienna używana i w przerwaniu, i w pętli głównej musi być **`volatile`** —
bez tego kompilator ma prawo założyć, że w pętli nic jej nie zmienia,
i czytać ją raz, na zapas.

### Przerwania zewnętrzne INT0, INT1, INT2

To jedyne przerwania „od nóżki”: **INT0 = PD2, INT1 = PD3, INT2 = PB2**.
ATmega32 nie ma przerwań od zmiany stanu dowolnego pinu (PCINT) — tylko te
trzy linie. Co dokładnie je wyzwala, wybierają bity ISC:

| ISC01 | ISC00 | INT0 reaguje na… |
|---|---|---|
| 0 | 0 | niski poziom (ciągle, póki trwa) |
| 0 | 1 | każdą zmianę stanu |
| 1 | 0 | zbocze opadające (1→0) |
| 1 | 1 | zbocze narastające (0→1) |

Bity ISC01:00 i ISC11:10 (dla INT1) mieszkają w **MCUCR**; INT2 ma jeden bit
ISC2 w **MCUCSR** (0 = zbocze opadające, 1 = narastające). Same przerwania
włącza rejestr **GICR** (bity INT0, INT1, INT2), a flagi zgłoszeń leżą w GIFR.

```c
DDRD &= ~(1 << PD2);                 // PD2 jako wejście...
PORTD |= (1 << PD2);                 // ...z podciąganiem (przycisk da zbocze)
MCUCR = (1 << ISC01);                // INT0: zbocze opadające
GICR |= (1 << INT0);
sei();

ISR(INT0_vect) { /* wciśnięto */ }
```

Pin przerwania to zwykły pin: na tej płytce trzeba do niego **doprowadzić
przewód** (np. z linii klawiatury) — bez tego nie ma go czym wyzwolić.

#### Typowe pułapki

- Brak `sei()` = żadne przerwanie się nie wykona, choćby wszystko inne grało.
- **Zła nazwa wektora** (np. `TIMER0_COMPA_vect` z ATmega328P zamiast
  `TIMER0_COMP_vect`) to tylko ostrzeżenie kompilatora: program się zbuduje
  i nigdy nie wejdzie do procedury.
- Bit zezwolenia **bez procedury ISR** = skok w pusty wektor; avr-libc
  zaczyna wtedy program od nowa. Objaw: układ „sam się restartuje”.
- Procedura ISR ma być krótka: ustaw flagę, zlicz, zapamiętaj — a robotę
  zostaw pętli głównej. Długie `_delay_ms` w przerwaniu zamraża resztę.
- Wyzwalanie poziomem (ISC = 00) zgłasza przerwanie **bez przerwy**, póki
  linia siedzi na masie — do przycisków zwykle wybiera się zbocze.

## Klawiatura matrycowa {#klawiatura}

*Szesnaście klawiszy zajęłoby szesnaście linii — cała płytka poszłaby na
przyciski. Matryca 4×4 załatwia to ośmioma: klawisze wiszą na skrzyżowaniach
czterech wierszy i czterech kolumn, a wciśnięcie zwiera jedno skrzyżowanie.*

{{demo:klawiatura}}

Sztuka polega na **skanowaniu**: kolumny sterujesz jako wyjścia, wiersze
czytasz jako wejścia z podciąganiem. W danej chwili tylko jedna kolumna
dostaje stan niski; jeśli któryś wiersz czyta zero, wciśnięty jest klawisz
na przecięciu tej kolumny i tego wiersza.

```c
DDRA = 0xF0;    // PA4..PA7 (kolumny) wyjścia, PA0..PA3 (wiersze) wejścia
PORTA = 0x0F;   // podciąganie na wierszach

for (uint8_t kolumna = 0; kolumna < 4; kolumna++) {
    PORTA = ~(1 << (kolumna + 4));      // jedna kolumna w dół, reszta w górę
    for (uint8_t wiersz = 0; wiersz < 4; wiersz++) {
        if ((PINA & (1 << wiersz)) == 0) {
            // wciśnięty klawisz [wiersz][kolumna]
        }
    }
}
```

Zapis `PORTA = ~(1 << (kolumna + 4))` robi dwie rzeczy naraz: wybraną kolumnę
ściąga do zera, a jedynki na pozostałych bitach podtrzymują podciąganie
wierszy.

Na płytce klawiatura siedzi na złączu **JP23**: piny W1–W4 to wiersze,
K1–K4 to kolumny; klawisze opisane są `1 2 3 A / 4 5 6 B / 7 8 9 C / * 0 # D`.
Matryca **nie ma własnych rezystorów** — podciąganie musi włączyć Twój
program. Zworka **JP3** („mała klawiatura”) upraszcza matrycę do czterech
przycisków na liniach wierszy.

#### Typowe pułapki

- Bez `PORTA = 0x0F` wiersze „pływają” i klawiatura zgłasza przypadkowe
  wciśnięcia. To najczęstsza usterka tego ćwiczenia.
- Styki **drgają**: jedno wciśnięcie potrafi dać serię zer i jedynek przez
  kilka–kilkadziesiąt milisekund. Po wykryciu klawisza odczekaj (np.
  `_delay_ms(20)`) i sprawdź ponownie, albo czekaj na puszczenie.
- Po zmianie kolumny daj sygnałom chwilę (choćby kilka mikrosekund albo
  jeden pusty odczyt) przed czytaniem wierszy.
- Trzymanie klawisza to nie szesnaście wciśnięć — reaguj na **zmianę** stanu,
  nie na sam stan.

## Wyświetlacz 7-segmentowy {#wyswietlacz-7seg}

*Cztery cyfry po siedem segmentów (plus kropka) to 32 diody — a złącze ma
tylko 12 linii: 8 na kształt znaku i 4 na wybór cyfry. Trik polega na tym, że
w danej chwili świeci TYLKO JEDNA cyfra, a oko tego nie zauważa.*

{{demo:wyswietlacz-7seg}}

Wyświetlacze na tej płytce mają **wspólną anodę**, więc logika jest odwrócona:
**zero zapala**. Segment świeci, gdy jego linia (złącze „Cyfra (segmenty)”,
piny a…g i dp) ma stan niski; cyfrę uaktywnia stan niski na jej linii wyboru
(złącze „Kolumna (wybór cyfry)”, C1…C4, przez tranzystory PNP) — w danej
chwili tylko jednej.

Przy taśmie poprowadzonej prosto (PB0→a, PB1→b, … PB7→dp) wzory cyfr
wyglądają tak — zero na pozycjach segmentów, które mają świecić:

```c
const uint8_t CYFRY[10] = {
    0xC0, 0xF9, 0xA4, 0xB0, 0x99,   // 0 1 2 3 4
    0x92, 0x82, 0xF8, 0x80, 0x90,   // 5 6 7 8 9
};
```

**Multipleksowanie** to pętla: zgaś wszystko → wystaw wzór cyfry → włącz jej
kolumnę → odczekaj chwilę → następna cyfra. Gdy pełny obieg trwa krócej niż
około 1/50 sekundy, bezwładność oka skleja to w stabilny obraz.

```c
for (uint8_t cyfra = 0; cyfra < 4; cyfra++) {
    PORTA = 0x0F;                  // wszystkie kolumny nieaktywne (jedynki)
    PORTB = CYFRY[wartosc[cyfra]]; // wzór segmentów dla tej cyfry
    PORTA = ~(1 << cyfra) & 0x0F;  // aktywuj jedną kolumnę (zero)
    _delay_ms(2);
}
```

#### Typowe pułapki

- Zapominasz o odwróconej logice: `0xFF` gasi wszystko, `0x00` zapala
  wszystkie segmenty. Wzór „na odwrót” daje negatyw cyfry.
- **Ghosting (duchy):** jeśli zmienisz wzór segmentów, zanim wyłączysz starą
  kolumnę, poprzednia cyfra na ułamek chwili dostaje cudzy wzór i obok znaków
  pojawia się cień. Kolejność: najpierw zgaś kolumny, potem zmieniaj segmenty.
- Za wolny obieg (dłużej niż ~20 ms na pełną czwórkę) = widoczne miganie;
  zbyt długie `_delay_ms` w pętli głównej zatrzymuje odświeżanie.
- Wszystkie cztery cyfry dzielą te same linie segmentów — nie da się
  „zostawić” jednej zapalonej i zająć się resztą.

## Wyświetlacz LCD (HD44780) {#lcd}

*Wyświetlacz znakowy 2×16 ma własny sterownik HD44780: Ty wysyłasz mu bajty —
komendy albo znaki — a on sam rysuje piksele i pamięta treść. Cała obsługa to
umiejętność podania bajtu w rytmie, który sterownik rozumie.*

{{demo:lcd}}

Na płytce używa się wygodnego złącza **„LCD 4bit”**: linie RS, E i D4–D7.
W trybie 4-bitowym każdy bajt jedzie w **dwóch połówkach** (najpierw starsza).
Znaczenie linii:

- **RS** — 0: bajt jest komendą, 1: bajt jest znakiem do wyświetlenia,
- **E** — impuls zegarowy: wystaw dane, podnieś E, opuść — sterownik łapie
  dane przy **opadaniu** E,
- **R/W** — na tej płytce przylutowane do masy: **tylko zapis**. Nie ma jak
  odczytać flagi zajętości, więc po każdej operacji trzeba odczekać.

### Najważniejsze komendy

| Bajt | Działanie | Czas |
|---|---|---|
| `0x01` | wyczyść ekran i wróć na początek | ~1,6 ms |
| `0x02` | kursor na początek (treść zostaje) | ~1,6 ms |
| `0x06` | tryb wpisywania: kursor idzie w prawo | ~40 µs |
| `0x0C` | włącz wyświetlanie (bez kursora); `0x0E` z kursorem | ~40 µs |
| `0x28` | tryb 4-bitowy, 2 linie, znak 5×8 | ~40 µs |
| `0x80 + adres` | ustaw kursor na adresie DDRAM | ~40 µs |

Pamięć treści (**DDRAM**) ma po 40 komórek na linię, a widać 16:
**pierwsza linia zaczyna się od adresu `0x00`, druga od `0x40`**. Druga linia
NIE jest ciągiem dalszym pierwszej — po 16. znaku kursor wchodzi w niewidoczną
część, nie do drugiej linii. Drugi wiersz: `komenda(0x80 + 0x40)`.

**Znaki własne:** w pamięci CGRAM jest miejsce na 8 znaków (kody 0–7). Komenda
`0x40 + 8·kod` ustawia zapis do wzorca; wysyłasz 8 bajtów — po jednym wierszu
pikseli (5 młodszych bitów) — i znak wyświetlasz jak każdy inny: `dana(kod)`.

### Uruchomienie w trybie 4-bitowym

Po włączeniu zasilania sterownik nie wie, ile linii danych podłączono,
więc sekwencja startowa jest sztywna (z datasheeta HD44780):

1. odczekaj >15 ms od włączenia zasilania,
2. wyślij samą połówkę `0011` — trzy razy: po pierwszej odczekaj >4,1 ms,
   po drugiej >100 µs,
3. wyślij połówkę `0010` — od tej chwili obowiązuje tryb 4-bitowy,
4. teraz pełne komendy: `0x28`, `0x08` (wyłącz), `0x01` (wyczyść),
   `0x06`, `0x0C`.

#### Typowe pułapki

- Za krótkie opóźnienia po `0x01`/`0x02` (potrzebują ~1,6 ms, reszta ~40 µs) —
  wyświetlacz gubi komendy i pokazuje przypadkowe znaki.
- Tekst „znika” po 16 znakach: kursor wszedł w niewidoczną część linii.
  Druga linia to adres `0x40`, nie „dalej”.
- Pomylona kolejność połówek bajtu (najpierw MŁODSZA zamiast starszej) —
  na ekranie krzaczki, choć program wygląda dobrze.
- RS ustawione odwrotnie: komendy lądują jako znaki (dziwne symbole na
  ekranie) albo znaki jako komendy (kursor skacze, ekran się czyści).

## USART — łącze szeregowe {#usart}

*USART wysyła bajty jednym przewodem, bit po bicie, w umówionym rytmie.
Po drugiej stronie kabla siedzi komputer z terminalem — i to jest najprostszy
sposób, żeby program „mówił” pełnymi zdaniami i słuchał klawiatury PC.*

Obie strony muszą się umówić na **prędkość** (bity na sekundę, np. 9600)
i **ramkę** — najczęściej 8N1: bit startu, 8 bitów danych, bez parzystości,
1 bit stopu. Prędkość po stronie ATmega32 ustawia rejestr UBRR:

**UBRR = F_CPU / 16 / prędkość − 1** — dla 4 MHz i 9600 bodów: UBRR = 25.

| Rejestr | Rola |
|---|---|
| `UDR` | okienko danych: zapis = wyślij bajt, odczyt = odbierz bajt |
| `UCSRA` | flagi stanu: RXC (odebrano), TXC (wysłano), UDRE (bufor pusty) |
| `UCSRB` | włączniki: RXEN (odbiornik), TXEN (nadajnik), RXCIE (przerwanie odbioru) |
| `UCSRC` | kształt ramki: UCSZ1:0 (liczba bitów), USBS (bity stopu) — zapis wymaga URSEL! |
| `UBRRH/UBRRL` | prędkość transmisji (starszy/młodszy bajt) |

```c
#define F_CPU 4000000UL
#define BAUD 9600

void usart_init(void) {
    UBRRH = 0;
    UBRRL = F_CPU / 16 / BAUD - 1;                  // 25 przy 4 MHz
    UCSRB = (1 << RXEN) | (1 << TXEN);              // włącz odbiór i nadawanie
    UCSRC = (1 << URSEL) | (1 << UCSZ1) | (1 << UCSZ0); // ramka 8N1
}

void wyslij(char znak) {
    while (!(UCSRA & (1 << UDRE))) { }  // czekaj, aż bufor będzie wolny
    UDR = znak;
}

char odbierz(void) {
    while (!(UCSRA & (1 << RXC))) { }   // czekaj na znak
    return UDR;
}
```

> **Pułapka nr 1 tego układu — URSEL.** Rejestry UCSRC i UBRRH dzielą jeden
> adres. Zapis do UCSRC **musi** mieć ustawiony najstarszy bit URSEL — bez
> niego bajt trafia do UBRRH i psuje prędkość transmisji. To cecha ATmega32,
> w nowszych układach ten bit nie istnieje.

Na płytce ZL3AVR tor szeregowy **nie wymaga przewodów**: PD0 (RXD) i PD1 (TXD)
biegną ścieżkami przez konwerter MAX232 do gniazda DB9. Jest jeden haczyk:
linia odbioru dochodzi do PD0 tylko przy **zwartej zworce JP4** („RxD Enable”).

#### Typowe pułapki

- Rozwarta **JP4**: nadawanie działa, odbiór milczy — program „nie słyszy”
  żadnego znaku.
- UBRR policzone z F_CPU, które nie zgadza się z fuse: obie strony tykają
  w innym rytmie i terminal pokazuje śmieci. Ćwiczenia z USART przestawiają
  fuse na 4 MHz.
- Prędkość w terminalu musi być tą samą liczbą, którą podstawiono do wzoru
  na UBRR — 9600 po jednej i 4800 po drugiej stronie to też śmieci.
- Odczyt `UDR` bez sprawdzenia RXC zwraca stare dane; zapis bez UDRE
  potrafi zgubić znak. Flagi z UCSRA są częścią protokołu, nie ozdobą.
