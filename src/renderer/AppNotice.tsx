import { Alert, Button } from '@heroui/react';
import {
  Download01Icon,
  HandIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
  XIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { ActionButton, Icon } from './ui';
import './app-notice.css';

const icons = {
  approval: ShieldCheckIcon,
  input: MessageSquareIcon,
  handoff: HandIcon,
  update: Download01Icon,
};

export function AppNotice({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  onDismiss,
}: {
  kind: keyof typeof icons;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
}) {
  return (
    <Alert className="app-notice" role="region" aria-label="工作台提示">
      <Alert.Indicator>
        <Icon icon={icons[kind]} size={18} />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title title={title}>{title}</Alert.Title>
        <Alert.Description title={description}>{description}</Alert.Description>
      </Alert.Content>
      <Button size="sm" variant="primary" className="app-notice-action" onPress={onAction}>
        <span>{actionLabel}</span>
      </Button>
      <ActionButton
        isIconOnly
        className="app-notice-dismiss"
        aria-label="收起提醒"
        onPress={onDismiss}
      >
        <Icon icon={XIcon} size={14} />
      </ActionButton>
    </Alert>
  );
}
