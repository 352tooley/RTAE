# RTAE v0.1 Demo Checklist

Complete end-to-end verification of the Remote Task Autonomy Engine.

## Prerequisites Verification

- [ ] Node.js 18+ installed: `node --version`
- [ ] Firebase CLI installed: `firebase --version`
- [ ] Flutter installed: `flutter --version`
- [ ] Firebase project created and Blaze plan enabled
- [ ] Firebase services enabled: Auth, Firestore, Storage, Functions, Hosting

## Deployment Verification

### Backend Deployment

- [ ] Cloud Functions deployed successfully
  ```powershell
  cd backend
  firebase deploy --only functions
  ```
  **Expected**: All functions deploy without errors
  - createPairingCode
  - claimPairingCode
  - compileTaskPlan
  - enqueueJob
  - claimJob
  - completeJob
  - updateDeviceHeartbeat
  - getAvailableJobs
  - processSchedules

- [ ] Firestore rules deployed
  ```powershell
  firebase deploy --only firestore:rules
  ```
  **Expected**: Rules deployed successfully

- [ ] Storage rules deployed
  ```powershell
  firebase deploy --only storage:rules
  ```
  **Expected**: Rules deployed successfully

### Flutter Web Deployment

- [ ] Flutter web built successfully
  ```powershell
  cd mobile
  flutter build web --release
  ```
  **Expected**: Build completes in `build/web/`

