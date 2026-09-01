// Przyklad z laboratorium - klawiatura matrycowa i kalkulator
#define F_CPU 1000000L
#include <avr/io.h>
#include <avr/delay.h>
volatile uint8_t *ddrDiod = &DDRD;
volatile uint8_t *portDiod = &PORTD;
void z2() //pierwsze zadanie z sekwencja
{
	*portDiod = 0xF0;
	_delay_ms(100);
	*portDiod ^= 0xFF;
	_delay_ms(100);
}
void z3()
{
	*portDiod = 0b10101010;
	_delay_ms(100);
	*portDiod ^= 0xFF;
	_delay_ms(100);
}
void z4a()
{
	*portDiod = 0b00000001;
	_delay_ms(100);
	while(1)
	{
		if( (*portDiod & 0b10000000) != 0) //wyodrebnij bit7 czy != 0
		{
			//instrukcje jesli bit7 != 0
			*portDiod = *portDiod << 1; //wyczyszczenie bitu7
			*portDiod |= 0b00000001; //selektywne ustawienie wyniku
			_delay_ms(100);
		}
		else
		{
			*portDiod = *portDiod << 1; //selektywne ustawienie wyniku
			_delay_ms(100);
		}
	}
}
void z4b()
{
	*portDiod = 0b00000001;
	_delay_ms(100);
	while(1)
	{
		uint8_t bit7 = (*portDiod & 0b10000000) >> 7; // wyodrebnienie i przesuniecie o7
		*portDiod = *portDiod << 1; // przesun w lewo = wyczyszczenie
		*portDiod |= bit7; // selektywnie ustaw bit 0 (bit7 po przesunieciu o 7)
		_delay_ms(100);
	}
}
void z4c()
{
	*portDiod = 0b00000001;
	_delay_ms(100);
	while(1)
	{
		*portDiod = (*portDiod << 1) | (*portDiod >> 7);
		//np. 0b1000 0000 -> 0b1 |0000 0001|
		//0b0010 0000 -> 0b|0100 0000| 01
		//czyli niepotrzebne 1 beda "poza zakresem" - nie zostana pokazane
		
		_delay_ms(100);
	}
}
void z5()
{
	*portDiod = 0b10010000;
	_delay_ms(100);
	while(1)
	{
		*portDiod = (*portDiod >> 1) | (*portDiod << 7);
		_delay_ms(100);
	}
}

//definicja portow odpowiedzialnych za klawiature

void z6()
{
	if(!(PINA & (1<<PA0)))
	{
		z2();
	}
	else if(!(PINA & (1<<PA1)))
	{
		z3();
	}
	else if(!(PINA & (1<<PA2)))
	{
		z4c();
	}
	else if(!(PINA & (1<<PA3)))
	{
		z5();
	}
	
}

uint8_t keypad_get_currently_pressed_key() {
	for (uint8_t column = 0; column < 4; column++) {
		PORTA = ~(1 << (column + 4));
		_delay_ms(3);
		for (uint8_t row = 0; row < 4; row++) {
			if ((PINA & (1 << row)) == 0) {
				return (row * 4) + column;
			}
		}
	}
	return 0xFF;
}

void z7()
{
	uint8_t pressedKey = keypad_get_currently_pressed_key();
	*portDiod = pressedKey;
}

void z8()
{
	uint8_t key = keypad_get_currently_pressed_key();
	if(key <= 7)
	{
		*portDiod = (1 << key); //zamiana na numer bitu
	}
	else if(key >= 8 && key <= 15) //w tresci teor. od key 9
	{
		*portDiod = (1 << (key - 8)); //tu wtedy tez 9
	}
	else
	{
		*portDiod = 0xFF; // nic nie wcisniete
	}
}

//ZADANIE 12
uint8_t keymap[4][4] = {
	{ '1', '2', '3', 'A' },
	{ '4', '5', '6', 'B' },
	{ '7', '8', '9', 'C' },
	{ '*', '0', '#', 'D' }
};
uint8_t get_char_from_key(uint8_t key_number)
{
	if(key_number == 0xFF)
		return 0xFF;
	
	uint8_t row = key_number / 4; //to wynika ze wzoru jak obliczany jest numer klawisza - f. keypad_get_currently_pressed_key()
	uint8_t col = key_number % 4;
	
	return keymap[row][col];
}

//Zadanie 13
uint8_t is_digit(uint8_t ch)
{
	if (ch >= '0' && ch <= '9')
	return 1;
	else
	return 0;
}

uint8_t is_operation(uint8_t ch)
{
	if (ch == 'A' || ch == 'B' || ch == 'C' || ch == 'D')
		return 1;
	else
		return 0;
}
void z_kalkulator()
{
	uint8_t ch;
	uint8_t b, operacja;
	int8_t a, wynik;

	// pierwsza cyfra
	while(!is_digit(ch = get_char_from_key(keypad_get_currently_pressed_key())));
	a = ch - '0';
	_delay_ms(50);

	while(1)
	{
		// czekaj na operacje
		while(!is_operation(ch = get_char_from_key(keypad_get_currently_pressed_key())));
		operacja = ch;

		// czekaj na druga cyfre
		while(!is_digit(ch = get_char_from_key(keypad_get_currently_pressed_key())));
		b = ch - '0';
		_delay_ms(200); // debounce

		while(get_char_from_key(keypad_get_currently_pressed_key()) != '#');
		_delay_ms(200); // debounce po #
		
		switch(operacja)
		{
			case 'A': wynik = a + b;                       
			break;
			case 'B': wynik = a - b;                      
			break;
			case 'C': wynik = a * b;                       
			break;
			case 'D': wynik = (b == 0) ? 0 : (a / b);     
			break;
			default:  wynik = 0;                           
			break;
		}

		*portDiod = wynik;



		a = wynik; // nowa a to stary wynik
	}
}
int main(void)
{
	//diody init wyjscie - zadanie 3
	*ddrDiod = 0xFF;
	*portDiod = 0xFF;
	_delay_ms(300);
	*portDiod= 0;
	
	//klawiatura init
	DDRA = 0xF0; // ustaw dolne bity na wejście
	PORTA = 0x0F; // ustaw rezystory pull-up na wejście
	
	while (1)
	{
		//zadanie 1 to fizyczne polaczenie
		
		//z6();
		
		//z7();
		
		z_kalkulator();
		
		
		
	}
}

