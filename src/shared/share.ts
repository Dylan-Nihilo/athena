import type { BrowserActor, BrowserFrame, BrowserState, RecordedStep, Recording } from './types';

export interface ShareParticipant extends BrowserActor {
  role: 'host' | 'viewer' | 'editor';
  status: 'pending' | 'connected' | 'disconnected';
  requestedControl?: boolean;
}
export interface ShareState {
  active: boolean;
  sessionId?: string;
  tabId?: string;
  title?: string;
  address?: string;
  fingerprint?: string;
  invite?: { url: string; expiresAt: number };
  participants: ShareParticipant[];
  controllerId: string;
  generation: number;
  changingControl?: boolean;
  error?: string;
}
export type ShareServerMessage =
  | { type: 'welcome'; participantId: string; resume: string }
  | { type: 'state'; state: ShareState; browser?: BrowserState; steps?: RecordedStep[] }
  | { type: 'frame'; frame: BrowserFrame }
  | { type: 'step'; step: RecordedStep }
  | { type: 'result'; id: number; value?: unknown; error?: string }
  | { type: 'ended'; recording?: Recording }
  | { type: 'error'; error: string };

// Deliberately narrower than workbench:invoke. Never add general host or Agent tools here.
export const SHARED_PAGE_ACTIONS = new Set([
  'browser:input',
  'browser:navigate',
  'browser:back',
  'browser:forward',
  'browser:reload',
  'browser:inspect',
  'browser:query',
  'browser:element',
  'browser:element-details',
  'browser:edit',
  'browser:preview-styles',
  'browser:commit-styles',
  'browser:undo',
]);
