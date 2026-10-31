import React, { useId } from 'react';
import { AppIcon } from './AppIcon';

export interface MobileFieldProps {
  label?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export const MobileField: React.FC<MobileFieldProps> = ({
  label,
  helperText,
  error,
  required,
  id: customId,
  className = '',
  children,
}) => {
  const generatedId = useId();
  const id = customId || generatedId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 select-none"
        >
          {label}
          {required && <span className="text-red-500 font-bold" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative w-full">
        {React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>, {
              id: (children.props as { id?: string }).id || id,
              'aria-describedby': error ? errorId : helperText ? helpId : undefined,
              'aria-invalid': Boolean(error),
            })
          : children}
      </div>

      {error ? (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400 font-normal flex items-center gap-1">
          <AppIcon name="alert" size={14} className="shrink-0 text-red-500" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p id={helpId} className="text-xs text-slate-500 dark:text-slate-400 font-normal">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};

export interface MobileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  clearable?: boolean;
  onClear?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const MobileInput = React.forwardRef<HTMLInputElement, MobileInputProps>(
  ({ clearable, onClear, leading, trailing, value, className = '', disabled, ...props }, ref) => {
    const showClear = clearable && Boolean(value) && !disabled;

    return (
      <div className="relative flex items-center w-full">
        {leading && <div className="absolute left-3.5 z-10 text-slate-400 pointer-events-none">{leading}</div>}
        <input
          ref={ref}
          value={value}
          disabled={disabled}
          className={`w-full min-h-[48px] px-3.5 text-base bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0058BE] focus:border-transparent disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800 transition-colors ${
            leading ? 'pl-10' : ''
          } ${showClear || trailing ? 'pr-11' : ''} ${className}`}
          {...props}
        />
        {showClear && (
          <button
            type="button"
            aria-label="清空输入"
            onClick={onClear}
            className="absolute right-2.5 h-7 w-7 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:opacity-80 active:opacity-60"
          >
            <AppIcon name="close" size={14} />
          </button>
        )}
        {!showClear && trailing && (
          <div className="absolute right-3.5 text-slate-400 flex items-center">{trailing}</div>
        )}
      </div>
    );
  },
);
MobileInput.displayName = 'MobileInput';

export interface MobileTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const MobileTextarea = React.forwardRef<HTMLTextAreaElement, MobileTextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full min-h-[96px] p-3 text-base bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0058BE] focus:border-transparent disabled:opacity-50 transition-colors resize-y ${className}`}
        {...props}
      />
    );
  },
);
MobileTextarea.displayName = 'MobileTextarea';

export interface MobileSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
}

export const MobileSwitch: React.FC<MobileSwitchProps> = ({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  id,
}) => {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0058BE] focus-visible:ring-offset-2 ${
        checked ? 'bg-[#0058BE]' : 'bg-slate-300 dark:bg-slate-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
};
