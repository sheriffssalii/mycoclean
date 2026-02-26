#include <Arduino.h>
#include "DHT.h"

// =====================
// PIN DEFINITIONS
// =====================
#define DHTPIN 26
#define DHTTYPE DHT11
#define RELAY_PIN 27
#define SOIL_MOISTURE_PIN 4

#define GREEN_LED 18
#define RED_LED 19
#define BUZZER 21

// =====================
// SENSOR CONFIGURATION
// =====================
DHT dht(DHTPIN, DHTTYPE);

const int DRY_VALUE = 3315; 
const int WET_VALUE = 1070;

// =====================
// SYSTEM MODES & ALARMS
// =====================
enum SystemMode {
  MODE_COLONIZATION,
  MODE_FRUITING
};

enum AlarmState {
  ALARM_NONE,
  ALARM_WARNING,
  ALARM_CRITICAL
};

SystemMode currentMode = MODE_COLONIZATION;
AlarmState currentAlarm = ALARM_NONE;

// Individual Alert Flags for Dashboard
bool buzzerMuted = false;
bool tempAlert = false;
bool humAlert = false;
bool soilAlert = false;

// =====================
// THRESHOLDS
// =====================
const float COL_MIN_TEMP = 18.0;
const float COL_MAX_TEMP = 27.0;

const float FRU_MIN_TEMP = 18.0;
const float FRU_MAX_TEMP = 24.0;

const float FRU_MIN_HUM  = 80.0;
const float FRU_MAX_HUM  = 95.0;

const int FRU_MIN_SOIL = 45;
const int FRU_MAX_SOIL = 75;

// =====================
// TIMING VARIABLES
// =====================
unsigned long lastReadTime = 0;
const unsigned long readInterval = 2000; 

unsigned long lastAlarmMillis = 0;
const unsigned long alarmInterval = 500; 
bool alarmToggle = false;

// =====================
// FUNCTION PROTOTYPES
// =====================
void handleSerialCommands();
void handleEnvironment();
void handleColonization(float temp, float hum, int soil);
void handleFruiting(float temp, float hum, int soil);
void handleAlarms();
void sendDataToSerial(String modeStr, float temp, float hum, int soil, String alarmStr);

// =====================
// SETUP
// =====================
void setup() {
  Serial.begin(115200);

  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  dht.begin();
  
  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(BUZZER, HIGH);
  delay(100);
  digitalWrite(BUZZER, LOW);
  delay(400);
  digitalWrite(GREEN_LED, LOW);
  
  Serial.println("{\"status\": \"System Initialized via Serial\"}");
}

// =====================
// MAIN LOOP
// =====================
void loop() {
  handleSerialCommands();
  handleAlarms();

  if (millis() - lastReadTime >= readInterval) {
    lastReadTime = millis();
    handleEnvironment();
  }
}

// =====================
// ALARM PULSING LOGIC
// =====================
void handleAlarms() {
  if (currentAlarm == ALARM_NONE) {
    digitalWrite(GREEN_LED, HIGH);
    digitalWrite(RED_LED, LOW);
    digitalWrite(BUZZER, LOW);
    buzzerMuted = false; // Auto-reset the mute when things go back to normal!
  } 
  else if (currentAlarm == ALARM_CRITICAL) {
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(RED_LED, HIGH);
    // Only sound the buzzer if it hasn't been muted
    digitalWrite(BUZZER, buzzerMuted ? LOW : HIGH); 
  } 
  else if (currentAlarm == ALARM_WARNING) {
    digitalWrite(GREEN_LED, LOW);
    
    if (millis() - lastAlarmMillis >= alarmInterval) {
      lastAlarmMillis = millis();
      alarmToggle = !alarmToggle; 
      digitalWrite(RED_LED, alarmToggle ? HIGH : LOW);
      // Only pulse the buzzer if it hasn't been muted
      digitalWrite(BUZZER, (alarmToggle && !buzzerMuted) ? HIGH : LOW);
    }
  }
}

