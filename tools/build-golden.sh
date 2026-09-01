#!/bin/sh
# Kompiluje kody referencyjne z ZASOBY/ prawdziwym avr-gcc (w kontenerze),
# produkujac zestaw golden testow: .hex + listing + mapa.
#
# Uruchomienie z katalogu glownego repozytorium:
#   docker run --rm -v "$PWD":/src zl3avr-toolchain sh tools/build-golden.sh
set -e

OUT=tests/golden
SRC=ZASOBY
mkdir -p "$OUT"

# Flagi dobrane tak, jak ustawia je Microchip Studio w konfiguracji Release.
CFLAGS="-mmcu=atmega32 -Os -std=gnu99 -funsigned-char -funsigned-bitfields -fpack-struct -fshort-enums -Wall"

build() {
  name="$1"; shift
  echo "=== $name ==="
  rm -rf /tmp/b && mkdir -p /tmp/b
  i=0
  for f in "$@"; do
    cp "$SRC/$f" "/tmp/b/src$i.c"
    i=$((i+1))
  done
  cp "$SRC/queue.h" /tmp/b/ 2>/dev/null || true
  ( cd /tmp/b && avr-gcc $CFLAGS -I. -o out.elf src*.c 2>&1 | sed 's/^/    /' )
  avr-objcopy -O ihex -R .eeprom /tmp/b/out.elf "$OUT/$name.hex"
  avr-objdump -d -S /tmp/b/out.elf > "$OUT/$name.lst"
  avr-size /tmp/b/out.elf | tail -1 | awk -v n="$name" '{print "    " n ": text=" $1 " data=" $2 " bss=" $3}'
}

build lab1_gpio_led  "main.c"
build lab2_keypad    "main (1).c"
build lab3_7seg      "main (2).c"
build lab4_timer0    "main (3).c"
build lab5_interrupts "main (4).c"
build lab6_uart      "main (5).c" "queue.c"
build lab7_frames    "main (6).c" "queue.c"
build lab8_lcd       "main (7).c"

echo
echo "Gotowe: $(ls "$OUT"/*.hex | wc -l) plikow HEX w $OUT"

# --- kopia dla aplikacji webowej ---
mkdir -p apps/web/src/examples/hex
cp "$OUT"/*.hex apps/web/src/examples/hex/
echo "Skopiowano HEX do apps/web/src/examples/hex/"

# --- kopia zrodel dla aplikacji webowej ---
mkdir -p apps/web/src/examples/src
echo "Zrodla kopiuje osobno skrypt tools/copy-example-sources.py"
