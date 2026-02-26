// ==========================================
// 1. PAGE NAVIGATION LOGIC
// ==========================================
function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active-view');
    });
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.remove('active');
    });

    document.getElementById(tabId).classList.add('active-view');
    event.currentTarget.classList.add('active');

    // Auto-refresh logs when the tab is opened
    if (tabId === 'logs') {
        loadLogs();
    }
}

// ==========================================
// 2. CHART.JS SETUP
// ==========================================
const ctx = document.getElementById('mycoChart').getContext('2d');
Chart.defaults.color = '#a0a0a0';
Chart.defaults.font.family = "'Segoe UI', sans-serif";

const mycoChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [], 
        datasets: [
            {
                label: 'Temperature (°C)',
                borderColor: '#ff4757',
                backgroundColor: 'rgba(255, 71, 87, 0.1)',
                data: [],
                tension: 0.4,
                fill: true
            },
            {
                label: 'Humidity (%)',
                borderColor: '#3742fa',
                backgroundColor: 'rgba(55, 66, 250, 0.1)',
                data: [],
                tension: 0.4,
                fill: true
            },
            {
                label: 'Soil Moisture (%)',
                borderColor: '#2ed573',
                backgroundColor: 'rgba(46, 213, 115, 0.1)',
                data: [],
                tension: 0.4,
                fill: true
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
            y: { grid: { color: '#333' } },
            x: { grid: { display: false } }
        }
    }
});

// ==========================================
// 3. GRAPH FILTER LOGIC
// ==========================================
function setGraphView(view) {
    const ds = mycoChart.data.datasets;
    
    if (view === 'all') {
        ds[0].hidden = false; ds[1].hidden = false; ds[2].hidden = false;
    } else if (view === 'temp') {
        ds[0].hidden = false; ds[1].hidden = true; ds[2].hidden = true;
    } else if (view === 'hum') {
        ds[0].hidden = true; ds[1].hidden = false; ds[2].hidden = true;
    } else if (view === 'soil') {
        ds[0].hidden = true; ds[1].hidden = true; ds[2].hidden = false;
    }
    mycoChart.update();
}

// ==========================================
// 4. SERVER CONNECTION & REAL-TIME DATA
// ==========================================
const socket = io(); 
let currentMode = "COLONIZATION";
let isMuted = false;
const modeDisplay = document.getElementById('modeDisplay');

socket.on('sensorData', (data) => {
    if (data.temperature !== undefined && data.humidity !== undefined && data.soil !== undefined) {
        
        // Update UI Cards
        document.getElementById('tempValue').textContent = data.temperature.toFixed(1) + ' °C';
        document.getElementById('humValue').textContent = data.humidity.toFixed(1) + ' %';
        document.getElementById('soilValue').textContent = data.soil + ' %';

        // Sync Mode Badge
        if (data.mode === "Colonization") {
            currentMode = "COLONIZATION";
            modeDisplay.textContent = "COLONIZATION";
            modeDisplay.className = "mode-badge colonization";
        } else if (data.mode === "Fruiting") {
            currentMode = "FRUITING";
            modeDisplay.textContent = "FRUITING";
            modeDisplay.className = "mode-badge fruiting";
        }

        // Sync Main Alarm Badge
        const alarmDisplay = document.getElementById('alarmDisplay');
        if (data.alarm === "NONE") {
            alarmDisplay.textContent = "STABLE";
            alarmDisplay.className = "mode-badge fruiting"; 
        } else if (data.alarm === "WARNING") {
            alarmDisplay.textContent = "WARNING: OUT OF BOUNDS";
            alarmDisplay.className = "mode-badge warning-pulse"; 
        } else if (data.alarm === "CRITICAL") {
            alarmDisplay.textContent = "CRITICAL: SENSOR ERROR";
            alarmDisplay.className = "mode-badge critical-pulse"; 
        }

        // Sync Mute Button State
        if (data.muted !== undefined) {
            isMuted = data.muted;
            const btnMute = document.getElementById('btnMute');
            
            if (isMuted) {
                btnMute.innerHTML = '<i class="fa-solid fa-volume-high"></i> Unmute Buzzer';
                btnMute.className = 'btn btn-danger'; 
            } else {
                btnMute.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> Mute Buzzer';
                btnMute.className = 'btn btn-warning'; 
            }
        }

        // Handle Individual Card Flashing 
        const tempCard = document.getElementById('tempCard');
        const humCard = document.getElementById('humCard');
        const soilCard = document.getElementById('soilCard');

        if (data.tempAlert === true) tempCard.classList.add('card-error');
        else tempCard.classList.remove('card-error');

        if (data.humAlert === true) humCard.classList.add('card-error');
        else humCard.classList.remove('card-error');

        if (data.soilAlert === true) soilCard.classList.add('card-error');
        else soilCard.classList.remove('card-error');

        // Update Live Graph
        const now = new Date();
        const timeLabel = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');

        if (mycoChart.data.labels.length > 15) {
            mycoChart.data.labels.shift();
            mycoChart.data.datasets.forEach(dataset => dataset.data.shift());
        }
        
        mycoChart.data.labels.push(timeLabel);
        mycoChart.data.datasets[0].data.push(data.temperature);
        mycoChart.data.datasets[1].data.push(data.humidity);
        mycoChart.data.datasets[2].data.push(data.soil);
        
        mycoChart.update();
    }
});