// =====================
// READ INCOMING SERIAL COMMANDS
// =====================
void handleSerialCommands() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim(); 

    if (command.equalsIgnoreCase("FRUITING")) {
      currentMode = MODE_FRUITING;
    } 
    else if (command.equalsIgnoreCase("COLONIZATION")) {
      currentMode = MODE_COLONIZATION;
    }
    // NEW: Listen for mute commands
    else if (command.equalsIgnoreCase("MUTE")) {
      buzzerMuted = true;
    }
    else if (command.equalsIgnoreCase("UNMUTE")) {
      buzzerMuted = false;
    }
  }
}

// =====================
// HANDLE SENSOR & LOGIC
// =====================
void handleEnvironment() {
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();

  int soilRaw = analogRead(SOIL_MOISTURE_PIN);
  int soilPercent = map(soilRaw, DRY_VALUE, WET_VALUE, 0, 100);
  soilPercent = constrain(soilPercent, 0, 100);

  if (isnan(temp) || isnan(hum)) {
    currentAlarm = ALARM_CRITICAL;
    tempAlert = true; humAlert = true; soilAlert = false;
    sendDataToSerial("ERROR", 0, 0, 0, "CRITICAL"); 
    return;
  }

  if (currentMode == MODE_COLONIZATION) {
    handleColonization(temp, hum, soilPercent);
  } else {
    handleFruiting(temp, hum, soilPercent);
  }

  String alarmStr = "NONE";
  if (currentAlarm == ALARM_WARNING) alarmStr = "WARNING";
  else if (currentAlarm == ALARM_CRITICAL) alarmStr = "CRITICAL";

  sendDataToSerial(currentMode == MODE_COLONIZATION ? "Colonization" : "Fruiting", temp, hum, soilPercent, alarmStr);
}

// =====================
// COLONIZATION LOGIC
// =====================
void handleColonization(float temp, float hum, int soil) {
  // 1. Evaluate Alarms
  tempAlert = (temp < COL_MIN_TEMP || temp > COL_MAX_TEMP);
  humAlert = false; 
  soilAlert = false;

  if (tempAlert) currentAlarm = ALARM_WARNING;
  else currentAlarm = ALARM_NONE;

  // 2. Control Hardware: Guarantee Humidifier is OFF during Spawn Run
  digitalWrite(RELAY_PIN, LOW); 
}

// =====================
// FRUITING LOGIC
// =====================
void handleFruiting(float temp, float hum, int soil) {
  // 1. Evaluate Alarms
  tempAlert = (temp < FRU_MIN_TEMP || temp > FRU_MAX_TEMP);
  humAlert  = (hum  < FRU_MIN_HUM  || hum  > FRU_MAX_HUM);
  soilAlert = (soil < FRU_MIN_SOIL || soil > FRU_MAX_SOIL);

  if (tempAlert || humAlert || soilAlert) currentAlarm = ALARM_WARNING;
  else currentAlarm = ALARM_NONE;

  // 2. Control Hardware: Automated Humidifier Logic for Fruit Production
  if (hum < FRU_MIN_HUM) {
    digitalWrite(RELAY_PIN, HIGH); // Turn Humidifier ON
  } else if (hum >= FRU_MAX_HUM) {
    digitalWrite(RELAY_PIN, LOW);  // Turn Humidifier OFF
  }
}

// =====================
// SEND DATA AS JSON TO COM PORT
// =====================
void sendDataToSerial(String modeStr, float temp, float hum, int soil, String alarmStr) {
  String json = "{";
  json += "\"mode\":\"" + modeStr + "\",";
  json += "\"temperature\":" + String(temp) + ",";
  json += "\"humidity\":" + String(hum) + ",";
  json += "\"soil\":" + String(soil) + ",";
  json += "\"alarm\":\"" + alarmStr + "\","; 
  json += "\"tempAlert\":" + String(tempAlert ? "true" : "false") + ",";
  json += "\"humAlert\":" + String(humAlert ? "true" : "false") + ",";
  json += "\"soilAlert\":" + String(soilAlert ? "true" : "false");
  json += ",\"muted\":" + String(buzzerMuted ? "true" : "false");
  json += "}";
  
  Serial.println(json);
}