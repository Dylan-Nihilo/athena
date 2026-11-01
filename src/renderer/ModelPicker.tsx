import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Label, Popover, Slider } from '@heroui/react';
import { ChevronDown, RefreshCw, RotateCcw, X } from 'lucide-react';
import { ChoiceSelect } from './ChoiceSelect';
import type { Settings } from '../shared/types';
import type { ModelOption, ModelSelection } from '../shared/usage';

const effortNames: Record<string, string> = {
  none: '关闭',
  minimal: '轻量',
  low: '轻快',
  medium: '均衡',
  high: '深入',
  xhigh: '深度',
  max: '极致',
  ultra: 'Ultra',
};
const effortName = (id: string) => effortNames[id] ?? id;

export function ModelPicker({
  settings,
  busy,
  onChange,
}: {
  settings: Settings;
  busy: boolean;
  onChange: (settings: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draftIndex, setDraftIndex] = useState<number | null>(null);
  const request = useRef(0);
  const savingRef = useRef(false);
  const effortOutputId = useId();
  const selection = settings.modelSelection;
  const current = models.find((model) => model.model === selection?.model);
  const efforts = current?.efforts ?? [];
  const effort = selection?.effort ?? current?.defaultEffort;
  const selectedIndex = efforts.findIndex((option) => option.id === effort);
  const shownIndex = draftIndex ?? Math.max(0, selectedIndex);
  const shownEffort = efforts[shownIndex];
  const disabled = busy || loading || saving;
  const defaultIndex = efforts.findIndex((option) => option.id === current?.defaultEffort);
  const effortLabel =
    draftIndex !== null
      ? effortName(shownEffort?.id ?? '')
      : !effort
        ? '默认'
        : selectedIndex < 0
          ? `${effort} · 暂不可用`
          : effortName(effort);

  const refresh = useCallback(async (force = false) => {
    const id = ++request.current;
    setLoading(true);
    setError('');
    try {
      const value = await window.workbench.invoke<ModelOption[]>('models:list', { refresh: force });
      if (id === request.current) setModels(value);
    } catch {
      if (id === request.current) setError('无法读取模型，请检查 Codex 连接后重试。');
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      request.current++;
    };
  }, [refresh]);
  useEffect(() => setDraftIndex(null), [selection?.model, selection?.effort, open]);

  const select = async (next: ModelSelection) => {
    if (busy || loading || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      onChange(await window.workbench.invoke<Settings>('settings:model', next));
    } catch (error) {
      setError(
        (error instanceof Error ? error.message : String(error)).replace(
          /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
          '',
        ),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
      setDraftIndex(null);
    }
  };

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" className="model-picker" aria-label="选择模型">
        <span className="model-picker-name">{current?.name ?? selection?.model ?? '默认模型'}</span>
        {selection?.effort && (
          <span className="model-picker-effort">{effortName(selection.effort)}</span>
        )}
        <ChevronDown size={12} />
      </Button>
      <Popover.Content placement="top start" offset={10} className="model-controls">
        <Popover.Dialog>
          <div className="model-controls-heading">
            <Popover.Heading>模型与思考</Popover.Heading>
            <div>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                aria-label="刷新模型"
                isDisabled={loading || saving}
                onPress={() => void refresh(true)}
              >
                <RefreshCw size={14} className={loading ? 'is-refreshing' : ''} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                aria-label="关闭模型选择"
                onPress={() => setOpen(false)}
              >
                <X size={14} />
              </Button>
            </div>
          </div>
          <ChoiceSelect
            label="模型"
            className="model-choice"
            value={selection?.model ?? ''}
            placeholder={loading ? '读取模型…' : '沿用 Codex 当前模型'}
            isDisabled={disabled || !models.length}
            options={[
              ...(selection && !current
                ? [
                    {
                      value: selection.model,
                      label: `${selection.model} · 暂不可用`,
                      disabled: true,
                    },
                  ]
                : []),
              ...models.map((model) => ({ value: model.model, label: model.name })),
            ]}
            onChange={(value) => {
              const model = models.find((option) => option.model === value);
              if (model) void select({ model: model.model, effort: model.defaultEffort });
            }}
          />
          {!!efforts.length && (
            <div className="reasoning-control">
              <Slider
                className="reasoning-slider"
                minValue={0}
                maxValue={Math.max(1, efforts.length - 1)}
                step={1}
                value={shownIndex}
                isDisabled={disabled || efforts.length < 2}
                onChange={(value) => {
                  if (typeof value === 'number') setDraftIndex(value);
                }}
                onChangeEnd={(value) => {
                  if (typeof value === 'number' && current && efforts[value])
                    void select({ model: current.model, effort: efforts[value].id });
                }}
              >
                <div className="reasoning-heading">
                  <Label>推理强度</Label>
                  <Slider.Output>
                    <span id={effortOutputId}>{effortLabel}</span>
                  </Slider.Output>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label="恢复默认推理强度"
                    isDisabled={disabled || defaultIndex < 0}
                    onPress={() => {
                      if (current && effort !== current.defaultEffort)
                        void select({ model: current.model, effort: current.defaultEffort });
                    }}
                  >
                    <RotateCcw size={13} />
                  </Button>
                </div>
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Steps />
                  <Slider.Thumb aria-describedby={effortOutputId} />
                </Slider.Track>
                <div className="reasoning-range" aria-hidden="true">
                  <span>{effortName(efforts[0].id)}</span>
                  <span>{effortName(efforts.at(-1)!.id)}</span>
                </div>
              </Slider>
            </div>
          )}
          {error && (
            <p className="model-control-error" role="alert">
              {error}
            </p>
          )}
          <p className="model-control-status" role="status">
            {busy
              ? '任务结束后可调整'
              : saving
                ? '正在保存…'
                : loading
                  ? '正在读取可用模型…'
                  : !selection
                    ? '使用 Codex 默认配置'
                    : '用于下一次任务'}
          </p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
