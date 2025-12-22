import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { chromium, Browser, Page } from 'playwright';
import { Storage } from '@google-cloud/storage';
import * as dotenv from 'dotenv';

dotenv.config();

// ===== Configuration =====

interface AgentConfig {
  deviceId: string;
  deviceToken: string;
  firebaseProjectId: string;
  firebaseRegion: string;
}

const CONFIG_FILE = path.join(__dirname, '..', 'agent-config.json');
const USER_DATA_DIR = path.join(__dirname, '..', 'browser-profile');

let config: AgentConfig | null = null;

// ===== Firebase Cloud Functions Endpoint =====

function getCloudFunctionUrl(functionName: string): string {
  return `https://${config!.firebaseRegion}-${config!.firebaseProjectId}.cloudfunctions.net/${functionName}`;
}

// ===== Agent Setup =====

async function setupAgent(): Promise<void> {
  if (fs.existsSync(CONFIG_FILE)) {
    console.log('Loading existing agent configuration...');
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    console.log(`Agent configured: Device ID = ${config!.deviceId}`);
  } else {
    console.log('No configuration found. Starting pairing process...');
    await pairDevice();
  }
}

async function pairDevice(): Promise<void> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise(resolve => readline.question(query, resolve));
  };

  const firebaseProjectId = await question('Enter Firebase Project ID: ');
  const firebaseRegion = await question('Enter Firebase Region (default: us-central1): ') || 'us-central1';
  const pairingCode = await question('Enter 6-digit pairing code from web controller: ');

  readline.close();

  console.log('Claiming pairing code...');

  try {
    const response = await axios.post(
      `https://${firebaseRegion}-${firebaseProjectId}.cloudfunctions.net/claimPairingCode`,
      { data: { code: pairingCode } }
    );

    const { deviceId, deviceToken } = response.data.result;

    config = {
      deviceId,
      deviceToken,
      firebaseProjectId,
      firebaseRegion,
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`✓ Device paired successfully! Device ID: ${deviceId}`);
    console.log(`Configuration saved to ${CONFIG_FILE}`);
  } catch (error: any) {
    console.error('Failed to claim pairing code:', error.response?.data || error.message);
    process.exit(1);
  }
}

// ===== Job Polling =====

interface Job {
  jobId: string;
  taskId: string;
  ownerUserId: string;
  deviceId: string;
  compiledPlanJson: any;
  validationSpec: any;
}

async function pollForJobs(): Promise<void> {
  while (true) {
    try {
      // Send heartbeat
      await sendHeartbeat();

      // Look for available jobs (query Firestore via Cloud Function)
      const jobsResponse = await axios.post(
        getCloudFunctionUrl('getAvailableJobs'),
        {
          data: {
            deviceId: config!.deviceId,
            deviceToken: config!.deviceToken,
          },
        }
      );

      const jobs = jobsResponse.data.result?.jobs || [];

      if (jobs.length > 0) {
        console.log(`Found ${jobs.length} available job(s)`);
        const job = jobs[0]; // Process one at a time

        await processJob(job);
      } else {
        // No jobs, wait before polling again
        await sleep(5000); // 5 seconds
      }
    } catch (error: any) {
      console.error('Error polling for jobs:', error.message);
      await sleep(10000); // Wait 10 seconds on error
    }
  }
}

async function sendHeartbeat(): Promise<void> {
  try {
    await axios.post(
      getCloudFunctionUrl('updateDeviceHeartbeat'),
      {
        data: {
          deviceId: config!.deviceId,
          deviceToken: config!.deviceToken,
        },
      }
    );
  } catch (error: any) {
    console.error('Heartbeat failed:', error.message);
  }
}

// ===== Job Processing =====

async function processJob(job: Job): Promise<void> {
  console.log(`\n--- Processing Job ${job.jobId} ---`);
  console.log(`Task ID: ${job.taskId}`);

  // Claim job
  console.log('Claiming job...');
  try {
    const claimResponse = await axios.post(
      getCloudFunctionUrl('claimJob'),
      {
        data: {
          jobId: job.jobId,
          deviceId: config!.deviceId,
          deviceToken: config!.deviceToken,
        },
      }
    );

    if (!claimResponse.data.result?.success) {
      console.log('Failed to claim job (already claimed or invalid)');
      return;
    }

    console.log('✓ Job claimed successfully');
  } catch (error: any) {
    console.error('Failed to claim job:', error.message);
    return;
  }

  // Execute task
  const runResult = await executeTask(job);

  // Upload artifacts
  console.log('Uploading artifacts...');
  const artifactPaths = await uploadArtifacts(job, runResult);

  // Complete job
  console.log('Completing job...');
  try {
    await axios.post(
      getCloudFunctionUrl('completeJob'),
      {
        data: {
          jobId: job.jobId,
          deviceId: config!.deviceId,
          deviceToken: config!.deviceToken,
          runResult: {
            status: runResult.status,
            summaryText: runResult.summaryText,
            extractedValues: runResult.extractedValues,
            artifactPaths,
          },
        },
      }
    );

    console.log(`✓ Job completed with status: ${runResult.status}`);
  } catch (error: any) {
    console.error('Failed to complete job:', error.message);
  }
}

