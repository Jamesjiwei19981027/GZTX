import React from 'react';
import { getBrandTagline, getBrandFullName } from '../constants/brand';
import { BrandMark } from './BrandMark';

export function AuthBrandPanel({ lang }: { lang: 'zh' | 'en' }) {
  return <aside className="hidden md:flex md:w-1/2 items-center justify-center bg-surface border-r border-outline-variant p-12">
    <div className="w-full max-w-md space-y-6">
      <BrandMark lang={lang} iconSize={40} className="text-2xl" />
      <p className="text-[28px] font-medium text-on-surface">{getBrandTagline(lang)}</p>
      <p className="text-sm text-on-surface-variant">{getBrandFullName(lang)}</p>
    </div>
  </aside>;
}
