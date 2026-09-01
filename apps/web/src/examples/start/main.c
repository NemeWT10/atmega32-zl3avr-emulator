#define F_CPU 1000000UL
#include <avr/io.h>
#include <util/delay.h>

int main(void)
{
    DDRA = 0xFF;
    PORTA = 0xFF;

    while (1)
    {
    }
}
