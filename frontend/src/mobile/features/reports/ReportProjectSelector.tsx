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
    <label className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-200">
      <span className="shrink-0 font-medium">汇报项目</span>
      <select aria-label="汇报项目" value={selected} onChange={(event) => {
        const project = available.find((item) => String(item.id) === event.target.value);
        if (project) onSelectProject(project);
      }} className="min-w-0 flex-1 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3">
        <option value="" disabled>请选择项目</option>
        {available.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
      </select>
    </label>
  );
};