interface RunResult {
  status: 'SUCCESS' | 'FAIL' | 'BLOCKED' | 'UNKNOWN' | 'TIMEOUT';
  summaryText: string;
  extractedValues: Record<string, any>;
  screenshots: Buffer[];
  logs: string[];
  extractedJson?: any;
}

async function executeTask(job: Job): Promise<RunResult> {
  const logs: string[] = [];
  const screenshots: Buffer[] = [];
  let status: RunResult['status'] = 'SUCCESS';
  let summaryText = '';
  const extractedValues: Record<string, any> = {};

  let browser: Browser | null = null;
  let page: Page | null = null;

  const startTime = Date.now();
  const maxDuration = (job.compiledPlanJson.maxDurationSeconds || 300) * 1000;

  try {
    logs.push(`[${new Date().toISOString()}] Starting task execution`);
    console.log('Launching browser...');

    browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false, // Headful for debugging
      viewport: { width: 1280, height: 720 },
    });

    page = browser.pages()[0] || await browser.newPage();

    // Execute steps
    for (const step of job.compiledPlanJson.steps) {
      // Check timeout
      if (Date.now() - startTime > maxDuration) {
        status = 'TIMEOUT';
        summaryText = 'Task exceeded maximum duration';
        logs.push(`[${new Date().toISOString()}] TIMEOUT: Exceeded ${maxDuration}ms`);
        break;
      }

      logs.push(`[${new Date().toISOString()}] Step: ${step.action}`);

      try {
        await executeStep(page, step, logs, screenshots, extractedValues);

        // Check for stop conditions after each step
        const stopCondition = await checkStopConditions(page, job.compiledPlanJson.stopConditions);
        if (stopCondition) {
          status = stopCondition;
          summaryText = `Stopped: ${stopCondition} condition detected`;
          logs.push(`[${new Date().toISOString()}] Stop condition: ${stopCondition}`);
          break;
        }
      } catch (error: any) {
        logs.push(`[${new Date().toISOString()}] Error in step: ${error.message}`);
        status = 'FAIL';
        summaryText = `Step failed: ${step.action} - ${error.message}`;
        break;
      }
    }

    // Validation
    if (status === 'SUCCESS') {
      const validationResult = await validateResult(page, job.validationSpec, extractedValues);
      if (!validationResult.passed) {
        status = 'FAIL';
        summaryText = `Validation failed: ${validationResult.reason}`;
        logs.push(`[${new Date().toISOString()}] Validation failed: ${validationResult.reason}`);
      } else {
        summaryText = 'Task completed successfully with validation passed';
      }
    }

    // Capture final screenshot if not already captured
    if (screenshots.length === 0) {
      const screenshot = await page.screenshot({ fullPage: true });
      screenshots.push(screenshot);
    }

  } catch (error: any) {
    logs.push(`[${new Date().toISOString()}] Fatal error: ${error.message}`);
    status = 'FAIL';
    summaryText = `Fatal error: ${error.message}`;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  logs.push(`[${new Date().toISOString()}] Task execution completed with status: ${status}`);

  return {
    status,
    summaryText,
    extractedValues,
    screenshots,
    logs,
  };
}

