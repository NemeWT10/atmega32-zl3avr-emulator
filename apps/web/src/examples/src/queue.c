#include "queue.h"

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

void init_queue(queue *q) {
	q->front = 0;
	q->rear = 0;
}

bool is_full(queue *q) {
	return (q->rear + 1) % MAX_QUEUE_ELEMENTS == q->front;
}

bool is_empty(queue *q) {
	return q->front == q->rear;
}

void enqueue(queue *q, uint8_t value) {
	if (is_full(q)) {
		printf("Queue overflow\n");
		} else {
		q->arr[q->rear] = value;
		q->rear = (q->rear + 1) % MAX_QUEUE_ELEMENTS;  // Circular increment
	}
}

uint8_t dequeue(queue *q) {
	if (is_empty(q)) {
		printf("Queue underflow\n");
		return 0;  // Return 0 as an error value
		} else {
		uint8_t value = q->arr[q->front];
		q->front = (q->front + 1) % MAX_QUEUE_ELEMENTS;  // Circular increment
		return value;
	}
}