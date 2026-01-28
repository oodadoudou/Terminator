import { ConfirmPrompt, SelectPrompt, TextPrompt, isCancel } from '@clack/core';

type TextOptions = {
  message: string;
  placeholder?: string;
  validate?: (value: string) => string | void;
  defaultValue?: string;
  initialValue?: string;
};

type SelectOption<T> = {
  value: T;
  label?: string;
  hint?: string;
};

type SelectFormatOptions = {
  activePrefix?: string;
  inactivePrefix?: string;
  labelWidth?: number;
  includeHints?: boolean;
};

type SelectOptions<T> = {
  message: string;
  options: SelectOption<T>[];
  initialValue?: T;
  format?: SelectFormatOptions;
};

type ConfirmOptions = {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
};

const getSelectLabelWidth = (labels: string[], format?: SelectFormatOptions) => {
  if (typeof format?.labelWidth === 'number') {
    return format.labelWidth;
  }
  if (labels.length === 0) {
    return 0;
  }
  const max = Math.max(...labels.map((label) => label.length));
  return max + 2;
};

export const text = async (opts: TextOptions) => {
  const prompt = new TextPrompt({
    validate: opts.validate,
    placeholder: opts.placeholder,
    defaultValue: opts.defaultValue,
    initialValue: opts.initialValue,
    render() {
      const placeholder = opts.placeholder ?? '';
      const hasValue = Boolean(this.value);
      const activeValue = hasValue ? this.valueWithCursor : placeholder;
      const finalValue =
        this.state === 'submit' || this.state === 'cancel'
          ? this.value ?? ''
          : activeValue;
      const lines = [`${opts.message}`, `> ${finalValue}`];
      if (this.state === 'error' && this.error) {
        lines.push(this.error);
      }
      return lines.join('\n');
    },
  });

  return (await prompt.prompt()) as string | symbol;
};

export const select = async <T>(opts: SelectOptions<T>) => {
  const format: SelectFormatOptions = {
    activePrefix: '→ ',
    inactivePrefix: '  ',
    includeHints: true,
    ...opts.format,
  };
  const labels = opts.options.map(
    (option) => option.label ?? String(option.value)
  );
  const labelWidth = getSelectLabelWidth(labels, format);
  const prompt = new SelectPrompt({
    options: opts.options,
    initialValue: opts.initialValue,
    render() {
      const lines = this.options.map((option, index) => {
        const isActive = index === this.cursor;
        const label = option.label ?? String(option.value);
        const prefix = isActive ? format.activePrefix : format.inactivePrefix;
        const paddedLabel = labelWidth
          ? label.padEnd(labelWidth, ' ')
          : label;
        const hint =
          format.includeHints !== false && option.hint
            ? option.hint
            : '';
        return `${prefix}${paddedLabel}${hint}`;
      });
      return `${opts.message}\n${lines.join('\n')}`;
    },
  });

  return (await prompt.prompt()) as T | symbol;
};

export const confirm = async (opts: ConfirmOptions) => {
  const prompt = new ConfirmPrompt({
    active: opts.active ?? 'Yes',
    inactive: opts.inactive ?? 'No',
    initialValue: opts.initialValue ?? true,
    render() {
      const active = this.value ? `[${opts.active ?? 'Yes'}]` : 'Yes';
      const inactive = this.value ? 'No' : `[${opts.inactive ?? 'No'}]`;
      const status = `${active} / ${inactive}`;
      return `${opts.message}\n${status}`;
    },
  });

  return (await prompt.prompt()) as boolean | symbol;
};

export const spinner = () => {
  let active = false;
  return {
    start(message = '') {
      active = true;
      if (message) {
        console.log(message);
      }
    },
    stop(message = '') {
      if (!active) return;
      if (message) {
        console.log(message);
      }
      active = false;
    },
  };
};

export const intro = (message: string) => {
  if (message) {
    console.log(message);
  }
};

export const outro = (message: string) => {
  if (message) {
    console.log(message);
  }
};

export const cancel = (message: string) => {
  if (message) {
    console.log(message);
  }
};

export { isCancel };
