import { useState, useEffect, useMemo } from 'react';
import { Calendar, Users, Activity, FileSpreadsheet, Search, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

// --- Types ---
interface ProductionRow {
  id: string;
  timeDuration: string;
  modelName: string;
  plannedMp: number;
  actualMp: number;
  totalAvailTime: number;
  plannedDt: number;
  unplannedDt: number;
  targetOutput: number;
  actualOutput: number;
  goodOutput: number;
  remarks: string;
}

// --- Constants ---
const TEAM_PLANNED_MP: Record<string, number> = {
  'THT Panel': 14,
  'THT Accessories': 6,
  'FG Panel': 9,
  'FG Accessories': 6,
  'Packing Panel': 6,
  'Packing Accessories': 7,
};

// --- Helper Functions to Reverse-Parse Remarks ---
const parseDowntime = (remarks: string | undefined) => {
  if (!remarks) return { planned: 0, unplanned: 0 };
  let planned = 0;
  let unplanned = 0;
  const plannedRegex = /(?:break|change\s*over|setup|meeting)\s*(\d+)/gi;
  const unplannedRegex = /(?:delay|breakdown|power\s*cut|stopped)\s*(\d+)(?:\s*mins['s]*|\s*minutes)?/gi;
  let match;
  while ((match = plannedRegex.exec(remarks)) !== null) { planned += parseInt(match[1]); }
  while ((match = unplannedRegex.exec(remarks)) !== null) { unplanned += parseInt(match[1]); }
  return { planned, unplanned };
};

const parseDefectsFromRemarks = (remarks: string | undefined) => {
  if (!remarks) return 0;
  let total = 0;
  const defectRegex = /(?:fault|damage|drv|missing)\s*(\d+)(?:\s*no['s]*|\s*nos)?/gi;
  let match;
  while ((match = defectRegex.exec(remarks)) !== null) { total += parseInt(match[1]); }
  return total;
};

// --- Exact Time Label Rule Generator ---
const decimalToTimeLabel = (decimalHour: number) => {
  const endH = Math.floor(decimalHour);
  const endM = Math.round((decimalHour % 1) * 60);
  
  // Rule 1: If database time is 9.0 -> map exactly to 08:30 - 09:00
  if (endH === 9 && endM === 0) {
    return "08:30 - 09:00";
  }
  
  // Rule 2: If database time is 10.0, 11.0, etc. -> start time is endH - 1
  const startH = endH - 1;
  return `${startH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')} - ${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
};

// Formats minutes into 'Xh Ym' or 'Ym' for cleaner Day Totals
const formatMinutes = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// --- DYNAMIC PERCENTAGE STYLING ---
const getPercentageStyle = (val: number, isDarkBackground = false) => {
  if (val > 100) return 'bg-red-600 text-white font-bold'; // > 100% gets Red Background
  if (val >= 90) return isDarkBackground ? 'text-green-400 font-bold' : 'text-green-600 font-bold'; // Green
  if (val >= 75) return isDarkBackground ? 'text-yellow-400 font-bold' : 'text-yellow-500 font-bold'; // Yellow
  if (val >= 60) return isDarkBackground ? 'text-orange-400 font-bold' : 'text-red-800 font-bold'; // Dark Red
  return isDarkBackground ? 'text-red-500 font-bold' : 'text-red-600 font-bold'; // Vivid Red
};

export default function ViewUtilizationReport() {
  // --- Filters State ---
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  
  // --- Data State ---
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(false);

  // --- Fetch Available Teams on Mount ---
  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await supabase.from('production_records').select('team');
      if (data) {
        const uniqueTeams = [...new Set(data.map(d => d.team).filter(Boolean))].sort();
        setAvailableTeams(uniqueTeams);
        if (uniqueTeams.length > 0 && !selectedTeam) {
          setSelectedTeam(uniqueTeams[0]); // Auto-select first team
        }
      }
    };
    fetchTeams();
  }, []);

  // --- Fetch Data based on Filters ---
  const fetchReportData = async () => {
    if (!selectedDate || !selectedTeam) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('date', selectedDate)
      .eq('team', selectedTeam)
      .order('hour', { ascending: true });

    if (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
      return;
    }

    // Transform DB records into our View Rows
    const transformedRows: ProductionRow[] = (data || []).map((record) => {
      const dts = parseDowntime(record.remarks);
      const defects = parseDefectsFromRemarks(record.remarks) + (record.defect_qty || 0);
      
      // Duration Check: If 9.0, it is 30 minutes, else standard 60 minutes
      const is9AMSlot = Math.floor(record.hour) === 9 && Math.round((record.hour % 1) * 60) === 0;

      return {
        id: record.id,
        timeDuration: decimalToTimeLabel(record.hour),
        modelName: (record.item || []).map((i: any) => i.model).join('\n'), 
        plannedMp: TEAM_PLANNED_MP[selectedTeam] || record.manpower || 0, 
        actualMp: record.manpower || 0,
        totalAvailTime: is9AMSlot ? 30 : 60,
        plannedDt: dts.planned,
        unplannedDt: dts.unplanned,
        targetOutput: record.target_units || 0,
        actualOutput: record.units_produced || 0,
        goodOutput: (record.units_produced || 0) - defects,
        remarks: record.remarks || ''
      };
    });

    setRows(transformedRows);
    setLoading(false);
  };

  // Re-fetch when filters change
  useEffect(() => {
    fetchReportData();
  }, [selectedDate, selectedTeam]);

  // --- Total Aggregations ---
  const totals = useMemo(() => {
    const sums = rows.reduce((acc, row) => {
      const actualAvail = row.totalAvailTime - row.plannedDt;
      const actualRun = actualAvail - row.unplannedDt;
      return {
        target: acc.target + row.targetOutput,
        actual: acc.actual + row.actualOutput,
        good: acc.good + row.goodOutput,
        totalAvail: acc.totalAvail + row.totalAvailTime,
        actualAvail: acc.actualAvail + actualAvail,
        runTime: acc.runTime + actualRun,
        plannedMp: acc.plannedMp + row.plannedMp,
        actualMp: acc.actualMp + row.actualMp,
        plannedDt: acc.plannedDt + row.plannedDt,
        unplannedDt: acc.unplannedDt + row.unplannedDt
      };
    }, { target: 0, actual: 0, good: 0, totalAvail: 0, actualAvail: 0, runTime: 0, plannedMp: 0, actualMp: 0, plannedDt: 0, unplannedDt: 0 });

    return {
      ...sums,
      avgPlannedMp: rows.length ? Math.round(sums.plannedMp / rows.length) : 0,
      avgActualMp: rows.length ? Math.round(sums.actualMp / rows.length) : 0
    };
  }, [rows]);

  // Pre-calculate percentages for the footer
  const pctUtilActualTotal = totals.actualAvail ? (totals.runTime / totals.actualAvail) * 100 : 0;
  const pctUtilTotalAll = totals.totalAvail ? (totals.runTime / totals.totalAvail) * 100 : 0;
  const pctEffTotal = totals.target ? (totals.actual / totals.target) * 100 : 0;
  const pctQualTotal = totals.actual ? (totals.good / totals.actual) * 100 : 0;

  // Base cell classes
  const cellClass = "border border-slate-300 px-2 py-2 h-10 text-slate-700 leading-tight";
  const numCellClass = `${cellClass} text-center font-mono`;
  const preWrapCellClass = `${cellClass} whitespace-pre-wrap`;

  return (
    <div className="max-w-[100vw] mx-auto p-4 md:p-6 bg-slate-50 min-h-screen font-sans">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        
        {/* --- Header / Filters --- */}
        <div className="bg-[#1E40AF] px-6 py-5 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <FileSpreadsheet size={24} className="text-blue-100" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Utilization Report View</h2>
              <p className="text-xs text-blue-200">View performance data in Excel format</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            {/* Date Filter */}
            <div className="flex items-center bg-blue-800 border border-blue-600 rounded-lg px-3 py-2 shadow-inner">
              <Calendar size={16} className="text-blue-300 mr-2" />
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm text-white outline-none cursor-pointer [color-scheme:dark]"
              />
            </div>

            {/* Team Filter */}
            <div className="flex items-center bg-blue-800 border border-blue-600 rounded-lg px-3 py-2 shadow-inner min-w-[200px]">
              <Users size={16} className="text-blue-300 mr-2" />
              <select 
                value={selectedTeam} 
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="bg-transparent text-sm text-white outline-none w-full cursor-pointer appearance-none"
              >
                <option value="" disabled className="text-slate-800">Select Team...</option>
                {availableTeams.map(team => (
                  <option key={team} value={team} className="text-slate-800">{team}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={fetchReportData}
              className="flex items-center justify-center bg-white text-blue-700 px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-blue-50 transition-colors"
            >
              <Search size={16} className="mr-2" /> Filter
            </button>
          </div>
        </div>

        {/* --- Data Table Container --- */}
        <div className="overflow-x-auto relative min-h-[400px]">
          {loading ? (
            <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center text-blue-600">
              <RefreshCw size={32} className="animate-spin mb-4" />
              <p className="font-bold">Fetching Records...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
              <Activity size={48} className="mb-4 opacity-20" />
              <p className="font-semibold">No production records found for {selectedTeam} on this date.</p>
            </div>
          ) : null}

          <table className="w-full text-xs border-collapse whitespace-nowrap min-w-[1600px]">
            <thead className="bg-[#1E40AF] text-white sticky top-0 z-20">
              <tr>
                <th className="border border-slate-400 px-2 py-3 w-10 text-center font-bold">SL</th>
                <th className="border border-slate-400 px-2 py-3 w-32 font-bold text-center">Time Duration</th>
                <th className="border border-slate-400 px-2 py-3 w-48 font-bold text-left">Model Name</th>
                <th className="border border-slate-400 px-2 py-3 w-16 font-bold text-center whitespace-pre-wrap">Plan MP</th>
                <th className="border border-slate-400 px-2 py-3 w-16 font-bold text-center whitespace-pre-wrap">Actual MP</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center whitespace-pre-wrap">Total Avail Time (min)</th>
                <th className="border border-slate-400 px-2 py-3 w-24 font-bold text-center whitespace-pre-wrap">Planned DT (Break/Setup)</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center text-amber-200 whitespace-pre-wrap">Actual Avail Time</th>
                <th className="border border-slate-400 px-2 py-3 w-24 font-bold text-center whitespace-pre-wrap">Un-Planned DT (Delay)</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center text-amber-200 whitespace-pre-wrap">Actual Run Time</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center text-emerald-200 whitespace-pre-wrap">Line Util % (Actual)</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center text-emerald-200 whitespace-pre-wrap">Line Util % (Total)</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center">Target Output</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center">Actual Output</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center text-blue-200 whitespace-pre-wrap">Efficiency %</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center">Good Output</th>
                <th className="border border-slate-400 px-2 py-3 w-20 font-bold text-center text-blue-200 whitespace-pre-wrap">Quality (FPY) %</th>
                <th className="border border-slate-400 px-2 py-3 w-48 font-bold text-left">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {rows.map((row, index) => {
                const actualAvailTime = row.totalAvailTime - row.plannedDt;
                const actualRunTime = actualAvailTime - row.unplannedDt;
                
                // Calculate percentages for the current row
                const pctUtilActual = actualAvailTime > 0 ? (actualRunTime / actualAvailTime) * 100 : 0;
                const pctUtilTotal = row.totalAvailTime > 0 ? (actualRunTime / row.totalAvailTime) * 100 : 0;
                const pctEff = row.targetOutput > 0 ? (row.actualOutput / row.targetOutput) * 100 : 0;
                const pctQual = row.actualOutput > 0 ? (row.goodOutput / row.actualOutput) * 100 : 0;

                return (
                  <tr key={row.id} className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className={`${numCellClass} text-slate-500 font-bold`}>{index + 1}</td>
                    <td className={`${numCellClass} font-semibold`}>{row.timeDuration}</td>
                    <td className={`${preWrapCellClass} font-medium`}>{row.modelName || '-'}</td>
                    <td className={numCellClass}>{row.plannedMp}</td>
                    <td className={numCellClass}>{row.actualMp}</td>
                    <td className={`${numCellClass} font-bold`}>{row.totalAvailTime}</td>
                    <td className={`${numCellClass} text-rose-600 bg-rose-50/30`}>{row.plannedDt || ''}</td>
                    <td className={`${numCellClass} bg-slate-100 font-bold text-slate-700`}>{actualAvailTime}</td>
                    <td className={`${numCellClass} text-orange-600 bg-orange-50/30`}>{row.unplannedDt || ''}</td>
                    <td className={`${numCellClass} bg-slate-100 font-bold text-slate-700`}>{actualRunTime}</td>
                    
                    {/* Applying Dynamic Styles (Removed conflicting static backgrounds) */}
                    <td className={`${numCellClass} ${getPercentageStyle(pctUtilActual, false)}`}>
                      {pctUtilActual.toFixed(1)}%
                    </td>
                    <td className={`${numCellClass} ${getPercentageStyle(pctUtilTotal, false)}`}>
                      {pctUtilTotal.toFixed(1)}%
                    </td>
                    
                    <td className={numCellClass}>{row.targetOutput}</td>
                    <td className={`${numCellClass} font-bold text-blue-700 bg-blue-50/30`}>{row.actualOutput}</td>
                    
                    <td className={`${numCellClass} ${getPercentageStyle(pctEff, false)}`}>
                      {pctEff.toFixed(1)}%
                    </td>
                    
                    <td className={`${numCellClass} font-bold text-green-700 bg-green-50/30`}>{row.goodOutput}</td>
                    
                    <td className={`${numCellClass} ${getPercentageStyle(pctQual, false)}`}>
                      {pctQual.toFixed(1)}%
                    </td>
                    
                    <td className={`${preWrapCellClass} text-[11px]`}>{row.remarks || '-'}</td>
                  </tr>
                );
              })}

              {/* Day Summary / Totals Row */}
              {rows.length > 0 && (
                <tr className="bg-slate-800 text-white font-bold sticky bottom-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                  <td colSpan={3} className="border border-slate-700 px-4 py-3 text-right text-slate-300">AVERAGES / TOTALS:</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.avgPlannedMp}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.avgActualMp}</td>
                  
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.totalAvail)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.plannedDt)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.actualAvail)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.unplannedDt)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.runTime)}</td>
                  
                  {/* Percentages with Dynamic Colors for Dark Background */}
                  <td className={`border border-slate-700 px-2 py-3 text-center ${getPercentageStyle(pctUtilActualTotal, true)}`}>
                    {pctUtilActualTotal.toFixed(1)}%
                  </td>
                  <td className={`border border-slate-700 px-2 py-3 text-center ${getPercentageStyle(pctUtilTotalAll, true)}`}>
                    {pctUtilTotalAll.toFixed(1)}%
                  </td>
                  
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.target}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.actual}</td>
                  <td className={`border border-slate-700 px-2 py-3 text-center ${getPercentageStyle(pctEffTotal, true)}`}>
                    {pctEffTotal.toFixed(1)}%
                  </td>
                  
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.good}</td>
                  <td className={`border border-slate-700 px-2 py-3 text-center ${getPercentageStyle(pctQualTotal, true)}`}>
                    {pctQualTotal.toFixed(1)}%
                  </td>
                  
                  <td className="border border-slate-700 px-2 py-3 text-white"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
