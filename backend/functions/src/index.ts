import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

// Import shared types (copy locally or use path alias)
import {
  TaskStatus,
  RunStatus,
  JobStatus,
  DeviceStatus,
  CreatePairingCodeRequest,
  CreatePairingCodeResponse,
  ClaimPairingCodeRequest,
  ClaimPairingCodeResponse,
  CompileTaskPlanRequest,
  CompileTaskPlanResponse,
  EnqueueJobRequest,
  EnqueueJobResponse,
  ClaimJobRequest,
  ClaimJobResponse,
  CompleteJobRequest,
  CompleteJobResponse,
  CompiledPlanJson,
  ValidationSpec,
  PlaywrightStep,
} from './types';

// ===== Utility Functions =====

function generatePairingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateDeviceToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function verifyDeviceToken(deviceId: string, deviceToken: string): Promise<boolean> {
  const deviceDoc = await db.collection('devices').doc(deviceId).get();
  if (!deviceDoc.exists) return false;
  const device = deviceDoc.data();
  return device?.deviceToken === deviceToken;
}

async function sendNotification(
  ownerUserId: string,
  recipient: string,
  subject: string,
  body: string,
  runId?: string,
  taskId?: string
): Promise<void> {
  // Check for email provider config (environment variable)
  const emailProvider = process.env.EMAIL_PROVIDER; // 'sendgrid' | 'smtp' | undefined

  if (!emailProvider) {
    // Fallback: log to Firestore notifications collection
    console.log('No email provider configured, logging notification to Firestore');
    await db.collection('notifications').add({
      notificationId: db.collection('notifications').doc().id,
      ownerUserId,
      recipient,
      subject,
      body,
      runId: runId || null,
      taskId: taskId || null,
      createdAt: Date.now(),
    });
  } else {
    // TODO: Implement actual email sending via SendGrid/SMTP
    // For now, also log to Firestore as backup
    console.log(`Sending email via ${emailProvider} to ${recipient}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);

    // Still log to Firestore for audit
    await db.collection('notifications').add({
      notificationId: db.collection('notifications').doc().id,
      ownerUserId,
      recipient,
      subject,
      body,
      runId: runId || null,
      taskId: taskId || null,
      createdAt: Date.now(),
    });
  }
}

// ===== Pairing Functions =====

export const createPairingCode = functions.https.onCall(
  async (data: CreatePairingCodeRequest, context): Promise<CreatePairingCodeResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const code = generatePairingCode();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    await db.collection('pairingCodes').doc(code).set({
      code,
      ownerUserId: userId,
      displayName: data.displayName || 'Windows Agent',
      expiresAt,
      createdAt: Date.now(),
      claimed: false,
    });

    return { code, expiresAt };
  }
);

export const claimPairingCode = functions.https.onCall(
  async (data: ClaimPairingCodeRequest, context): Promise<ClaimPairingCodeResponse> => {
    const { code } = data;

    const pairingDoc = await db.collection('pairingCodes').doc(code).get();

    if (!pairingDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Invalid pairing code');
    }

    const pairing = pairingDoc.data();

    if (pairing?.claimed) {
      throw new functions.https.HttpsError('already-exists', 'Pairing code already claimed');
    }

    if (pairing?.expiresAt < Date.now()) {
      throw new functions.https.HttpsError('deadline-exceeded', 'Pairing code expired');
    }

    // Create device
    const deviceRef = db.collection('devices').doc();
    const deviceId = deviceRef.id;
    const deviceToken = generateDeviceToken();

    await deviceRef.set({
      deviceId,
      ownerUserId: pairing.ownerUserId,
      displayName: pairing.displayName,
      deviceToken,
      lastSeenAt: Date.now(),
      status: DeviceStatus.ACTIVE,
      createdAt: Date.now(),
    });

    // Mark pairing code as claimed
    await pairingDoc.ref.update({ claimed: true });

    return { deviceId, deviceToken };
  }
);

// ===== Task Compilation =====

export const compileTaskPlan = functions.https.onCall(
  async (data: CompileTaskPlanRequest, context): Promise<CompileTaskPlanResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { instructionsPlaintext } = data;

    // Simple heuristic-based compiler (v0.1)
    // In production, use LLM or more sophisticated parsing

    const lowerInstructions = instructionsPlaintext.toLowerCase();

    // Check for write actions
    const writeKeywords = ['submit', 'click submit', 'approve', 'confirm', 'post', 'save', 'update', 'delete', 'create'];
    const hasWriteAction = writeKeywords.some(keyword => lowerInstructions.includes(keyword));

    if (hasWriteAction) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Write actions detected. v0.1 supports READ-ONLY automation only.'
      );
    }

    // Parse basic steps (simplified example)
    const steps: PlaywrightStep[] = [];

    // Extract URL if present
    const urlMatch = instructionsPlaintext.match(/(?:go to|navigate to|open)\s+([^\s]+)/i);
    if (urlMatch) {
      steps.push({
        action: 'navigate',
        url: urlMatch[1],
      });
    }

    // Add wait step
    steps.push({
      action: 'wait',
      timeout: 3000,
    });

    // Add screenshot
    steps.push({
      action: 'screenshot',
    });

    // Extract selectors to check
    const selectorMatches = instructionsPlaintext.match(/check\s+(?:for\s+)?([^\n]+)/gi);
    const suggestedSelectors: string[] = [];
    if (selectorMatches) {
      selectorMatches.forEach(match => {
        const text = match.replace(/check\s+(?:for\s+)?/i, '').trim();
        suggestedSelectors.push(`text=${text}`);
      });
    }

    // Extract data if mentioned
    const extractMatches = instructionsPlaintext.match(/extract\s+([^\n]+)/gi);
    if (extractMatches) {
      extractMatches.forEach(match => {
        const fieldName = match.replace(/extract\s+/i, '').trim();
        steps.push({
          action: 'extract',
          selector: 'body',
          extractAs: fieldName,
        });
      });
    }

    // Final screenshot
    steps.push({
      action: 'screenshot',
    });

    const compiledPlanJson: CompiledPlanJson = {
      steps,
      maxDurationSeconds: 300, // 5 minutes
      stopConditions: {
        detectAuthPages: true,
        detectUnknownState: true,
      },
    };

    const suggestedValidationSpec: ValidationSpec = {
      requiredSelectors: suggestedSelectors,
      requiredTextContains: [],
      extractedFieldsRequired: [],
      optionalNumericRules: [],
    };

    return { compiledPlanJson, suggestedValidationSpec };
  }
);

// ===== Job Queue =====

export const enqueueJob = functions.https.onCall(
  async (data: EnqueueJobRequest, context): Promise<EnqueueJobResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { taskId, deviceId } = data;

    // Verify task ownership
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists || taskDoc.data()?.ownerUserId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Task not found or access denied');
    }

    const task = taskDoc.data();
    if (!task?.compiledPlanJson) {
      throw new functions.https.HttpsError('failed-precondition', 'Task not compiled');
    }

    // Verify device ownership
    const deviceDoc = await db.collection('devices').doc(deviceId).get();
    if (!deviceDoc.exists || deviceDoc.data()?.ownerUserId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Device not found or access denied');
    }

    // Create job
    const jobRef = db.collection('jobQueue').doc();
    const jobId = jobRef.id;

    await jobRef.set({
      jobId,
      taskId,
      ownerUserId: userId,
      deviceId,
      compiledPlanJson: task.compiledPlanJson,
      validationSpec: task.validationSpec || {},
      status: JobStatus.QUEUED,
      createdAt: Date.now(),
    });

    return { jobId };
  }
);

export const claimJob = functions.https.onCall(
  async (data: ClaimJobRequest, context): Promise<ClaimJobResponse> => {
    const { jobId, deviceId, deviceToken } = data;

    // Verify device token
    const isValid = await verifyDeviceToken(deviceId, deviceToken);
    if (!isValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid device credentials');
    }

    // Transaction to claim job
    const jobRef = db.collection('jobQueue').doc(jobId);

    try {
      const job = await db.runTransaction(async (transaction) => {
        const jobDoc = await transaction.get(jobRef);

        if (!jobDoc.exists) {
          throw new functions.https.HttpsError('not-found', 'Job not found');
        }

        const jobData = jobDoc.data();

        if (jobData?.status !== JobStatus.QUEUED) {
          throw new functions.https.HttpsError('failed-precondition', 'Job already claimed or completed');
        }

        if (jobData.deviceId !== deviceId) {
          throw new functions.https.HttpsError('permission-denied', 'Job assigned to different device');
        }

        transaction.update(jobRef, {
          status: JobStatus.CLAIMED,
          claimedBy: deviceId,
          claimedAt: Date.now(),
        });

        return { ...jobData, status: JobStatus.CLAIMED };
      });

      return { success: true, job: job as any };
    } catch (error) {
      console.error('Error claiming job:', error);
      return { success: false };
    }
  }
);

export const completeJob = functions.https.onCall(
  async (data: CompleteJobRequest, context): Promise<CompleteJobResponse> => {
    const { jobId, deviceId, deviceToken, runResult } = data;

    // Verify device token
    const isValid = await verifyDeviceToken(deviceId, deviceToken);
    if (!isValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid device credentials');
    }

    // Get job
    const jobDoc = await db.collection('jobQueue').doc(jobId).get();
    if (!jobDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Job not found');
    }

    const job = jobDoc.data();
    if (job?.claimedBy !== deviceId) {
      throw new functions.https.HttpsError('permission-denied', 'Job not claimed by this device');
    }

    // Create run document
    const runRef = db.collection('runs').doc();
    const runId = runRef.id;

    await runRef.set({
      runId,
      taskId: job.taskId,
      ownerUserId: job.ownerUserId,
      deviceId,
      status: runResult.status,
      summaryText: runResult.summaryText,
      extractedValues: runResult.extractedValues || {},
      artifactPaths: runResult.artifactPaths,
      startedAt: job.claimedAt || Date.now(),
      completedAt: Date.now(),
    });

    // Update job
    await jobDoc.ref.update({
      status: JobStatus.COMPLETED,
      completedAt: Date.now(),
      runId,
    });

    // Update task counters and check certification/quarantine
    const taskRef = db.collection('tasks').doc(job.taskId);
    const taskDoc = await taskRef.get();
    const task = taskDoc.data();

    if (!task) {
      throw new functions.https.HttpsError('not-found', 'Task not found');
    }

    let newStatus = task.status;
    let consecutiveSuccessCount = task.consecutiveSuccessCount || 0;
    let consecutiveFailureCount = task.consecutiveFailureCount || 0;

    if (runResult.status === RunStatus.SUCCESS) {
      consecutiveSuccessCount++;
      consecutiveFailureCount = 0;

      // Check for certification
      if (consecutiveSuccessCount >= 3 && task.status === TaskStatus.DRAFT) {
        newStatus = TaskStatus.CERTIFIED;
      }
    } else {
      consecutiveFailureCount++;
      consecutiveSuccessCount = 0;

      // Check for quarantine (circuit breaker)
      if (consecutiveFailureCount >= 2) {
        newStatus = TaskStatus.QUARANTINED;

        // Disable all schedules
        const schedules = await db.collection('schedules')
          .where('taskId', '==', job.taskId)
          .get();

        const batch = db.batch();
        schedules.forEach(scheduleDoc => {
          batch.update(scheduleDoc.ref, { enabled: false });
        });
        await batch.commit();

        // Send notification
        const userDoc = await admin.auth().getUser(job.ownerUserId);
        const userEmail = userDoc.email || 'user@example.com';

        await sendNotification(
          job.ownerUserId,
          userEmail,
          `Task Quarantined: ${task.title}`,
          `Your task "${task.title}" has been quarantined after ${consecutiveFailureCount} consecutive failures.\n\nLast run status: ${runResult.status}\nSummary: ${runResult.summaryText}\n\nAll schedules have been disabled.`,
          runId,
          job.taskId
        );
      } else if (runResult.status !== RunStatus.SUCCESS) {
        // Send failure notification
        const userDoc = await admin.auth().getUser(job.ownerUserId);
        const userEmail = userDoc.email || 'user@example.com';

        await sendNotification(
          job.ownerUserId,
          userEmail,
          `Task Run ${runResult.status}: ${task.title}`,
          `Your task "${task.title}" completed with status: ${runResult.status}\n\nSummary: ${runResult.summaryText}\n\nConsecutive failures: ${consecutiveFailureCount}/2`,
          runId,
          job.taskId
        );
      }
    }

    await taskRef.update({
      consecutiveSuccessCount,
      consecutiveFailureCount,
      lastRunStatus: runResult.status,
      status: newStatus,
      updatedAt: Date.now(),
    });

    return { success: true, taskStatus: newStatus };
  }
);

// ===== Scheduled Job Processing =====

export const processSchedules = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  const now = Date.now();

  // Find schedules that are due
  const dueSchedules = await db.collection('schedules')
    .where('enabled', '==', true)
    .where('nextRunAt', '<=', now)
    .get();

  console.log(`Found ${dueSchedules.size} due schedules`);

  for (const scheduleDoc of dueSchedules.docs) {
    const schedule = scheduleDoc.data();

    // Check if task is CERTIFIED
    const taskDoc = await db.collection('tasks').doc(schedule.taskId).get();
    const task = taskDoc.data();

    if (!task || task.status !== TaskStatus.CERTIFIED) {
      console.log(`Skipping schedule ${schedule.scheduleId}: task not certified`);
      continue;
    }

    // Find device for this task
    const devices = await db.collection('devices')
      .where('ownerUserId', '==', schedule.ownerUserId)
      .where('status', '==', DeviceStatus.ACTIVE)
      .limit(1)
      .get();

    if (devices.empty) {
      console.log(`No active device found for schedule ${schedule.scheduleId}`);
      continue;
    }

    const deviceId = devices.docs[0].id;

    // Enqueue job
    const jobRef = db.collection('jobQueue').doc();
    await jobRef.set({
      jobId: jobRef.id,
      taskId: schedule.taskId,
      ownerUserId: schedule.ownerUserId,
      deviceId,
      compiledPlanJson: task.compiledPlanJson,
      validationSpec: task.validationSpec || {},
      status: JobStatus.QUEUED,
      createdAt: Date.now(),
    });

    // Update nextRunAt based on cron expression (simplified: add 24 hours)
    // TODO: Use proper cron parser in production
    const nextRunAt = now + 24 * 60 * 60 * 1000;
    await scheduleDoc.ref.update({ nextRunAt });

    console.log(`Enqueued job for schedule ${schedule.scheduleId}`);
  }

  return null;
});

// ===== Device Heartbeat =====

export const updateDeviceHeartbeat = functions.https.onCall(
  async (data: { deviceId: string; deviceToken: string }, context) => {
    const { deviceId, deviceToken } = data;

    const isValid = await verifyDeviceToken(deviceId, deviceToken);
    if (!isValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid device credentials');
    }

    await db.collection('devices').doc(deviceId).update({
      lastSeenAt: Date.now(),
      status: DeviceStatus.ACTIVE,
    });

    return { success: true };
  }
);

// ===== Get Available Jobs (for agent polling) =====

export const getAvailableJobs = functions.https.onCall(
  async (data: { deviceId: string; deviceToken: string }, context) => {
    const { deviceId, deviceToken } = data;

    const isValid = await verifyDeviceToken(deviceId, deviceToken);
    if (!isValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid device credentials');
    }

    // Query for QUEUED jobs matching this device
    const jobsSnapshot = await db.collection('jobQueue')
      .where('deviceId', '==', deviceId)
      .where('status', '==', JobStatus.QUEUED)
      .limit(10)
      .get();

    const jobs = jobsSnapshot.docs.map(doc => ({ jobId: doc.id, ...doc.data() }));

    return { jobs };
  }
);
