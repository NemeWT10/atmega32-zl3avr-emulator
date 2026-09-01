// Pusty projekt — punkt wyjścia do własnego programu.
//
// Przewody na płytce są już poprowadzone: port A (złącze JP17) łączy się
// z linijką ośmiu diod (złącze JP22). Program poniżej robi dwie rzeczy i nic
// poza tym — ustawia port A jako wyjście i zapala wszystkie diody. Dzięki temu
// od razu widać, że połączenia działają, jeszcze zanim napiszesz choćby linię.
//
// Dalej jest już Twoje miejsce: pisz wewnątrz pętli while (1).

#define F_CPU 1000000UL   // tempo pracy układu; musi zgadzać się z fuse bitami
#include <avr/io.h>       // nazwy rejestrów: DDRA, PORTA, PINA...
#include <util/delay.h>   // opóźnienia, np. _delay_ms(500);

int main(void)
{
    // DDRA mówi, czym jest każda z ośmiu linii portu A: jedynka to wyjście
    // (układ sam podaje na nią napięcie), zero to wejście (układ ją tylko czyta).
    // 0xFF to osiem jedynek, czyli cały port jako wyjście.
    DDRA = 0xFF;

    // PORTA ustawia stan wyjść. Jedynka podaje na linię napięcie i dioda świeci,
    // zero ją gasi. Tutaj zapalamy wszystkie osiem naraz.
    PORTA = 0xFF;

    while (1)
    {
        // Tu wpisz swój program. Na przykład miganie wszystkimi diodami:
        //
        //     PORTA = 0x00;
        //     _delay_ms(500);
        //     PORTA = 0xFF;
        //     _delay_ms(500);
    }
}
