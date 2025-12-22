@echo off
echo =======================================
echo RTAE v0.1 - Windows Setup Script
echo =======================================
echo.

echo Step 1: Installing backend dependencies...
cd backend\functions
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)
cd ..\..

echo.
echo Step 2: Installing agent dependencies...
cd agent
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install agent dependencies
    pause
    exit /b 1
)

echo.
echo Step 3: Installing Playwright browsers...
call npx playwright install chromium
if errorlevel 1 (
    echo ERROR: Failed to install Playwright browsers
    pause
    exit /b 1
)
cd ..

echo.
echo Step 4: Building backend Cloud Functions...
cd backend\functions
call npm run build
if errorlevel 1 (
    echo ERROR: Failed to build backend functions
    pause
    exit /b 1
)
cd ..\..

echo.
echo Step 5: Building agent...
cd agent
call npm run build
if errorlevel 1 (
    echo ERROR: Failed to build agent
    pause
    exit /b 1
)
cd ..

echo.
echo Step 6: Installing Flutter dependencies...
cd mobile
call flutter pub get
if errorlevel 1 (
    echo ERROR: Failed to install Flutter dependencies
    pause
    exit /b 1
)
cd ..

echo.
echo =======================================
echo Setup Complete!
echo =======================================
echo.
echo Next Steps:
echo 1. Configure Firebase:
echo    - cd backend
echo    - firebase login
echo    - firebase use --add
echo    - Update .firebaserc with your project ID
echo.
echo 2. Configure Flutter:
echo    - cd mobile
echo    - flutterfire configure --project=your-project-id
echo.
echo 3. Build and deploy:
echo    - cd mobile
echo    - flutter build web --release
echo    - cd ..\backend
echo    - firebase deploy
echo.
echo 4. Run agent:
echo    - cd agent
echo    - npm start
echo.
echo See README.md for detailed instructions.
echo.
pause
