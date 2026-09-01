# Toolchain AVR w przegladarce (SPIKE-1)

Budowa clang + lld + llvm-objcopy do WebAssembly, zeby aplikacja hostowana
na GitHub Pages mogla kompilowac kod C dla ATmega32 bez zadnego serwera.

Uzasadnienie wyboru tej sciezki: `docs/spikes/spike-1-toolchain-wasm.md`.

## Uruchomienie

```bash
docker build -t zl3avr-wasm-toolchain tools/wasm-toolchain
```

Budowa trwa GODZINY i zajmuje kilkanascie GB. Liczbe rownoleglych zadan
reguluje `--build-arg JOBS=8`.

## Po udanej budowie

Artefakty (`clang.wasm`, `lld.wasm`, `llvm-objcopy.wasm` wraz z plikami `.js`)
wyciaga sie z obrazu:

```bash
docker create --name zl3avr-extract zl3avr-wasm-toolchain
docker cp zl3avr-extract:/work/build-wasm/bin ./toolchain-build/
docker rm zl3avr-extract
```

## Czego jeszcze brakuje

Clang jest tylko frontendem - do zlinkowania programu potrzebne sa
PREKOMPILOWANE artefakty avr-libc dla atmega32:

- naglowki `avr/*.h`, `util/*.h`,
- `crtatmega32.o`, `libatmega32.a`, `libc.a`, `libm.a`,
- skrypt linkera `avr5.x`.

Bierzemy je z obrazu `zl3avr-toolchain` (tools/avr-docker), w ktorym siedzi
prawdziwy avr-gcc i avr-libc. To dane, nie kod - trafiaja do wirtualnego
systemu plikow jako spakowane archiwum.
