@echo off
:loop
:: Abrir el programa especificado
start "" "C:\Users\opc\Downloads\usf\u2211.exe"

:: Esperar 5 segundos (ajustable según el tiempo que necesites)
timeout /t 90000

:: Buscar el PID del proceso u.exe
for /f "tokens=2" %%i in ('tasklist ^| findstr "u2211.exe"') do set PID=%%i

:: Matar el proceso utilizando el PID
taskkill /pid %PID% /f

:: Volver a repetir el proceso
goto loop