- [ ] Web app deployed to Firebase Hosting
  ```powershell
  cd backend
  firebase deploy --only hosting
  ```
  **Expected**: Hosting URL active (e.g., https://your-project.web.app)

### Agent Setup

- [ ] Agent dependencies installed
  ```powershell
  cd agent
  npm install
  ```
  **Expected**: No errors

- [ ] Agent built successfully
  ```powershell
  npm run build
  ```
  **Expected**: TypeScript compiles to `dist/`

- [ ] Playwright browsers installed
  ```powershell
  npx playwright install chromium
  ```
  **Expected**: Chromium downloaded

## Functional Testing

### Test 1: User Authentication

1. [ ] Open web controller URL in browser
2. [ ] Click "Sign Up"
3. [ ] Enter email: `test@example.com`
4. [ ] Enter password: `test123456`
5. [ ] Click "Sign Up" button

**Expected Outcome**:
- ✓ User created in Firebase Auth
- ✓ Redirected to home screen
- ✓ Bottom navigation visible (Tasks, Devices, Notifications)

### Test 2: Device Pairing

1. [ ] Click "Devices" tab
2. [ ] Click "Generate Pairing Code" button
3. [ ] Enter device name: `Windows Test Agent`
4. [ ] Copy the 6-digit code (e.g., `123456`)

5. [ ] Open new PowerShell terminal
   ```powershell
   cd agent
   npm start
   ```
6. [ ] Enter Firebase Project ID when prompted
7. [ ] Enter Firebase Region: `us-central1`
8. [ ] Enter 6-digit pairing code
9. [ ] Agent creates `agent-config.json`
10. [ ] Agent starts polling: "Starting job polling..."

11. [ ] Return to web controller
12. [ ] Refresh Devices tab

**Expected Outcome**:
- ✓ New device appears in list
- ✓ Status: ACTIVE
- ✓ Last seen: "Just now"
- ✓ Agent console shows heartbeat updates every few seconds

### Test 3: Create and Compile Task

1. [ ] Click "Tasks" tab
2. [ ] Click "+" FAB button
3. [ ] Enter title: `Google Homepage Check`
4. [ ] Enter instructions:
   ```
   Go to https://www.google.com and check for Search
   ```
5. [ ] Click "Create"

6. [ ] Click on the task to open detail screen
7. [ ] Verify status badge shows "DRAFT"
8. [ ] Click "Compile" button
9. [ ] Wait for compilation

**Expected Outcome**:
- ✓ Task appears in task list
- ✓ Compile button shows loading spinner
- ✓ "Compiled Plan" section appears
- ✓ Shows: "Steps: 4", "Max Duration: 300s"
- ✓ "Validation Spec" section appears
- ✓ Success toast: "Task compiled successfully"

### Test 4: Run Task (1st Time)

1. [ ] Click "Run Now" button
2. [ ] Watch agent terminal

**Agent Terminal Expected**:
```
--- Processing Job {jobId} ---
Claiming job...
✓ Job claimed successfully
Launching browser...
[timestamp] Starting task execution
[timestamp] Step: navigate
  → Navigated to https://www.google.com
[timestamp] Step: wait
  → Waited 3000ms
[timestamp] Step: screenshot
  → Captured screenshot #1
[timestamp] Step: screenshot
  → Captured screenshot #2
[timestamp] Task execution completed with status: SUCCESS
Uploading artifacts...
Completing job...
✓ Job completed with status: SUCCESS
```

3. [ ] Chromium browser should launch (headful)
4. [ ] Navigate to google.com
5. [ ] Browser closes after completion

6. [ ] Return to web controller
7. [ ] Go to "Runs" tab in task detail
8. [ ] Click on the latest run

**Expected Outcome**:
- ✓ Run status: SUCCESS (green checkmark)
- ✓ Summary: "Task completed successfully with validation passed"
- ✓ Screenshots appear (2 screenshots)
- ✓ Timestamps shown
- ✓ Task still shows status: DRAFT
- ✓ Success counter: 1/3

### Test 5: Run Task (2nd and 3rd Time - Certification)

1. [ ] Go back to task detail
2. [ ] Click "Run Now" again
3. [ ] Wait for completion
4. [ ] Verify success counter: 2/3

5. [ ] Click "Run Now" third time
6. [ ] Wait for completion

**Expected Outcome**:
- ✓ After 3rd successful run, task status changes to CERTIFIED
- ✓ Status badge turns green
- ✓ Success counter: 3/3
- ✓ All 3 runs show SUCCESS in Runs tab

### Test 6: Add Schedule (CERTIFIED Only)

1. [ ] Go to "Schedule" tab
2. [ ] Verify info banner is gone (task is now CERTIFIED)
3. [ ] Click "Add Schedule" button
4. [ ] Enter cron expression: `0 9 * * *` (daily at 9 AM)
5. [ ] Click "Add"

**Expected Outcome**:
- ✓ Schedule appears in list
- ✓ Shows: "0 9 * * *"
- ✓ Enabled toggle is ON
- ✓ Schedule saved to Firestore

### Test 7: Auth Detection (Stop Condition)

1. [ ] Go back to Tasks tab
2. [ ] Create new task:
   - Title: `Auth Detection Test`
   - Instructions: `Go to https://accounts.google.com/signin`
3. [ ] Click "Create"
4. [ ] Open task detail
5. [ ] Click "Compile"
6. [ ] Click "Run Now"

**Agent Terminal Expected**:
```
[timestamp] Step: navigate
  → Navigated to https://accounts.google.com/signin
[timestamp] Stop condition: BLOCKED
Stopped: BLOCKED condition detected
```

7. [ ] Check run detail in web controller

**Expected Outcome**:
- ✓ Run status: BLOCKED (orange icon)
- ✓ Summary contains "BLOCKED condition detected"
- ✓ Screenshot shows Google sign-in page
- ✓ Notification appears in Notifications tab
- ✓ Notification subject: "Task Run BLOCKED: Auth Detection Test"
- ✓ Notification body explains stop condition

### Test 8: Circuit Breaker (Quarantine)

1. [ ] Create new task:
   - Title: `Invalid Task`
   - Instructions: `Go to https://invalid-url-that-does-not-exist-12345.com`
2. [ ] Compile and Run Now
3. [ ] Wait for FAIL status
4. [ ] Run Now again (2nd failure)

**Expected Outcome After 2nd Failure**:
- ✓ Task status changes to QUARANTINED (red badge)
- ✓ All schedules for this task disabled
- ✓ Notification appears with subject: "Task Quarantined: Invalid Task"
- ✓ Notification body shows:
  - "quarantined after 2 consecutive failures"
  - Last run status
  - "All schedules have been disabled"
- ✓ Cannot add new schedules while quarantined

### Test 9: Notification Fallback UI

1. [ ] Click "Notifications" tab
2. [ ] Verify all notifications from previous tests appear
3. [ ] Click to expand a notification
4. [ ] Verify full details shown:
   - Recipient email
   - Subject
   - Full body
   - Task ID
   - Run ID (if applicable)
   - Timestamp

**Expected Outcome**:
- ✓ Info banner shows: "These are notification logs (email fallback)"
- ✓ Notifications sorted by newest first
- ✓ Color-coded icons (red for quarantine, orange for fail/blocked, etc.)
- ✓ Expandable cards with full message

### Test 10: Mobile Responsiveness (iPhone Safari)

1. [ ] Open web controller on iPhone Safari
2. [ ] Test "Add to Home Screen":
   - Tap Share button
   - Tap "Add to Home Screen"
   - Confirm
3. [ ] Launch app from home screen

**Expected Outcome**:
- ✓ Renders correctly on mobile viewport
- ✓ Bottom navigation accessible
- ✓ All screens responsive
- ✓ Runs in standalone mode (no Safari UI)
- ✓ Touch interactions work smoothly

### Test 11: Data Extraction

1. [ ] Create new task:
   - Title: `Extract Google Title`
   - Instructions: `Go to https://www.google.com and extract the page title`
2. [ ] Compile task
3. [ ] Manually add extraction step to compiled plan (via Firestore console):
   - Add step: `{ "action": "extract", "selector": "title", "extractAs": "pageTitle" }`
4. [ ] Run Now

**Expected Outcome**:
- ✓ Run completes with SUCCESS
- ✓ Run detail shows "Extracted Values" section
- ✓ Shows: `pageTitle: Google` (or similar)
- ✓ extracted.json file exists in Cloud Storage

### Test 12: Scheduled Execution (Optional - Time-Based)

1. [ ] Use a CERTIFIED task with schedule
2. [ ] Modify schedule to run in next 2 minutes (via Firestore console)
3. [ ] Wait for scheduled time
4. [ ] Keep agent running

**Expected Outcome**:
- ✓ Cloud Function `processSchedules` triggers (check Functions logs)
- ✓ Job enqueued automatically
- ✓ Agent picks up job and executes
- ✓ New run appears in task detail
- ✓ Schedule's `nextRunAt` updated to next occurrence

## Integration Verification

### Firestore Data Integrity

1. [ ] Open Firebase Console → Firestore
2. [ ] Verify collections exist:
   - devices (with your device)
   - tasks (with your test tasks)
   - schedules (with your schedules)
   - runs (with execution history)
   - notifications (with notification logs)
   - pairingCodes (claimed codes)

### Cloud Storage Verification

1. [ ] Open Firebase Console → Storage
2. [ ] Navigate to `artifacts/{userId}/{taskId}/{runId}/`
3. [ ] Verify structure:
   - screenshots/ folder with PNG files
   - logs.txt file
   - extracted.json (if extraction occurred)

### Cloud Functions Logs

1. [ ] Open Firebase Console → Functions
2. [ ] Click on any function → Logs
3. [ ] Verify no critical errors
4. [ ] Check recent invocations:
   - enqueueJob called when "Run Now" clicked
   - claimJob called by agent
   - completeJob called after execution
   - updateDeviceHeartbeat called periodically

## Performance Checks

- [ ] Task compilation completes within 5 seconds
- [ ] Job claiming is instant (transaction-based)
- [ ] Browser launches within 3 seconds
- [ ] Screenshot upload completes within 5 seconds
- [ ] Web UI loads within 2 seconds
- [ ] Real-time updates reflect within 1 second

## Security Checks

- [ ] Unauthenticated users cannot access Firestore data
- [ ] Cannot read other users' tasks
- [ ] Cannot access other users' artifacts in Storage
- [ ] Device tokens are not exposed in web UI
- [ ] Cloud Functions require valid device credentials for agent endpoints

## Cleanup (Optional)

After testing, you may want to clean up:

1. [ ] Delete test tasks from Firestore
2. [ ] Delete test artifacts from Storage
3. [ ] Remove pairing codes
4. [ ] Delete test user from Authentication

## Known Limitations

- Compiler is heuristic-based (not LLM-powered)
- Only basic validation supported
- No retry mechanism for transient failures
- Scheduled jobs use simplified cron parsing (add 24h for next run)
- Email notifications require manual provider configuration

## Success Criteria

**Minimum Viable Demo**:
- ✓ User can sign up and log in
- ✓ Agent pairs successfully
- ✓ Task compiles from plain text
- ✓ Task runs and captures artifacts
- ✓ Task achieves CERTIFIED status after 3 successes
- ✓ Schedules can be added to CERTIFIED tasks
- ✓ Circuit breaker quarantines after 2 failures
- ✓ Notifications logged to Firestore (fallback)
- ✓ Web UI displays all data correctly
- ✓ Mobile (iPhone Safari) renders properly

**All checkboxes above should be ✓ for a complete demo!**

## Troubleshooting Common Issues

### Issue: Agent can't find jobs
**Solution**: Verify deviceId in agent-config.json matches device in Firestore

### Issue: Compilation returns error about write actions
**Solution**: Modify instructions to remove keywords like "submit", "click", "approve"

### Issue: Screenshots not appearing
**Solution**: Check Cloud Storage rules deployed and bucket exists

### Issue: Functions fail with permission errors
**Solution**: Verify Blaze plan enabled and billing active

### Issue: Flutter web build fails
**Solution**: Run `flutterfire configure` again and ensure firebase_options.dart generated

### Issue: Agent pairing fails
**Solution**: Verify Firebase project ID and region are correct

## Next Steps After Demo

1. Configure email provider (SendGrid/SMTP) for actual email notifications
2. Implement LLM-based task compiler for better plan generation
3. Add more sophisticated validation rules
4. Implement screenshot diffing for visual regression
5. Add metrics and analytics dashboard
6. Scale to multiple agents per user
7. Add write action support with approval workflows

---

**Demo Complete!** 🎉

You now have a fully functional RTAE v0.1 system deployed and verified.
