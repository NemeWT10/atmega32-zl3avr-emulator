#define F_CPU 4000000UL
#include <avr/io.h>
#include <util/delay.h>
volatile uint8_t* LCD_DDR = &DDRB;
volatile uint8_t* LCD_PORT = &PORTB;
#define EN_LCD 0
#define RS_LCD 1
#define D4_LCD 4
#define D5_LCD 5
#define D6_LCD 6
#define D7_LCD 7

#define CMD_INIT1 0b00110011
#define CMD_INIT2 0b00110010
#define CMD_CLEAR (1<<0)
#define CMD_RET_HOME (1<<1)
#define CMD_ENTRY_MODE_SET (1<<2)
	#define CMD_ENTRY_MODE_SET_CURSOR_INC (1<<1)
	#define CMD_ENTRY_MODE_SET_CURSOR_DEC (0<<1)
	#define CMD_ENTRY_MODE_SET_DISPLAY_SHIFT_ON (1<<0)
	#define CMD_ENTRY_MODE_SET_DISPLAY_SHIFT_OFF (0<<0)
#define CMD_DISPLAY_CONF (1<<3)
	#define CMD_DISPLAY_CONF_DISPLAY_ON (1<<2)
	#define CMD_DISPLAY_CONF_DISPLAY_OFF (0<<2)
	#define CMD_DISPLAY_CONF_CURSOR_ON (1<<1)
	#define CMD_DISPLAY_CONF_CURSOR_OFF (0<<1)
	#define CMD_DISPLAY_CONF_CURSOR_BLINK_ON (1<<0)
	#define CMD_DISPLAY_CONF_CURSOR_BLINK_OFF (0<<0)
#define CMD_CURSOR_DISPLAY_SHIFT_CONF (1<<4)
	#define CMD_CURSOR_DISPLAY_SHIFT_CONF_DISPLAY_SHIFT (1<<3)
	#define CMD_CURSOR_DISPLAY_SHIFT_CONF_CURSOR_SHIFT (0<<3)
	#define CMD_CURSOR_DISPLAY_SHIFT_CONF_SHIFT_LEFT (0<<2)
	#define CMD_CURSOR_DISPLAY_SHIFT_CONF_SHIFT_RIGHT (1<<2)
#define CMD_FUNCTION_SET (1<<5)
	#define CMD_FUNCTION_SET_4bit_mode_ON (0<<4)
	#define CMD_FUNCTION_SET_8bit_mode_ON (1<<4)
	#define CMD_FUNCTION_SET_2_lines_ON (1<<3)
	#define CMD_FUNCTION_SET_1_lines_ON (0<<3)
	#define CMD_FUNCTION_SET_5x8_FONT_ON (0<<2)
	#define CMD_FUNCTION_SET_5x10_FONT_ON (1<<2)
#define CMD_SET_DDRAM_ADDR (1<<7)
#define CMD_SET_CGRAM_ADDR (1<<6)

void lcd_set_instruction_transmission_mode()
{
	*LCD_PORT &= ~(1<<RS_LCD);
}
void lcd_set_data_transmission_mode()
{
	*LCD_PORT |= (1<<RS_LCD);
}
void lcd_begin_transmission(){
	*LCD_PORT |= (1<<EN_LCD);
}
void lcd_end_transmission(){
	*LCD_PORT &= ~(1<<EN_LCD);
}
void lcd_set_4bits(uint8_t nibble)
{
	if(nibble & 0b1000)
	*LCD_PORT |= (1<<D7_LCD);
	if(nibble & 0b0100)
	*LCD_PORT |= (1<<D6_LCD);
	if(nibble & 0b0010)
	*LCD_PORT |= (1<<D5_LCD);
	if(nibble & 0b0001)
	*LCD_PORT |= (1<<D4_LCD);
}
void lcd_set_port_lower_nibble(uint8_t data)
{
	*LCD_PORT &= ~((1<<D4_LCD)|(1<<D5_LCD)|(1<<D6_LCD)|(1<<D7_LCD));
	data = data & 0x0F;
	lcd_set_4bits(data);
}
void lcd_set_port_upper_nibble(uint8_t data)
{
	*LCD_PORT &= ~((1<<D4_LCD)|(1<<D5_LCD)|(1<<D6_LCD)|(1<<D7_LCD));
	data = (data & 0xF0) >> 4;
	lcd_set_4bits(data);
}

