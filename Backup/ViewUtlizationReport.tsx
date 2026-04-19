import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Users, Activity, FileSpreadsheet, Search, RefreshCw, Edit2, Trash2, Save, X, Clipboard } from 'lucide-react';
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
  'Packing Accessories': 7,
  'Packing Panel': 6,
  'THT Panel': 14,
  'THT Accessories': 6,
  'FG Panel': 9,
  'FG Accessories': 6,
  
  
};

// --- Extract Teams directly from the constant so ALL teams always show ---
const ALL_TEAMS = Object.keys(TEAM_PLANNED_MP);

// --- Helper Functions ---
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
  
  if (endH === 9 && endM === 0) {
    return "08:30 - 09:00";
  }
  
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

// --- DYNAMIC PERCENTAGE STYLING (Returns Inline Styles) ---
const getPercentageStyle = (val: number, isDarkBackground = false): React.CSSProperties => {
  if (val > 100 || val < 0) {
    return { backgroundColor: '#dc2626', color: 'white', fontWeight: 'bold' }; 
  }
  
  let textColor = '';
  if (val >= 90) {
    textColor = isDarkBackground ? '#4ade80' : '#16a34a'; // Green
  } else if (val >= 75) {
    textColor = isDarkBackground ? '#facc15' : '#eab308'; // Yellow
  } else if (val >= 60) {
    textColor = isDarkBackground ? '#fb923c' : '#991b1b'; // Orange / Dark Red
  } else {
    textColor = isDarkBackground ? '#ef4444' : '#dc2626'; // Vivid Red
  }

  return { color: textColor, fontWeight: 'bold' };
};