// ==========================================
// 5. FETCH AND DISPLAY HISTORICAL LOGS
// ==========================================
async function loadLogs() {
    try {
        const response = await fetch('/api/logs');
        const csvText = await response.text();
        
        // Split text into individual rows
        const rows = csvText.trim().split('\n');
        rows.shift(); // Remove the header
        rows.reverse(); // Newest first

        const tbody = document.querySelector('#logsTable tbody');
        tbody.innerHTML = ''; 

        const maxRows = Math.min(rows.length, 100);

        for(let i = 0; i < maxRows; i++) {
            const cols = rows[i].split(',');
            if(cols.length < 6) continue;

            let time, mode, temp, hum, soil, alarm;

            // SMART CSV PARSER: Check if the timestamp was split by an accidental comma
            if (cols.length >= 7) {
                // Stitch the Date (cols[0]) and Time (cols[1]) back together
                time = (cols[0] + "," + cols[1]).replace(/"/g, '').trim();
                mode = cols[2].replace(/"/g, '');
                temp = cols[3];
                hum = cols[4];
                soil = cols[5];
                alarm = cols[6].replace(/"/g, '').trim();
            } else {
                // Normal reading (just in case)
                time = cols[0].replace(/"/g, '').trim();
                mode = cols[1].replace(/"/g, '');
                temp = cols[2];
                hum = cols[3];
                soil = cols[4];
                alarm = cols[5].replace(/"/g, '').trim();
            }

            // Color-code the alarm text
            let alarmClass = 'log-stable';
            if(alarm === 'WARNING') alarmClass = 'log-warning';
            if(alarm === 'CRITICAL') alarmClass = 'log-critical';

            // Create the HTML row
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${time}</td>
                <td>${mode}</td>
                <td>${temp}</td>
                <td>${hum}</td>
                <td>${soil}</td>
                <td class="${alarmClass}">${alarm}</td>
            `;
            tbody.appendChild(tr);
        }
    } catch (err) {
        console.error("Failed to load logs", err);
    }
}

// ==========================================
// 6. SEND COMMANDS TO ESP32
// ==========================================
document.getElementById('btnMode').addEventListener('click', () => {
    if(currentMode === "COLONIZATION") {
        socket.emit('sendCommand', 'FRUITING');
    } else {
        socket.emit('sendCommand', 'COLONIZATION');
    }
});

// Mute Button Logic
document.getElementById('btnMute').addEventListener('click', () => {
    if(isMuted) {
        socket.emit('sendCommand', 'UNMUTE');
    } else {
        socket.emit('sendCommand', 'MUTE');
    }
});

document.getElementById('btnRestart').addEventListener('click', () => {
    alert("System Restart feature will be implemented in the next firmware update.");
});