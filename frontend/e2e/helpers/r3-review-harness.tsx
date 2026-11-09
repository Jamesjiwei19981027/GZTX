import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { ReportReviewPanel } from '../../src/components/ReportReviewPanel';

const root = createRoot(document.getElementById('root')!);
(window as any).renderReport = (canReview = true, review = null) => root.render(<ReportReviewPanel key={String(canReview)} report={{ id: 12, binding_id: 1, author_user_id: 3, status: 'submitted', summary_text: '成员汇报', can_review: canReview, review }} />);
(window as any).renderReport();
