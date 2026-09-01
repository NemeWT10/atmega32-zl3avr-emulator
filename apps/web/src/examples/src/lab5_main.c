#define  F_CPU 1000000UL
#include <avr/interrupt.h>
#include <avr/io.h>
#include <util/delay.h>
// Zapowiedz funkcji uzywanej w przerwaniu, zanim pojawi sie jej tresc.
// Bez tej linii kompilator w miejscu wywolania nie wie, co to za funkcja,
// i zgaduje - avr-gcc ostrzega wtedy o "implicit declaration", a nowszy
// clang uznaje to za blad. Wygenerowany kod jest identyczny w obu wypadkach.
void zapal_diode(void);

//z6 zmienna
uint16_t licznik = 0;
uint8_t seg[10] = {
	0b11000000, // 0
	0b11111001, // 1
	0b10100100, // 2
	0b10110000, // 3
	0b10011001, //4
	0b10010010, // 5
	0b10000010, // 6
	0b11111000, // 7
	0b10000000, //8
	0b10010000 // 9
};

void led_init()
{
	DDRC = 0xFF;
	PORTC = 0xFF;
}
void led_toggle()
{
	PORTC ^= 0xFF;
}
void timer1_init_normal()
{
	cli();
	TCCR1B |= (1<<CS12); //prescaler 256


	TCNT1 = 61630;
	TIMSK |= (1<<TOIE1); //przerwanie normal TC1
	sei();
}
ISR(TIMER1_OVF_vect) {
	led_toggle();
	zapal_diode();
	licznik++;
	TIFR = (1<<TOV1);
	TCNT1 = 61630;
}
void timer1_init_ctc()
{
	cli();
	TCCR1B |= (1<<CS12); //prescaler 256
	TCCR1B |= (1<<WGM12);
	OCR1A = 3905;
	TIMSK |= (1<<OCIE1A); //przerwanie ctc TC1
	sei();
}
ISR(TIMER1_COMPA_vect) {
	led_toggle();
	zapal_diode();
	licznik++;
	TIFR = (1<<OCF1A);
	//TCNT1 = 0;
}
//z5
void button_init()
{
	DDRA = 0x00; //wej
	PORTA = 0xFF; //pullup
}
void zapal_diode()
{
	for(uint8_t i=0;i<4;i++)
	{
		if((PINA & (1<<i)) == 0 )
			PORTC |= (1<<i);
	}
}
//z6
void seg7_init()
{
	//kolumny
	DDRD = 0xFF;
	PORTD = 0xFF;
	
	//fragmenty
	DDRB = 0xFF;
	PORTB = 0;
}
void wyswietl(uint16_t liczba)
{
	uint8_t numerKolumny = 0;
	//multipleksacja
	while(numerKolumny<4)
	{
		//dezaktywacja wszystkich kolumn
		PORTD = 0xFF; //stan wysoki na baze tranzystora
		
		switch(numerKolumny)
		{
			case 0:
			if(liczba > 999)
			{
				PORTB = seg[(liczba / 1000 ) % 10]; //cyfra 1000
				PORTD &= ~(1<<numerKolumny);
			}
			break;
			case 1:
			if(liczba > 99)
			{
				PORTB = seg[(liczba / 100 ) % 10]; //cyfra 100
				PORTD &= ~(1<<numerKolumny);
			}
			break;
			case 2:
			if(liczba > 9)
			{
				PORTB = seg[(liczba / 10 ) % 10]; //cyfra 10
				PORTD &= ~(1<<numerKolumny);
			}
			break;
			case 3:
			PORTB = seg[liczba % 10];	 //cyfra 1
			PORTD &= ~(1<<numerKolumny);
			break;
		}
		
		numerKolumny++;
		_delay_ms(2);
	}
}

int main(void)
{
	led_init();
	button_init();
	seg7_init();
    //timer1_init_normal();
	timer1_init_ctc();
    while (1) 
    {
		wyswietl(licznik);
		_delay_ms(20);
    }
}

