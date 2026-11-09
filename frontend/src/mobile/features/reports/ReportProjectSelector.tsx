import React from 'react';
import { Project } from '../../../types';

export interface ReportProjectSelectorProps {
  currentProject: Project;
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
}

export const ReportProjectSelector: React.FC<ReportProjectSelectorProps> = ({ currentProject, projects, onSelectProject }) => {
  if (!projects || !onSelectProject) return null;
  const available = projects.filter((project) => Number(project.id) > 0 && project.active !== false);
  const selected = available.some((project) => String(project.id) === String(currentProject.id)) ? String(currentProject.id) : '';
  return (
    <label className="flex items-center gap-3 px-4 py-3 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant dark:border-outline-variant text-sm text-on-surface dark:text-outline">
      <span className="shrink-0 font-medium tabular-nums">汇报项目</span>
      <select aria-label="汇报项目" value={selected} onChange={(event) => {
        const project = available.find((item) => String(item.id) === event.target.value);
        if (project) onSelectProject(project);
      }} className="min-w-0 flex-1 min-h-[40px] rounded-lg border border-outline-variant dark:border-outline-variant bg-transparent px-3">
        <option value="" disabled>请选择项目</option>
        {available.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
      </select>
    </label>
  );
};
