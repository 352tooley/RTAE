// RTAE v0.1 Shared TypeScript Schema

// ===== Enums =====

export enum TaskStatus {
  DRAFT = 'DRAFT',
  CERTIFIED = 'CERTIFIED',
  QUARANTINED = 'QUARANTINED',
}

export enum RunStatus {
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
  BLOCKED = 'BLOCKED',
  UNKNOWN = 'UNKNOWN',
  TIMEOUT = 'TIMEOUT',
}

export enum JobStatus {
  QUEUED = 'QUEUED',
  CLAIMED = 'CLAIMED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum DeviceStatus {
  ACTIVE = 'ACTIVE',
  OFFLINE = 'OFFLINE',
  QUARANTINED = 'QUARANTINED',
}

// ===== Validation Spec =====

export interface NumericRule {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
}

export interface ValidationSpec {
  requiredSelectors?: string[];
  requiredTextContains?: string[];
  extractedFieldsRequired?: string[];
  optionalNumericRules?: NumericRule[];
}

// ===== Compiled Plan =====

export interface PlaywrightStep {
  action: 'navigate' | 'click' | 'wait' | 'screenshot' | 'extract' | 'scroll';
  selector?: string;
  url?: string;
  text?: string;
  timeout?: number;
  extractAs?: string; // field name for extracted data
  waitForSelector?: string;
  scrollDirection?: 'down' | 'up';
  scrollAmount?: number;
}

export interface CompiledPlanJson {
  steps: PlaywrightStep[];
  maxDurationSeconds: number;
  stopConditions: {
    detectAuthPages: boolean;
    detectUnknownState: boolean;
  };
}

// ===== Firestore Documents =====

export interface Device {
  deviceId: string;
  ownerUserId: string;
  displayName: string;
  deviceToken: string; // agent uses this for auth
  lastSeenAt: number; // timestamp
  status: DeviceStatus;
  createdAt: number;
}

export interface Task {
  taskId: string;
  ownerUserId: string;
  title: string;
  instructionsPlaintext: string;
  compiledPlanJson?: CompiledPlanJson;
  validationSpec?: ValidationSpec;
  status: TaskStatus;
  consecutiveSuccessCount: number;
  consecutiveFailureCount: number;
  lastRunStatus?: RunStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Schedule {
  scheduleId: string;
  taskId: string;
  ownerUserId: string;
  cronExpression: string; // e.g., "0 9 * * MON-FRI"
  enabled: boolean;
  nextRunAt: number; // timestamp
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactPaths {
  screenshots: string[]; // Cloud Storage paths
  logs: string; // Cloud Storage path
  extracted?: string; // Cloud Storage path (optional)
}

export interface Run {
  runId: string;
  taskId: string;
  ownerUserId: string;
  deviceId: string;
  status: RunStatus;
  summaryText: string;
  extractedValues?: Record<string, any>;
  artifactPaths?: ArtifactPaths;
  startedAt: number;
  completedAt?: number;
}

export interface Job {
  jobId: string;
  taskId: string;
  ownerUserId: string;
  deviceId: string;
  compiledPlanJson: CompiledPlanJson;
  validationSpec?: ValidationSpec;
  status: JobStatus;
  claimedBy?: string; // deviceId
  claimedAt?: number;
  createdAt: number;
  completedAt?: number;
  runId?: string; // linked run
}

export interface NotificationLog {
  notificationId: string;
  ownerUserId: string;
  recipient: string; // email
  subject: string;
  body: string;
  runId?: string;
  taskId?: string;
  createdAt: number;
}

// ===== Pairing =====

export interface PairingCode {
  code: string; // 6-digit
  ownerUserId: string;
  expiresAt: number;
  createdAt: number;
  claimed: boolean;
}

// ===== API Request/Response Types =====

export interface CreatePairingCodeRequest {
  displayName: string;
}

export interface CreatePairingCodeResponse {
  code: string;
  expiresAt: number;
}

export interface ClaimPairingCodeRequest {
  code: string;
}

export interface ClaimPairingCodeResponse {
  deviceId: string;
  deviceToken: string;
}

export interface CompileTaskPlanRequest {
  instructionsPlaintext: string;
}

export interface CompileTaskPlanResponse {
  compiledPlanJson: CompiledPlanJson;
  suggestedValidationSpec: ValidationSpec;
}

export interface EnqueueJobRequest {
  taskId: string;
  deviceId: string;
}

export interface EnqueueJobResponse {
  jobId: string;
}

export interface ClaimJobRequest {
  jobId: string;
  deviceId: string;
  deviceToken: string;
}

export interface ClaimJobResponse {
  success: boolean;
  job?: Job;
}

export interface CompleteJobRequest {
  jobId: string;
  deviceId: string;
  deviceToken: string;
  runResult: {
    status: RunStatus;
    summaryText: string;
    extractedValues?: Record<string, any>;
    artifactPaths: ArtifactPaths;
  };
}

export interface CompleteJobResponse {
  success: boolean;
  taskStatus: TaskStatus;
}

// ===== Agent Run Result =====

export interface AgentRunResult {
  status: RunStatus;
  summaryText: string;
  extractedValues?: Record<string, any>;
  artifactPaths: ArtifactPaths;
  logs: string[];
  screenshots: Buffer[]; // in-memory before upload
  extractedJson?: any;
}
