# ZL3AVR Emulator — wirtualny zestaw z mikrokontrolerem ATmega32

> ## Kto to napisał, na czym się opiera i czego tu nie ma
>
> ### Autorstwo i charakter
>
> Narzędzie powstało jako **praca własna studenta Politechniki Lubelskiej**
> (Wydział Elektrotechniki i Informatyki), przy okazji zajęć „Technika mikroprocesorowa"
> i „Systemy wbudowane". **Nie jest oficjalnym oprogramowaniem uczelni**, nie powstało
> na niczyje zlecenie i nie jest w żaden sposób przez nią firmowane.
>
> Projekt jest **wyłącznie edukacyjny i niezarobkowy** — pomoc dydaktyczna pozwalająca
> wykonać ćwiczenia laboratoryjne bez dostępu do fizycznego sprzętu. Nie jest produktem
> komercyjnym, nie jest sprzedawany i nie służy do zarabiania.
>
> ### Dołączone przykłady kodu — skąd pochodzą
>
> Programy w `apps/web/src/examples/src/` i skrypt „komputera PC" to **rozwiązania zadań
> laboratoryjnych napisane przez autora**. Pisane były jednak według instrukcji
> prowadzących zajęcia i **często na dostarczonych przez nich szkieletach** — pliki
> z komentarzami w rodzaju „TODO do zmiany" to właśnie takie szablony do uzupełnienia.
>
> Trzeba więc powiedzieć wprost: **fragmenty tych plików mogą pochodzić od prowadzących**,
> a prawa do nich należą do ich autorów i do uczelni. To samo dotyczy samego doboru
> i układu ćwiczeń, formatu ramek czy przyjętych nazw sygnałów.
>
> Znalazły się tu tylko dlatego, że bez nich narzędzie nie ma czego pokazać — emulator
> płytki, na której nie da się niczego uruchomić, jest bezużyteczny. Zakres jest możliwie
> wąski: kilkanaście krótkich plików potrzebnych do zademonstrowania peryferiów,
> pozbawionych danych osobowych.
>
> ### Sprzęt i dokumentacja producentów
>
> Opis sprzętu opiera się na dokumentacji: zestawu **ZL3AVR** (BTC Korporacja / Kamami),
> mikrokontrolera **ATmega32** (Atmel/Microchip) oraz sterownika wyświetlacza
> **HD44780** (Hitachi). Wszystkie znaki towarowe należą do ich właścicieli;
> użyto ich wyłącznie w celu wskazania, jaki sprzęt jest odwzorowywany.
>
> ### Czego w tym repozytorium nie ma i nie będzie
>
> - **skanów instrukcji laboratoryjnych** i sylabusa przedmiotu — ani w oryginale,
>   ani przepisanych na tekst,
> - **dokumentacji producentów** płytki i układów — w żadnej postaci,
> - **danych osobowych** — z kodu, dokumentacji i komunikatów interfejsu usunięto imiona,
>   nazwiska, numery albumów i adresy e-mail, zarówno autora, jak i prowadzących.
>
> Materiały te są cudzą własnością w całości, więc **nie są redystrybuowane** — leżą
> wyłącznie na komputerze autora i nie są częścią tego repozytorium. Narzędzie ich nie
> zastępuje i nie pozwala ich odtworzyć: kto chce przejść zajęcia, nadal potrzebuje
> instrukcji od prowadzącego.
>
> ### Zastrzeżenie i zgłoszenia
>
> Intencją autora jest korzystanie z cudzego dorobku **wyłącznie w zakresie niezbędnym
> do celów dydaktycznych i niezarobkowych**, z podaniem źródła i bez publikowania samych
> materiałów źródłowych.
>
> Jeżeli mimo to ktokolwiek uprawniony — prowadzący zajęcia, uczelnia albo producent
> sprzętu — uzna, że cokolwiek w tym repozytorium narusza jego prawa albo że coś nie
> powinno być tu publikowane, **wystarczy zgłoszenie (np. przez „Issues" w repozytorium).
> Sporny materiał zostanie niezwłocznie usunięty**, bez dyskusji i bez konieczności
> uzasadniania.

---

## Czym jest projekt

Emulator zestawu ewaluacyjnego **BTC/Kamami ZL3AVR z mikrokontrolerem ATmega32** — w duchu
SimulIDE / Wokwi, ale **wierny konkretnej płytce**. Ta sama płytka służy dwóm przedmiotom
na Politechnice Lubelskiej (Wydz. Elektrotechniki i Informatyki): „Technika mikroprocesorowa"
i „Systemy wbudowane" — emulator obsługuje ćwiczenia z obu.

Student uruchamia u siebie kompletne środowisko laboratoryjne: IDE + kompilator C + wirtualna
płytka + **ręczne łączenie kabli** + programator + fuse bity + terminal RS232 + "komputer PC"
ze skryptem Pythona. Wykonuje 100% zadań z instrukcji L1–L9 bez fizycznego sprzętu.

Płytka ma zachowywać się jak prawdziwa również wtedy, gdy zachowuje się niewygodnie.
Odwzorowane są typowe pułapki, na których traci się godziny: `F_CPU` rozjechane z zegarem
z fuse bitów, fuse JTAGEN zabierający linie portu C, brak `URSEL` przy zapisie `UCSRC`,
rozwarta zworka JP4 blokująca odbiór, „duchy" na wyświetlaczu przy złej kolejności
multipleksowania, kasowanie flagi przerwania zapisem jedynki.

## Dla kogo jest to narzędzie

**Główny odbiorca: student, który widzi mikrokontroler pierwszy raz w życiu.**
Nie zna słowa „port", nie wie, czym różni się wejście od wyjścia, nie domyśli się, co znaczy
„pull-up", i nie odnajdzie się w liczącym kilkaset stron datasheecie. Wszystko, co pokazuje
interfejs, musi być dla niego zrozumiałe bez dodatkowego tłumacza.

**Odbiorcy dodatkowi:**

- *Prowadzący zajęcia* — pokaz działania peryferiów bez rozdawania sprzętu, przygotowanie
  i sprawdzenie zadań, demonstracja pułapek na żywo.
- *Osoba wracająca do AVR po latach* — szybkie przypomnienie mapy rejestrów i zachowania płytki.
- *Ktoś, kto ma płytkę, ale nie ma jej pod ręką* — praca nad kodem w domu.

Narzędzie nie należy do jednego kursu. Konkretne ćwiczenia pojawiają się w opisach
wyłącznie jako oznaczone przykłady — nigdy jako definicja tego, do czego dany element służy.

## Kluczowe funkcjonalności

**Wierna symulacja ATmega32**
- pełny zestaw instrukcji AVR8 z dokładnym zliczaniem taktów zegara
- porty z modelem elektrycznym wyprowadzenia: pull-upy, linie pływające, konflikt wysterowań
- liczniki TC0, TC1 (16-bitowy) i TC2 we wszystkich trybach, 21 wektorów przerwań
- transmisja szeregowa modelowana **na poziomie bitów**, nie kolejki bajtów
- fuse bity wyznaczające **rzeczywistą** częstotliwość taktowania
- wgrywanie programu z pliku Intel HEX

**Płytka ZL3AVR odwzorowana z dokumentacji producenta**
- rozmieszczenie elementów i proporcje wzięte z rysunków w dokumentacji producenta
- przewody prowadzone **dwoma kliknięciami**: kliknięcie szpilki podnosi żyłę, kliknięcie
  drugiej — łączy; między kliknięciami można przybliżać i przesuwać rysunek
  (przeciągnięcie z pinu na pin też działa)
- z przewodem w ręku **płytka się przygasza**, wolne szpilki dostają obrączki, a nad
  rysunkiem stoi pasek z informacją, skąd żyła wychodzi; **Escape** albo kliknięcie
  w tło odkłada przewód
- zbliżenie do drugiej szpilki pokazuje **dokładnie tę żyłę, która powstanie** — podgląd
  i gotowe połączenie liczy ta sama funkcja, więc nie mogą się różnić
- kształt każdej żyły jest **wyliczany, nie symulowany**: ten sam układ połączeń wygląda
  zawsze identycznie, a warstwa przewodów nie zużywa mocy, gdy nic się nie dzieje —
  działa płynnie także na starszych komputerach
- świeżo połączona żyła **dorysowuje się od szpilki do szpilki** — widać, że wtyk wszedł
  dokładnie tam, gdzie pokazywał podgląd
- przyciąganie do najbliższego pinu wybacza niecelne kliknięcie; próba połączenia już
  połączonych szpilek **mówi o tym wprost** — bez tego wyglądałaby identycznie
  jak „nic się nie stało"
- **wiązka przewodów**: Shift + zaznaczenie prostokątne podnosi kilka szpilek naraz,
  a jedno kliknięcie wpina je w kolejne linie złącza — jak taśmę wielożyłową
- ikona **„?”** przy płytce z podręczną ściągą i krótkim **animowanym pokazem** łączenia
- zworki JP3, JP4, JP25 klikane jak na sprzęcie; JP27 zajęte na stałe przez osadzony wyświetlacz
- peryferia: 8 diod, klawiatura 4×4, cztery cyfry 7-segmentowe z multipleksem i „duchem",
  wyświetlacz alfanumeryczny 2×16 z pamięcią własnych znaków
- przewody, zworki i fuse bity ćwiczenia wczytuje **jedno polecenie** razem z kodem
  („Gotowe przykłady" w pasku głównym) — patrz „Poradnik” niżej
- najechanie na przewód **przygasza pozostałe**, obrysowuje jego oba końce i wypisuje przy
  kursorze, co z czym łączy; pole trafienia żyły ma szerokość samego przewodu, więc reaguje
  ta, nad którą naprawdę stoi kursor
- klawiatura matrycowa sterowana **klawiaturą komputera** (1–9, 0, A–D, * i #) — bez tego
  nie da się przytrzymać klawisza wystarczająco długo, żeby program zauważył go przy skanowaniu
- **pomoc kontekstowa**: najechanie obrysowuje element i pokazuje krótką podpowiedź,
  kliknięcie przypina pełny opis — czym to jest, jak się tego używa i na co uważać.
  Panel obok płytki pokazuje **wyłącznie to** — instrukcja obsługi jest w rozdziale „Poradnik”
- elementy, których typowe ćwiczenia nie używają, są **wyraźnie oznaczone** — ciekawy
  przeczyta, a ktoś, kto ma zadanie do zrobienia, wie, że może przejść dalej
- zakładka **README** z poradnikiem obsługi, bez wychodzenia z aplikacji
- **poruszanie się po rysunku jak po mapie**: kółko myszy przybliża dokładnie tam, gdzie
  stoi kursor (100–600%), przeciągnięcie płytki przesuwa obraz, dwuklik przybliża,
  a przycisk „cała płytka” wraca do widoku ogólnego
- po przybliżeniu w rogu pojawia się **mapka całej płytki** z zaznaczonym wycinkiem —
  kliknięcie w nią przenosi widok; przycisk „pokaż na płytce” w opisie elementu dojeżdża
  do niego sam
- najechanie na **pojedynczy pin** mówi, która to linia mikrokontrolera, jaką ma funkcję
  dodatkową i **jaki stan jest na niej w tej chwili** (wysoki, niski, pływający)
- **cofanie zmian w połączeniach** — wypięcie żyły, wyczyszczenie płytki i wczytanie
  gotowego zestawu da się odwołać jednym przyciskiem

**Kompilacja i wgrywanie programu**
- **kompilator działa w samej przeglądarce** — clang, lld i llvm-objcopy zbudowane do
  WebAssembly, z prawdziwymi bibliotekami avr-libc. Nie trzeba nic instalować ani
  uruchamiać: wystarczy otworzyć stronę. Budowanie przykładu zajmuje ułamek sekundy
- jeśli obok chodzi lokalny serwer z **prawdziwym avr-gcc**, narzędzie wybiera jego —
  to ten sam kompilator co w Microchip Studio. Pasek stanu mówi, który pracuje
- „Zbuduj i wgraj" kompiluje projekt i od razu programuje mikrokontroler
- kompilacja i programowanie są jednym poleceniem — rozdzielenie ich to najczęstsze źródło
  pomyłki „poprawiłem kod, ale płytka robi stare rzeczy"
- komunikaty kompilatora trafiają do listy problemów przy właściwych liniach —
  **ze wszystkich plików projektu**, z nazwą pliku i skokiem do miejsca błędu
- każdy znany komunikat avr-gcc dostaje **wyjaśnienie po polsku**: co to naprawdę znaczy
  i od czego zacząć szukanie (np. „called object is not a function” to zwykle brakujący
  średnik linię wyżej)
- pasek stanu mówi, w którym pliku i w której linii jest pierwszy błąd, i prowadzi
  do listy problemów jednym kliknięciem
- podgląd zajętości pamięci programu i RAM
- można też wgrać gotowy plik `.hex` zbudowany gdzie indziej albo jeden z przykładów

**Pusty projekt na start** — osobny przycisk w pasku u góry. Nie jest kolejnym ćwiczeniem
do oglądania, tylko czystą kartką: w edytorze zostaje sam szkielet programu, przewody łączą
port A z linijką diod, a wszystkie osiem diod zapala się od razu. Dzięki temu jeszcze przed
napisaniem pierwszej linii widać, że połączenia działają.

**Dwanaście gotowych przykładów** pogrupowanych według przedmiotu
- osiem z „Techniki mikroprocesorowej": diody, klawiatura, wyświetlacz 7-segmentowy,
  timery, przerwania, USART, ramki binarne, wyświetlacz tekstowy
- cztery z „Systemów wbudowanych": sterownik klawiatury
  z portem wybieranym parametrem, wyświetlacz sterowany wskaźnikami do rejestrów,
  własne znaki CGRAM przy nietypowym podłączeniu, USART i licznik pracujące jednocześnie
- wczytanie przykładu ustawia **wszystko naraz i w jednym miejscu**: kod źródłowy
  w edytorze, gotowy program w mikrokontrolerze, przewody na płytce i fuse bity —
  po ostrzeżeniu, że zastąpi to bieżący projekt

**Edytor kodu**
- podświetlanie składni C, skróty jak w typowym IDE, wielokrotny kursor, szukanie i zamiana
- **nazwy rejestrów i bitów mają własne kolory** (rejestry inne niż bity), a typy
  `uint8_t`/`uint16_t` podświetlają się jak słowa kluczowe; na liście podpowiedzi rejestry
  i bity są oznaczone literami **R** i **B**
- dymek rejestru czy bitu prowadzi **wprost do właściwego rozdziału Kompendium** —
  teoria jest o jedno kliknięcie od kodu
- zarządzanie plikami: tworzenie z szablonem, zmiana nazwy, usuwanie, wczytywanie z dysku,
  pobieranie pojedynczo i całego projektu jako archiwum ZIP
- projekt zapamiętywany między sesjami w przeglądarce
- podpowiedzi: rejestry, bity, makra, wektory przerwań, gotowe fragmenty kodu oraz funkcje
  i zmienne **z całego projektu** — także z innych plików, z nazwą pliku i numerem linii
- dymki z opisem symbolu: czym jest, skąd pochodzi, przykład użycia, pułapka
- dymek dostaje też **argument funkcji** — mówi, do której funkcji należy i czym w ogóle
  jest argument; wcześniej najechanie na niego nie pokazywało niczego
- **przejście do definicji** własnej funkcji, zmiennej albo stałej: Ctrl + kliknięcie
  przenosi do miejsca, w którym ją zadeklarowano, **także w innym pliku projektu**,
  a przycisk „← wróć" (Alt + ←) wraca tam, skąd nastąpił skok
- przełącznik **„Bez komentarzy"** pokazuje ten sam kod bez komentarzy, z przyciskiem
  kopiowania — do przeniesienia do Microchip Studio albo do sprawozdania. Plik zostaje
  nietknięty, a podgląd jest tylko do odczytu, więc nie da się przez pomyłkę skasować opisów

**Analiza kodu w trzech warstwach** (unikatowa część narzędzia)
- *C* — niedomknięte nawiasy, brak średnika, przypisanie zamiast porównania, pusta instrukcja po `if`
- *AVR* — rejestry z innego układu wraz z odpowiednikiem, **nazwy przerwań z innego układu**
  (`TIMER0_COMPA_vect` zamiast `TIMER0_COMP_vect` — kompilator tylko ostrzega, a program
  po prostu nigdy w nie nie wchodzi), kasowanie flagi przez zerowanie bitu,
  `UCSRC` bez `URSEL`, zapis do `PORTx` bez `DDRx`, odczyt wejść z `PORTx` zamiast `PINx`,
  brakujące nagłówki (w tym `PROGMEM` bez `avr/pgmspace.h`), przerwanie bez `sei()`,
  wartość i numer bitu poza zakresem rejestru 8-bitowego, `%f` w `printf`
  (avr-libc drukuje wtedy „?”), **bit włączający przerwanie bez procedury ISR**
  (program restartuje się przy pierwszym przerwaniu — jeden z najtrudniejszych błędów
  do zauważenia), procedura ISR, której nikt nie włącza, oraz `main` bez żadnej pętli
  (program wykona się raz i stanie)
- *Płytka* — ostrzeżenia zależne od **aktualnego stanu sprzętu**: rozjazd `F_CPU` z zegarem
  z fuse bitów, sterowanie portem C przy włączonym JTAGEN, odbiór przez USART przy rozwartej
  zworce JP4, odczyt wejść bez pull-upów oraz **brakujące przewody** — „program używa portu B,
  a ze złącza tego portu nie wychodzi żadna żyła; podłączony jest za to port D → Diody LED".
  Także **pin przerwania zewnętrznego**: kod z `INT0` w ogóle nie wymienia portu D,
  a analiza i tak powie, że z linii PD2 nie wychodzi żaden przewód.
  **Tego nie zrobi żaden kompilator**, bo nie wie, jak ustawiona jest płytka
- analiza obejmuje **wszystkie pliki projektu naraz** — ostrzeżenie o brakującym przewodzie
  pojawia się także wtedy, gdy port ustawia sterownik w innym pliku niż otwarty;
  lista problemów podpisuje każdy wpis nazwą pliku

**Podgląd wnętrza mikrokontrolera**
- rejestry rozłożone na **nazwane bity**, nie na ciąg zer i jedynek
- opis każdego rejestru i każdego bitu po najechaniu
- krokowanie po jednej instrukcji, licznik taktów i czasu, regulacja tempa symulacji

**Kalkulator timerów** — zakładka, która przelicza polecenie „mrugaj co 100 ms"
na wartości rejestrów licznika
- wpisujesz to, co znasz — czas (albo częstotliwość), tryb, preskaler lub gotowe OCR —
  a kalkulator pokazuje **wszystkie pasujące konfiguracje** z osiągniętym czasem i błędem
- działa w obie strony: z czasu wylicza rejestry, z wpisanego OCR/TCNT wylicza czas
- gdy czas nie mieści się w wybranym liczniku, mówi o tym wprost i **podpowiada licznik,
  który trafi** (klasyka: 100 ms nie mieści się w 8-bitowym TC0, ale TC1 trafia co do taktu)
- na czas za długi dla samego licznika pokazuje **odliczanie programowe**: krótsze zdarzenie
  bazowe plus zmienna globalna zliczająca powtórzenia (np. sekunda na TC0 przy ÷256
  to 125 zdarzeń po 8 ms) — razem z gotowym kodem; ta podpowiedź pojawia się **tylko**
  wtedy, gdy licznik naprawdę jest za krótki
- znaną wartość rejestru podaje się jawnie: **lista wyboru** (OCR czy startowe TCNT)
  plus pole liczby — bez zgadywania, co kalkulator zrozumie
- kliknięcie wiersza daje **gotową funkcję do wklejenia** — w wersji z pętlą sprawdzającą
  flagę albo z przerwaniem, z komentarzami albo bez (pole wyboru)
- częstotliwość zegara podpowiada się **z fuse bitów płytki**, ikona „?" pokazuje krótką
  ściągę z animowanym wykresem trybu CTC

**Kompendium wiedzy** — teoria do ćwiczeń w dziewięciu rozdziałach: operacje bitowe,
porty, zegar i F_CPU, timery, przerwania, klawiatura matrycowa, wyświetlacz 7-segmentowy,
LCD (HD44780) i USART
- krótkie rozdziały z przykładami kodu, tabelami rejestrów i sekcją **typowych pułapek**
- klawiatura, wyświetlacz 7-segmentowy i LCD mają **animowane pokazy** (skanowanie matrycy,
  multipleks ze zwolnionym tempem, wpisywanie znaków z przeskokiem do drugiej linii)
- pomoc na płytce, podgląd rejestrów i dymki edytora **linkują do właściwych rozdziałów**
  zamiast powtarzać tę samą wiedzę w trzech miejscach
- warstwa merytoryczna pochodzi z kart katalogowych ATmega32 i HD44780 oraz dokumentacji
  płytki — każdą wartość można sprawdzić u źródła

**Terminal szeregowy**
- odpowiednik terminala na komputerze, z **własną** prędkością transmisji
- da się go **zadokować pod płytką** (przycisk „Pokaż terminal USART") — wtedy widać naraz
  klawiaturę, diody i to, co idzie łączem; otwiera się sam, gdy płytka pierwszy raz coś nada
- pasek pokazujący obok siebie prędkość mikrokontrolera i terminala oraz wyjaśniający rozjazd
- tryb szesnastkowy do podglądu ramek binarnych

**Komputer PC ze skryptem w Pythonie** *(używane w ćwiczeniu L7 — ramki binarne)*
- osobna zakładka: komputer stojący obok płytki, połączony z nią kablem szeregowym
- oznaczona wprost, przy którym ćwiczeniu się przydaje — przy pozostałych zadaniach
  jest po prostu niepotrzebna i nie ma sprawiać wrażenia zepsutej
- skrypt studenta chodzi w **prawdziwym CPythonie** (Pyodide) i **bez żadnych zmian** —
  z blokującym `input()`, blokującym `serial.read()` i pętlą `while True`
- podstawione moduły `serial` i `hexdump` obejmują dokładnie to, czego używają ćwiczenia
- odebrana ramka rozkłada się na pola, a odpowiedź wraca do płytki tym samym kablem

**Praca się nie gubi**
- przewody, zworki, fuse bity i wgrany program **przeżywają odświeżenie strony**
- przycisk **„Udostępnij"** zapisuje cały stan w adresie: kod, połączenia i fuse bity.
  Prowadzący otwiera dokładnie tę płytkę, którą widzi student — „u mnie nie działa"
  przestaje być rozmową w ciemno. Nietknięte gotowe ćwiczenie mieści się
  w kilkunastu znakach (`…#p=lab3`)

**Okno fuse bitów** wzorowane na „Device Programming → Fuses" z Microchip Studio,
z ostrzeżeniami o skutkach wybranych ustawień.

## Poradnik — jak używać narzędzia

*Ta sekcja jest dla osoby, która właśnie uruchomiła program. W aplikacji ten sam tekst
jest w zakładce **README** — czytany wprost z tego pliku, więc nie ma dwóch wersji.*

### Co to w ogóle jest

To **wirtualna płytka ZL3AVR z mikrokontrolerem ATmega32** — ta sama, która stoi
w laboratorium. Piszesz w niej program w języku C, wgrywasz go do mikrokontrolera
i oglądasz efekt: zapalone diody, cyfry na wyświetlaczu, napisy na ekranie, znaki
w terminalu. Nie potrzebujesz żadnego sprzętu ani instalowania Microchip Studio.

Płytka zachowuje się jak prawdziwa. Znaczy to również, że **da się ją podłączyć źle**
i wtedy nie zadziała — dokładnie tak samo jak na zajęciach. To nie jest usterka
narzędzia, tylko sedno ćwiczenia.

Program ma siedem zakładek (plus ten poradnik):

| Zakładka | Do czego służy |
|---|---|
| **IDE** | pisanie kodu, pliki projektu, lista problemów z wyjaśnieniami |
| **Płytka** | wirtualny zestaw: przewody, zworki, diody, wyświetlacze, klawiatura |
| **Symulator** | podgląd wnętrza układu: rejestry rozłożone na nazwane bity, krokowanie |
| **Terminal USART** | odpowiednik terminala na komputerze podłączonym kablem szeregowym |
| **Komputer PC** | skrypt w Pythonie po drugiej stronie tego kabla (potrzebny w L7) |
| **Kalkulator timerów** | przelicza „mrugaj co 100 ms" na wartości rejestrów licznika — i z powrotem |
| **Kompendium** | teoria do ćwiczeń: porty, timery, przerwania, wyświetlacze, klawiatura, USART |

### Od czego zacząć

1. W górnym pasku wybierz coś z listy **„Gotowe przykłady"**. Wczytanie przykładu
   ustawia **wszystko naraz**: kod źródłowy w edytorze, gotowy program w mikrokontrolerze,
   przewody na płytce oraz fuse bity (czyli zegar). To jedyne miejsce, w którym wczytuje
   się ćwiczenie — dzięki temu kod i połączenia zawsze do siebie pasują.
   Jeśli wolisz zacząć od siebie, naciśnij **„Pusty projekt"** obok tej listy: dostaniesz
   czystą kartkę z portem A połączonym z diodami i wszystkimi ośmioma zapalonymi.
2. Przejdź na zakładkę **Płytka** i zobacz, co się dzieje.
3. Zmień coś w kodzie i naciśnij **„Zbuduj i wgraj" (F7)**. Kompilacja i wgranie programu
   są jednym poleceniem — nie da się przez pomyłkę oglądać starego programu.

Jeśli nic się nie dzieje, sprawdź po kolei trzy rzeczy: czy **zasilanie jest włączone**
(przycisk po prawej w górnym pasku), czy program w ogóle został wgrany, i czy w zakładce
IDE nie czeka lista problemów z czerwonym licznikiem błędów.

### Pisanie kodu w edytorze

Zakładka **IDE** to nie samo pole tekstowe — sporo rzeczy odpowiada tam na pytania,
zamiast kazać ich szukać w liczącym kilkaset stron datasheecie.

- **Najedź kursorem na nazwę**, a dostaniesz opis. Rejestr albo bit (`UCSRC`, `OCIE1A`) —
  czym jest, po co się go używa i na co uważać. Własna funkcja, zmienna albo argument —
  jej deklaracja i plik, w którym powstała. To najszybszy sposób, żeby zrozumieć cudzy kod.
- **Ctrl + kliknięcie** na własną nazwę przenosi do miejsca, w którym ją zadeklarowano —
  także do innego pliku projektu. Przycisk **„← wróć"** (albo Alt + ←) wraca tam, skąd skok
  nastąpił.
- **Ctrl + spacja** rozwija podpowiedzi: rejestry, bity, wektory przerwań, gotowe fragmenty
  kodu i wszystkie własne nazwy z projektu.
- Przełącznik **„Bez komentarzy"** nad edytorem pokazuje ten sam kod z pominięciem
  komentarzy i daje przycisk **„Kopiuj kod"** — do przeniesienia programu do Microchip
  Studio albo do sprawozdania. To tylko podgląd: plik zostaje nietknięty, a komentarze
  wracają po wyłączeniu przełącznika.
- Lista **„Problemy"** pod edytorem zbiera komunikaty kompilatora ze wszystkich plików
  i ostrzeżenia zależne od stanu płytki. Kliknięcie w problem przenosi do jego linii.
- Nazwy **rejestrów i bitów mają w kodzie własne kolory**, a na liście podpowiedzi
  litery **R** i **B** mówią od razu, co jest czym. Dymek rejestru prowadzi też do
  właściwego rozdziału zakładki **Kompendium**.

### Kompendium — teoria pod ręką

Zakładka **Kompendium** to krótki podręcznik do ćwiczeń: dziewięć rozdziałów
od operacji bitowych, przez porty, zegar, timery i przerwania, po klawiaturę,
oba wyświetlacze i USART. Każdy rozdział ma przykład kodu, tabelę najważniejszych
rejestrów i sekcję typowych pułapek; klawiatura i wyświetlacze mają **animowane
pokazy** — widać na przykład, że w danej chwili świeci tylko jedna cyfra
wyświetlacza, zanim odświeżanie „przyspieszy".

Nie trzeba tam trafiać ręcznie: opisy elementów na płytce, grupy rejestrów
w Symulatorze i dymki w edytorze mają odnośniki wprost do właściwego rozdziału.

### Kalkulator timerów

Zakładka **Kalkulator timerów** przelicza polecenie w rodzaju „mrugaj co 100 ms"
na wartości rejestrów — i działa w obie strony.

1. **Wpisz, co znasz.** Sam czas? Zostaw tryb i preskaler na „dowolny" — zobaczysz
   wszystkie konfiguracje, które trafiają. Prowadzący podał preskaler albo tryb?
   Zablokuj je, a lista się dopasuje. Masz gotowe `OCR0`? Wpisz je w „Wartość
   rejestru", a kalkulator policzy czas w drugą stronę.
2. **Kliknij wiersz z wynikiem** — pod tabelą pojawi się gotowa funkcja do wklejenia:
   w wersji z pętlą sprawdzającą flagę albo z przerwaniem, z komentarzami albo bez.
3. Gdy czas **nie mieści się w wybranym liczniku**, kalkulator mówi o tym wprost
   i podpowiada licznik, który trafi (np. 100 ms wymaga 16-bitowego TC1) — a jeśli
   ograniczenia zostawiają tylko za krótki licznik, pokazuje **odliczanie programowe**:
   krótsze zdarzenie bazowe i zmienną globalną, która zlicza powtórzenia.

Częstotliwość zegara podpowiada się z fuse bitów płytki — to ta sama pułapka,
o której mówi rozdział „Zegar i F_CPU" w Kompendium: rzeczywisty zegar ustawiają
fuse bity, nie `#define F_CPU`.

### Jak prowadzić przewody

Peryferia na tej płytce **nie są na stałe połączone** z mikrokontrolerem. Wszystko jest
wyprowadzone na szpilki (goldpiny) i to Ty decydujesz, co z czym połączyć — tak jak
na zajęciach.

1. **Kliknij szpilkę**, z której chcesz poprowadzić żyłę. Płytka się przygasi, wolne
   szpilki dostaną obrączki, a nad rysunkiem stanie pasek z informacją, co prowadzisz.
2. **Kliknij drugą szpilkę.** Nie musisz celować idealnie — najbliższa szpilka
   **podświetli się na zielono**, a podgląd pokaże dokładnie tę żyłę, która zaraz
   powstanie. Po kliknięciu żyła dorysuje się od szpilki do szpilki.

Między kliknięciami możesz swobodnie **przybliżać i przesuwać** rysunek — wybierz
źródło przy jednym powiększeniu, a cel przy innym. Jeśli wolisz stary sposób,
przeciągnięcie z szpilki na szpilkę też działa.

- **Esc** albo kliknięcie w puste miejsce odkłada prowadzony przewód.
- Najechanie na gotowy przewód **przygasza pozostałe** i wypisuje, co z czym łączy.
- **Kliknięcie żyły wypina ją.** Jeśli to była pomyłka, naciśnij **„Cofnij"**.
- Przy gęsto oplecionym złączu włącz **„ukryj przewody"** — piny zostaną odsłonięte.
- Najechanie na pin mówi, która to linia mikrokontrolera i **jaki jest na niej stan
  w tej chwili**: wysoki (1), niski (0) czy pływający (nikt jej nie steruje).
- Ikona **„?”** w lewym dolnym rogu płytki trzyma podręczną ściągę z łączenia,
  razem z krótkim animowanym pokazem.

#### Wiązka przewodów — kilka żył jednym ruchem

Całe złącze da się podpiąć tak, jak wchodzi taśma wielożyłowa:

1. Przytrzymaj **Shift** i **zaznacz prostokątem** kilka szpilek (na przykład cały
   port). Pasek nad płytką pokaże, ile żył prowadzisz.
2. **Kliknij szpilkę, w którą ma wejść pierwsza żyła.** Każda następna zajmie kolejną
   linię tego złącza w dół, w kolejności od najwyższej zaznaczonej szpilki.

Podgląd przy celu pokazuje od razu wszystkie żyły wiązki. Jeśli od klikniętej szpilki
w dół nie ma tylu linii, ile ma wiązka, płytka powie o tym wprost; połączenia, które
już istnieją, są pomijane.

### Jak oglądać płytkę z bliska

Rysunek ma proporcje prawdziwej płytki, więc drobne opisy bywają w małym oknie
nieczytelne. Płytkę ogląda się jak mapę:

- **kółko myszy** przybliża i oddala — zawsze w miejscu, gdzie stoi kursor,
- **przeciągnięcie płytki** przesuwa obraz; działa też środkowy przycisk myszy,
- **dwuklik** w puste miejsce przybliża, przycisk **„cała płytka"** wraca do widoku ogólnego,
- po przybliżeniu w rogu pojawia się **mapka całej płytki** z zaznaczonym wycinkiem —
  kliknięcie w nią przenosi widok w to miejsce,
- w opisie elementu jest przycisk **„Pokaż na płytce"**, który sam do niego dojeżdża.

Najechanie na element obrysowuje go i pokazuje jedno zdanie. **Kliknięcie** przypina
pełny opis w panelu z prawej: czym to jest, jak się tego używa i na co uważać. Opis
zostaje na miejscu, dopóki nie wybierzesz czegoś innego. Elementy oznaczone
**„rzadko używane"** można spokojnie pominąć — typowe ćwiczenia się bez nich obywają.

### Terminal obok płytki

Część ćwiczeń wymaga patrzenia na dwie rzeczy naraz: co się dzieje na płytce i co poszło
łączem szeregowym. Dlatego terminal da się **zadokować pod rysunkiem** — przycisk
**„Pokaż terminal USART"** w pasku widoku płytki. Otwiera się też sam, kiedy płytka
pierwszy raz coś nadaje.

Dwie rzeczy, które warto wiedzieć od razu:

- **Płytka odzywa się zwykle dopiero w odpowiedzi na wysłany znak.** Wpisz go w pole
  „Wyślij do płytki" **nad** oknem terminala i naciśnij Enter. Puste okno nie znaczy,
  że coś jest zepsute.
- Nazwy ustawień w pasku u góry nie trzeba znać na pamięć — **najedź na nie kursorem**.
  Przy „Prędkości terminala" znajdziesz wyjaśnienie, czym w ogóle jest prędkość transmisji
  i dlaczego obie strony muszą mieć ustawioną tę samą, a przy każdej pozycji listy zdanie
  o tym, kiedy tej akurat się używa.
- **Klawiatura 4×4 na płytce nie wysyła nic do terminala.** Czyta ją program, a nie łącze
  szeregowe — i tylko wtedy, gdy sam ją odczytuje. To dwie zupełnie różne drogi.

### Komputer PC obok płytki

Część ćwiczeń nie kończy się na płytce. Płytka wysyła **ramkę** — ciąg bajtów, w którym
siedzi kilka liczb obok siebie — a po drugiej stronie kabla stoi komputer ze skryptem
w Pythonie, który tę ramkę rozkłada na pola i odsyła odpowiedź.

Zakładka **Komputer PC** jest tym komputerem. Z dołączonych ćwiczeń korzysta z niej
**jedno: L7 — ramki binarne**, i zakładka mówi o tym wprost, żeby przy pozostałych zadaniach
nie wyglądała na zepsutą. Wczytanie L7 przynosi gotowy plik `script.py`.

Skrypt uruchamia się przyciskiem **„Uruchom skrypt"** i działa jak na zajęciach:

- wypisuje to samo, co wypisałby w oknie konsoli,
- kiedy dojdzie do `input(...)`, **zatrzymuje się i czeka** — wpisz odpowiedź w polu na dole,
- kiedy czeka na ramkę, po prostu czeka; płytka w tym czasie pracuje dalej.

Nazwa portu w kodzie (`COM15`) nie ma tu znaczenia — kabel jest zawsze ten sam.
Na prawdziwym komputerze to jedyna linia, którą trzeba u siebie zmienić.

### Wysłanie komuś swojej płytki

Przycisk **„Udostępnij"** w górnym pasku kopiuje adres, pod którym ktoś inny zobaczy
**dokładnie to samo**: ten kod, te przewody i te fuse bity. To najprostszy sposób,
żeby pokazać prowadzącemu, co się dzieje, bez opisywania tego słowami.

Praca nie ginie też przy odświeżeniu strony — przewody, zworki, fuse bity i wgrany
program wracają tam, gdzie były.

### Klawiatura komputera steruje klawiaturą płytki

Klawiatury 4×4 **nie da się sensownie obsługiwać myszą**. Program odczytuje ją metodą
skanowania — wierszami, po kolei — więc klawisz trzeba przytrzymać przez kilka pełnych
rund, a mysz zwalnia go za szybko. Nie da się też myszą wcisnąć dwóch klawiszy naraz.

Dlatego na zakładce **Płytka** klawiatura komputera wciska przyciski płytki
jeden do jednego, zgodnie z nadrukiem:

| na płytce | na klawiaturze |
|---|---|
| `1 2 3 A` | `1` `2` `3` `A` |
| `4 5 6 B` | `4` `5` `6` `B` |
| `7 8 9 C` | `7` `8` `9` `C` |
| `* 0 # D` | `*` `0` `#` `D` |

- Gwiazdkę i kratkę można wcisnąć także **przecinkiem i kropką** — na wielu układach
  klawiatury `*` i `#` wymagają shifta.
- **Trzymanie klawisza trzyma przycisk.** Puszczenie zwalnia go.
- Pisanie w edytorze i w terminalu **nie uruchamia** klawiszy płytki, więc nie trzeba
  o niczym pamiętać.

---

---

## Uruchomienie u siebie

Narzędzie działa w przeglądarce i normalnie wystarczy otworzyć adres, pod którym jest
wystawione. Żeby uruchomić je z kodu:

```bash
npm install
npm run dev
```

Aplikacja stanie na `http://localhost:5173`.

Jedna rzecz wymaga przygotowania osobno: **kompilator C działający w przeglądarce**.
To clang, lld i llvm-objcopy zbudowane do WebAssembly — budowa jest jednorazowa, ale trwa
godziny i wymaga Dockera. Przepis leży w `tools/wasm-toolchain/`.

Bez tego kroku aplikacja działa normalnie: płytka, symulator, terminal, wszystkie gotowe
przykłady i wgrywanie własnych plików `.hex`. Nie da się tylko zbudować własnego kodu —
pasek u góry mówi o tym wprost.

## Licencja

Kod samego narzędzia jest na **licencji MIT** — rób z nim, co chcesz: używaj, zmieniaj,
rozwijaj, także we własnych projektach. Pełna treść w pliku [`LICENSE`](LICENSE).

Jest jeden wyjątek i wynika on wprost z tego, co napisano na górze: **przykładowe programy
z laboratorium** (`apps/web/src/examples/src/`) to rozwiązania zadań pisane według instrukcji
prowadzących i na dostarczonych przez nich szkieletach. Nie da się objąć własną licencją
czegoś, czego się nie napisało w całości — te pliki są tu **wyłącznie jako materiał
demonstracyjny** i pozostają na warunkach ich autorów oraz Politechniki Lubelskiej.
Szczegóły w `LICENSE`.

Praktycznie znaczy to tyle: emulator, edytor, kompilator w przeglądarce i cała reszta
narzędzia są Twoje do woli. Kilkanaście krótkich plików z ćwiczeniami traktuj jak cytat.
