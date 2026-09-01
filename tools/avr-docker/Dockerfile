# Prawdziwy avr-gcc do generowania golden testow (.hex) i do porownan z toolchainem WASM.
# Ten sam kompilator co w Microchip Studio (avr-gcc + avr-libc).
FROM debian:bookworm-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc-avr avr-libc binutils-avr make && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /src
