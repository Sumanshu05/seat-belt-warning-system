//Aim:  Seat belt Occupation Warning

//Author: Sumanshu Nagpal


#include <avr/io.h>            
#include <avr/interrupt.h>
// function declarations
void init();
void pwm_init();
void pwm_on();
void timer0_init();
void timer_off();
void pwm_off();

// declaration of different variables
int Count;
int seat_occupied=0;
int seat_belt=0;
int req_delay = 0;

//main function
int main()
{
  
  sei();     // global interrupt  enable
  Serial.begin(9600);
  DDRD |= (1 << PD7); // digital pin 7 set as output
  init(); 
  
  
  while(1)
  {
    if (seat_occupied == 1) 
    {
      	Serial.println(" seat occupied");
        if (seat_belt == 0)
        {
      		timer0_init();
       		if(req_delay == 1)
      		{
              PORTD |= (1 << PD7);
              pwm_init();
        	pwm_on();
        	Serial.println("buzzer ON");
        	}
    	}
      else
      {
        Serial.println("seat belt on");
        PORTD &= ~(1 << PD7);
     	timer_off();
      	pwm_off();
      }
    }
    else
    {
      Serial.println("In else");
      PORTD &= ~(1 << PD7);
      timer_off();
      pwm_off();
    }
  }
  
}

// functions definations 
void init()
{
  EICRA |=  (1 << ISC00);// set external inerrupt  to  logical change
  EICRA &=~ (1 << ISC01);
  EICRA |= (1 << ISC10);
  EICRA &=~ (1 << ISC11);
  EIMSK |= (1 << INT0); //external interrupt enable
  EIMSK |= (1 << INT1);
  
}
void pwm_init()
{
    TCCR1B |= (1 << WGM12)|(1 << CS11)|(1 << CS10);       // clock source
  	OCR1A = 512;
  	OCR1B = 0;
	TIMSK1 |= (1 << OCIE1A)|(1<<OCIE1B);                 // enable compare interrupt
}

void pwm_on()
{
  TIMSK1 |= (1 << OCIE1A)|(1<<OCIE1B);//PWM ON   
  OCR1A = 256; 
  OCR1B = 128;               // 50% duty cycle
}
void timer0_init()
{
	TCCR0A |=(1 << WGM01);                 // to choose ctc mode 
	OCR0A= 81;                            
	TIMSK0 |= (1 <<  OCIE0A) ;             // enabling timer interrupt 
  	TCCR0B |= (1 << CS02)|(1 << CS00);    // clock source
  
}
void timer_off()
{
  TIMSK1 &=~ ((1 << OCIE1A)|(1<<OCIE1B));//PWM off state 
  TCCR0A = 0x00;
  TIMSK0 = 0x00;
  req_delay = 0;
}


void pwm_off()
{
  
  OCR1A = 256;
  OCR1B = 0;
}




// ISR DEFINATIONS

ISR (TIMER1_COMPA_vect)    //ISR FOR TIMER1
{
	PORTD |= (1 << PD7);                                  
}
ISR (TIMER1_COMPB_vect)     // ISR FOR TIMER1
{
	PORTD &= ~(1 << PD7);
}

ISR (INT0_vect)          //ISR FOR EXTERNAL INTERRUPT
{
  seat_occupied++;
  seat_occupied = seat_occupied % 2 ;
}

ISR (INT1_vect)       //ISR FOR EXTERNAL INTERRUPT
{PORTD |= (1 << PD7);
 seat_belt++;
 seat_belt = seat_belt % 2 ;
}

ISR(TIMER0_COMPA_vect)   //ISR FOR TIMER 0
{
	Count++;
	if (Count >= 100)           
	{
      req_delay = 1;
      Count=0;
    }
}

