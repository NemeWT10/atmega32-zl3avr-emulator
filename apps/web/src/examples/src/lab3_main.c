#define F_CPU 1000000UL
#include <avr/io.h>
#include <util/delay.h>

//zadanie 3
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
void wyswietl(uint16_t liczba)
{
	uint8_t numerKolumny = 0;
	//multipleksacja
	while(numerKolumny<4)
	{
		//dezaktywacja wszystkich kolumn
		PORTA = 0xFF; //stan wysoki na baze tranzystora
		
		switch(numerKolumny)
		{
			case 0:
				if(liczba > 999)
				{
					PORTB = seg[(liczba / 1000 ) % 10]; //cyfra 1000
					PORTA &= ~(1<<numerKolumny);
				}
				break;
			case 1:
				if(liczba > 99)
				{
					PORTB = seg[(liczba / 100 ) % 10]; //cyfra 100
					PORTA &= ~(1<<numerKolumny);
				}
				break;		
			case 2:
				if(liczba > 9)
				{
					PORTB = seg[(liczba / 10 ) % 10]; //cyfra 10
					PORTA &= ~(1<<numerKolumny);
				}
				break;			
			case 3:
				PORTB = seg[liczba % 10];	 //cyfra 1
				PORTA &= ~(1<<numerKolumny);
				break;
		}
		
		numerKolumny++;
		_delay_ms(2);
	}
}
int main(void)
{
    //init segmenty
	DDRB = 0xFF;
	PORTB = 0; //wzystkie segmenty zapalone

	
	//init kolumny - ml. czesc portu
	DDRA |= 0x0F;
	PORTA &= 0xF0;
	
	//zadanie 3 sprawdzenie czy wszystkie liczby wyswietlaja sie prawidlowo
	/*for(uint8_t i=0;i<=9;i++)
	{
		PORTB = seg[i];
		_delay_ms(1000);
	}*/
	
	//przyciski init
	DDRD &= 0b11111000; //mlodsze 3 piny jako wejscie do przyciskow - zadanie z licznikiem
	PORTD |= 0b00000111; //pull up
	
	//zmienne pomocnicze
	uint16_t licznik = 0; 
	uint8_t czyUruchomiony = 0; 
	
	
	
    while (1) 
    {
		if(licznik==10000) //reset licznika po dobiciu do 10k - 10k nie bedzie probowac sie wyswietlic bo wyswietlenie jest nizej
			licznik=0;
		//wyswietl(2026);
		
		
		//pd0 zatrzemyuje
		//pd 1 licznik=0
		//pd2 start
		if((PIND & (1<<PD0)) == 0)
		{
			_delay_ms(5); //prosta eliminacja odbicia stykow
			if((PIND & (1<<PD0)) == 0)
			czyUruchomiony = 0;
		}
		if((PIND & (1<<PD1)) == 0)
		{
			_delay_ms(5); //prosta eliminacja odbicia stykow
			if((PIND & (1<<PD1)) == 0)
			licznik=0;
		}
		if((PIND & (1<<PD2)) == 0)
		{
			_delay_ms(5); //prosta eliminacja odbicia stykow
			if((PIND & (1<<PD2)) == 0)
			czyUruchomiony=1;
		}
	
		
		//wyswietl trwa okolo/ponad 8ms dla liczb 4 cyfrowych
		for(uint8_t i=0;i<12;i++) //12 wywolan petli bo 12*8ms to okolo 100ms
		{
			wyswietl(licznik);
		}
		
		//to rowiazanie bardzo migocze no ale mozna:
		/*wyswietl(licznik);
		_delay_ms(92);*/
		
		if(czyUruchomiony == 1)
			licznik++;
			
    }
}

