@echo off
cd /d "%~dp0backend"
if not exist ".env" (
  echo Missing backend\.env.
  echo Copy backend\.env.example to backend\.env and set DATABASE_URL, JWT_SECRET, and AES_SECRET.
  pause
  exit /b 1
)
echo Starting Project-Print-Hello_Ethiopia--BirrBalance-Management-System-Finale backend...
call npm run dev
pause