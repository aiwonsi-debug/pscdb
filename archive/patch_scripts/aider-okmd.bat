@echo off
setlocal
chcp 65001 >nul

set "PYTHON_DIR=C:\Users\624\tools\python-embed"
set "AIDER_EXE=%PYTHON_DIR%\Scripts\aider.exe"

set "OPENAI_API_BASE=https://api.groq.com/openai/v1"
set "OPENAI_API_KEY=sk_4xDUBr2bGWtB8SkBEaquxaC8wZITiBrlS2g5siq6Qbusql5qOfJKaKq1YNx2r039"
set "DEFAULT_MODEL=openai/groq/compound"
set "MODEL_NAME=Groq Compound (70k Limit)"

if "%~1"=="" (
    echo ======================================================
    echo   Aider Launcher (Optimized Context)
    echo   Active Engine: %MODEL_NAME%
    echo   Model ID: %DEFAULT_MODEL%
    echo ======================================================
    "%AIDER_EXE%" --model %DEFAULT_MODEL% --weak-model %DEFAULT_MODEL% --editor-model %DEFAULT_MODEL% --map-tokens 512 --no-show-model-warnings --yes-always
) else (
    "%AIDER_EXE%" --model %DEFAULT_MODEL% --weak-model %DEFAULT_MODEL% --editor-model %DEFAULT_MODEL% --map-tokens 512 --no-show-model-warnings --yes-always %*
)
