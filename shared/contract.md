# RTAE v0.1 Contract

## System Overview
Remote Task Autonomy Engine (RTAE) v0.1 is a browser automation system with:
- **Controller**: Flutter Web (iPhone Safari compatible, Add to Home Screen)
- **Backend**: Firebase (Auth, Firestore, Cloud Storage, Cloud Functions, Hosting)
- **Agent**: Windows Node.js + TypeScript + Playwright (Chromium persistent profile)

## Constraints

### v0.1 Limitations
- **READ-ONLY**: No submit, approve, or write actions
- **Browser-only**: Playwright tasks against web pages
- **Windows-first**: Agent designed for Windows deployment

### Autonomy Ladder
```
DRAFT → CERTIFIED → SCHEDULED → QUARANTINED
```

- **DRAFT**: Newly created task
- **CERTIFIED**: 3 consecutive SUCCESS runs with validation pass
- **SCHEDULED**: CERTIFIED tasks can have schedules
- **QUARANTINED**: 2+ consecutive non-success runs (circuit breaker)

### Circuit Breaker
- 2 consecutive non-SUCCESS outcomes (FAIL/BLOCKED/UNKNOWN/TIMEOUT) → QUARANTINED
- Quarantined tasks: disable all schedules, send notification

### Artifacts (required per run)
- Logs (text file)
- Screenshots (minimum 1: start/end)
- Optional: extracted.json (structured data)

### Stop Conditions
- Auth/login/SSO pages detected
- Unknown page state (required selectors/text not found)
- Timeouts
- Unexpected redirects

### Certification Requirements
- 3 consecutive runs with status = SUCCESS
- All validation specs pass
- No BLOCKED/AUTH state
- No UNKNOWN_STATE

### Scheduling
- Only CERTIFIED tasks can be scheduled
- If task becomes QUARANTINED, all schedules disabled

## Notifications

### Email Notifications
Cloud Functions send emails for:
- FAIL / BLOCKED / UNKNOWN / TIMEOUT run outcomes
- QUARANTINED transitions
- Optional: scheduled run completion summary (disabled by default)

### Email Fallback
If no email provider (SendGrid/SMTP) configured:
- Log notification to Firestore: `notifications/` collection
- Include: recipient, subject, body, runId, taskId, timestamp
- Display in web controller UI "Notifications" screen

## Data Model

### Collections

#### devices
- `deviceId` (auto-generated)
- `ownerUserId`
- `displayName`
- `deviceToken` (random, used by agent for auth)
- `lastSeenAt`
- `status`: ACTIVE | OFFLINE | QUARANTINED

#### tasks
- `taskId` (auto-generated)
- `ownerUserId`
- `title`
- `instructionsPlaintext` (user input)
- `compiledPlanJson` (output from compiler)
- `validationSpec` (optional)
- `status`: DRAFT | CERTIFIED | QUARANTINED
- `consecutiveSuccessCount`
- `consecutiveFailureCount`
- `lastRunStatus`
- `createdAt`, `updatedAt`

#### schedules
- `scheduleId` (auto-generated)
- `taskId`
- `ownerUserId`
- `cronExpression` (e.g., "0 9 * * MON-FRI")
- `enabled` (bool)
- `nextRunAt`

#### runs
- `runId` (auto-generated)
- `taskId`
- `ownerUserId`
- `deviceId`
- `status`: SUCCESS | FAIL | BLOCKED | UNKNOWN | TIMEOUT
- `summaryText`
- `extractedValues` (map)
- `artifactPaths` (screenshots[], logs, extracted)
- `startedAt`, `completedAt`

#### jobQueue
- `jobId` (auto-generated)
- `taskId`
- `ownerUserId`
- `deviceId`
- `compiledPlanJson`
- `validationSpec`
- `status`: QUEUED | CLAIMED | COMPLETED | FAILED
- `claimedBy` (deviceId)
- `claimedAt`
- `createdAt`
- `completedAt`

#### notifications (fallback)
- `notificationId` (auto-generated)
- `ownerUserId`
- `recipient`
- `subject`
- `body`
- `runId` (optional)
- `taskId` (optional)
- `createdAt`

