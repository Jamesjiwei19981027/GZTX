import React from 'react';
import type { Language } from '../types';
import { getBrandName } from '../constants/brand';

interface BrandMarkProps {
  lang?: Language;
  iconSize?: number;
  showWordmark?: boolean;
  className?: string;
}

/** Shared flat pen-nib mark used by the web shell and auth gates. */
export const BrandMark: React.FC<BrandMarkProps> = ({
  lang = 'zh',
  iconSize = 28,
  showWordmark = true,
  className = '',
}) => {
  const brandLang: Language = lang === 'en' ? 'en' : 'zh';
  return (
  <span className={`inline-flex items-center gap-2 text-primary ${className}`}>
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19.2 3.3a2.7 2.7 0 0 0-3.8 0L4.5 14.2a1.8 1.8 0 0 0-.48.86l-.92 4.1a.8.8 0 0 0 .96.96l4.1-.92a1.8 1.8 0 0 0 .86-.48L19.95 7.1a2.7 2.7 0 0 0-.75-3.8ZM7.1 17.63l-1.44.32.32-1.44 7.4-7.4 1.12 1.12-7.4 7.4Zm8.53-8.53-1.12-1.12 1.93-1.93 1.12 1.12-1.93 1.93Z" />
      <path d="m3.95 20.05 1.2-2.1 1.9 1.9-2.1 1.2a.7.7 0 0 1-1-.99Z" />
    </svg>
    {showWordmark && <span className="font-medium leading-none">{getBrandName(brandLang)}</span>}
  </span>
  );
};
