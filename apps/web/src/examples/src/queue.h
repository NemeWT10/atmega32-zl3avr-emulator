#ifndef QUEUE_H
#define QUEUE_H

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#define MAX_QUEUE_ELEMENTS 128

typedef struct {
	uint8_t arr[MAX_QUEUE_ELEMENTS];
	int front;
	int rear;
} queue;

void init_queue(queue *q);
bool is_full(queue *q);
bool is_empty(queue *q);
void enqueue(queue *q, uint8_t value);
uint8_t dequeue(queue *q);

#endif // QUEUE_H