import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, ChevronRight, X as CloseIcon, Info, Loader2, 
  Package, Users, AlertCircle, LayoutGrid, Calendar as CalendarIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const toDateKey = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

interface YieldDataMap {
  [dateKey: string]: {
    totalQty: number;
    teamTotals: { [teamName: string]: number };
  };
}

export default function YieldCalendar() {
  const [viewDate, setViewDate] = useState(new Date());
  const [yieldStats, setYieldStats] = useState<YieldDataMap>({});
  const [loading, setLoading] = useState(true);
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [groupedDetails, setGroupedDetails] = useState<{ [teamName: string]: any[] }>({});
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    const fetchMonthSummary = async () => {
      setLoading(true);
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

      const { data, error } = await supabase
        .from('yield')
        .select(`date, quantity, operators ( team )`)
        .gte('date', firstDay)
        .lte('date', lastDay);

      if (!error && data) {
        const map: YieldDataMap = {};
        data.forEach((row: any) => {
          const dKey = row.date;
          const team = row.operators?.team || 'Unassigned';
          if (!map[dKey]) map[dKey] = { totalQty: 0, teamTotals: {} };
          map[dKey].totalQty += row.quantity;
          map[dKey].teamTotals[team] = (map[dKey].teamTotals[team] || 0) + row.quantity;
        });
        setYieldStats(map);
      }
      setLoading(false);
    };
    fetchMonthSummary();
  }, [viewDate]);

  const handleDateClick = async (dateKey: string) => {
    if (!yieldStats[dateKey]) return;
    setSelectedDate(dateKey);
    setDetailsLoading(true);
    const { data, error } = await supabase
      .from('yield')
      .select('*, operators(team)')
      .eq('date', dateKey);

    if (!error && data) {
      const groups = data.reduce((acc: any, item) => {
        const teamName = item.operators?.team || 'Unassigned';
        if (!acc[teamName]) acc[teamName] = [];
        acc[teamName].push(item);
        return acc;
      }, {});
      setGroupedDetails(groups);
    }
    setDetailsLoading(false);
  };

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [viewDate]);

