import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { MobileReportPolicySettings } from '../../src/mobile/features/projects/MobileReportPolicySettings';

const root = createRoot(document.getElementById('root')!);
(window as any).renderPolicy = (canManage: boolean, archived: boolean) => root.render(
  <MobileReportPolicySettings projectId={42} canManage={canManage} archived={archived} />,
);
(window as any).renderPolicy(true, false);
