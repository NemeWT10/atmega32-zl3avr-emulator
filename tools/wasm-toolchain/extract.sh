#!/usr/bin/env bash
# Wyciaga z obrazow dockerowych to, czego przegladarka potrzebuje do kompilacji:
#
#   1. clang / lld / llvm-objcopy zbudowane do WebAssembly   (zl3avr-wasm-toolchain)
#   2. naglowki i biblioteki avr-libc dla atmega32           (zl3avr-toolchain)
#
# Punkt 2 to DANE, nie kod: clang jest samym frontendem i nie ma wlasnej biblioteki
# standardowej dla AVR. Bierzemy ja z prawdziwego avr-gcc, zeby program zlinkowany
# w przegladarce zawieral te same funkcje co zbudowany w Microchip Studio.
#
# Wszystko przechodzi przez `tar` na standardowym wyjsciu kontenera. `docker cp`
# jest tu nie do uzycia: pod Git Bashem sciezki uniksowe sa po drodze przerabiane
# na windowsowe i polecenie dostaje katalog, ktorego nie ma.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/apps/web/public/toolchain"
TMP="$ROOT/tools/wasm-toolchain/.sysroot"
mkdir -p "$OUT"
rm -rf "$TMP"; mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

echo "--- clang, lld, llvm-objcopy (wasm) ---"
MSYS_NO_PATHCONV=1 docker run --rm zl3avr-wasm-toolchain sh -c '
  cd /work/build-wasm/bin
  rm -f clang.js && cat clang.js-18 > clang.js
  tar -chf - clang.js clang.wasm lld.js lld.wasm llvm-objcopy.js llvm-objcopy.wasm
' | tar -C "$OUT" -xf -

# Emscripten wystawia na obiekcie modulu tylko to, co wskazano przy linkowaniu.
# Nasz build nie ma FS na tej liscie, a bez niego nie da sie ani podlozyc plikow
# zrodlowych, ani odczytac wyniku. Doszywamy jedna linijke na poczatku `preRun`:
# w tym miejscu `FS` jest juz zbudowane, a wywolania uzytkownika jeszcze nie ruszyly.
# Alternatywa byloby przebudowanie LLVM-a (godziny) dla jednego eksportu.
echo "--- doszycie eksportu FS ---"
for f in clang.js lld.js llvm-objcopy.js; do
  sed -i 's/function preRun(){/function preRun(){Module["FS"]=FS;/' "$OUT/$f"
  grep -q 'function preRun(){Module\["FS"\]=FS;' "$OUT/$f" || { echo "NIE UDALO SIE doszyc FS w $f"; exit 1; }
done

# Clang dostarcza wlasny komplet naglowkow „wolnostojacych” - stdbool.h, stddef.h,
# stdarg.h, limits.h i pokrewne. Nie ma ich ani w avr-libc, ani nigdzie indziej:
# nalezą do kompilatora, bo ich tresc zalezy od tego, jak on sam liczy typy.
# Bez nich `#include <stdbool.h>` konczy sie „file not found”. Bierzemy sam ten
# komplet - reszta katalogu to instrukcje procesorow x86, ARM i kart graficznych,
# czyli 7 MB, ktore na AVR nie sa do niczego potrzebne.
echo "--- naglowki wolnostojace clanga ---"
mkdir -p "$TMP/clang/include"
MSYS_NO_PATHCONV=1 docker run --rm zl3avr-wasm-toolchain sh -c '
  cd /work/build-wasm/lib/clang/*/include
  tar -chf - std*.h __std*.h limits.h float.h iso646.h inttypes.h tgmath.h varargs.h
' | tar -C "$TMP/clang/include" -xf -
echo "  $(ls "$TMP/clang/include" | wc -l) plikow, $(du -sk "$TMP/clang/include" | cut -f1) kB"

echo "--- avr-libc dla atmega32 ---"
MSYS_NO_PATHCONV=1 docker run --rm zl3avr-toolchain sh -c '
  set -e
  mkdir -p /sysroot/avr/include /sysroot/avr/lib
  cp -r /usr/lib/avr/include/. /sysroot/avr/include/
  cp /usr/lib/avr/lib/avr5/crtatmega32.o   /sysroot/avr/lib/
  cp /usr/lib/avr/lib/avr5/libatmega32.a   /sysroot/avr/lib/
  cp /usr/lib/avr/lib/avr5/libc.a          /sysroot/avr/lib/
  cp /usr/lib/avr/lib/avr5/libm.a          /sysroot/avr/lib/
  cp /usr/lib/avr/lib/avr5/libprintf_flt.a /sysroot/avr/lib/ 2>/dev/null || true
  cp /usr/lib/gcc/avr/*/avr5/libgcc.a      /sysroot/avr/lib/
  cp /usr/lib/avr/lib/ldscripts/avr5.x     /sysroot/avr/lib/
  tar -C /sysroot -cf - avr
' | tar -C "$TMP" -xf -

# Skrypt linkera jest pisany pod GNU ld. Zapis KEEP(SORT(*)(.ctors)) sortuje PLIKI
# wejsciowe - to rozszerzenie GNU, ktorego lld nie zna; parsowanie przerywa sie
# bledem "') expected, but got ('". Sekcje .ctors/.dtors sa kilka linii wyzej i tak
# zbierane przez *(.ctors), a kolejnosc plikow ma znaczenie wylacznie dla priorytetow
# konstruktorow C++, ktorych w kodzie na ATmega32 nie ma.
python - "$TMP/avr/lib/avr5.x" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
before = s
for kind in ('ctors', 'dtors'):
    s = s.replace('KEEP(SORT(*)(.%s))' % kind, 'KEEP(*(SORT_BY_NAME(.%s)))' % kind)
assert s != before, 'nie znaleziono KEEP(SORT(*)(...)) w avr5.x'
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('  avr5.x: KEEP(SORT(*)(...)) -> KEEP(*(SORT_BY_NAME(...)))')
PY

# avr-libc niesie naglowki wszystkich ukladow AVR - 267 plikow, 18,8 MB z 19,3 MB
# calosci. Nasza plytka ma jeden uklad, a `avr/io.h` wybiera dla niego doklaadnie
# jeden plik. Sprawdzone poleceniem `avr-gcc -H`: dla atmega32 siegamy tylko po
# `io.h` i `iom32.h`. Reszte usuwamy - inaczej student pobiera 19 MB naglowkow
# 266 ukladow, ktorych ta plytka nigdy nie uzyje.
echo "--- odchudzenie naglowkow ---"
BEFORE=$(du -sk "$TMP/avr/include" | cut -f1)
find "$TMP/avr/include/avr" -maxdepth 1 -name 'io*.h'   ! -name 'io.h' ! -name 'iom32.h' -delete
AFTER=$(du -sk "$TMP/avr/include" | cut -f1)
echo "  naglowki: ${BEFORE} kB -> ${AFTER} kB"

# Dwa archiwa zamiast jednego: kazde uruchomienie narzedzia dostaje SWOJ wirtualny
# system plikow, wiec zawartosc trzeba rozpakowac za kazdym razem. Clang potrzebuje
# wylacznie naglowkow, a linker wylacznie bibliotek - dzielac je, nie przepisujemy
# kilku megabajtow bibliotek przy kompilacji kazdego pliku .c.
rm -f "$OUT/avr-sysroot.tar"
tar -C "$TMP" -cf "$OUT/avr-include.tar" clang/include avr/include
tar -C "$TMP" -cf "$OUT/avr-lib.tar" avr/lib

echo
echo "--- wynik ---"
ls -la "$OUT"
du -sh "$OUT"
