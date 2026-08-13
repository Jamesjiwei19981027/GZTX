import React from 'react';
import { Language } from '../../types';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

/** 全局 `?` 键唤起的快捷键帮助面板 */
export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ isOpen, onClose, lang }) => {
  if (!isOpen) return null;

  const zh = lang === 'zh';
  const groups: { title: string; items: { keys: string[]; desc: string }[] }[] = [
    {
      title: zh ? '全局' : 'Global',
      items: [
        { keys: ['Ctrl', 'K'], desc: zh ? '全局搜索（任务 / 项目 / 知识）' : 'Global search' },
        { keys: ['Alt', 'N'], desc: zh ? '快速添加任务（自然语言时间解析）' : 'Quick add task' },
        { keys: ['?'], desc: zh ? '打开本快捷键帮助' : 'Open this help panel' },
      ],
    },
    {
      title: zh ? '我的任务（列表键盘流）' : 'My Tasks (list keys)',
      items: [
        { keys: ['J'], desc: zh ? '高亮下一条任务' : 'Highlight next task' },
        { keys: ['K'], desc: zh ? '高亮上一条任务' : 'Highlight previous task' },
        { keys: ['X'], desc: zh ? '选中 / 取消选中高亮任务（进入批量操作）' : 'Toggle selection' },
        { keys: ['E'], desc: zh ? '打开高亮任务详情' : 'Open highlighted task' },
        { keys: ['C'], desc: zh ? '完成 / 取消完成高亮任务' : 'Complete highlighted task' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface dark:bg-[#2e3132] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-surface-variant dark:border-outline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-on-surface dark:text-[#f0f1f2] flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">keyboard</span>
            {zh ? '键盘快捷键' : 'Keyboard Shortcuts'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant"
            aria-label={zh ? '关闭' : 'Close'}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant mb-2">
                {group.title}
              </p>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.desc}
                    className="flex items-center justify-between gap-3 p-2.5 bg-surface-container-low dark:bg-[#191c1d] rounded-xl"
                  >
                    <span className="text-sm text-on-surface dark:text-[#f0f1f2]">{item.desc}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {item.keys.map((key, i) => (
                        <React.Fragment key={key}>
                          {i > 0 && <span className="text-xs text-on-surface-variant">+</span>}
                          <kbd className="px-2 py-1 bg-surface border border-outline-variant rounded text-xs font-mono font-bold text-on-surface dark:text-[#f0f1f2] dark:bg-[#2e3132]">
                            {key}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-on-surface-variant">
          {zh
            ? '输入框聚焦时列表快捷键自动失效，不会打断输入。'
            : 'List shortcuts are disabled while typing in inputs.'}
        </p>
      </div>
    </div>
  );
};
