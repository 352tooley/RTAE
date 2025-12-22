# RTAE v0.1 - Quick Start Guide

Get RTAE running in 15 minutes on Windows.

## 1. Prerequisites (5 minutes)

Download and install:
- Node.js 18+ from https://nodejs.org/
- Flutter from https://docs.flutter.dev/get-started/install/windows
- Git from https://git-scm.com/download/win

Verify installations:
```powershell
node --version
flutter --version
git --version
```

Install Firebase CLI:
```powershell
npm install -g firebase-tools
```

## 2. Firebase Project (3 minutes)

1. Go to https://console.firebase.google.com/
2. Create new project (name: rtae-demo)
3. Enable services:
   - Authentication → Email/Password ✓
   - Firestore Database → Create ✓
   - Storage → Create ✓
   - Functions → Upgrade to Blaze plan ✓

## 3. Clone and Setup (2 minutes)

```powershell
git clone <repo-url> rtae
cd rtae
setup.bat
```

This installs all dependencies automatically.

## 4. Configure Firebase (3 minutes)

```powershell
# Login to Firebase
firebase login

# Configure backend
cd backend
firebase use --add
# Select your project, alias: default

# Update .firebaserc with your project ID
# (Replace "your-firebase-project-id" with actual ID)

# Configure Flutter
cd ..\mobile
flutterfire configure --project=rtae-demo
# Select Web platform only
```

## 5. Deploy (2 minutes)

```powershell
# Build Flutter web
flutter build web --release

# Deploy everything
cd ..\backend
firebase deploy
```

Wait for deployment (~2 minutes). Note your hosting URL.

## 6. Run Agent and Test (5 minutes)

Open web controller:
- Visit your hosting URL (e.g., https://rtae-demo.web.app)
- Sign up with any email/password
- Go to Devices tab
- Click "Generate Pairing Code"
- Copy the 6-digit code

Start agent:
```powershell
cd ..\agent
npm start
# Enter project ID: rtae-demo
# Enter region: us-central1
# Enter pairing code: 123456
```

Agent should start polling.

## 7. Create Your First Task

In web controller:
1. Go to Tasks tab
2. Click "+" button
3. Title: `Test Google`
4. Instructions: `Go to https://www.google.com`
5. Click Create
6. Click on task → Compile → Run Now

Watch agent terminal for browser automation!

## Done! 🎉

Your RTAE system is now running. See README.md for full documentation.

## Quick Commands Reference

```powershell
# Deploy everything
cd backend
firebase deploy

# Deploy functions only
firebase deploy --only functions

# Deploy hosting only
firebase deploy --only hosting

# Run agent
cd agent
npm start

# Build Flutter web
cd mobile
flutter build web --release

# View functions logs
firebase functions:log
```

## Troubleshooting

**Agent won't start**: Run `npx playwright install chromium` in agent folder

**Compile fails**: Instructions contain write keywords (submit, approve, etc.)

**Functions fail**: Verify Blaze plan is active and billing enabled

**Web build fails**: Run `flutterfire configure` again

## What's Next?

- Follow DEMO_CHECKLIST.md for full feature testing
- Configure email notifications (optional)
- Create more complex tasks
- Achieve CERTIFIED status (3 consecutive successes)
- Add schedules to CERTIFIED tasks

Enjoy your autonomous browser automation system!
