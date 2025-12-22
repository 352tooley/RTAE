# RTAE v0.1 - Remote Task Autonomy Engine

Deploy-first browser automation system for Windows with Flutter web controller.

## System Overview

- **Controller**: Flutter Web (iPhone Safari compatible, "Add to Home Screen" friendly)
- **Backend**: Firebase (Auth, Firestore, Cloud Storage, Cloud Functions, Hosting)
- **Agent**: Windows Node.js + TypeScript + Playwright (Chromium persistent profile)
- **Autonomy**: READ-ONLY automation with certification ladder (DRAFT → CERTIFIED → QUARANTINED)

## Prerequisites (Windows)

### 1. Install Node.js
```powershell
# Download and install Node.js LTS (18.x or higher)
# Visit: https://nodejs.org/
# Verify installation:
node --version
npm --version
```

### 2. Install Firebase CLI
```powershell
npm install -g firebase-tools
firebase --version
```

### 3. Install Flutter
```powershell
# Download Flutter SDK for Windows
# Visit: https://docs.flutter.dev/get-started/install/windows
# Extract to C:\flutter
# Add C:\flutter\bin to PATH
# Verify installation:
flutter --version
flutter doctor
```

### 4. Install Git (if not already installed)
```powershell
# Download from https://git-scm.com/download/win
git --version
```

## Quick Start (Windows)

### Step 1: Clone Repository
```powershell
git clone <repository-url> rtae
cd rtae
```

### Step 2: Firebase Setup

#### 2.1 Create Firebase Project
1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Name it (e.g., "rtae-prod")
4. Disable Google Analytics (optional)
5. Create project

#### 2.2 Enable Firebase Services
In Firebase Console:
1. **Authentication**: Enable Email/Password provider
2. **Firestore Database**: Create database in production mode
3. **Storage**: Create default bucket
4. **Functions**: Upgrade to Blaze plan (required for Cloud Functions)

#### 2.3 Configure Firebase Project
```powershell
cd backend
firebase login
firebase use --add
# Select your Firebase project
# Enter alias: default
```

#### 2.4 Update .firebaserc
```powershell
# Edit backend/.firebaserc and replace "your-firebase-project-id" with your actual project ID
```

### Step 3: Deploy Backend

#### 3.1 Install Cloud Functions Dependencies
```powershell
cd backend/functions
npm install
cd ../..
```

#### 3.2 Deploy Firestore Rules, Storage Rules, and Functions
```powershell
cd backend
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
firebase deploy --only functions
# Wait for deployment to complete (5-10 minutes)
cd ..
```

### Step 4: Configure Flutter Web App

#### 4.1 Install FlutterFire CLI
```powershell
dart pub global activate flutterfire_cli
```

#### 4.2 Configure Firebase for Flutter
```powershell
cd mobile
flutterfire configure --project=<your-firebase-project-id>
# This will auto-generate lib/firebase_options.dart
```

#### 4.3 Install Flutter Dependencies
```powershell
flutter pub get
```

#### 4.4 Build Flutter Web App
```powershell
flutter build web --release
cd ..
```

### Step 5: Deploy Flutter Web to Firebase Hosting
```powershell
cd backend
firebase deploy --only hosting
# Note the hosting URL (e.g., https://rtae-prod.web.app)
cd ..
```

### Step 6: Setup Windows Agent

#### 6.1 Install Agent Dependencies
```powershell
cd agent
npm install
```

#### 6.2 Build Agent
```powershell
npm run build
```

#### 6.3 Install Playwright Browsers
```powershell
npx playwright install chromium
```

### Step 7: Pair Agent with Controller

#### 7.1 Open Web Controller
1. Open browser and go to your Firebase Hosting URL
2. Sign up with email/password
3. Navigate to "Devices" tab
4. Click "Generate Pairing Code"
5. Copy the 6-digit code

