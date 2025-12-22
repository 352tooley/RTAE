// Types for Cloud Functions (copied from shared/schema.ts)

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

export interface PlaywrightStep {
  action: 'navigate' | 'click' | 'wait' | 'screenshot' | 'extract' | 'scroll';
  selector?: string;
  url?: string;
  text?: string;
  timeout?: number;
  extractAs?: string;
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
  job?: any;
}

export interface CompleteJobRequest {
  jobId: string;
  deviceId: string;
  deviceToken: string;
  runResult: {
    status: RunStatus;
    summaryText: string;
    extractedValues?: Record<string, any>;
    artifactPaths: {
      screenshots: string[];
      logs: string;
      extracted?: string;
    };
  };
}

export interface CompleteJobResponse {
  success: boolean;
  taskStatus: TaskStatus;
}
