import { useEffect, useRef, useState } from 'react';
import type {
  AgentInfo,
  CodexUpdateStatus,
  Conversation,
  PendingAgentRequest,
} from '../shared/types';
import { AppNotice } from './AppNotice';

type CodexRelease = Exclude<CodexUpdateStatus, { status: 'unknown' }>;
const dismissedReleaseKey = 'athena.dismissedCodexRelease';

export function useCodexUpdate(agent: AgentInfo | undefined, enabled: boolean) {
  const [release, setRelease] = useState<CodexRelease>();
  const [refreshCount, setRefreshCount] = useState(0);
  const lastRefresh = useRef(refreshCount);

  useEffect(() => {
    setRelease(undefined);
    if (!enabled || !agent?.available || !agent.version) return;
    let latestRequest = 0;
    const check = async (force = false) => {
      if (document.hidden && !force) return;
      const request = ++latestRequest;
      const status = await window.workbench
        .invoke<CodexUpdateStatus>('codex:update-status', { refresh: force })
        .catch(() => undefined);
      if (request === latestRequest)
        setRelease(
          status?.status === 'available' || status?.status === 'current' ? status : undefined,
        );
    };
    void check(refreshCount !== lastRefresh.current);
    lastRefresh.current = refreshCount;
    const onWake = () => void check();
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);
    const timer = window.setInterval(onWake, 6 * 60 * 60 * 1000);
    return () => {
      latestRequest++;
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
      window.clearInterval(timer);
    };
  }, [enabled, agent?.available, agent?.path, agent?.version, refreshCount]);
  return {
    update: release?.status === 'available' ? release : undefined,
    installedVersion: release?.installedVersion,
    refresh: () => setRefreshCount((count) => count + 1),
  };
}

export const requestKey = (pending: PendingAgentRequest) =>
  JSON.stringify([pending.conversationId, pending.messageId, pending.request.id]);

export function WorkbenchNotices({
  requests,
  conversations,
  update,
  onReview,
  onShowRelease,
}: {
  requests: PendingAgentRequest[];
  conversations: Conversation[];
  update?: CodexRelease;
  onReview: (request: PendingAgentRequest) => void;
  onShowRelease: (url: string) => void;
}) {
  const [dismissedRequests, setDismissedRequests] = useState<string[]>([]);
  const [dismissedRelease, setDismissedRelease] = useState(() => {
    try {
      return localStorage.getItem(dismissedReleaseKey);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const active = new Set(requests.map(requestKey));
    setDismissedRequests((keys) =>
      keys.some((key) => !active.has(key)) ? keys.filter((key) => active.has(key)) : keys,
    );
  }, [requests]);

  const pending = requests.find((item) => !dismissedRequests.includes(requestKey(item)));
  let notice;
  if (pending) {
    const dismiss = () => setDismissedRequests((keys) => [...keys, requestKey(pending)]);
    const kind =
      pending.kind === 'input'
        ? 'input'
        : pending.request.action === 'browser-help'
          ? 'handoff'
          : 'approval';
    const title = { input: '任务等待回答', handoff: '任务需要你接手', approval: '任务等待审批' }[
      kind
    ];
    const label = { input: '去回答', handoff: '查看任务', approval: '查看审批' }[kind];
    notice = (
      <AppNotice
        key={requestKey(pending)}
        kind={kind}
        title={title}
        description={
          conversations.find((item) => item.id === pending.conversationId)?.title || '当前任务'
        }
        actionLabel={label}
        onDismiss={dismiss}
        onAction={() => {
          dismiss();
          onReview(pending);
        }}
      />
    );
  } else if (update && update.latestVersion !== dismissedRelease) {
    notice = (
      <AppNotice
        kind="update"
        title="Codex CLI 有新版本"
        description={`${update.installedVersion} → ${update.latestVersion}`}
        actionLabel="查看更新说明"
        onAction={() => onShowRelease(update.releaseUrl)}
        onDismiss={() => {
          setDismissedRelease(update.latestVersion);
          try {
            localStorage.setItem(dismissedReleaseKey, update.latestVersion);
          } catch {
            /* Session dismissal still applies. */
          }
        }}
      />
    );
  }
  return (
    <div aria-live="polite" aria-relevant="additions text" className="workbench-notices">
      {notice}
    </div>
  );
}
