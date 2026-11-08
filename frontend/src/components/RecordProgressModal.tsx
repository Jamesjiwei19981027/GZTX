import React from 'react';
import { RecordProgressScreen, RecordProgressProps } from '../mobile/features/progress/RecordProgressScreen';

export interface RecordProgressModalProps extends RecordProgressProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecordProgressModal: React.FC<RecordProgressModalProps> = ({
  isOpen,
  onClose,
  ...props
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="记录进展"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#10161e] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <RecordProgressScreen
          {...props}
          isModal={true}
          onBack={onClose}
          onSaved={(target) => {
            props.onSaved?.(target);
            onClose();
          }}
        />
      </div>
    </div>
  );
};
