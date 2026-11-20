@echo off
rem YCDO HMS: starts the fingerprint service (fp-bridge.py) on this centre PC.
rem The HMS web page (https://hms.ycdo.org.pk) talks to it on http://127.0.0.1:8790.
rem Keep this window open while registering patients.
cd /d "%~dp0"
title YCDO fingerprint service - BAND NA KAREIN

rem --- 1. Python -------------------------------------------------------------
set PY=
where python >nul 2>nul && python -c "import sys" >nul 2>nul && set PY=python
if not defined PY ( where py >nul 2>nul && set PY=py -3 )
if not defined PY (
  echo.
  echo  [X] Python is computer par install nahi hai.
  echo      python.org se Python 3 install karein. Install ke pehle screen par
  echo      "Add python.exe to PATH" par tick zaroor lagayein. Phir ye file dobara chalayein.
  echo.
  pause
  exit /b 1
)
echo  [OK] Python mil gaya

rem --- 2. Fingerprint SDK / driver ------------------------------------------
if not exist "%SystemRoot%\System32\libzkfp.dll" (
  echo.
  echo  [X] Fingerprint SDK installed nahi hai - scanner nahi chalega.
  echo      ZKFinger SDK for Windows ka setup.exe chalayein ^(ye scanner ka driver bhi
  echo      install karta hai^), scanner USB mein lagayein, phir ye file dobara chalayein.
  echo.
  pause
  exit /b 1
)
echo  [OK] Fingerprint SDK installed hai

rem --- 3. Already running? ---------------------------------------------------
netstat -ano | findstr /r /c:"127.0.0.1:8790 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo  [OK] Fingerprint service pehle se chal rahi hai. Kuch karne ki zaroorat nahi.
  timeout /t 6 >nul
  exit /b 0
)

rem --- 4. Start ---------------------------------------------------------------
echo.
echo  Fingerprint service shuru ho rahi hai: http://127.0.0.1:8790
echo  Ye window BAND NA KAREIN. Band karne se thumb scan kaam nahi karega.
echo  Chrome agar "local network" ki ijazat maange to Allow par click karein.
echo.
%PY% fp-bridge.py
echo.
echo  [X] Fingerprint service band ho gayi. Upar wala error dekhein, scanner ki USB
echo      check karein, phir ye file dobara chalayein.
pause
