@echo off
setlocal
chcp 65001 >nul

set "PYTHON_DIR=C:\Users\624\tools\python-embed"
set "AIDER_EXE=%PYTHON_DIR%\Scripts\aider.exe"

set "OPENAI_API_BASE=https://api.groq.com/openai/v1"
set "OPENAI_API_KEY=YOUR_GROQ_API_KEY_HERE"
set "MODEL=openai/groq/compound"

echo ======================================================
echo   Aider + Groq Compound Launcher (High Rate-Limit 70k)
echo   Model: %MODEL%
echo   Map Tokens: 512 (Anti-RateLimit)
echo ======================================================

if "%~1"=="" (
    "%AIDER_EXE%" --model %MODEL% --weak-model %MODEL% --editor-model %MODEL% --map-tokens 512 --no-show-model-warnings --yes-always
) else (
    "%AIDER_EXE%" --model %MODEL% --weak-model %MODEL% --editor-model %MODEL% --map-tokens 512 --no-show-model-warnings --yes-always %*
)
