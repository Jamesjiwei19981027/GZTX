import React, { useState } from 'react';
import { Task, Language } from '../../types';
import { getT } from '../../i18n';

interface CalendarViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onOpenNewTaskWithDate: (dateStr: string) => void;
  lang: Language;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  onSelectTask,
  onOpenNewTaskWithDate,
  lang,
}) => {
  const t = getT(lang);
  const [viewType, setViewType] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDay, setSelectedDay] = useState<number>(15); // Default focus Oct 15 from screenshot

  const daysOfWeek = lang === 'zh'
    ? ['日', '一', '二', '三', '四', '五', '六']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // October 2024 starts on Tuesday (day index 2) and has 31 days.
  const firstDayIndex = 2; // Tuesday
  const totalDays = 31;
  const blanks = Array.from({ length: firstDayIndex }, (_, i) => i);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  // Helper to get date string YYYY-MM-DD for October 2024
  const getDateStr = (dayNum: number) => {
    const dStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    return `2024-10-${dStr}`;
  };

  const selectedDateStr = getDateStr(selectedDay);
  const selectedDayTasks = tasks.filter((t) => t.dueDate === selectedDateStr);

  return (
    <div className="max-w-[1400px] mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
      {/* Top Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-extrabold text-on-surface dark:text-[#f0f1f2] tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl">calendar_month</span>
            <span>{lang === 'zh' ? '2024年 10月' : 'October 2024'}</span>
          </h1>
          <div className="flex items-center bg-surface-container dark:bg-[#191c1d] rounded-xl p-1 border border-outline-variant">
            <button
              onClick={() => setSelectedDay(Math.max(1, selectedDay - 1))}
              className="p-1 hover:bg-surface dark:hover:bg-[#2e3132] rounded-lg text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <button
              onClick={() => setSelectedDay(15)}
              className="px-2.5 py-1 text-xs font-bold text-primary hover:bg-surface dark:hover:bg-[#2e3132] rounded-lg transition-colors"
            >
              {t.today}
            </button>
            <button
              onClick={() => setSelectedDay(Math.min(31, selectedDay + 1))}
              className="p-1 hover:bg-surface dark:hover:bg-[#2e3132] rounded-lg text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>

        {/* View Mode Switcher (Month / Week / Day) */}
        <div className="flex bg-surface-container dark:bg-[#191c1d] p-1 rounded-xl border border-outline-variant shadow-xs">
          {(['month', 'week', 'day'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewType(mode)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                viewType === mode
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {mode === 'month' ? t.month : mode === 'week' ? t.week : t.day}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Layout: Grid + Outlook Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Calendar Grid Section (8 cols) */}
        <div className="lg:col-span-8 bg-surface dark:bg-[#191c1d] rounded-2xl border border-surface-variant dark:border-outline-variant p-4 md:p-6 shadow-sm">
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-2 mb-3 text-center">
            {daysOfWeek.map((day, idx) => (
              <div key={day} className={`text-xs font-extrabold py-2 uppercase ${idx === 0 || idx === 6 ? 'text-error' : 'text-on-surface-variant'}`}>
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Blank previous month days */}
            {blanks.map((idx) => (
              <div
                key={`blank-${idx}`}
                className="h-24 md:h-28 bg-surface-container-lowest/30 dark:bg-[#151718] rounded-xl border border-transparent opacity-40 pointer-events-none"
              ></div>
            ))}

            {/* Actual October Days */}
            {days.map((dayNum) => {
              const dStr = getDateStr(dayNum);
              const dayTasks = tasks.filter((t) => t.dueDate === dStr);
              const isSelected = selectedDay === dayNum;
              const isToday = dayNum === 15; // Oct 15 is our focus anchor

              return (
                <div
                  key={dayNum}
                  onClick={() => setSelectedDay(dayNum)}
                  onDoubleClick={() => onOpenNewTaskWithDate(dStr)}
                  className={`h-24 md:h-28 rounded-xl p-2 transition-all cursor-pointer flex flex-col justify-between border relative group overflow-hidden ${
                    isSelected
                      ? 'bg-primary-fixed/20 dark:bg-primary-container/30 border-2 border-primary shadow-md'
                      : 'bg-surface-container-low dark:bg-[#2e3132] border-surface-variant dark:border-outline hover:border-primary/50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span
                      className={`text-xs md:text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-primary text-on-primary shadow-sm ring-2 ring-primary/30'
                          : isSelected
                          ? 'text-primary dark:text-[#adc6ff] font-extrabold'
                          : 'text-on-surface dark:text-[#f0f1f2]'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="text-[10px] bg-secondary-container text-on-secondary-container font-extrabold px-1.5 py-0.5 rounded-full">
                        {dayTasks.length}
                      </span>
                    )}
                  </div>

                  {/* Task Pills Snippets */}
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayTasks.slice(0, 2).map((tItem) => {
                      const isDone = tItem.status === 'Done';
                      return (
                        <div
                          key={tItem.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTask(tItem);
                          }}
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded truncate flex items-center gap-1 transition-transform hover:scale-102 ${
                            isDone
                              ? 'bg-secondary/20 text-secondary line-through'
                              : tItem.priority === 'Urgent' || tItem.priority === 'High'
                              ? 'bg-error-container text-on-error-container font-bold'
                              : 'bg-primary-fixed text-on-primary-fixed-variant'
                          }`}
                        >
                          <span className="w-1 h-1 rounded-full bg-current flex-shrink-0"></span>
                          <span className="truncate">{tItem.title.split(' ')[0]}</span>
                        </div>
                      );
                    })}
                    {dayTasks.length > 2 && (
                      <div className="text-[9px] text-center font-bold text-on-surface-variant">
                        +{dayTasks.length - 2} {lang === 'zh' ? '更多' : 'more'}
                      </div>
                    )}
                  </div>

                  {/* Quick Add icon on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenNewTaskWithDate(dStr);
                    }}
                    className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-primary text-on-primary rounded-full shadow transition-opacity"
                    title={lang === 'zh' ? '在此日添加任务' : 'Add task on this day'}
                  >
                    <span className="material-symbols-outlined text-xs">add</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Schedule & Outlook Side Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Weather & Outlook Card */}
          <div className="bg-gradient-to-br from-[#1d4ed8] to-[#1e40af] text-white p-6 rounded-2xl shadow-md relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider opacity-80">
                  {t.todayOutlook}
                </h3>
                <p className="text-2xl font-extrabold mt-1">
                  {lang === 'zh' ? `10月${selectedDay}日 安排` : `Oct ${selectedDay} Schedule`}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-white/20 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-md">
                <span className="material-symbols-outlined text-sm">wb_sunny</span>
                <span>24°C</span>
              </div>
            </div>

            <p className="text-xs font-medium bg-white/10 p-3 rounded-xl backdrop-blur-sm">
              💡 {t.outlookDesc}
            </p>

            {/* Productivity Score */}
            <div className="mt-5 pt-4 border-t border-white/20">
              <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                <span>{t.efficiencyScore}</span>
                <span>85%</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                <div className="bg-amber-300 h-2 rounded-full w-[85%] transition-all duration-1000"></div>
              </div>
            </div>
          </div>

          {/* Selected Day's Task Timeline */}
          <div className="bg-surface dark:bg-[#191c1d] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-surface-variant">
              <h3 className="font-bold text-base text-on-surface dark:text-[#f0f1f2] flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">view_timeline</span>
                <span>{lang === 'zh' ? `10月${selectedDay}日 任务列表` : `Tasks for Oct ${selectedDay}`}</span>
              </h3>
              <button
                onClick={() => onOpenNewTaskWithDate(selectedDateStr)}
                className="p-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-on-primary rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>{lang === 'zh' ? '增加' : 'Add'}</span>
              </button>
            </div>

            {selectedDayTasks.length === 0 ? (
              <div className="text-center py-10 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl mb-1 opacity-50">event_available</span>
                <p className="text-sm font-semibold">{lang === 'zh' ? '此日没有任何安排' : 'No tasks scheduled'}</p>
                <p className="text-xs mt-1">{lang === 'zh' ? '双击日期方格即可创建任务' : 'Double click any day to add tasks'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDayTasks.map((taskItem) => {
                  const isDone = taskItem.status === 'Done';
                  return (
                    <div
                      key={taskItem.id}
                      onClick={() => onSelectTask(taskItem)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isDone
                          ? 'bg-surface-container-lowest border-surface-variant opacity-75'
                          : 'bg-surface-container-low dark:bg-[#2e3132] border-transparent hover:border-primary/50 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`w-2 h-10 rounded-full flex-shrink-0 ${
                            isDone ? 'bg-secondary' : taskItem.priority === 'Urgent' || taskItem.priority === 'High' ? 'bg-error' : 'bg-primary'
                          }`}
                        ></div>
                        <div className="overflow-hidden">
                          <p className={`text-sm font-bold truncate ${isDone ? 'line-through text-on-surface-variant' : 'text-on-surface dark:text-[#f0f1f2]'}`}>
                            {taskItem.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
                            <span className="font-semibold text-primary">{taskItem.dueTime || '全天'}</span>
                            <span>•</span>
                            <span className="truncate">#{taskItem.tag || taskItem.category}</span>
                          </div>
                        </div>
                      </div>

                      <span className="material-symbols-outlined text-on-surface-variant/60 text-lg flex-shrink-0 ml-2">
                        chevron_right
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
