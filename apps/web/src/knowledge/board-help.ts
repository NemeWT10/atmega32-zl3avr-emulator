/**
 * Opisy elementow plytki ZL3AVR.
 *
 * ODBIORCA: student, ktory NIE WIE, o co chodzi. Nie zna slowa "port", nie wie,
 * czym rozni sie wejscie od wyjscia i nie domysli sie, co znaczy "pull-up".
 * Dlatego pojecia tlumaczymy prostymi slowami, w miejscu pierwszego uzycia.
 *
 * FORMA: trzy pola, nie szesc. Wczesniej kazdy element miał osobne akapity
 * "czym jest", "po co tu jest", "jak sie uzywa" i "przyklady" - i konczylo sie
 * to powtarzaniem tego samego trzy razy innymi slowami. Czytelnik przestawal
 * czytac. Teraz jest krotko:
 *
 *   what  - czym to jest i po co, dwa-trzy zdania
 *   use   - jak sie tego uzywa, tylko gdy jest konkret do powiedzenia
 *   trap  - na co uwazac, TYLKO gdy naprawde istnieje pulapka
 *
 * Plytka jest uniwersalna - opisy NIE odnosza sie do konkretnego kursu.
 */

export interface BoardHelp {
  title: string
  /**
   * Rozdzial kompendium, ktory rozwija temat tego elementu.
   *
   * Pomoc na plytce zostaje krotka (co to jest, jak uzyc, pulapka),
   * a teoria zyje w JEDNYM miejscu - kompendium. Odnosnik zamiast kopii.
   */
  chapter?: string
  /** Czym element jest i po co tu jest. Dwa, trzy zdania. */
  what: string
  /** Jak sie go uzywa. Pomijamy, gdy nie ma nic konkretnego do dodania. */
  use?: string
  /** Typowa pomylka. Pomijamy, gdy zadnej nie ma - fałszywe ostrzezenia ucza ignorowania. */
  trap?: string
  /**
   * Element, ktorego typowe cwiczenia nie uzywaja.
   *
   * Ciekawy przeczyta opis do konca, a ktos, kto ma zadanie do zrobienia,
   * od razu wie, ze moze przejsc dalej. Bez tego kazdy element wyglada
   * na jednakowo wazny i trzeba je wszystkie przeczytac, zeby to ocenic.
   */
  rare?: boolean
}

/** Zdanie wspolne dla czterech zlaczy portow - zeby nie powtarzac go recznie. */
const PORT_WHAT =
  'Osiem wyprowadzeń mikrokontrolera wyciągniętych na szpilki. Każde z nich program ustawia albo ' +
  'jako WYJŚCIE (mikrokontroler podaje na nim napięcie i zapala tak np. diodę), albo jako WEJŚCIE ' +
  '(sprawdza, jakie napięcie ktoś na nim wystawił — tak czyta się przycisk).'

const PORT_USE =
  'Dwie kolumny szpilek to nie dwa różne sygnały — obie szpilki w jednym rzędzie to ta sama linia, ' +
  'wyprowadzona dwa razy, żeby dało się podpiąć do niej dwa przewody. Chwyć dowolną.'

