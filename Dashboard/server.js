const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { SerialPort, ReadlineParser } = require('serialport');
const fs = require('fs'); // NEW: File System module to save data
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ==========================================
// 1. SERIAL PORT SETUP (Hardware Connection)
// ==========================================
const portName = 'COM5'; // CHANGE THIS IF YOUR ESP32 IS ON A DIFFERENT PORT
const serialPort = new SerialPort({ path: portName, baudRate: 115200 });
const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

// ==========================================
// 2. CSV LOGGING SETUP (The Data Dataset)
// ==========================================
const logFilePath = path.join(__dirname, 'mycowood_logs.csv');

// Check if the CSV exists. If not, create it and write the column headers.
if (!fs.existsSync(logFilePath)) {
    const headers = 'Timestamp,System Mode,Temperature (C),Humidity (%),Soil Moisture (%),Alarm State\n';
    fs.writeFileSync(logFilePath, headers);
    console.log('✅ Created new log file: mycowood_logs.csv');
}

// ==========================================
// 3. WEB SERVER SETUP
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// NEW: Create an API endpoint to send the CSV data to the dashboard
app.get('/api/logs', (req, res) => {
    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send("Error reading log file.");
        }
        res.send(data);
    });
});

// ==========================================
// 4. HANDLE INCOMING ESP32 DATA
// ==========================================
parser.on('data', (data) => {
    try {
        const parsedData = JSON.parse(data);
        
        // 1. Send live data to the web dashboard
        io.emit('sensorData', parsedData);

        // 2. Format the current date and time (e.g., "25/02/2026, 22:30:05")
        const now = new Date();
        const timestamp = now.toLocaleString('en-GB'); 

        // 3. Create a single row of data for the CSV
        // Make sure we only log if the data is valid
        if(parsedData.temperature !== undefined) {
            const csvRow = `"${timestamp}","${parsedData.mode}",${parsedData.temperature},${parsedData.humidity},${parsedData.soil},"${parsedData.alarm}"\n`;
            
            // 4. Append the row to the CSV file silently in the background
            fs.appendFile(logFilePath, csvRow, (err) => {
                if (err) console.error('Error writing to CSV:', err);
            });
        }

    } catch (err) {
        // Ignore incomplete JSON strings during startup
    }
});

// ==========================================
// 5. HANDLE DASHBOARD COMMANDS
// ==========================================
io.on('connection', (socket) => {
    console.log('💻 Dashboard connected.');

    // Listen for button clicks from the dashboard and send to ESP32
    socket.on('sendCommand', (command) => {
        console.log(`Sending command to ESP32: ${command}`);
        serialPort.write(`${command}\n`);
    });
});

// ==========================================
// 6. START SERVER
// ==========================================
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n==========================================`);
    console.log(`🚀 MycoWood Server is running on http://localhost:${PORT}`);
    console.log(`📊 Data is being logged to: mycowood_logs.csv`);
    console.log(`==========================================\n`);
});