export default function ViewUtilizationReport() {
  // --- Filters State ---
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTeam, setSelectedTeam] = useState(ALL_TEAMS[0]); // Auto-select first team
  
  // --- Data State ---
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(false);

  // --- Edit Mode State ---
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ 
    actualMp: 0, 
    plannedDt: 0, 
    unplannedDt: 0, 
    targetOutput: 0, 
    actualOutput: 0, 
    remarks: '' 
  });

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
      const defects = parseDefectsFromRemarks(record.remarks) + (record.defect_qty || 0);
      
      const is9AMSlot = Math.floor(record.hour) === 9 && Math.round((record.hour % 1) * 60) === 0;

      return {
        id: record.id,
        timeDuration: decimalToTimeLabel(record.hour),
        modelName: (record.item || []).map((i: any) => i.model).join('\n'), 
        plannedMp: TEAM_PLANNED_MP[selectedTeam] || record.manpower || 0, 
        actualMp: record.manpower || 0,
        totalAvailTime: is9AMSlot ? 30 : 60,
        plannedDt: record.plan_dt || 0,     // FETCH FROM SUPABASE COLUMN
        unplannedDt: record.unplan_dt || 0, // FETCH FROM SUPABASE COLUMN
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
    setEditingRowId(null); // Reset edit state if filters change
  }, [selectedDate, selectedTeam]);

  // --- CRUD Handlers ---
  const handleEditClick = (row: ProductionRow) => {
    const pwd = window.prompt("Enter password to edit:");
    if (pwd === '787374') {
      setEditingRowId(row.id);
      setEditForm({
        actualMp: row.actualMp,
        plannedDt: row.plannedDt,
        unplannedDt: row.unplannedDt,
        targetOutput: row.targetOutput,
        actualOutput: row.actualOutput,
        remarks: row.remarks
      });
    } else if (pwd !== null) {
      alert("Incorrect password!");
    }
  };

  const handleDeleteClick = async (id: string) => {
    const pwd = window.prompt("Enter password to delete:");
    if (pwd === '787374') {
      if (window.confirm("Are you sure you want to delete this record? This cannot be undone.")) {
        const { error } = await supabase.from('production_records').delete().eq('id', id);
        if (!error) {
          fetchReportData(); // Refresh table
        } else {
          alert("Error deleting record.");
        }
      }
    } else if (pwd !== null) {
      alert("Incorrect password!");
    }
  };

  const handleSaveEdit = async () => {
    try {
      const { error } = await supabase
        .from('production_records')
        .update({
          manpower: editForm.actualMp,
          target_units: editForm.targetOutput,
          units_produced: editForm.actualOutput,
          plan_dt: editForm.plannedDt,       // SAVE TO SUPABASE COLUMN
          unplan_dt: editForm.unplannedDt,   // SAVE TO SUPABASE COLUMN
          remarks: editForm.remarks 
        })
        .eq('id', editingRowId);

      if (error) throw error;

      setEditingRowId(null);
      fetchReportData(); // Refresh table to recalculate downtimes/defects
    } catch (err) {
      console.error("Error updating record:", err);
      alert("Failed to save changes.");
    }
  };

  // --- Total Aggregations ---
  const totals = useMemo(() => {
    const sums = rows.reduce((acc, row) => {
      // Use editForm values if currently editing, otherwise use row values
      const currentPlannedDt = editingRowId === row.id ? editForm.plannedDt : row.plannedDt;
      const currentUnplannedDt = editingRowId === row.id ? editForm.unplannedDt : row.unplannedDt;
      
      const actualAvail = row.totalAvailTime - currentPlannedDt;
      const actualRun = actualAvail - currentUnplannedDt;
      return {
        target: acc.target + row.targetOutput,
        actual: acc.actual + row.actualOutput,
        good: acc.good + row.goodOutput,
        totalAvail: acc.totalAvail + row.totalAvailTime,
        actualAvail: acc.actualAvail + actualAvail,
        runTime: acc.runTime + actualRun,
        plannedMp: acc.plannedMp + row.plannedMp,
        actualMp: acc.actualMp + row.actualMp,
        plannedDt: acc.plannedDt + currentPlannedDt,
        unplannedDt: acc.unplannedDt + currentUnplannedDt
      };
    }, { target: 0, actual: 0, good: 0, totalAvail: 0, actualAvail: 0, runTime: 0, plannedMp: 0, actualMp: 0, plannedDt: 0, unplannedDt: 0 });

    return {
      ...sums,
      avgPlannedMp: rows.length ? Math.round(sums.plannedMp / rows.length) : 0,
      avgActualMp: rows.length ? Math.round(sums.actualMp / rows.length) : 0
    };
  }, [rows, editingRowId, editForm]);

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
                {ALL_TEAMS.map(team => (
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
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-10 text-center text-[10px] whitespace-normal leading-tight font-bold">SL.No</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-48 text-[10px] whitespace-normal leading-tight font-bold text-center">Time Duration</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 min-w-[160px] text-[10px] whitespace-normal leading-tight font-bold text-left">Model Name</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-16 text-[10px] whitespace-normal leading-tight font-bold text-center">Planned Manpower</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-16 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Manpower</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Total Available Time (min)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-28 text-[10px] whitespace-normal leading-tight font-bold text-center text-amber-200">Planned Downtime (min) (Break + Offline Work + Change Over)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Available Time (min)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-24 text-[10px] whitespace-normal leading-tight font-bold text-center text-amber-200">Un-Planned Downtime (min)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Run Time (min) = Actual Available Time - Unplanned Downtime</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-emerald-200">Line Utilization (%) = (Actual Run Time / Actual Available Time) * 100</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-emerald-200">Line Utilization (%) = (Actual Run Time / Total Available Time) * 100</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Target Output (Qty)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Output (Qty)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-blue-200">Efficiency(%) = (Actual Output / Target Output) * 100</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Good Output(Qty)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-blue-200">Quality (FPY) = (Good Output / Actual Output) * 100</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 min-w-[250px] text-[10px] whitespace-normal leading-tight font-bold text-left">Remarks</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {rows.map((row, index) => {
                const isEditing = editingRowId === row.id;

                // Live recalculation during Edit mode
                const currentPlannedDt = isEditing ? editForm.plannedDt : row.plannedDt;
                const currentUnplannedDt = isEditing ? editForm.unplannedDt : row.unplannedDt;
                const currentActualOutput = isEditing ? editForm.actualOutput : row.actualOutput;
                const currentTargetOutput = isEditing ? editForm.targetOutput : row.targetOutput;

                const actualAvailTime = row.totalAvailTime - currentPlannedDt;
                const actualRunTime = actualAvailTime - currentUnplannedDt;
                
                const pctUtilActual = actualAvailTime > 0 ? (actualRunTime / actualAvailTime) * 100 : 0;
                const pctUtilTotal = row.totalAvailTime > 0 ? (actualRunTime / row.totalAvailTime) * 100 : 0;
                const pctEff = currentTargetOutput > 0 ? (currentActualOutput / currentTargetOutput) * 100 : 0;
                const pctQual = currentActualOutput > 0 ? (row.goodOutput / currentActualOutput) * 100 : 0;

                return (
                  <tr key={row.id} className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className={`${numCellClass} text-slate-500 font-bold`}>{index + 1}</td>
                    <td className={`${numCellClass} font-semibold`}>{row.timeDuration}</td>
                    <td className={`${preWrapCellClass} font-medium`}>{row.modelName || '-'}</td>
                    <td className={numCellClass}>{row.plannedMp}</td>
                    
                    {/* Actual MP (Editable) */}
                    <td className={numCellClass}>
                      {isEditing ? (
                        <input type="number" className="w-12 border border-blue-400 rounded text-center outline-none" value={editForm.actualMp} onChange={(e) => setEditForm({...editForm, actualMp: Number(e.target.value)})} />
                      ) : (
                        row.actualMp
                      )}
                    </td>

                    <td className={`${numCellClass} font-bold`}>{row.totalAvailTime}</td>
                    
                    {/* Planned DT (Editable) */}
                    <td className={`${numCellClass} ${isEditing ? '' : 'bg-rose-50/30'}`}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-rose-400 rounded text-center outline-none text-rose-600" value={editForm.plannedDt} onChange={(e) => setEditForm({...editForm, plannedDt: Number(e.target.value)})} />
                      ) : (
                        <span className="text-rose-600">{row.plannedDt || ''}</span>
                      )}
                    </td>

                    <td className={`${numCellClass} bg-slate-100 font-bold text-slate-700`}>{actualAvailTime}</td>
                    
                    {/* Un-Planned DT (Editable) */}
                    <td className={`${numCellClass} ${isEditing ? '' : 'bg-orange-50/30'}`}>
                      {isEditing ? (
                         <input type="number" className="w-16 border border-orange-400 rounded text-center outline-none text-orange-600" value={editForm.unplannedDt} onChange={(e) => setEditForm({...editForm, unplannedDt: Number(e.target.value)})} />
                      ) : (
                         <span className="text-orange-600">{row.unplannedDt || ''}</span>
                      )}
                    </td>

                    <td className={`${numCellClass} bg-slate-100 font-bold text-slate-700`}>{actualRunTime}</td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctUtilActual, false)}>
                      {pctUtilActual.toFixed(1)}%
                    </td>
                    <td className={numCellClass} style={getPercentageStyle(pctUtilTotal, false)}>
                      {pctUtilTotal.toFixed(1)}%
                    </td>
                    
                    {/* Target Output (Editable) */}
                    <td className={numCellClass}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-blue-400 rounded text-center outline-none" value={editForm.targetOutput} onChange={(e) => setEditForm({...editForm, targetOutput: Number(e.target.value)})} />
                      ) : (
                        row.targetOutput
                      )}
                    </td>

                    {/* Actual Output (Editable) */}
                    <td className={`${numCellClass} font-bold`}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-blue-400 rounded text-center outline-none" value={editForm.actualOutput} onChange={(e) => setEditForm({...editForm, actualOutput: Number(e.target.value)})} />
                      ) : (
                        row.actualOutput
                      )}
                    </td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctEff, false)}>
                      {pctEff.toFixed(1)}%
                    </td>
                    
                    <td className={`${numCellClass} font-bold`}>{row.goodOutput}</td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctQual, false)}>
                      {pctQual.toFixed(1)}%
                    </td>
                    
                    {/* Remarks (Editable) */}
                    <td className={`${preWrapCellClass} text-[11px]`}>
                      {isEditing ? (
                        <textarea className="w-full min-h-[40px] border border-blue-400 rounded p-1 outline-none resize-none" value={editForm.remarks} onChange={(e) => setEditForm({...editForm, remarks: e.target.value})} />
                      ) : (
                        row.remarks || '-'
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className={`${cellClass} text-center`}>
                      {isEditing ? (
                        <div className="flex justify-center gap-2">
                          <button onClick={handleSaveEdit} className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors" title="Save">
                            <Save size={16} />
                          </button>
                          <button onClick={() => setEditingRowId(null)} className="p-1 text-slate-500 hover:bg-slate-200 rounded transition-colors" title="Cancel">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-center gap-2">
                          <button onClick={() => handleEditClick(row)} className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Edit">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDeleteClick(row.id)} className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
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
                  <td className="border border-slate-700 px-2 py-3 text-center text-rose-300">{formatMinutes(totals.plannedDt)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.actualAvail)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-orange-300">{formatMinutes(totals.unplannedDt)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.runTime)}</td>
                  
                  <td className="border border-slate-700 px-2 py-3 text-center" style={getPercentageStyle(pctUtilActualTotal, true)}>
                    {pctUtilActualTotal.toFixed(1)}%
                  </td>
                  <td className="border border-slate-700 px-2 py-3 text-center" style={getPercentageStyle(pctUtilTotalAll, true)}>
                    {pctUtilTotalAll.toFixed(1)}%
                  </td>
                  
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.target}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.actual}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center" style={getPercentageStyle(pctEffTotal, true)}>
                    {pctEffTotal.toFixed(1)}%
                  </td>
                  
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.good}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center" style={getPercentageStyle(pctQualTotal, true)}>
                    {pctQualTotal.toFixed(1)}%
                  </td>
                  
                  <td className="border border-slate-700 px-2 py-3 text-white"></td>
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
