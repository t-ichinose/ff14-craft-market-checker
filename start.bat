@echo off
chcp 65001 > nul
echo ========================================================
echo   FF14 Craft Market Rate Checker を起動しています...
echo ========================================================
echo.

cd /d "%~dp0"

echo 開発サーバー (Vite :3000) を起動中...
cd frontend
start "FF14 Market Tracker" cmd /c "npm run dev"

timeout /t 2 > nul
echo.
echo ブラウザを開いています: http://localhost:3000
start http://localhost:3000

echo ========================================================
echo   起動完了！ ブラウザで利用可能です。
echo   終了する場合は、開いたコマンドプロンプト画面を閉じてください。
echo ========================================================
pause
