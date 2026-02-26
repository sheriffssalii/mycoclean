@echo off
title MycoWood System Launcher
color 0A

echo ==========================================
echo    STARTING MYCOWOOD SCADA SYSTEM...
echo ==========================================
echo.

:: 1. Start the Node.js Server in a new window
echo [1] Launching Node.js Local Server on Port 3000...
start "MycoWood Local Server" cmd /k "node server.js"

:: Wait 2 seconds for Node to start
timeout /t 2 /nobreak > NUL

:: 2. Start Ngrok in a new window
echo [2] Opening Ngrok Secure Tunnel...
start "MycoWood Public Tunnel" cmd /k "ngrok http 3000"

:: Wait 3 seconds for Ngrok to connect to the internet
echo [3] Waiting for servers to initialize...
timeout /t 3 /nobreak > NUL

:: 3. Automatically open Chrome!
echo [4] Launching Google Chrome...
start chrome "http://localhost:3000"
start chrome "http://localhost:4040"

echo.
echo ==========================================
echo    SYSTEM IS LIVE! 
echo    Copy the public link from the Ngrok tab.
echo ==========================================
pause