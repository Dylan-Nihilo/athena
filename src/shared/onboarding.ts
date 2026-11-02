export type OnboardingStage = 'welcome' | 'codex' | 'login' | 'workspace' | 'browser' | 'ready';
export type OnboardingStatus = 'new' | 'in-progress' | 'deferred' | 'complete' | 'legacy';
export type OnboardingInstallKind = 'codex' | 'browser';

/** Only user choices are durable. Runtime readiness is always checked again. */
export interface OnboardingProgress {
  version: 1;
  status: 'in-progress' | 'deferred' | 'complete';
  stage: OnboardingStage;
  workspaceConfirmed?: string;
  browserDeferred?: boolean;
  required?: boolean;
}

export interface OnboardingInstallPlan {
  id: string;
  kind: OnboardingInstallKind;
  version: string;
  sourceUrl: string;
  destination: string;
  sha256: string;
  downloadBytes?: number;
  changes: string[];
  expiresAt: number;
}

export interface OnboardingOperation {
  id: string;
  kind: 'detect' | 'install-codex' | 'login' | 'workspace-check' | 'prepare-browser';
  phase: string;
  message: string;
  receivedBytes?: number;
  totalBytes?: number;
  cancelable: boolean;
}

export interface OnboardingState {
  version: 1;
  sessionId: string;
  revision: number;
  status: OnboardingStatus;
  stage: OnboardingStage;
  requiresSetup: boolean;
  coreReady: boolean;
  codex: {
    status: 'unchecked' | 'checking' | 'missing' | 'error' | 'ready';
    authentication: 'unknown' | 'missing' | 'ready';
    path?: string;
    version?: string;
    detail?: string;
  };
  workspace: {
    path: string;
    status: 'unchecked' | 'checking' | 'ready' | 'error';
    candidate?: { id: string; path: string };
    error?: string;
  };
  browser: {
    status: 'unchecked' | 'checking' | 'missing' | 'preparing' | 'ready' | 'deferred' | 'error';
    path?: string;
    error?: string;
  };
  operation?: OnboardingOperation;
  plan?: OnboardingInstallPlan;
  login?: { status: 'waiting' | 'checking' | 'error'; canReopen: boolean; error?: string };
  error?: string;
}

/** Each command returns a current snapshot; long operations also emit onboarding:state. */
export interface OnboardingCommandPayloads {
  'onboarding:open': undefined;
  'onboarding:refresh': undefined;
  'onboarding:plan-install': { kind: OnboardingInstallKind };
  'onboarding:install': { planId: string };
  'onboarding:login/start': undefined;
  'onboarding:login/reopen': undefined;
  'onboarding:cancel': { operationId: string };
  'onboarding:workspace/pick': undefined;
  'onboarding:workspace/confirm': { candidateId: string };
  'onboarding:browser/prepare': undefined;
  'onboarding:defer': undefined;
  'onboarding:complete': undefined;
}
