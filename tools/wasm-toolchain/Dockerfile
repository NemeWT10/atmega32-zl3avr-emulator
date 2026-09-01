# Budowa toolchaina AVR dzialajacego w PRZEGLADARCE (SPIKE-1).
#
# Ustalenie z rozpoznania (docs/spikes/spike-1-toolchain-wasm.md): caly potrzebny
# lancuch narzedzi mieszka w jednym projekcie LLVM - clang ma backend AVR,
# lld ma AVR.cpp dla ELF, a llvm-objcopy potrafi "-O ihex". Nie potrzebujemy
# binutils ani gcc, wiec nie powtarzamy bledu Wokwi, ktore probowalo portowac
# narzedzia GNU na Emscripten i sie wycofalo.
#
# Budowa jest dwuetapowa, bo LLVM potrzebuje wlasnych narzedzi (tblgen)
# uruchamianych na maszynie budujacej, zanim skompiluje sie do wasm.

FROM emscripten/emsdk:3.1.74

ARG LLVM_TAG=llvmorg-18.1.8
ARG JOBS=4

RUN apt-get update && \
    apt-get install -y --no-install-recommends cmake ninja-build git python3 ccache && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /work
RUN git clone --depth 1 --branch ${LLVM_TAG} https://github.com/llvm/llvm-project.git

# --- Etap 1: natywne narzedzia pomocnicze (tblgen) -------------------------
RUN cmake -G Ninja -S llvm-project/llvm -B build-native \
      -DCMAKE_BUILD_TYPE=Release \
      -DLLVM_TARGETS_TO_BUILD=AVR \
      -DLLVM_ENABLE_PROJECTS="clang" \
      -DLLVM_ENABLE_ZSTD=OFF \
      -DLLVM_INCLUDE_TESTS=OFF \
      -DLLVM_INCLUDE_BENCHMARKS=OFF && \
    ninja -C build-native -j${JOBS} llvm-tblgen clang-tblgen llvm-min-tblgen

# --- Etap 2: wlasciwa kompilacja do WebAssembly ----------------------------
# Bez watkow i bez ladowania wtyczek - w przegladarce i tak ich nie ma,
# a wylaczenie ich znaczaco zmniejsza wynikowy modul.
#
# LLVM_COMPILER_CHECKED=ON pomija sprawdzanie wersji libstdc++. Pod Emscriptenem
# ten test zawsze zawodzi, bo kompilujemy z libc++ zamiast z libstdc++;
# bez pominiecia konfiguracja przerywa sie z komunikatem
# "libstdc++ version must be at least 7.4".
#
# NIE wlaczamy obslugi wyjatkow: LLVM buduje sie z -fno-exceptions, wiec proba
# jednoczesnego wlaczenia ich lapania konczy sie bledem
# "DISABLE_EXCEPTION_THROWING was set ... but is not compatible".
# Wiekszy stos jest natomiast konieczny - parser clanga schodzi gleboko w rekurencji.
RUN emcmake cmake -G Ninja -S llvm-project/llvm -B build-wasm \
      -DLLVM_COMPILER_CHECKED=ON \
      -DCMAKE_BUILD_TYPE=MinSizeRel \
      -DLLVM_TARGETS_TO_BUILD=AVR \
      -DLLVM_ENABLE_PROJECTS="clang;lld" \
      -DLLVM_TABLEGEN=/work/build-native/bin/llvm-tblgen \
      -DCLANG_TABLEGEN=/work/build-native/bin/clang-tblgen \
      -DLLVM_ENABLE_THREADS=OFF \
      -DLLVM_ENABLE_ZLIB=OFF \
      -DLLVM_ENABLE_ZSTD=OFF \
      -DLLVM_ENABLE_LIBXML2=OFF \
      -DLLVM_ENABLE_TERMINFO=OFF \
      -DLLVM_ENABLE_PIC=OFF \
      -DLLVM_BUILD_TOOLS=OFF \
      -DLLVM_INCLUDE_TESTS=OFF \
      -DLLVM_INCLUDE_BENCHMARKS=OFF \
      -DLLVM_INCLUDE_EXAMPLES=OFF \
      -DCLANG_ENABLE_STATIC_ANALYZER=OFF \
      -DCLANG_ENABLE_ARCMT=OFF \
      -DCMAKE_CXX_FLAGS="-Os" \
      -DCMAKE_EXE_LINKER_FLAGS="-sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=0 -sMODULARIZE=1 -sEXPORT_ES6=1 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker -sSTACK_SIZE=8MB" && \
    ninja -C build-wasm -j${JOBS} clang lld llvm-objcopy

CMD ["bash"]
