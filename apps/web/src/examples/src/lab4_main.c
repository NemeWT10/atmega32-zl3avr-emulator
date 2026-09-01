#define F_CPU 1000000UL
#include <avr/io.h>
void led_initialize() {
	DDRD = 0xFF;
	PORTD = 0xFF;
}
void timer_initialize()
{
	// f cpu = 1 mhz
	//ustawienie prescalera 256
	TCCR0 &= ~(1<<CS00);
	TCCR0 &= ~(1<<CS01);
	TCCR0 |= (1<<CS02);
	
	TCCR0 |= (1<<WGM01); //CTC
	
	OCR0 = 38 ; //1MHz, 256, 10ms ;; 1 000 000 * 10 / 1000 / 256 = 39 ; 39 - 1 = 38
}
void delay_10ms()
{
	while(1)
	{
		if((TIFR & (1<<OCF0)) !=0)
		{
			TIFR = (1<<OCF0);
			return;
		}
	}
}

void delay_1s()
{
	for(uint8_t i=0;i<100;i++)
	{
		delay_10ms();
	}
	
	
}
void timer_initialize_zad5()
{
	//f = 1MHz
	
	// prescaler 8
	TCCR0 &= ~(1<<CS00);
	TCCR0 &= ~(1<<CS02);
	TCCR0 |= (1<<CS01);


	/*
	//CTC
	TCCR0 |= (1<<WGM01);

	//1ms ;; 1 000 000 Hz * 1 / 1000 s / 8 = 125 ; 125 - 1 = 124
	OCR0 = 124;
	*/
	
	
	//Normal
	// 255 - 124 = 131
	
}

void delay_1ms_zad5()
{
	while(1)
	{
		if ((TIFR & (1<<OCF0)) != 0)
		{
			TIFR = 1 << OCF0;
			
			//Dla trybu normal
			TCNT0 = 131;
			return;
		}
	}
}
void delay_1s_zad5()
{
	for(uint16_t i=0;i<1000;i++)
	delay_1ms_zad5();
}

//zadanie 6
void delay_ms(uint32_t time)
{
	for(uint32_t i=0;i<time;i++)
	{
		delay_1ms_zad5();
	}
}
int main(void)
{
    led_initialize();
	//timer_initialize();
	timer_initialize_zad5();
	
	PORTD = 0x00;
	uint32_t counter = 0;
    while (1) 
    {
		//PORTD ^= 0xFF;
		//delay_1s();
		//delay_1s_zad5();
		
		
		
		counter++;
		delay_ms(1000);
		
		//neguj 0 za kazdym razem
		PORTD ^= (1<<0);
		
		/*if((counter % 2) == 0)
			PORTD ^= (1<<1);
		if((counter % 4) == 0)
			PORTD ^= (1<<2);	
		if((counter % 8) == 0)
			PORTD ^= (1<<3);
		if((counter % 16) == 0)
			PORTD ^= (1<<4);
		if((counter % 32) == 0)
			PORTD ^= (1<<5);
		if((counter % 64) == 0)
			PORTD ^= (1<<6);
		if((counter % 128) == 0)
			PORTD ^= (1<<7);*/
		
		for (uint8_t i=1;i<8;i++)
		{
			if((counter % (1<<i)) == 0)
				PORTD ^= (1<<i);
		}

		
	
    }
}

