import { Button, Card, Chip, Description, Input, Label, TextArea } from '@heroui/react';
import { RadioButtonGroup } from '@heroui-pro/react';
import { useState } from 'react';
import { BotIcon, ShieldCheckIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from './ui';
import type { PendingAgentRequest } from '../shared/types';

export function RequestPanel({
  pending,
  requestKey,
  taskTitle,
  onRespond,
  onStop,
  onShowTask,
}: {
  pending: PendingAgentRequest;
  requestKey: string;
  taskTitle: string;
  onRespond: (action: string, payload: unknown) => Promise<boolean>;
  onStop: () => void;
  onShowTask: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, { selected?: number; text?: string }>>({});
  const [sending, setSending] = useState(false);
  const respond = async (action: string, value: Record<string, unknown>) => {
    setSending(true);
    try {
      await onRespond(action, {
        id: pending.request.id,
        conversationId: pending.conversationId,
        messageId: pending.messageId,
        ...value,
      });
    } finally {
      setSending(false);
    }
  };
  const answerFor = (
    question: Extract<PendingAgentRequest, { kind: 'input' }>['request']['questions'][number],
  ) => {
    const value = answers[question.id];
    return (
      question.options?.[value?.selected ?? -1]?.label ??
      (question.isSecret ? value?.text : value?.text?.trim()) ??
      ''
    );
  };
  return (
    <Card
      data-request-key={requestKey}
      tabIndex={-1}
      className="request-panel"
      role="region"
      aria-label="Agent 待处理事项"
    >
      <Card.Header className="request-heading">
        {pending.kind === 'approval' ? (
          <Icon icon={ShieldCheckIcon} size={17} />
        ) : (
          <Icon icon={BotIcon} size={17} />
        )}
        <Card.Title>
          {pending.kind === 'approval' ? pending.request.title : '需要你的回答'}
        </Card.Title>
        <Chip size="sm" role="status">
          <Chip.Label>
            {sending ? '提交中' : pending.kind === 'approval' ? '等待确认' : '等待回答'}
          </Chip.Label>
        </Chip>
      </Card.Header>
      <Card.Content>
        <Button size="sm" variant="ghost" className="request-task" onPress={onShowTask}>
          {taskTitle}
        </Button>
        {pending.kind === 'approval' ? (
          <>
            <pre>{pending.request.detail}</pre>
            <Card.Footer className="button-row">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={sending}
                onPress={() => void respond('agent:approval', { approved: false })}
              >
                {pending.request.action === 'browser-help' ? '停止处理' : '拒绝'}
              </Button>
              <Button
                size="sm"
                variant="primary"
                isDisabled={sending}
                onPress={() => void respond('agent:approval', { approved: true })}
              >
                {pending.request.action === 'browser-help' ? '已完成，继续' : '允许这次操作'}
              </Button>
            </Card.Footer>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                pending.request.questions.map((question) => [question.id, [answerFor(question)]]),
              );
              void respond('agent:user-input', { answers: values });
            }}
          >
            <div className="request-questions">
              {pending.request.questions.map((question) => {
                const value = answers[question.id] ?? {};
                const options = question.options ?? [];
                const update = (patch: { selected?: number; text?: string }) =>
                  setAnswers((previous) => ({
                    ...previous,
                    [question.id]: { ...previous[question.id], ...patch },
                  }));
                const freeform =
                  !options.length || (question.isOther && value.selected === options.length);
                return (
                  <fieldset key={question.id} disabled={sending}>
                    <legend>{question.question}</legend>
                    {!!options.length && (
                      <RadioButtonGroup
                        aria-label={question.question}
                        value={value.selected === undefined ? null : String(value.selected)}
                        onChange={(selected) => update({ selected: Number(selected) })}
                        isDisabled={sending}
                      >
                        {options.map((option, index) => (
                          <RadioButtonGroup.Item key={index} value={String(index)}>
                            <RadioButtonGroup.Indicator />
                            <RadioButtonGroup.ItemContent>
                              <Label>{option.label}</Label>
                              {option.description && (
                                <Description>{option.description}</Description>
                              )}
                            </RadioButtonGroup.ItemContent>
                          </RadioButtonGroup.Item>
                        ))}
                        {question.isOther && (
                          <RadioButtonGroup.Item value={String(options.length)}>
                            <RadioButtonGroup.Indicator />
                            <RadioButtonGroup.ItemContent>自行填写</RadioButtonGroup.ItemContent>
                          </RadioButtonGroup.Item>
                        )}
                      </RadioButtonGroup>
                    )}
                    {freeform &&
                      (question.isSecret ? (
                        <Input
                          className="request-answer"
                          type="password"
                          aria-label={question.question}
                          autoComplete="off"
                          maxLength={20_000}
                          required
                          value={value.text ?? ''}
                          onChange={(event) => update({ text: event.target.value })}
                        />
                      ) : (
                        <TextArea
                          className="request-answer"
                          aria-label={question.question}
                          rows={2}
                          maxLength={20_000}
                          required
                          value={value.text ?? ''}
                          onChange={(event) => update({ text: event.target.value })}
                        />
                      ))}
                  </fieldset>
                );
              })}
            </div>
            <Card.Footer className="button-row">
              <Button
                size="sm"
                type="button"
                variant="secondary"
                isDisabled={sending}
                onPress={onStop}
              >
                停止任务
              </Button>
              <Button
                size="sm"
                type="submit"
                variant="primary"
                isDisabled={
                  sending || pending.request.questions.some((question) => !answerFor(question))
                }
              >
                {sending ? '提交中…' : '提交回答'}
              </Button>
            </Card.Footer>
          </form>
        )}
      </Card.Content>
    </Card>
  );
}
