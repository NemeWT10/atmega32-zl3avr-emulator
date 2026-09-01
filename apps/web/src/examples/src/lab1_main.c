// Przyklad z laboratorium - sterowanie diodami LED
#include <avr/io.h>
#include <avr/delay.h>
void zadanie3()
{
	//zadanie 3
	//sposob 1
	PORTD = 0b00000001;
	_delay_ms(1000);
	PORTD = 0b00000010;
	_delay_ms(1000);
	PORTD = 0b00000100;
	_delay_ms(1000);
	PORTD = 0b00001000;
	_delay_ms(1000);
	PORTD = 0b00010000;
	_delay_ms(1000);
	PORTD = 0b00100000;
	_delay_ms(1000);
	PORTD = 0b01000000;
	_delay_ms(1000);
	PORTD = 0b10000000;
	_delay_ms(1000);
	
	//sposob 2
	PORTD = 1; //zaswiecenie 1 diody
	_delay_ms(1000);
	for(uint8_t i = 0;i<8;i++)
	{
		PORTD = PORTD << 1;
		_delay_ms(1000);
	}
}
void zadanie4(){
	PORTD = 1;
	
	for(uint8_t i=0; i<8;i++)
	{
		PORTD |= (1<<i);
		_delay_ms(1000);
	}
	//_delay_ms(1000);
	for(int8_t i=7; i>=0;i--)
		{
			PORTD &= ~(1<<i);
			_delay_ms(500);
		}
}
void zadanie5()
{
	PORTD = 0b00001000;
	_delay_ms(1000);
	for(uint8_t i=0;i<4;i++)
	{
		PORTD |= PORTD >>1;
		_delay_ms(1000);
	}
	PORTD = 0b00010000;
	_delay_ms(500);
	for(uint8_t i=0;i<4;i++)
	{
		PORTD |= PORTD << 1;
		_delay_ms(500);
	}	
	
}
void zadanie6()
{
	PORTD = 0;
	PORTD |= (1<<7);
	PORTD |= (1<<2);
	_delay_ms(1000);
	
	for(uint8_t i=0;i<3;i++)
	{
		PORTD |= (1<< (6-i));
		PORTD &= ~(0x07); //0x07 = 0b00000111
		PORTD |= (1<< (1-(i&1)));
		_delay_ms(1000);
	}
	for(uint8_t i=0;i<3;i++)
	{
		PORTD &= ~(1<< (4+i));
		PORTD &= ~(0x07);
		PORTD |= (1<<i);
		_delay_ms(1000);
	}
	
}
void zadanie7()
{
	PORTD = 0b11000000;
	_delay_ms(500);
	for(uint8_t i=0;i<6;i++)
	{
		PORTD = PORTD >> 1;
		//PORTD = PORTD >> 1; 
		_delay_ms(500);
	}
	_delay_ms(500);
	for(uint8_t i=0;i<6;i++)
	{
		PORTD = PORTD << 1;
		//PORTD = PORTD << 1;
		_delay_ms(1000);
	}
}
int main(void)
{
	
    DDRD = 0xFF;

	//zadanie3();
	//zadanie4();
	//zadanie5();
	//zadanie6();
	//zadanie7();
	
	
    while (1) 
    {
		zadanie7();
    }
}

