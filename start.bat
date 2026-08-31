@echo off
cd /d "%~dp0"

if not exist "assets\audio" mkdir "assets\audio"

if not exist "assets\audio\qassimi_male_welcome.mp3" (
    if exist "C:\xampp2\htdocs\SaudiVoice\assets\audio\*.mp3" (
        echo Importing your eight welcome audio files...
        copy /Y "C:\xampp2\htdocs\SaudiVoice\assets\audio\*.mp3" "assets\audio\" >nul
    )
)

set "MISSING_AUDIO=0"
for %%F in (
    qassimi_male_welcome.mp3
    qassimi_female_welcome.mp3
    jeddawi_male_welcome.mp3
    jeddawi_female_welcome.mp3
    southern_male_welcome.mp3
    southern_female_welcome.mp3
    eastern_male_welcome.mp3
    eastern_female_welcome.mp3
) do (
    if not exist "assets\audio\%%F" (
        echo Missing audio file: %%F
        set "MISSING_AUDIO=1"
    )
)

if "%MISSING_AUDIO%"=="1" (
    echo.
    echo Welcome files are optional. Missing files will be generated and cached on first use.
)

if not exist ".env" (
    echo OPENAI_API_KEY=PASTE_KEY_HERE>".env"
    echo OPENAI_REALTIME_MODEL=gpt-realtime-1.5>>".env"
    echo OPENAI_TTS_MODEL=gpt-4o-mini-tts>>".env"
    echo REALTIME_VAD_EAGERNESS=high>>".env"
)
findstr /B /C:"OPENAI_REALTIME_MODEL=" ".env" >nul
if errorlevel 1 echo OPENAI_REALTIME_MODEL=gpt-realtime-1.5>>".env"
findstr /B /C:"OPENAI_TTS_MODEL=" ".env" >nul
if errorlevel 1 echo OPENAI_TTS_MODEL=gpt-4o-mini-tts>>".env"
findstr /B /C:"REALTIME_VAD_EAGERNESS=" ".env" >nul
if errorlevel 1 echo REALTIME_VAD_EAGERNESS=high>>".env"
findstr /C:"OPENAI_API_KEY=PASTE_KEY_HERE" ".env" >nul
if %errorlevel%==0 (
    echo.
    echo Paste your OpenAI API key after OPENAI_API_KEY=, save, then close Notepad.
    start /wait notepad.exe ".env"
)

findstr /B /C:"OPENAI_API_KEY=sk-" ".env" >nul
if errorlevel 1 (
    echo.
    echo The OpenAI API key is missing from .env.
    pause
    exit /b 1
)

where py >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON_CMD=py"
) else (
    set "PYTHON_CMD=python"
)
%PYTHON_CMD% -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo Failed to install Flask. Make sure Python is installed.
    pause
    exit /b 1
)
start "SaudiVoice Server" %PYTHON_CMD% app.py
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:5000
