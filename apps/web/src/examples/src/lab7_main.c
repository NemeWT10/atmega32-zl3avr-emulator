#define F_CPU 4000000UL
#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdbool.h>
#include <string.h>
#include "queue.h"

#define BAUDRATE 9600
#define BAUD_PRESCALER (F_CPU/16/BAUDRATE - 1)

typedef struct {
	uint8_t  pressed_key;
} device_to_pc_frame_t;

typedef struct {
	uint8_t  led_to_light_flags;
} pc_to_device_frame_t;

typedef struct __attribute__((__packed__)) {
	uint16_t packet_id;
	uint32_t uptime_seconds;
	int16_t  temperature;
	float    pressure;
	uint8_t  status_flags;
} sensor_data_frame_t;

queue rx_queue;
queue tx_queue;

//device_to_pc_frame_t tx_frame;
sensor_data_frame_t tx_frame;
pc_to_device_frame_t rx_frame;

uint8_t rx_buffer[64];
uint16_t rx_buffer_index = 0;

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

	UCSRB = (1 << RXEN) | (1 << TXEN) | (1 << RXCIE);
	UCSRC = (1 << URSEL) | (1 << UCSZ0) | (1 << UCSZ1);
	sei();
}

void timer1_init() {
	TCCR1B |= (1 << WGM12) | (1 << CS12);
	OCR1A = 15624; // TODO: do zmiany - 1 sekunda w trybie CTC, prescaler 256
	TIMSK |= (1 << OCIE1A);
}

ISR(USART_RXC_vect)
{
	enqueue(&rx_queue, UDR);
}

ISR(TIMER1_COMPA_vect){
	tx_frame.packet_id ++;
	// TODO wyślij bajty do kolejki
	// 	uint8_t* data_ptr = (uint8_t*) frame_variable;
	// 	uint8_t frame_size = sizeof(some_frame_t);
	// Iteruj przez wszystkie bajty ramki i wyślij każdy do kolejki:
	// 	enqueue(data_ptr[i])
	uint8_t* data_ptr = (uint8_t*) &tx_frame;
	//uint8_t frame_size = sizeof(device_to_pc_frame_t);
	uint8_t frame_size = sizeof(sensor_data_frame_t);
	for(uint8_t i=0;i<frame_size;i++)
	{
		enqueue(&tx_queue,data_ptr[i]);
	}
}

uint8_t usart_receive_character() {
	while ((UCSRA & (1 << RXC)) == 0);
	return UDR;
}

void usart_transmit_character(uint8_t character) {
	while (!(UCSRA & (1 << UDRE)));
	UDR = character;
}
void keypad_init() {
	DDRB =  0xF0; // wiersze wejscia, kolumny wyjscia
	PORTB = 0xFF; // pull-upy na wiersze, kolumny wysoko
}

uint8_t keypad_scan() {
	for(uint8_t col = 0;col < 4;col++)
	{
		PORTB |= 0xF0;
		_delay_us(5);
		PORTB &=  ~(1 << (col + 4)); 
		_delay_us(5);
		for(uint8_t row = 0; row < 4 ; row++)
		{
			uint8_t odczyt = PINB & 0x0F;
			if ((odczyt & (1<<row)) == 0)
			{
				
				return row*4+col +1;
			}
		}
	}
	
	return 0;
}
int main(void)
{
	cli();
	led_initialize();
	keypad_init();
	usart_init();
	timer1_init();
	sei();

	while (1)
	{
		if (!is_empty(&tx_queue)) {
			usart_transmit_character(dequeue(&tx_queue));
		}

		if (!is_empty(&rx_queue)) {
			uint8_t usart_latest_byte = dequeue(&rx_queue);
			rx_buffer[rx_buffer_index] = usart_latest_byte;
			rx_buffer_index++;
			if(rx_buffer_index== sizeof(pc_to_device_frame_t))
			{
				memcpy(&rx_frame, rx_buffer, sizeof(pc_to_device_frame_t));
				rx_buffer_index=0;
				PORTA = 0;
				PORTA = rx_frame.led_to_light_flags ;
			}
			// TODO deserializuj dane:
			// 	Wstaw przychodzący bajt do bufora 'rx_buffer' i zwiększ indeks 'rx_buffer_index'
			// 	Jeśli indeks bufora osiągnie wartość ramki: sizeof(some_frame_t), to skopiuj bufor do zmiennej z ramką:
			// 	  memcpy(&rx_frame, rx_buffer, sizeof(some_frame_t))

			// TODO ustaw nowe wartości diod LED na podstawie ramki
		}

		// TODO sprawdź stany przycisków i zaktualizuj ramkę. Nie wysyłaj tutaj danych (zrobić ma to przerwanie timera TC1)
		uint8_t key = keypad_scan();
		if (key !=0)
		{
			
			tx_frame.temperature = (int16_t)( key *10);
			//tx_frame.packet_id = (uint16_t)(key);
			tx_frame.pressure = (float)(key);
			tx_frame.status_flags = (uint8_t)(key*2);
			tx_frame.uptime_seconds = (uint32_t)(key);
		}
	}
}
