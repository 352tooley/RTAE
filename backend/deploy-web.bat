@echo off
echo =======================================
echo RTAE - Build and Deploy Flutter Web
echo =======================================
echo.

echo Step 1: Building Flutter web...
cd ..\mobile
call flutter build web --release
if errorlevel 1 (
    echo ERROR: Flutter build failed
    pause
    exit /b 1
)

echo.
echo Step 2: Copying build to backend/public...
cd ..\backend
if exist public rmdir /S /Q public
xcopy /E /I /Y ..\mobile\build\web public
if errorlevel 1 (
    echo ERROR: Failed to copy build files
    pause
    exit /b 1
)

echo.
echo Step 3: Deploying to Firebase Hosting...
call firebase deploy --only hosting
if errorlevel 1 (
    echo ERROR: Firebase deploy failed
    pause
    exit /b 1
)

echo.
echo =======================================
echo Deploy Complete!
echo =======================================
echo.
echo Your app is now live at:
echo https://rtae-6211e.web.app
echo.
pause