## API Endpoints (Cloud Functions)

### Pairing
- `createPairingCode()`: Returns { code: "123456", expiresAt }
- `claimPairingCode(code)`: Returns { deviceId, deviceToken }

### Task Management
- `compileTaskPlan(instructionsPlaintext)`: Returns { compiledPlanJson, suggestedValidationSpec }
  - Must refuse write actions
  - Only generate read-only plans

### Job Queue
- `enqueueJob(taskId, deviceId)`: Creates QUEUED job
- `claimJob(jobId, deviceId, deviceToken)`: Transaction to set CLAIMED
- `completeJob(jobId, deviceId, deviceToken, runResult)`: Updates run, task counters, checks circuit breaker

### Scheduling
- Background function: `processSchedules()`: Checks due schedules, enqueues jobs

## Agent Workflow

1. Start with deviceId + deviceToken (from pairing or config)
2. Poll `jobQueue` for QUEUED jobs matching deviceId
3. Claim job via transaction
4. Execute Playwright task:
   - Launch Chromium (persistent profile)
   - Navigate, interact (read-only)
   - Capture screenshots (start/end minimum)
   - Extract data if specified
   - Detect stop conditions (auth pages, unknown state)
5. Upload artifacts to Cloud Storage: `artifacts/{ownerUserId}/{taskId}/{runId}/`
6. Call `completeJob()` with status + artifacts
7. Backend updates task counters, checks certification/quarantine

## Validation Spec

```typescript
{
  requiredSelectors: string[];
  requiredTextContains: string[];
  extractedFieldsRequired: string[];
  optionalNumericRules: Array<{
    field: string;
    operator: "gt" | "lt" | "eq" | "gte" | "lte";
    value: number;
  }>;
}
```

## Storage Paths

```
artifacts/{ownerUserId}/{taskId}/{runId}/screenshots/screenshot_001.png
artifacts/{ownerUserId}/{taskId}/{runId}/logs.txt
artifacts/{ownerUserId}/{taskId}/{runId}/extracted.json
```

## Stop Condition Heuristics

### BLOCKED/AUTH Detection
- URL contains: login, sign-in, sso, okta, verify, mfa, authenticate
- Page text contains: "sign in", "log in", "enter password", "verify identity"

### UNKNOWN_STATE Detection
- Required selectors not found within timeout
- Required text not present
- Unexpected page structure

### TIMEOUT
- Task exceeds maximum execution time (default: 5 minutes)

## Certification Logic

After each run:
1. If status = SUCCESS and validation passes:
   - Increment `consecutiveSuccessCount`
   - Reset `consecutiveFailureCount` to 0
   - If `consecutiveSuccessCount >= 3`: promote to CERTIFIED
2. If status != SUCCESS:
   - Increment `consecutiveFailureCount`
   - Reset `consecutiveSuccessCount` to 0
   - If `consecutiveFailureCount >= 2`: demote to QUARANTINED

## Circuit Breaker

When task becomes QUARANTINED:
1. Update task status to QUARANTINED
2. Disable all schedules for this task
3. Send notification (email or log to notifications/)

## Security

### Firestore Rules
- Users can only read/write their own tasks, runs, devices
- Device-scoped access for agents (via deviceToken validation in Cloud Functions)
- Admin-only access to job queue management

### Storage Rules
- Users can only read/write their own artifacts paths
- Structured paths enforce ownership: `artifacts/{ownerUserId}/...`

## Flutter Web Controller

### Screens
1. **Auth**: Email/password login/signup
2. **Devices**: List devices, generate pairing code
3. **Tasks**: List tasks with status badges, "Run Now" button
4. **Task Detail**:
   - Edit title + instructions
   - Compile button
   - Validation spec form
   - Schedule editor (CERTIFIED only)
   - Run history
5. **Run Detail**:
   - Status, summary
   - Screenshots gallery
   - Extracted values
6. **Notifications**: Fallback notification logs

### Mobile Optimizations
- Responsive layout for iPhone Safari
- "Add to Home Screen" meta tags
- Touch-friendly buttons
- No native dependencies