#### 7.2 Run Agent and Pair
```powershell
cd agent
npm start
# Follow prompts:
# - Enter Firebase Project ID: <your-firebase-project-id>
# - Enter Firebase Region: us-central1 (or your region)
# - Enter 6-digit pairing code: <code-from-web-controller>
# Agent will create agent-config.json and start polling for jobs
```

## Demo Checklist

### Test 1: Create and Run a Simple Task

1. **Create Task** (Web Controller)
   - Go to Tasks tab
   - Click "+" button
   - Title: "Check Google Homepage"
   - Instructions: "Go to https://www.google.com and check for Search"
   - Click "Create"

2. **Compile Task**
   - Click on the task to open details
   - Click "Compile" button
   - Wait for compilation
   - Verify "Compiled Plan" section appears

3. **Run Task**
   - Click "Run Now" button
   - Switch to agent terminal - you should see:
     - Job claimed
     - Browser launching (headful Chromium)
     - Navigation to google.com
     - Screenshots captured
     - Artifacts uploading
     - Job completed

4. **View Results**
   - Go to "Runs" tab in task detail
   - Click on the run
   - Verify status: SUCCESS
   - View screenshots

**Expected Outcome**: Task status remains DRAFT (need 3 successes for CERTIFIED)

### Test 2: Achieve Certification

1. **Run Same Task 3 Times**
   - Click "Run Now" three times (wait for each to complete)
   - After 3rd successful run, task status should change to CERTIFIED

**Expected Outcome**: Task status badge shows "CERTIFIED" (green)

### Test 3: Add Schedule (CERTIFIED tasks only)

1. **Add Schedule**
   - Go to "Schedule" tab in task detail
   - Click "Add Schedule"
   - Enter cron expression: `0 9 * * *` (daily at 9 AM)
   - Click "Add"
   - Schedule appears with enabled toggle

**Expected Outcome**: Schedule saved, will execute at next scheduled time

### Test 4: Test Auth Detection (Circuit Breaker)

1. **Create Task with Auth URL**
   - Title: "Test Auth Detection"
   - Instructions: "Go to https://accounts.google.com/signin"
   - Compile and Run Now

**Expected Outcome**:
- Run status: BLOCKED
- Summary: "Stopped: BLOCKED condition detected"
- Notification appears in Notifications tab (email fallback)

### Test 5: Test Quarantine (Circuit Breaker)

1. **Trigger 2 Consecutive Failures**
   - Create a task with invalid URL or selector
   - Run twice
   - After 2nd failure, task status → QUARANTINED
   - All schedules disabled
   - Notification sent

**Expected Outcome**:
- Task status badge shows "QUARANTINED" (red)
- Notification in Notifications tab

### Test 6: Verify Notification Fallback

1. **Check Notifications Tab**
   - Go to Notifications tab
   - Verify all failure/blocked/quarantine events are logged
   - Click to expand and view full notification body

**Expected Outcome**: All notifications visible in UI (since no email provider configured)

## File Structure

```
rtae/
├── shared/
│   ├── contract.md          # System contract and specifications
│   └── schema.ts            # TypeScript type definitions
├── backend/
│   ├── functions/
│   │   ├── src/
│   │   │   ├── index.ts     # Cloud Functions (pairing, jobs, compiler, notifications)
│   │   │   └── types.ts     # Type definitions
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── firestore.rules      # Firestore security rules
│   ├── storage.rules        # Cloud Storage security rules
│   ├── firebase.json        # Firebase config
│   └── .firebaserc          # Firebase project config
├── agent/
│   ├── src/
│   │   └── index.ts         # Windows agent worker (Playwright)
│   ├── package.json
│   ├── tsconfig.json
│   └── agent-config.json    # Generated after pairing
├── mobile/
│   ├── lib/
│   │   ├── main.dart
│   │   ├── firebase_options.dart  # Generated by flutterfire configure
│   │   ├── services/
│   │   │   └── auth_service.dart
│   │   └── screens/
│   │       ├── auth_screen.dart
│   │       ├── home_screen.dart
│   │       ├── tasks_screen.dart
│   │       ├── task_detail_screen.dart
│   │       ├── run_detail_screen.dart
│   │       ├── devices_screen.dart
│   │       └── notifications_screen.dart
│   ├── web/
│   │   ├── index.html       # PWA-enabled index
│   │   └── manifest.json    # PWA manifest
│   └── pubspec.yaml
└── README.md
```