async function executeStep(
  page: Page,
  step: any,
  logs: string[],
  screenshots: Buffer[],
  extractedValues: Record<string, any>
): Promise<void> {
  switch (step.action) {
    case 'navigate':
      await page.goto(step.url, { waitUntil: 'networkidle', timeout: step.timeout || 30000 });
      logs.push(`  → Navigated to ${step.url}`);
      break;

    case 'wait':
      await sleep(step.timeout || 1000);
      logs.push(`  → Waited ${step.timeout || 1000}ms`);
      break;

    case 'screenshot':
      const screenshot = await page.screenshot({ fullPage: true });
      screenshots.push(screenshot);
      logs.push(`  → Captured screenshot #${screenshots.length}`);
      break;

    case 'click':
      if (step.selector) {
        await page.click(step.selector, { timeout: step.timeout || 10000 });
        logs.push(`  → Clicked ${step.selector}`);
      }
      break;

    case 'extract':
      if (step.selector && step.extractAs) {
        const element = await page.$(step.selector);
        if (element) {
          const text = await element.textContent();
          extractedValues[step.extractAs] = text?.trim();
          logs.push(`  → Extracted ${step.extractAs}: ${extractedValues[step.extractAs]}`);
        }
      }
      break;

    case 'scroll':
      await page.evaluate((direction) => {
        if (direction === 'down') {
          window.scrollBy(0, 500);
        } else {
          window.scrollBy(0, -500);
        }
      }, step.scrollDirection || 'down');
      logs.push(`  → Scrolled ${step.scrollDirection || 'down'}`);
      break;

    default:
      logs.push(`  → Unknown action: ${step.action}`);
  }
}

async function checkStopConditions(
  page: Page,
  stopConditions: { detectAuthPages: boolean; detectUnknownState: boolean }
): Promise<'BLOCKED' | 'UNKNOWN' | null> {
  if (stopConditions.detectAuthPages) {
    const url = page.url().toLowerCase();
    const authKeywords = ['login', 'signin', 'sign-in', 'sso', 'okta', 'auth', 'verify', 'mfa'];

    if (authKeywords.some(keyword => url.includes(keyword))) {
      return 'BLOCKED';
    }

    const pageText = await page.textContent('body');
    const authTextKeywords = ['sign in', 'log in', 'enter password', 'verify identity', 'authentication required'];

    if (pageText && authTextKeywords.some(keyword => pageText.toLowerCase().includes(keyword))) {
      return 'BLOCKED';
    }
  }

  return null;
}

async function validateResult(
  page: Page,
  validationSpec: any,
  extractedValues: Record<string, any>
): Promise<{ passed: boolean; reason?: string }> {
  if (!validationSpec) {
    return { passed: true };
  }

  // Check required selectors
  if (validationSpec.requiredSelectors) {
    for (const selector of validationSpec.requiredSelectors) {
      const element = await page.$(selector);
      if (!element) {
        return { passed: false, reason: `Required selector not found: ${selector}` };
      }
    }
  }

  // Check required text
  if (validationSpec.requiredTextContains) {
    const pageText = await page.textContent('body');
    for (const text of validationSpec.requiredTextContains) {
      if (!pageText?.includes(text)) {
        return { passed: false, reason: `Required text not found: ${text}` };
      }
    }
  }

  // Check extracted fields
  if (validationSpec.extractedFieldsRequired) {
    for (const field of validationSpec.extractedFieldsRequired) {
      if (!extractedValues[field]) {
        return { passed: false, reason: `Required extracted field missing: ${field}` };
      }
    }
  }

  return { passed: true };
}

// ===== Artifact Upload =====

async function uploadArtifacts(job: Job, runResult: RunResult): Promise<any> {
  const storage = new Storage({
    projectId: config!.firebaseProjectId,
  });

  const bucket = storage.bucket(`${config!.firebaseProjectId}.appspot.com`);
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const basePath = `artifacts/${job.ownerUserId}/${job.taskId}/${runId}`;

  const screenshotPaths: string[] = [];

  // Upload screenshots
  for (let i = 0; i < runResult.screenshots.length; i++) {
    const filename = `screenshot_${String(i + 1).padStart(3, '0')}.png`;
    const filePath = `${basePath}/screenshots/${filename}`;

    await bucket.file(filePath).save(runResult.screenshots[i], {
      contentType: 'image/png',
    });

    screenshotPaths.push(filePath);
  }

  // Upload logs
  const logsPath = `${basePath}/logs.txt`;
  await bucket.file(logsPath).save(runResult.logs.join('\n'), {
    contentType: 'text/plain',
  });

  // Upload extracted JSON if present
  let extractedPath: string | undefined;
  if (Object.keys(runResult.extractedValues).length > 0) {
    extractedPath = `${basePath}/extracted.json`;
    await bucket.file(extractedPath).save(JSON.stringify(runResult.extractedValues, null, 2), {
      contentType: 'application/json',
    });
  }

  return {
    screenshots: screenshotPaths,
    logs: logsPath,
    extracted: extractedPath,
  };
}

// ===== Utilities =====

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Main =====

async function main() {
  console.log('RTAE Windows Agent v0.1');
  console.log('========================\n');

  await setupAgent();

  if (!config) {
    console.error('Failed to configure agent');
    process.exit(1);
  }

  console.log('\nStarting job polling...\n');
  await pollForJobs();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
