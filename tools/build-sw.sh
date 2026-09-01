set -e
CFLAGS="-mmcu=atmega32 -Os -std=gnu99 -funsigned-char -funsigned-bitfields -fpack-struct -fshort-enums -Wall"
OUT=tests/golden
SRC=ZASOBY/SYSTEMY_WBUDOWANE_AVR
mkdir -p "$OUT"
build() {
  name="$1"; dir="$2"
  echo "=== $name ==="
  rm -rf /tmp/b && mkdir -p /tmp/b
  cp "$SRC/$dir"/*.c "$SRC/$dir"/*.h /tmp/b/ 2>/dev/null || cp "$SRC/$dir"/*.c /tmp/b/
  ( cd /tmp/b && avr-gcc $CFLAGS -I. -o out.elf *.c 2>&1 | sed 's/^/    /' )
  avr-objcopy -O ihex -R .eeprom /tmp/b/out.elf "$OUT/$name.hex"
  avr-objdump -d -S /tmp/b/out.elf > "$OUT/$name.lst"
  avr-size /tmp/b/out.elf | tail -1 | awk -v n="$name" '{print "    " n ": text=" $1 " data=" $2 " bss=" $3}'
}
build sw1_keypad_port  SW1_klawiatura_uniwersalna
build sw2_lcd_pointers SW2_lcd_wskazniki
build sw3_lcd_cgram    SW3_cgram_inne_podlaczenie
build sw4_usart_timer  SW4_usart_timer