## Firestore Collections

- `devices`: Paired Windows agents
- `tasks`: Automation tasks with compiled plans
- `schedules`: Cron-based task schedules
- `runs`: Execution history with artifacts
- `jobQueue`: Pending/claimed jobs for agents
- `pairingCodes`: Temporary 6-digit codes for device pairing
- `notifications`: Email notification logs (fallback)

## Cloud Storage Structure

```
artifacts/{ownerUserId}/{taskId}/{runId}/
├── screenshots/
│   ├── screenshot_001.png
│   ├── screenshot_002.png
│   └── ...
├── logs.txt
└── extracted.json (optional)
```

## Configuration Files to Update

1. **backend/.firebaserc**: Replace `your-firebase-project-id` with actual project ID
2. **mobile/lib/firebase_options.dart**: Auto-generated by `flutterfire configure`
3. **agent/agent-config.json**: Auto-generated during pairing

## Email Notifications (Optional)

To enable actual email sending instead of Firestore logs:

1. Set environment variable in Cloud Functions:
```powershell
firebase functions:config:set email.provider="sendgrid"
firebase functions:config:set email.api_key="YOUR_SENDGRID_API_KEY"
```

2. Update `backend/functions/src/index.ts` to implement email sending via provider

## Troubleshooting

### Agent Not Finding Jobs
- Verify agent is paired: check `agent/agent-config.json` exists
- Verify device is ACTIVE in web controller Devices tab
- Check agent console for errors
- Verify Firebase project ID matches in all configs

### Flutter Build Fails
- Run `flutter clean` then `flutter pub get`
- Verify `flutterfire configure` was run successfully
- Check `lib/firebase_options.dart` has correct project ID

### Functions Deployment Fails
- Verify Firebase project is on Blaze (pay-as-you-go) plan
- Run `npm install` in `backend/functions/` directory
- Check for TypeScript compilation errors: `npm run build`

### Browser Not Launching
- Run `npx playwright install chromium` in agent directory
- Verify Windows Defender/Firewall allows Playwright

### Screenshots Not Appearing
- Verify Cloud Storage bucket exists and rules are deployed
- Check agent console for upload errors
- Verify Storage URL permissions in web controller

## Development Tips

### Running Agent in Dev Mode
```powershell
cd agent
npm run dev
# This rebuilds TypeScript and runs agent
```

### Testing Functions Locally
```powershell
cd backend/functions
npm run serve
# Functions emulator runs at http://localhost:5001
```

### Hot Reload Flutter Web
```powershell
cd mobile
flutter run -d chrome
# Makes changes and hot reloads
```

## Security Notes

- **Device Tokens**: Stored locally in `agent-config.json` - keep secure
- **Firestore Rules**: Users can only access their own data
- **Storage Rules**: Artifact paths enforce user ownership
- **Authentication**: Email/password only (v0.1)

## Limitations (v0.1)

- **READ-ONLY**: No submit/approve/write actions supported
- **Single Region**: All resources in one Firebase region
- **No Mobile App**: Web-only controller (but iPhone Safari compatible)
- **Basic Compiler**: Heuristic-based, not LLM-powered
- **Windows Only**: Agent designed for Windows deployment

## Future Enhancements (Post-v0.1)

- LLM-based task compilation
- Advanced validation rules
- Multi-region support
- Native mobile apps
- Write action support with approval workflows
- Screenshot diffing and visual regression
- Metrics dashboard

## License

MIT

## Support

For issues and questions, refer to `shared/contract.md` for system specifications.
