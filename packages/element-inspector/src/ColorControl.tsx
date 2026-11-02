import { useId, useMemo, useState } from 'react';
import {
  Button,
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorThumb,
  Dialog,
  DialogTrigger,
  Input,
  Label,
  Popover,
  SliderOutput,
  SliderTrack,
  parseColor,
  type Color,
} from 'react-aria-components';
import { PropertyField } from './fields';

function pickerColor(css: string): Color {
  try {
    return parseColor(css);
  } catch {
    // CSS Color 4 values may exceed the sRGB picker's gamut. Only the picker needs a projection.
    if (typeof document === 'undefined') return parseColor('#00000000');
    const context = document.createElement('canvas').getContext('2d');
    if (!context || !CSS.supports('color', css)) return parseColor('#00000000');
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return parseColor(`rgba(${r},${g},${b},${a / 255})`);
  }
}

function compactColor(value: string, color: Color) {
  if (value === 'rgba(0, 0, 0, 0)') return 'transparent';
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)$/.test(value))
    return color.toString('hex');
  return value;
}

export function ColorControl({
  label,
  value,
  disabled,
  isAllowed,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  isAllowed?: (css: string) => boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const id = useId();
  const parsed = useMemo(() => pickerColor(value), [value]);
  const display = compactColor(value, parsed);
  const [draft, setDraft] = useState<string>();
  const [focused, setFocused] = useState(false);
  const hasAlpha = parsed.getChannelValue('alpha') < 1;
  const [invalid, setInvalid] = useState(false);
  // Preserve hue while moving through gray/black, where an RGB serialization loses it.
  const [picked, setPicked] = useState<{ css: string; color: Color }>();
  const active = picked?.css === value ? picked.color : parsed;
  const reset = () => {
    setDraft(undefined);
    setInvalid(false);
  };
  const choose = (next: Color) => {
    const css = next.toString('rgba');
    reset();
    setPicked({ css, color: next });
    if (css !== value) onChange(css);
  };
  const submit = () => {
    if (draft === undefined || draft.trim() === value || (!hasAlpha && draft.trim() === display)) {
      reset();
      return;
    }
    const css = draft.trim();
    // Empty clears the inline override and restores the page cascade.
    if (css && (!CSS.supports('color', css) || (isAllowed && !isAllowed(css)))) {
      setInvalid(true);
      return;
    }
    reset();
    onChange(css);
    onCommit();
  };
  return (
    <PropertyField label={label} htmlFor={id}>
      <div className="ei-color-box" data-invalid={invalid || undefined}>
        <ColorPicker value={active} onChange={choose}>
          <DialogTrigger>
            <Button
              className="ei-swatch-button"
              aria-label={label + '选择器'}
              isDisabled={disabled}
            >
              <span className="ei-swatch" aria-hidden>
                <i style={{ backgroundColor: value }} />
              </span>
            </Button>
            <Popover className="ei-popover" placement="bottom start" offset={6}>
              <Dialog className="ei-color-dialog" aria-label={label + '选择器'}>
                <header>
                  <strong>{label}</strong>
                  <span className="ei-swatch" aria-hidden>
                    <i style={{ backgroundColor: value }} />
                  </span>
                </header>
                <ColorArea
                  className="ei-color-area"
                  aria-label="饱和度和亮度"
                  colorSpace="hsb"
                  xChannel="saturation"
                  yChannel="brightness"
                  onChangeEnd={onCommit}
                >
                  <ColorThumb className="ei-color-thumb" />
                </ColorArea>
                {(['hue', 'alpha'] as const).map((channel) => (
                  <ColorSlider
                    className="ei-channel"
                    key={channel}
                    channel={channel}
                    colorSpace="hsb"
                    onChangeEnd={onCommit}
                  >
                    <Label>{channel === 'hue' ? '色相' : '不透明度'}</Label>
                    <SliderOutput />
                    <div className="ei-channel-bed">
                      <SliderTrack className="ei-channel-track">
                        <ColorThumb className="ei-color-thumb" />
                      </SliderTrack>
                    </div>
                  </ColorSlider>
                ))}
                <div className="ei-color-values">
                  <ColorField
                    slot={null}
                    className="ei-hex"
                    value={active}
                    aria-label="十六进制颜色"
                    onChange={(next) => {
                      if (!next) return;
                      choose(next.withChannelValue('alpha', active.getChannelValue('alpha')));
                      onCommit();
                    }}
                  >
                    <Label className="ei-sr-only">HEX</Label>
                    <Input className="ei-input" spellCheck={false} />
                  </ColorField>
                  <output className="ei-color-alpha" aria-label="颜色不透明度">
                    {Number((active.getChannelValue('alpha') * 100).toFixed(2))}%
                  </output>
                </div>
              </Dialog>
            </Popover>
          </DialogTrigger>
        </ColorPicker>
        <input
          id={id}
          aria-label={label + '值'}
          title={value}
          value={draft ?? (focused && hasAlpha ? value : display)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          maxLength={80}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={() => {
            setFocused(false);
            submit();
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? id + '-error' : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              reset();
            }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {hasAlpha && !focused && draft === undefined && (
          <span className="ei-alpha-value" title="颜色不透明度">
            {Number((parsed.getChannelValue('alpha') * 100).toFixed(2))}%
          </span>
        )}
      </div>
      {invalid && (
        <small id={id + '-error'} className="ei-error">
          请输入具体的 CSS 颜色，例如 #445566
        </small>
      )}
    </PropertyField>
  );
}