export const BOARD_HELP: Record<string, BoardHelp> = {
  // --- zlacza portow mikrokontrolera ---
  JP17: {
    chapter: 'porty',
    title: 'JP17 — Port A (PA0–PA7)',
    what: `${PORT_WHAT} Port A dodatkowo potrafi mierzyć napięcie, więc podłącza się do niego czujniki analogowe.`,
    use: PORT_USE,
  },
  JP16: {
    chapter: 'porty',
    title: 'JP16 — Port B (PB0–PB7)',
    what: `${PORT_WHAT} Górnymi liniami portu B program wędruje z komputera do pamięci mikrokontrolera podczas wgrywania.`,
    use: PORT_USE,
    trap:
      'W chwili wgrywania programu linie PB5, PB6 i PB7 należą do programatora. Podłączone do nich ' +
      'wyjście innego układu może przeszkodzić i wgrywanie się nie uda.',
  },
  JP18: {
    chapter: 'porty',
    title: 'JP18 — Port C (PC0–PC7)',
    what: `${PORT_WHAT} Cztery środkowe linie (PC2–PC5) może zająć wbudowany układ do debugowania JTAG.`,
    use: PORT_USE,
    trap:
      'JTAG jest włączony fabrycznie, więc PC2–PC5 domyślnie NIE reagują na program — dioda po prostu ' +
      'nie zapala się i nic tego nie tłumaczy. Wyłącz fuse JTAGEN w oknie fuse bitów.',
  },
  JP19: {
    chapter: 'porty',
    title: 'JP19 — Port D (PD0–PD7)',
    what: `${PORT_WHAT} PD0 i PD1 to jednocześnie odbiór i nadawanie łącza szeregowego do komputera.`,
    use: PORT_USE,
    trap:
      'Gdy program korzysta z łącza szeregowego, PD0 i PD1 są zajęte. Podłączona do nich dioda będzie ' +
      'mrugać w rytm transmisji, a przycisk potrafi ją zakłócić.',
  },

  // --- zlacza peryferiow ---
  JP22: {
    chapter: 'porty',
    title: 'JP22 — rząd ośmiu diod',
    what:
      'Osiem diod LED, każda ze swoją szpilką. Dioda świeci, gdy na jej linii jest stan WYSOKI, ' +
      'bo drugi koniec diody jest połączony z masą przez rezystor.',
    use:
      'Połącz przewodami wybrany port z tym złączem i ustaw ten port jako wyjście (DDRx = 0xFF). ' +
      'Zapis PORTx = 0b00000001 zapala pierwszą diodę.',
    trap: 'Kolejność żył decyduje, która dioda odpowiada któremu bitowi. Odwrócona wiązka odwraca cały efekt.',
  },
  JP23: {
    chapter: 'klawiatura',
    title: 'JP23 — klawiatura 4×4',
    what:
      'Szesnaście przycisków w siatce czterech wierszy i czterech kolumn. Zamiast szesnastu wyprowadzeń ' +
      'zużywa osiem: przycisk zwiera swój wiersz ze swoją kolumną. Szpilki W1–W4 to wiersze, K1–K4 kolumny.',
    use:
      'Kolumny ustaw jako wyjścia, wiersze jako wejścia z pull-upami (DDRx = 0xF0, PORTx = 0xFF). ' +
      'Podawaj zero kolejno na jedną kolumnę i sprawdzaj, który wiersz odpowiedział zerem.',
    trap:
      'Bez pull-upów na wierszach odczyt jest przypadkowy — niepodłączone wejście „łapie” zakłócenia. ' +
      'Styk po naciśnięciu przez kilkanaście milisekund drga, więc czytaj dwa razy w odstępie.',
  },
  JP24: {
    chapter: 'wyswietlacz-7seg',
    title: 'JP24 — segmenty wyświetlacza cyfrowego',
    what:
      'Osiem linii sterujących kreskami, z których składa się cyfra: siedem segmentów a–g plus kropka. ' +
      'Segment zapala się stanem NISKIM, bo wszystkie mają wspólny plus.',
    use: 'Podłącz cały port do tego złącza i wystawiaj wzór cyfry, pamiętając o odwróconej logice: zero zapala.',
    trap: 'Odwrotnie niż przy diodach — tu jedynka gasi, a zero zapala. Ten sam wzór da negatyw cyfry.',
  },
  JP28: {
    chapter: 'wyswietlacz-7seg',
    title: 'JP28 — wybór aktywnej cyfry',
    what:
      'Cztery linie decydujące, która z czterech cyfr świeci. Cyfra włącza się stanem NISKIM. ' +
      'Wszystkie cyfry mają wspólne segmenty, więc mogą świecić tylko po kolei.',
    use:
      'Zapal jedną cyfrę, wystaw jej wzór na JP24, odczekaj kilka milisekund, zgaś i przejdź do następnej. ' +
      'Powtarzane szybciej niż 50 razy na sekundę oko widzi jako cztery cyfry naraz.',
    trap:
      'Zmiana wzoru segmentów przed zgaszeniem poprzedniej cyfry daje „duchy” — blade ślady cudzych ' +
      'segmentów. Kolejność musi być: zgaś cyfrę, zmień segmenty, zapal następną.',
  },
  JP29: {
    chapter: 'lcd',
    title: 'JP29 — wyświetlacz tekstowy, sterowanie czterema liniami',
    what:
      'Sześć szpilek do wyświetlacza tekstowego: RS, E oraz cztery linie danych D4–D7. ' +
      'Bajt idzie do wyświetlacza w dwóch krokach po cztery bity, dzięki czemu wystarcza sześć wyprowadzeń.',
    use:
      'RS = 0 oznacza rozkaz (wyczyść ekran, ustaw kursor), RS = 1 znak do pokazania. Wyświetlacz ' +
      'przepisuje linie danych w chwili, gdy E opada z jedynki do zera.',
    trap:
      'Wyświetlacz musi być podłączony dokładnie do tych linii, o których mówi program. Pomylone ' +
      'wyprowadzenia dają pusty albo zaśmiecony ekran — bez żadnego komunikatu.',
  },
  JP27: {
    chapter: 'lcd',
    title: 'JP27 — złącze, w którym siedzi wyświetlacz',
    what:
      'Szesnastostykowe złącze, w które wyświetlacz jest wetknięty na stałe: zasilanie, kontrast, ' +
      'RS, R/W, E, osiem linii danych i podświetlenie.',
    trap:
      'Nie da się tu nic podpiąć, bo miejsce zajmuje moduł. Sterowanie prowadzi się przez JP29. ' +
      'Linia R/W jest przylutowana do masy, więc z wyświetlacza można tylko pisać, nigdy czytać.',
  },

  // --- zworki ---
  JP3: {
    chapter: 'klawiatura',
    title: 'JP3 — mała klawiatura',
    what:
      'Zworka, czyli zdejmowany mostek zwierający dwie szpilki. Założona redukuje klawiaturę ' +
      'do czterech przycisków w pierwszej kolumnie.',
    use: 'Kliknij, żeby założyć albo zdjąć. Do pełnej matrycy 4×4 zworka musi być zdjęta.',
  },
  JP4: {
    chapter: 'usart',
    title: 'JP4 — włącznik odbioru z komputera',
    what:
      'Zworka dołączająca linię odbioru RS232 do wyprowadzenia PD0. Rozwarta odcina odbiór, ' +
      'ale zostawia działające nadawanie.',
    trap:
      'To wyjątkowo mylący objaw: przy rozwartej zworce płytka wysyła tekst do terminala normalnie, ' +
      'a na wpisywane znaki nie reaguje wcale. Wygląda jak błąd programu, a to zdjęty mostek.',
  },
  JP25: {
    chapter: 'zegar',
    title: 'JP25 — podłączenie kwarcu',
    what:
      'Zworka dołączająca rezonator kwarcowy 16 MHz do wyprowadzeń mikrokontrolera. ' +
      'Kwarc daje takt znacznie dokładniejszy niż wbudowany generator.',
    trap:
      'Sama zworka nie wystarczy. Mikrokontroler używa kwarcu dopiero po przestawieniu fuse bitów na ' +
      'zegar zewnętrzny — a przestawienie ich przy zdjętej zworce zatrzymuje układ, bo nie ma z czego taktować.',
  },

  // --- glowne elementy ---
  mcu: {
    chapter: 'porty',
    title: 'ATmega32 — mikrokontroler',
    what:
      'Cały komputer w jednej obudowie: procesor, pamięć programu, pamięć robocza, liczniki, ' +
      'układ transmisji szeregowej i 32 wyprowadzenia. To on wykonuje wgrany program.',
    use:
      'Wyprowadzenia po lewej i prawej stronie odpowiadają szpilkom na złączach JP16–JP19. ' +
      'Nazwa PB3 na obudowie i PB3 na złączu to ta sama linia.',
    trap:
      'Częstotliwość taktowania NIE bierze się z #define F_CPU w kodzie — to tylko liczba, z której ' +
      'kompilator wylicza opóźnienia. Prawdziwy takt ustawiają fuse bity, fabrycznie 1 MHz.',
  },
  reset: {
    title: 'Przycisk zerowania (Reset)',
    what: 'Wciśnięcie zaczyna program od początku — tak samo, jakby dopiero włączono zasilanie.',
    use: 'Przydaje się, gdy program się zapętlił albo chcesz obejrzeć jego początek jeszcze raz.',
    trap: 'Zerowanie nie kasuje programu z pamięci ani nie zmienia fuse bitów. Uruchamia go od nowa.',
  },
  progLed: {
    title: 'Dioda D10 — sygnalizacja wgrywania',
    what: 'Świeci, gdy trwa przesyłanie programu do mikrokontrolera. Zgaśnięcie oznacza koniec wgrywania.',
  },
  ledRow: {
    chapter: 'porty',
    title: 'Osiem diod LED',
    what:
      'Najprostszy sposób zobaczenia, co robi program: każda dioda pokazuje stan jednej linii portu. ' +
      'Świeci przy stanie wysokim.',
    trap: 'Nic nie zaświeci się, dopóki port nie zostanie ustawiony jako wyjście (DDRx).',
  },
  segments: {
    chapter: 'wyswietlacz-7seg',
    title: 'Wyświetlacz z czterech cyfr',
    what:
      'Cztery cyfry, każda z siedmiu kresek i kropki. Wszystkie cyfry współdzielą linie segmentów, ' +
      'więc świecą po kolei — a oko widzi je jako świecące jednocześnie.',
    trap: 'Zbyt wolne przełączanie widać jako migotanie, a zła kolejność jako blade „duchy” obcych segmentów.',
  },
  keypad: {
    chapter: 'klawiatura',
    title: 'Klawiatura 4×4',
    what:
      'Szesnaście przycisków czytanych metodą skanowania: program po kolei podaje zero na każdą kolumnę ' +
      'i sprawdza, który wiersz odpowiedział.',
    use:
      'Klawisze można wciskać myszą albo klawiaturą komputera. Trzymaj klawisz wciśnięty — program musi ' +
      'zdążyć go zauważyć podczas skanowania.',
    trap:
      'Dwa klawisze naraz dają odczyt, którego nie da się jednoznacznie rozszyfrować. ' +
      'Klawiatura nie ma też nic wspólnego z terminalem: wciśnięty klawisz widzi wyłącznie program, ' +
      'i tylko jeśli sam go odczytuje.',
  },
  lcd: {
    chapter: 'lcd',
    title: 'Wyświetlacz tekstowy 2 × 16 znaków',
    what:
      'Dwa wiersze po szesnaście znaków, sterowane układem HD44780. Ma wbudowany alfabet i osiem ' +
      'komórek na znaki zaprojektowane przez programistę.',
    use: 'Kontrast reguluje potencjometr PR1. Sterowanie prowadzi się przez złącze JP29.',
    trap:
      'Drugi wiersz nie zaczyna się pod adresem 16, tylko 0x40. Zapis znaków „poza” pierwszym wierszem ' +
      'trafia w niewidoczną część pamięci i tekst po prostu znika.',
  },
}