void lcd_write_byte(uint8_t data)
{
	lcd_set_port_upper_nibble(data);
	lcd_begin_transmission();
	_delay_us(2);
	lcd_end_transmission();
	_delay_ms(5);
	lcd_set_port_lower_nibble(data);
	lcd_begin_transmission();
	_delay_us(2);
	lcd_end_transmission();
	_delay_ms(5);
}
void lcd_write_command(uint8_t command)
{
	lcd_set_instruction_transmission_mode();
	lcd_write_byte(command);
}
void lcd_write_character(uint8_t character)
{
	lcd_set_data_transmission_mode();
	lcd_write_byte(character);
}
void lcd_init()
{
	*LCD_DDR = 0xFF;
	_delay_ms(50);
	lcd_write_command(CMD_INIT1);
	_delay_ms(4);
	lcd_write_command(CMD_INIT2);
	_delay_ms(4);
	lcd_write_command(CMD_FUNCTION_SET | CMD_FUNCTION_SET_2_lines_ON | 
	CMD_FUNCTION_SET_4bit_mode_ON | CMD_FUNCTION_SET_5x8_FONT_ON);
	
	lcd_write_command(CMD_ENTRY_MODE_SET | CMD_ENTRY_MODE_SET_CURSOR_INC | CMD_ENTRY_MODE_SET_DISPLAY_SHIFT_OFF);
	lcd_write_command(CMD_DISPLAY_CONF | CMD_DISPLAY_CONF_DISPLAY_ON | 
	CMD_DISPLAY_CONF_CURSOR_ON | CMD_DISPLAY_CONF_CURSOR_BLINK_ON);
	
	_delay_ms(4);
	lcd_write_command(CMD_CLEAR);
	_delay_ms(4);
}
void lcd_write_string(uint8_t* data)
{
	uint8_t i=0;
	while(data[i])
	{
		lcd_write_character(data[i]);
		i++;
	}
}
void lcd_move_cursor_to(uint8_t row, uint8_t column){
	lcd_write_command(CMD_SET_DDRAM_ADDR | (0x40*row + column));
	
}
void lcd_clear()
{
	lcd_write_command(CMD_CLEAR);
}
void lcd_return_home()
{
	lcd_write_command(CMD_RET_HOME);
}
void lcd_clear_characters(uint8_t row, uint8_t col, uint8_t n_characters)
{
	lcd_move_cursor_to(row,col);
	for(uint8_t i=0;i<n_characters;i++)
		lcd_write_command(' ');
}
void lcd_make_new_symbol(uint8_t *znak, uint8_t slot)
{
	lcd_write_command( (CMD_SET_CGRAM_ADDR | 0));
	_delay_ms(2);
	for(uint8_t i=0;i<8;i++)
	{
		lcd_write_character(znak[i]);
		
	}
	lcd_move_cursor_to(0,0);
	lcd_write_character(0);
}
void keypad_init() {
	DDRA =  0xF0; // wiersze wejscia, kolumny wyjscia
	PORTA = 0xFF; // pull-upy na wiersze, kolumny wysoko
}

uint8_t keypad_scan() {
	for(uint8_t col = 0;col < 4;col++)
	{
		PORTA |= 0xF0;
		_delay_us(5);
		PORTA &=  ~(1 << (col + 4));
		_delay_us(5);
		for(uint8_t row = 0; row < 4 ; row++)
		{
			uint8_t odczyt = PINA & 0x0F;
			if ((odczyt & (1<<row)) == 0)
			{
				
				return row*4+col +1;
			}
		}
	}
	
	return 0;
}
void lcd_shift_window_left()
{
	lcd_write_command(CMD_CURSOR_DISPLAY_SHIFT_CONF |
	CMD_CURSOR_DISPLAY_SHIFT_CONF_DISPLAY_SHIFT |
	CMD_CURSOR_DISPLAY_SHIFT_CONF_SHIFT_LEFT);
}
void lcd_shift_window_right()
{
	lcd_write_command(CMD_CURSOR_DISPLAY_SHIFT_CONF |
	CMD_CURSOR_DISPLAY_SHIFT_CONF_DISPLAY_SHIFT |
	CMD_CURSOR_DISPLAY_SHIFT_CONF_SHIFT_RIGHT);
}
int main(void)
{
	keypad_init();
    lcd_init();
	
	lcd_move_cursor_to(0,2);
	lcd_write_string("Emulator AVR");
	lcd_move_cursor_to(1,3);
	lcd_write_string("Tech uPROC");
	
uint8_t customChar[8] = {
	0b00100,
	0b01010,
	0b10001,
	0b10001,
	0b10001,
	0b10001,
	0b01010,
	0b00100
};
	lcd_make_new_symbol(customChar,0);
    while (1) 
    {

		uint8_t key = keypad_scan();
		if (key != 0)
		{
			if (key==5)
			{
				lcd_clear();
				_delay_ms(50);
			}
			if (key==2)
			{
				lcd_return_home();
				lcd_write_string("Emulator AVR");
				_delay_ms(40);
			}
			if (key ==3)
			{
				lcd_shift_window_left();
				_delay_ms(200);		 
			}
			if (key ==4)
			{
				lcd_shift_window_right();
				_delay_ms(200);
			}
		}
		
    }
}

