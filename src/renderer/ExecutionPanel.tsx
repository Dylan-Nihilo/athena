import { useState } from 'react';
import { Button, Card, Disclosure } from '@heroui/react';
import { Timeline } from '@heroui-pro/react';
import { ChatTool } from '@heroui-pro/react/chat-tool';
import {
  ArrowDown01Icon,
  ArrowUpRight01Icon,
  CircleIcon,
  FileCheckIcon,
  FolderOpenIcon,
  HandIcon,
  ListChecksIcon,
  Loading02Icon,
  SearchCheckIcon,
  StopIcon,
  Tick02Icon,
  TriangleAlertIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from './ui';
import type { ChatMessage, PendingAgentRequest, ToolCall } from '../shared/types';

const names: Record<string, string> = {
  browser_context: '查看当前网页',
  snapshot: '查看页面结构',
  screenshot: '截取页面',
  act: '操作网页',
  run: '执行网页步骤',
  read: '读取网页内容',
  grep: '查找内容',
  diff: '查看页面变化',
  wait: '等待页面条件',
  upload: '上传文件',
  download: '下载文件',
  pdf: '保存页面',
  request_human_help: '请求你处理网页',
  await_human_help: '等待你交还网页',
  plan: '更新任务计划',
  checkpoint: '核对结果',
  click: '点击元素',
  fill: '填写内容',
  select: '选择选项',
  navigate: '打开网页',
  scroll: '滚动页面',
  key: '键盘操作',
  logs: '读取页面日志',
  inspect: '检查元素',
  query: '查找元素',
  edit: '预览元素修改',
  undo: '撤销页面修改',
  tabs: '查看标签页',
  new_tab: '新建标签页',
  switch_tab: '切换标签页',
  close_tab: '关闭标签页',
  commandExecution: '执行命令',
  fileChange: '修改文件',
  status: '检查连接',
  controls: '提供调整控件',
};
export const toolTitle = (raw: string) =>
  names[raw.replace(/^(?:workbench_browser_|neo_)/, '')] ?? raw;
function toolTarget(tool: ToolCall): string {
  const input =
    tool.input && typeof tool.input === 'object' ? (tool.input as Record<string, unknown>) : {};
  if (typeof input.url === 'string') {
    try {
      const url = new URL(input.url);
      return url.hostname + url.pathname;
    } catch {
      /* No URL to show. */
    }
  }
  if (typeof input.page === 'number') return `页面 ${input.page}`;
  return '';
}
export function ExecutionPanel({
  message,
  conversationId,
  pending,
  statusLabel,
  onAction,
  onShowBrowser,
  onReviewRequest,
  onContinue,
}: {
  message: ChatMessage;
  conversationId: string;
  pending?: PendingAgentRequest;
  statusLabel: string;
  onAction: <T = unknown>(action: string, payload?: unknown) => Promise<T>;
  onShowBrowser: () => void;
  onReviewRequest: (pending: PendingAgentRequest) => void;
  onContinue: () => void;
}) {
  const [allTools, setAllTools] = useState(false);
  const [expandedToolId, setExpandedToolId] = useState<string>();
  const events = message.execution ?? [];
  const tools = (message.tools ?? []).filter(
    (tool) => !['neo_plan', 'neo_checkpoint'].includes(tool.name),
  );
  const recentTools = tools.slice(-4);
  const latest = events.at(-1);
  const reconciliation = events.findLast((event) =>
    ['recovery', 'checkpoint', 'human-help'].includes(event.kind),
  );
  const cancelled = events.some((event) => event.kind === 'cancelled');
  const blocked =
    !cancelled && (reconciliation?.status === 'blocked' || reconciliation?.outcome === 'unknown');
  const running = message.status === 'streaming';
  const currentTool = tools.findLast((tool) => tool.status === 'running');
  const currentStep = message.plan?.find((step) => step.status === 'inProgress');
  const checkpoints = events.filter((event) => event.kind === 'checkpoint');
  const artifacts = events.filter((event) => event.kind === 'artifact' && event.artifact);
  const unfinishedPlan = !running && message.plan?.some((step) => step.status !== 'completed');
  const state =
    running && statusLabel.includes('停止')
      ? statusLabel
      : pending
        ? '等待你处理'
        : blocked
          ? '需要核对结果'
          : cancelled
            ? '已停止'
            : running
              ? currentTool
                ? toolTitle(currentTool.name)
                : statusLabel || '等待后续结果'
              : message.status === 'error'
                ? '本轮未完成'
                : unfinishedPlan
                  ? '仍有步骤未完成'
                  : '本轮已结束';
  if (!running && !tools.length && !message.plan?.length && !events.length && !message.model)
    return null;
  return (
    <Card
      role="region"
      className="execution-panel"
      aria-label="任务执行"
      data-state={
        pending || blocked
          ? 'attention'
          : message.status === 'error' && !cancelled
            ? 'error'
            : running
              ? 'running'
              : 'idle'
      }
    >
      <Card.Header className="execution-heading" role="status">
        {cancelled && !running ? (
          <Icon icon={StopIcon} size={15} />
        ) : pending ? (
          <Icon icon={HandIcon} size={15} />
        ) : blocked || message.status === 'error' || unfinishedPlan ? (
          <Icon icon={TriangleAlertIcon} size={15} />
        ) : running ? (
          <Icon icon={Loading02Icon} size={15} className="spin" />
        ) : (
          <Icon icon={Tick02Icon} size={15} />
        )}
        <Card.Title>{state}</Card.Title>
        {message.model && (
          <span
            className="execution-model"
            title={
              message.model.source === 'unconfirmed'
                ? '所选模型，等待执行确认'
                : message.model.source === 'thread-response'
                  ? 'CLI 已确认的配置'
                  : '本轮 CLI 执行记录'
            }
          >
            {message.model.model ?? message.model.requested ?? '模型待确认'}
            {message.model.source === 'unconfirmed' ? ' · 待确认' : ''}
          </span>
        )}
      </Card.Header>
      {currentStep && (
        <p className="execution-objective">
          <span>{running ? '当前目标' : '最后执行步骤'}</span>
          {currentStep.step}
        </p>
      )}
      {!!message.plan?.length && (
        <Disclosure defaultExpanded className="execution-plan">
          <Disclosure.Heading>
            <Disclosure.Trigger>
              <Icon icon={ListChecksIcon} size={14} />
              <span>任务计划</span>
              <small>
                {message.plan.filter((step) => step.status === 'completed').length} /{' '}
                {message.plan.length} 步
              </small>
              <Icon icon={ArrowDown01Icon} size={13} />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Timeline density="compact" size="sm">
              {message.plan.map((step, index) => (
                <Timeline.Item
                  key={`${index}-${step.step}`}
                  status={
                    step.status === 'completed'
                      ? 'success'
                      : step.status === 'inProgress' && running
                        ? 'current'
                        : 'muted'
                  }
                >
                  <Timeline.Rail>
                    <Timeline.Marker>
                      {step.status === 'completed' ? (
                        <Icon icon={Tick02Icon} size={13} />
                      ) : step.status === 'inProgress' && running ? (
                        <Icon icon={Loading02Icon} size={13} className="spin" />
                      ) : (
                        <Icon icon={CircleIcon} size={11} />
                      )}
                    </Timeline.Marker>
                    <Timeline.Connector />
                  </Timeline.Rail>
                  <Timeline.Content>
                    <span>{step.step}</span>
                    <small>
                      {step.status === 'completed'
                        ? '已完成'
                        : step.status === 'inProgress'
                          ? running
                            ? '执行中'
                            : '已中断'
                          : '待执行'}
                    </small>
                  </Timeline.Content>
                </Timeline.Item>
              ))}
            </Timeline>
          </Disclosure.Content>
        </Disclosure>
      )}
      {(pending || blocked) && (
        <div className="execution-attention">
          <p>
            {pending
              ? pending.kind === 'approval'
                ? pending.request.title
                : pending.request.questions[0]?.question
              : reconciliation?.summary || '操作结果尚未核对，请先检查页面。'}
          </p>
          <div className="execution-actions">
            <Button size="sm" variant="secondary" onPress={onShowBrowser}>
              查看网页
              <Icon icon={ArrowUpRight01Icon} size={13} />
            </Button>
            {pending && (
              <Button size="sm" variant="primary" onPress={() => onReviewRequest(pending)}>
                处理请求
              </Button>
            )}
            {!running && blocked && (
              <Button size="sm" variant="primary" onPress={onContinue}>
                继续核对
              </Button>
            )}
          </div>
        </div>
      )}
      {!!tools.length && (
        <div className="execution-tools">
          {tools.length > 4 && (
            <Button
              size="sm"
              variant="ghost"
              className="earlier-tools"
              aria-expanded={allTools}
              onPress={() => setAllTools(!allTools)}
            >
              {allTools ? '收起较早动作' : `查看较早的 ${tools.length - 4} 个动作`}
              <Icon icon={ArrowDown01Icon} size={13} />
            </Button>
          )}
          <div
            role="group"
            aria-label="工具动作"
            className="execution-tool-list"
            onKeyDown={(event) => {
              const rows = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[data-slot="chat-tool-trigger"]',
                ),
              );
              const index = rows.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              const next = {
                ArrowUp: index - 1,
                ArrowDown: index + 1,
                Home: 0,
                End: rows.length - 1,
              }[event.key];
              if (next === undefined) return;
              event.preventDefault();
              rows[Math.max(0, Math.min(rows.length - 1, next))].focus();
            }}
          >
            {tools
              .filter(
                (tool) => allTools || recentTools.includes(tool) || expandedToolId === tool.id,
              )
              .map((tool) => {
                const expanded = expandedToolId === tool.id;
                const target = toolTarget(tool);
                return (
                  <ChatTool
                    key={tool.id}
                    isExpanded={expanded}
                    onExpandedChange={(open) => setExpandedToolId(open ? tool.id : undefined)}
                    state={
                      tool.status === 'running'
                        ? 'input-available'
                        : tool.status === 'error'
                          ? 'output-error'
                          : 'output-available'
                    }
                  >
                    <ChatTool.Trigger>
                      <ChatTool.StatusIcon />
                      <span>{toolTitle(tool.name)}</span>
                      {target && (
                        <span className="execution-tool-target" title={target}>
                          {target}
                        </span>
                      )}
                      <small>
                        {tool.status === 'running'
                          ? '执行中'
                          : tool.status === 'error'
                            ? '未成功'
                            : '已返回'}
                        {tool.durationMs !== undefined
                          ? ` · ${(tool.durationMs / 1000).toFixed(1)}s`
                          : ''}
                      </small>
                    </ChatTool.Trigger>
                    <ChatTool.Content>
                      {expanded && (
                        <>
                          {tool.output &&
                            (tool.status === 'error' ? (
                              <ChatTool.Error label="返回的问题">
                                <pre>{tool.output}</pre>
                              </ChatTool.Error>
                            ) : (
                              <ChatTool.Result label="返回结果">
                                <pre>{tool.output}</pre>
                              </ChatTool.Result>
                            ))}
                          <Disclosure>
                            {({ isExpanded }) => (
                              <>
                                <Disclosure.Heading>
                                  <Disclosure.Trigger className="execution-args-trigger">
                                    动作参数
                                    <Disclosure.Indicator />
                                  </Disclosure.Trigger>
                                </Disclosure.Heading>
                                <Disclosure.Content>
                                  {isExpanded && <ChatTool.Args input={tool.input} />}
                                </Disclosure.Content>
                              </>
                            )}
                          </Disclosure>
                          <Button
                            size="sm"
                            variant="ghost"
                            onPress={(event) => {
                              event.target
                                .closest('[data-slot="chat-tool"]')
                                ?.querySelector<HTMLButtonElement>(
                                  '[data-slot="chat-tool-trigger"]',
                                )
                                ?.focus();
                              setExpandedToolId(undefined);
                            }}
                          >
                            收起详情
                          </Button>
                        </>
                      )}
                    </ChatTool.Content>
                  </ChatTool>
                );
              })}
          </div>
        </div>
      )}
      {!!checkpoints.length && (
        <Disclosure defaultExpanded className="execution-checkpoints">
          <Disclosure.Heading>
            <Disclosure.Trigger>
              <Icon icon={SearchCheckIcon} size={15} />
              <span>核对结果</span>
              <small>{checkpoints.length} 项</small>
              <Icon icon={ArrowDown01Icon} size={13} />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            {checkpoints.map((event) => (
              <div key={event.id} className="checkpoint" data-outcome={event.outcome}>
                <div>
                  <span>
                    {event.outcome === 'verified'
                      ? '已核对'
                      : event.outcome === 'not_applied'
                        ? '未生效'
                        : '结果未知'}
                  </span>
                  <strong>{event.summary}</strong>
                </div>
                {event.evidence && <blockquote>{event.evidence}</blockquote>}
              </div>
            ))}
          </Disclosure.Content>
        </Disclosure>
      )}
      {!!artifacts.length && (
        <div className="execution-artifacts">
          {artifacts.map((event) => (
            <div key={event.id} className="execution-artifact">
              <Icon icon={FileCheckIcon} size={20} />
              <div>
                <strong>{event.artifact!.path.split('/').pop()}</strong>
                <span>{event.artifact!.bytes.toLocaleString()} bytes · 已核对文件</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`在 Finder 中显示 ${event.artifact!.path.split('/').pop()}`}
                onPress={() =>
                  void onAction('artifact:reveal', {
                    conversationId,
                    messageId: message.id,
                    eventId: event.id,
                  })
                }
              >
                <Icon icon={FolderOpenIcon} size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}
      {latest?.kind === 'finished' && latest.summary && message.status === 'error' && (
        <p className="panel-note">{latest.summary}</p>
      )}
      {message.failure && message.text !== message.failure && (
        <p className="execution-failure">{message.failure}</p>
      )}
    </Card>
  );
}
