"""Komputer PC po drugiej stronie kabla szeregowego.

Plytka co sekunde wysyla ramke z „pomiarami”. Ten skrypt ja odbiera, rozklada
na pola i odsyla z powrotem jeden bajt - numer, ktory ma sie zapalic na diodach.

RAMKA JEST CIAGIEM BAJTOW, nie tekstem. Zeby oba konce sie dogadaly, musza
tak samo rozumiec: ile pol, jakiego rodzaju, w jakiej kolejnosci i od ktorej
strony zapisana jest liczba. Sluzy do tego napis formatu:

    '<HLhfB'
     |||||+-- B: uint8   - flagi stanu
     ||||+--- f: float   - cisnienie
     |||+---- h: int16   - temperatura (ze znakiem)
     ||+----- L: uint32  - czas pracy w sekundach
     |+------ H: uint16  - numer ramki
     +------- <: mlodszy bajt pierwszy (tak zapisuje liczby AVR i x86)

Ten sam uklad pol ma struktura `sensor_data_frame_t` w programie plytki.
Rozjazd choc jednego pola sprawia, ze liczby wychodza bez sensu - i to jest
najczestszy blad w tym cwiczeniu.
"""

import serial
import struct
import hexdump

# Na prawdziwym komputerze trzeba tu wpisac port, pod ktorym widoczna jest plytka
# (w Menedzerze urzadzen, np. COM15). W emulatorze kabel jest zawsze ten sam,
# wiec nazwa nie ma znaczenia - skrypt dziala bez zmieniania tej linii.
SERIAL_PORT = 'COM15'
BAUD_RATE = 9600

FRAME_FORMAT = '<HLhfB'
FRAME_SIZE = struct.calcsize(FRAME_FORMAT)


def main():
    print(f"Otwieram port {SERIAL_PORT}, predkosc {BAUD_RATE} bodow.")
    print(f"Format ramki: '{FRAME_FORMAT}', rozmiar: {FRAME_SIZE} bajtow.")

    try:
        link = serial.Serial()
        link.port = SERIAL_PORT
        link.baudrate = BAUD_RATE
        link.timeout = 1          # sekunda na skompletowanie ramki
        link.open()
    except serial.SerialException as error:
        print(f"Nie udalo sie otworzyc portu {SERIAL_PORT}: {error}")
        return

    print("Polaczono. Czekam na ramki z plytki.\n")

    while True:
        # Czytamy dopiero wtedy, gdy przyszla CALA ramka. Odczyt polowy ramki
        # rozjechalby wszystkie nastepne - kolejne pola czytalyby sie z przesunieciem.
        if link.in_waiting >= FRAME_SIZE:
            raw = link.read(FRAME_SIZE)

            print("=== Odebrana ramka ===")
            print("bajty:  " + hexdump.dump(raw, size=2, sep=' '))

            packet_id, uptime, temperature, pressure, flags = struct.unpack(FRAME_FORMAT, raw)
            print(f"numer ramki:   {packet_id}")
            print(f"czas pracy:    {uptime} s")
            print(f"temperatura:   {temperature}")
            print(f"cisnienie:     {pressure}")
            print(f"flagi stanu:   {flags}")

            # Odpowiedz w druga strone: jeden bajt, ktory plytka pokaze na diodach.
            value = int(input("Co zapalic na diodach (0-255)? "))
            link.write(struct.pack('<B', value))
            print(f"Wyslano {value}.\n")


if __name__ == "__main__":
    main()
