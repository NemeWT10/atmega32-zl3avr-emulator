/**
 * Moduly Pythona podkladane skryptowi studenta.
 *
 * Na laboratorium skrypt uzywa dwoch bibliotek z zewnatrz: `pyserial` do rozmowy
 * przez port szeregowy i `hexdump` do wypisania ramki. Tutaj port szeregowy nie
 * jest zadnym portem systemu, tylko modelem lacza miedzy komputerem a plytka -
 * wiec `serial` musimy dostarczyc sami.
 *
 * Zakres jest celowo waski: DOKLADNIE to, czego uzywaja cwiczenia. Udawanie
 * calej biblioteki `pyserial` skonczyloby sie tym, ze cos „prawie dziala”,
 * a student traci czas na scigane niezgodnosci.
 */

/**
 * Namiastka `pyserial`.
 *
 * Nazwy i zachowanie wziete z dokumentacji `pyserial` w zakresie uzywanym przez
 * cwiczenia: `Serial()` z polami `port`, `baudrate`, `timeout`, metody `open`,
 * `close`, `read`, `write`, `reset_input_buffer`, wlasciwosc `in_waiting`
 * oraz wyjatek `SerialException`.
 *
 * `port` przyjmujemy, ale go nie uzywamy - w laboratorium jest tam „COM15”
 * i to jedyna linia, ktora student musi u siebie zmienic. Tutaj nie ma czego
 * zmieniac, wiec kazda nazwa jest dobra i skrypt dziala niezmieniony.
 */
export const SERIAL_MODULE = `"""Lacze szeregowe do wirtualnej plytki ZL3AVR.

Namiastka biblioteki pyserial w zakresie uzywanym przez cwiczenia. Zamiast portu
systemowego rozmawia z modelem plytki, ktory chodzi w tej samej przegladarce.
"""

from js import zl3avrInWaiting, zl3avrRead, zl3avrWrite, zl3avrSleep


class SerialException(Exception):
    """Blad lacza - taka sama nazwa jak w pyserial, bo skrypty ja lapia."""


class SerialTimeoutException(SerialException):
    pass


class Serial:
    def __init__(self, port=None, baudrate=9600, timeout=None, **kwargs):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self._open = False
        if port is not None:
            self.open()

    # --- otwieranie i zamykanie -------------------------------------------

    def open(self):
        self._open = True

    def close(self):
        self._open = False

    @property
    def is_open(self):
        return self._open

    def _require_open(self):
        if not self._open:
            raise SerialException("port nie jest otwarty")

    # --- odbior ------------------------------------------------------------

    @property
    def in_waiting(self):
        """Ile bajtow przyszlo z plytki i czeka na odczytanie.

        Skrypty z cwiczen pytaja o to w petli bez przerwy. Gdyby odpowiedz
        wracala natychmiast, petla zajelaby caly czas procesora i plytka nie
        mialaby kiedy nadawac. Dlatego przy pustym buforze odpowiedz przychodzi
        z niewielkim opoznieniem - albo wczesniej, jesli bajt sie pojawi.
        """
        self._require_open()
        return zl3avrInWaiting(25)

    def read(self, size=1):
        """Czyta dokladnie \`size\` bajtow albo mniej, gdy uplynie \`timeout\`."""
        self._require_open()
        timeout_ms = -1 if self.timeout is None else int(self.timeout * 1000)
        return bytes(zl3avrRead(size, timeout_ms).to_py())

    def read_all(self):
        return self.read(self.in_waiting)

    def readline(self):
        line = bytearray()
        while True:
            char = self.read(1)
            if not char:
                break
            line += char
            if char == b"\\n":
                break
        return bytes(line)

    def reset_input_buffer(self):
        self._require_open()
        waiting = zl3avrInWaiting(0)
        if waiting:
            zl3avrRead(waiting, 0)

    # --- nadawanie ---------------------------------------------------------

    def write(self, data):
        self._require_open()
        payload = bytes(data)
        zl3avrWrite(list(payload))
        return len(payload)

    def flush(self):
        pass

    # --- pozostale ---------------------------------------------------------

    def __enter__(self):
        if not self._open:
            self.open()
        return self

    def __exit__(self, *_):
        self.close()

    def __repr__(self):
        return "Serial<ZL3AVR port=%r baudrate=%r>" % (self.port, self.baudrate)


def sleep_ms(ms):
    zl3avrSleep(ms)
`

/**
 * Namiastka modulu `hexdump`.
 *
 * Uzywamy z niego jednej funkcji - `dump()`. Zachowanie odwzorowane z pakietu
 * `hexdump` 3.3 (domena publiczna): tresc zamieniana jest na zapis szesnastkowy
 * WIELKIMI literami i ciety na kawalki po `size` ZNAKOW (nie bajtow), sklejane
 * przez `sep`. Przy domyslnym `size=2` daje to jeden bajt na kawalek.
 */
export const HEXDUMP_MODULE = `"""Zapis danych dwojkowych w postaci szesnastkowej.

Namiastka pakietu 'hexdump' (domena publiczna) w zakresie uzywanym przez cwiczenia.
"""

import binascii


def chunks(seq, size):
    """Tnie ciag na kawalki po 'size'; ostatni bywa krotszy."""
    whole, rest = divmod(len(seq), size)
    for i in range(whole):
        yield seq[i * size:(i + 1) * size]
    if rest:
        yield seq[whole * size:]


def dump(binary, size=2, sep=' '):
    """Zamienia bajty na napis w rodzaju '00 DE AD BE EF'.

    'size' to dlugosc kawalka liczona w ZNAKACH zapisu szesnastkowego,
    a nie w bajtach - tak samo jak w oryginalnym pakiecie.
    """
    hexstr = binascii.hexlify(binary).decode('ascii')
    return sep.join(chunks(hexstr.upper(), size))


def hexdump(data, result='print'):
    """Podglad w postaci 'adres: bajty  znaki', po 16 bajtow w wierszu."""
    lines = []
    for offset in range(0, len(data), 16):
        row = data[offset:offset + 16]
        hexpart = dump(row, 2, ' ')
        text = ''.join(chr(b) if 32 <= b < 127 else '.' for b in row)
        lines.append('%08X: %-47s  %s' % (offset, hexpart, text))
    out = '\\n'.join(lines)
    if result == 'print':
        print(out)
        return None
    return out
`