/**
 * Opisy elementow rysowanych na plytce, ale nieinteraktywnych.
 * Klucz to napis sitodruku z layout.ts.
 */
export const DECORATION_HELP: Record<string, BoardHelp> = {
  // --- lacze do komputera ---
  RS232: {
    chapter: 'usart',
    title: 'Gniazdo kabla do komputera',
    what:
      'Trapezowe gniazdo łącza szeregowego. Tędy płytka wymienia znaki z programem terminala ' +
      'uruchomionym na komputerze.',
    trap: 'Odbiór działa tylko przy założonej zworce JP4. Nadawanie działa zawsze.',
  },
  U6: {
    chapter: 'usart',
    title: 'MAX232 — dopasowanie napięć',
    what:
      'Mikrokontroler nadaje napięciami 0 i 5 V, a łącze RS232 używa napięć dodatnich i ujemnych ' +
      'rzędu kilkunastu woltów. Ten układ tłumaczy jedno na drugie w obie strony.',
  },
  'PS/2': {
    title: 'Gniazdo klawiatury komputerowej',
    rare: true,
    what: 'Okrągłe gniazdo starszego typu klawiatur. Sygnały z niego wychodzą na złącze JP8.',
  },
  JP8: {
    title: 'JP8 — sygnały gniazda PS/2',
    rare: true,
    what: 'Dwie szpilki, CLOCK i DATA, wyprowadzone z gniazda klawiatury. Stąd prowadzi się je do portu.',
  },

  // --- zasilanie ---
  'AC/DC': {
    title: 'Gniazdo zasilania',
    rare: true,
    what: 'Wejście zasilacza 9–12 V. Napięcie z niego trafia do stabilizatora, który robi z niego równe 5 V.',
  },
  U1: {
    title: '7805 — stabilizator napięcia',
    rare: true,
    what: 'Zamienia napięcie z zasilacza na stabilne 5 V, którymi żyje mikrokontroler i cała reszta płytki.',
  },
  Zasilanie: {
    title: 'JP9 — wyprowadzenie zasilania',
    rare: true,
    what: 'Dwie szpilki, masa i +5 V, do zasilenia czegoś dołączonego z zewnątrz.',
    trap: 'Zwarcie tych dwóch szpilek przewodem to zwarcie zasilania. Na prawdziwej płytce kończy się to uszkodzeniem.',
  },

  // --- programowanie ---
  'Atmel ISP': {
    title: 'JP15 — złącze programatora (6 pinów)',
    what:
      'Tędy program wchodzi z komputera do pamięci mikrokontrolera. „ISP” znaczy, że układ programuje się ' +
      'na miejscu, bez wyjmowania go z podstawki.',
  },
  'Kanda ISP': {
    title: 'JP20 — złącze programatora (10 pinów)',
    rare: true,
    what: 'To samo zadanie co JP15, tylko w starszym układzie wyprowadzeń. Używa się jednego albo drugiego.',
  },
  'ZL11PRG-M': {
    title: 'JP30 — gniazdo modułu programatora',
    what: 'Miejsce, w które wpina się moduł programatora łączący płytkę z komputerem przez USB.',
  },
  JTAG: {
    title: 'JP21 — złącze do debugowania',
    rare: true,
    what:
      'Interfejs pozwalający zatrzymać program w dowolnym miejscu i podejrzeć zawartość rejestrów ' +
      'bez wyjmowania układu z płytki.',
    trap:
      'JTAG zajmuje wyprowadzenia PC2–PC5 i jest włączony fabrycznie. Dopóki nie wyłączysz fuse JTAGEN, ' +
      'te cztery linie portu C nie reagują na program.',
  },
  X1: {
    chapter: 'zegar',
    title: 'X1 — kwarc 16 MHz',
    what:
      'Rezonator kwarcowy: generator taktu o dokładności lepszej niż jedna milionowa. Wbudowany generator ' +
      'mikrokontrolera potrafi mylić się o kilka procent, co przy transmisji szeregowej bywa zabójcze.',
    use: 'Żeby go użyć, załóż zworkę JP25 i przestaw fuse bity na zegar zewnętrzny.',
  },

  // --- sygnaly pomocnicze ---
  'Kl. wc.': {
    title: 'JP13 — sygnał „ktoś wcisnął klawisz”',
    rare: true,
    what:
      'Jedna szpilka przyjmująca stan niski, gdy wciśnięto dowolny klawisz klawiatury. Pozwala zbudzić ' +
      'program przerwaniem zamiast bez przerwy skanować matrycę.',
  },
  Vref: {
    title: 'JP12 — napięcie odniesienia pomiarów',
    rare: true,
    what:
      'Wzorzec, do którego mikrokontroler porównuje mierzone napięcie. Wynik pomiaru mówi, jaką częścią ' +
      'tego wzorca jest napięcie na wejściu.',
  },
  I2C: {
    title: 'JP26 — magistrala dwuprzewodowa',
    rare: true,
    what:
      'Dwa przewody, SCL i SDA, którymi można podłączyć wiele układów naraz — czujniki, pamięci, zegary. ' +
      'Każdy ma swój adres, więc jedna para przewodów wystarcza dla wszystkich.',
  },
  Pullup: {
    title: 'JP5/JP6 — rezystory magistrali',
    rare: true,
    what:
      'Magistrala dwuprzewodowa wymaga rezystorów podciągających obie linie do zasilania. ' +
      'Te zworki decydują, czy płytka je dołącza.',
  },

  // --- podczerwien ---
  U2: {
    title: 'TFMS5360 — odbiornik podczerwieni',
    rare: true,
    what:
      'Scalony odbiornik reagujący na światło podczerwone migające 36 tysięcy razy na sekundę — tak nadają ' +
      'piloty. Na wyjściu daje gotowy sygnał zero-jedynkowy.',
  },
  'IR IN': {
    title: 'JP10 — wejście z odbiornika podczerwieni',
    rare: true,
    what: 'Szpilka z sygnałem odbiornika. Stąd prowadzi się przewód do wybranego wyprowadzenia portu.',
  },
  'IR OUT': {
    title: 'JP11 — nadajnik podczerwieni',
    rare: true,
    what: 'Szpilka sterująca diodą nadawczą D1. Pozwala samemu udawać pilota.',
  },
  D1: {
    title: 'D1 — dioda nadawcza podczerwieni',
    rare: true,
    what: 'Świeci światłem niewidocznym dla oka. Sterowana z JP11 przez tranzystor T1.',
  },

  // --- tor analogowy ---
  'L.In(AC)': {
    title: 'J3 — wejście audio (sygnał zmienny)',
    rare: true,
    what: 'Gniazdo słuchawkowe na sygnał zmienny, np. z odtwarzacza. Sygnał trafia stąd na wejście pomiarowe.',
  },
  'L.Out': {
    title: 'J2 — wyjście audio',
    rare: true,
    what: 'Gniazdo, na którym pojawia się dźwięk wytworzony przez płytkę. Można podpiąć słuchawki albo głośnik.',
  },
  'L.In(DC)': {
    title: 'J4 — wejście napięcia stałego',
    rare: true,
    what: 'Gniazdo na sygnał wolnozmienny — np. z czujnika temperatury albo potencjometru.',
  },
  U3: {
    title: 'U3 — wzmacniacz toru wejściowego',
    rare: true,
    what: 'Podnosi poziom słabego sygnału z gniazda audio do zakresu, który mikrokontroler potrafi zmierzyć.',
  },
  U4: {
    title: 'U4 — wzmacniacz toru wejściowego',
    rare: true,
    what: 'Drugi stopień wzmocnienia sygnału z wejść analogowych.',
  },
  PR1: {
    chapter: 'lcd',
    title: 'PR1 — kontrast wyświetlacza',
    what:
      'Potencjometr regulujący kontrast wyświetlacza tekstowego, czyli to, jak ciemne są znaki ' +
      'w stosunku do tła.',
    trap:
      'Skręcony do końca daje albo całkiem pusty ekran, albo dwa rzędy czarnych prostokątów. ' +
      'Wygląda to jak zepsuty wyświetlacz albo błąd programu, a wystarczy pokręcić.',
  },
  PR2: {
    title: 'PR2 — regulacja toru analogowego',
    rare: true,
    what: 'Potencjometr ustawiający wzmocnienie w torze sygnału analogowego.',
  },
  PR3: {
    title: 'PR3 — regulacja toru analogowego',
    rare: true,
    what: 'Potencjometr ustawiający poziom sygnału w torze analogowym.',
  },
  PR4: {
    title: 'PR4 — regulacja toru analogowego',
    rare: true,
    what: 'Potencjometr ustawiający poziom sygnału wejściowego.',
  },
  'DAC En': {
    title: 'JP1 — włącznik wyjścia dźwiękowego',
    rare: true,
    what:
      'Zworka dołączająca tor wyjściowy do gniazda audio. Mikrokontroler nie ma przetwornika ' +
      'analogowego, więc dźwięk robi, migając wyprowadzeniem bardzo szybko i wygładzając to filtrem.',
  },
  'ADC(AC)': {
    title: 'JP14 — wejście pomiarowe sygnału zmiennego',
    rare: true,
    what: 'Szpilka z sygnałem z gniazda audio. Prowadzi się z niej przewód do wyprowadzenia portu A.',
  },
  'Tłum/Wzm': {
    title: 'JP7 — tłumienie albo wzmocnienie',
    rare: true,
    what:
      'Zworka wybierająca, czy sygnał wejściowy ma zostać osłabiony, czy wzmocniony — zależnie od tego, ' +
      'jak mocne źródło podłączono.',
  },
}
