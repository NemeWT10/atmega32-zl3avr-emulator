#define F_CPU 4000000UL
#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdbool.h>
#include <string.h>
#include "queue.h"

#define BAUDRATE 9600
#define BAUD_PRESCALER (F_CPU/16/BAUDRATE - 1)

void led_initialize() {
	DDRA = 0xFF;
	PORTA = 0xFF;
}

void usart_init() {
	cli();
	UCSRB = 0x00;

	uint16_t baudrate_prescaler = BAUD_PRESCALER;
	UBRRH = baudrate_prescaler >> 8;
	UBRRL = baudrate_prescaler;

	UCSRB = (1 << RXEN) | (1 << TXEN) | (1<<RXCIE) ;
	UCSRC = (1 << URSEL) | (1 << UCSZ0) | (1 << UCSZ1);
	sei();
}
uint8_t usart_receive_character() {
	while ((UCSRA & (1 << RXC)) == 0);
	return UDR;
}

void usart_transmit_character(uint8_t character) {
	while (!(UCSRA & (1 << UDRE)));
	UDR = character;
}

uint8_t znakZad4;
queue rx_queue;
ISR(USART_RXC_vect)
{
	//Zad4
	
	/*znakZad4 = UDR;
	usart_transmit_character(znakZad4);
	znakZad4 ^= 0b01111111;
	usart_transmit_character(znakZad4);
	PORTA = znakZad4;*/
	
	//Zadanie 5
	enqueue(&rx_queue, UDR);
	
}




int main() {

	cli();
	led_initialize();
	usart_init();
	sei();

	while (1) {
		//Zadanie 3
		// Stwórz zmienną zawierającą wybrany znak typu uint8_t
		/*uint8_t znak = usart_receive_character();

		// Wyślij znak
		usart_transmit_character(znak);

		// Pokaż na diodach LED ten znak
		PORTA = znak;

		_delay_ms(500);*/
		
		//Zadanie 5
		if (!is_empty(&rx_queue)) {
			uint8_t usart_latest_char = dequeue(&rx_queue);
			usart_transmit_character(usart_latest_char);
			
			if(usart_latest_char == 's' )
				PORTA = 0xFF;
			if(usart_latest_char == 'c')
				PORTA = 0;
			if(!( (usart_latest_char >='0') && (usart_latest_char <='9')) )
				continue;
				
			uint8_t number = usart_latest_char - '0';
			PORTA ^= (1<<number);
		}
	}
}