return (
  <div className="min-h-screen bg-white p-4 md:p-8 font-sans text-slate-900">
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
      
      {/* Left: Calendar Section */}
      <div className="bg-white backdrop-blur-md rounded-[1.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[600px]">
        
        <div className="bg-gradient-to-r from-slate-100 to-white p-6 text-slate-900 shrink-0 border-b border-slate-200">
          <div className="flex justify-between items-center">
            
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
                <CalendarIcon size={20} className="text-white" />
              </div>

              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                Yield Calendar
              </h2>
            </div>

            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              
              <button
                onClick={() =>
                  setViewDate(
                    new Date(
                      viewDate.getFullYear(),
                      viewDate.getMonth() - 1,
                      1
                    )
                  )
                }
                className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="px-4 py-1 text-sm font-bold self-center border-x border-slate-200 text-slate-700">
                {viewDate.toLocaleString('default', {
                  month: 'short',
                  year: 'numeric',
                })}
              </div>

              <button
                onClick={() =>
                  setViewDate(
                    new Date(
                      viewDate.getFullYear(),
                      viewDate.getMonth() + 1,
                      1
                    )
                  )
                }
                className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"
              >
                <ChevronRight size={18} />
              </button>

            </div>
          </div>
        </div>

        <div className="p-6 flex-1 flex flex-col justify-center">

          {/* Week Header */}
          <div className="grid grid-cols-7 mb-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
              (d) => (
                <div key={d}>{d}</div>
              )
            )}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-3">

            {calendarDays.map((date, idx) => {

              if (!date)
                return (
                  <div
                    key={`empty-${idx}`}
                    className="aspect-square"
                  />
                );

              const key = toDateKey(date);

              const stats = yieldStats[key];

              const isToday =
                key === toDateKey(new Date());

              const isSelected =
                selectedDate === key;

              return (
                <div
                  key={key}
                  onClick={() =>
                    handleDateClick(key)
                  }
                  className={`
                    group relative aspect-square rounded-2xl border-2 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center
                    ${
                      stats
                        ? 'border-red-200 bg-red-50 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.12)]'
                        : 'border-transparent bg-slate-100/70 hover:bg-slate-100 hover:border-slate-300'
                    }
                    ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                        : ''
                    }
                  `}
                >

                  {/* Date */}
                  <span
                    className={`
                      text-sm font-bold
                      ${
                        isToday
                          ? 'text-blue-600'
                          : 'text-slate-600'
                      }
                      ${
                        isSelected
                          ? 'text-slate-900'
                          : ''
                      }
                    `}
                  >
                    {date.getDate()}
                  </span>

                  {/* Dot */}
                  {stats && (
                    <div className="mt-1 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                    </div>
                  )}

                  {/* Tooltip */}
                  {stats && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 z-50">

                      <div className="bg-white text-slate-900 rounded-xl p-3 shadow-2xl w-48 border border-slate-200 backdrop-blur-xl">

                        <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-200 text-[9px] font-black uppercase text-blue-500">

                          <span>Team Breakdown</span>

                          <Users size={10} />

                        </div>

                        <div className="space-y-1">

                          {Object.entries(
                            stats.teamTotals
                          ).map(([team, qty]) => (
                            <div
                              key={team}
                              className="flex justify-between text-[10px]"
                            >
                              <span className="text-slate-500 truncate pr-2">
                                {team}
                              </span>

                              <span className="font-bold text-red-500">
                                {qty}
                              </span>
                            </div>
                          ))}

                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Analytics Section */}
      <div className="bg-white backdrop-blur-md rounded-[1.5rem] shadow-2xl border border-slate-200 flex flex-col h-[600px] overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-slate-200 shrink-0 bg-slate-50">

          <div className="flex items-center justify-between">

            <div>
              <h3 className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] mb-1">
                Live Analytics
              </h3>

              <p className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <LayoutGrid
                  size={18}
                  className="text-blue-500"
                />

                {selectedDate
                  ? new Date(
                      selectedDate
                    ).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Standby'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar scrollbar-thin scrollbar-thumb-slate-300">

          {detailsLoading ? (

            <div className="flex flex-col items-center justify-center h-full text-slate-500">

              <Loader2
                className="animate-spin mb-4 text-blue-500"
                size={32}
              />

              <p className="text-xs font-bold uppercase tracking-widest">
                Accessing Records...
              </p>
            </div>

          ) : Object.keys(groupedDetails).length > 0 ? (

            Object.entries(groupedDetails).map(
              ([teamName, records]) => (

                <div
                  key={teamName}
                  className="relative"
                >

                  {/* Team Header */}
                  <div className="flex items-center justify-between mb-4 sticky top-0 bg-white/95 backdrop-blur-sm py-1 z-10">

                    <div className="flex items-center gap-2">

                      <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center border border-red-200">
                        <Users
                          size={16}
                          className="text-red-500"
                        />
                      </div>

                      <span className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                        {teamName}
                      </span>
                    </div>

                    <span className="text-[10px] font-black px-2 py-1 bg-blue-100 text-blue-600 rounded-lg border border-blue-200">

                      {records.reduce(
                        (s, r) => s + r.quantity,
                        0
                      )}{' '}
                      UNITS

                    </span>
                  </div>

                  {/* Records */}
                  <div className="space-y-4 ml-4 border-l-2 border-red-100 pl-4">

                    {records.map((rec) => (
                      <div
                        key={rec.id}
                        className="group/item pb-4 border-b border-slate-100 last:border-0"
                      >

                        <div className="flex justify-between items-center">

                          <div className="flex flex-col">

                            <span className="text-xs font-bold text-blue-600 uppercase">
                              {rec.model_name}
                            </span>

                            <span className="text-[12px] text-slate-500 flex items-center gap-1">
                              {rec.supplier_name}
                            </span>

                          </div>

                          <div className="text-right">

                            <span className="text-xl font-black text-slate-900">
                              {rec.quantity}
                            </span>

                            <span className="text-[8px] font-bold text-red-500 block uppercase">
                              Units
                            </span>

                          </div>
                        </div>

                        {rec.problem && (
                          <div className="flex gap-0 p-0 rounded-lg text-red-500 text-[13px] mt-2">
                            <span>{rec.problem}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )

          ) : (

            <div className="h-full flex flex-col items-center justify-center text-center">

              <Info
                className="text-slate-300 mb-4"
                size={48}
              />

              <p className="text-slate-500 text-sm italic font-medium">
                System awaiting date input for metrics.
              </p>

            </div>
          )}
        </div>

        {/* Footer Summary */}
        {Object.keys(groupedDetails).length > 0 && (

          <div className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 text-slate-900 shrink-0 border-t border-slate-200">

            <div className="flex justify-between items-center">

              <div className="flex flex-col">

                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Summary Output
                </span>

                <span className="text-sm font-bold text-blue-500">
                  Daily Total Yield
                </span>
              </div>

              <span className="text-3xl font-black text-slate-900">

                {Object.values(groupedDetails)
                  .flat()
                  .reduce(
                    (s, r) => s + r.quantity,
                    0
                  )}

              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
}
