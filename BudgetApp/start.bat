@echo off
title Budget App Backend
echo Installing and verifying dependencies...
python -m pip install -r requirements.txt

echo Starting Budget App Backend Server...
timeout /t 2 /nobreak > nul
start http://127.0.0.1:8000/

echo Server is running on http://127.0.0.1:8000/
echo Keep this window open while using the app!
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
