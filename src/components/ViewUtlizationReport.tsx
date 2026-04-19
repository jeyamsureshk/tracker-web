import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Activity, FileSpreadsheet, Search, RefreshCw, Edit2, Trash2, Save, X, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ExcelJS from 'exceljs';

// --- Types ---
interface ProductionRow {
  id: string;
  team: string; 
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

const decimalToTimeLabel = (decimalHour: number) => {
  const endH = Math.floor(decimalHour);
  const endM = Math.round((decimalHour % 1) * 60);
  if (endH === 9 && endM === 0) return "08:30 - 09:00";
  const startH = endH - 1;
  return `${startH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')} - ${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
};

const formatMinutes = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// --- DYNAMIC PERCENTAGE STYLING FOR UI ---
const getPercentageStyle = (val: number, isDarkBackground = false): React.CSSProperties => {
  if (val > 100 || val < 0) return { backgroundColor: '#dc2626', color: 'white', fontWeight: 'bold' }; 
  let textColor = '';
  if (val >= 90) textColor = isDarkBackground ? '#4ade80' : '#16a34a'; // Green
  else if (val >= 75) textColor = isDarkBackground ? '#facc15' : '#eab308'; // Yellow
  else if (val >= 60) textColor = isDarkBackground ? '#fb923c' : '#ea580c'; // Orange
  else textColor = isDarkBackground ? '#ef4444' : '#dc2626'; // Red
  return { color: textColor, fontWeight: 'bold' };
};

export default function ViewUtilizationReport() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState(ALL_TEAMS[0]); 
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ 
    actualMp: 0, plannedDt: 0, unplannedDt: 0, targetOutput: 0, actualOutput: 0, remarks: '' 
  });

  const fetchReportData = async () => {
    if (!selectedDate) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('date', selectedDate)
      .order('hour', { ascending: true });

    if (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
      return;
    }

    const transformedRows: ProductionRow[] = (data || []).map((record) => {
      const defects = parseDefectsFromRemarks(record.remarks) + (record.defect_qty || 0);
      const is9AMSlot = Math.floor(record.hour) === 9 && Math.round((record.hour % 1) * 60) === 0;

      return {
        id: record.id,
        team: record.team,
        timeDuration: decimalToTimeLabel(record.hour),
        modelName: (record.item || []).map((i: any) => i.model).join('\n'), 
        plannedMp: TEAM_PLANNED_MP[record.team] || record.manpower || 0,
        actualMp: record.manpower || 0,
        totalAvailTime: is9AMSlot ? 30 : 60,
        plannedDt: record.plan_dt || 0,
        unplannedDt: record.unplan_dt || 0,
        targetOutput: record.target_units || 0,
        actualOutput: record.units_produced || 0,
        goodOutput: (record.units_produced || 0) - defects,
        remarks: record.remarks || ''
      };
    });

    setRows(transformedRows);
    setLoading(false);
  };

  useEffect(() => {
    fetchReportData();
    setEditingRowId(null);
  }, [selectedDate]);

  const handleEditClick = (row: ProductionRow) => {
    const pwd = window.prompt("Enter password to edit:");
    if (pwd === '787374') {
      setEditingRowId(row.id);
      setEditForm({
        actualMp: row.actualMp, plannedDt: row.plannedDt, unplannedDt: row.unplannedDt,
        targetOutput: row.targetOutput, actualOutput: row.actualOutput, remarks: row.remarks
      });
    } else if (pwd !== null) alert("Incorrect password!");
  };

  const handleDeleteClick = async (id: string) => {
    const pwd = window.prompt("Enter password to delete:");
    if (pwd === '787374') {
      if (window.confirm("Are you sure you want to delete this record? This cannot be undone.")) {
        const { error } = await supabase.from('production_records').delete().eq('id', id);
        if (!error) fetchReportData();
        else alert("Error deleting record.");
      }
    } else if (pwd !== null) alert("Incorrect password!");
  };

  const handleSaveEdit = async () => {
    try {
      const { error } = await supabase
        .from('production_records')
        .update({
          manpower: editForm.actualMp, target_units: editForm.targetOutput,
          units_produced: editForm.actualOutput, plan_dt: editForm.plannedDt,
          unplan_dt: editForm.unplannedDt, remarks: editForm.remarks 
        }).eq('id', editingRowId);

      if (error) throw error;
      setEditingRowId(null);
      fetchReportData();
    } catch (err) {
      console.error("Error updating record:", err);
      alert("Failed to save changes.");
    }
  };

  // Filter rows to display based on active tab
  const displayedRows = rows.filter(row => row.team === activeTab);

  const totals = useMemo(() => {
    const sums = displayedRows.reduce((acc, row) => {
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
      avgPlannedMp: displayedRows.length ? Math.round(sums.plannedMp / displayedRows.length) : 0,
      avgActualMp: displayedRows.length ? Math.round(sums.actualMp / displayedRows.length) : 0
    };
  }, [displayedRows, editingRowId, editForm]);

  const pctUtilActualTotal = totals.actualAvail ? (totals.runTime / totals.actualAvail) * 100 : 0;
  const pctUtilTotalAll = totals.totalAvail ? (totals.runTime / totals.totalAvail) * 100 : 0;
  const pctEffTotal = totals.target ? (totals.actual / totals.target) * 100 : 0;
  const pctQualTotal = totals.actual ? (totals.good / totals.actual) * 100 : 0;

  // --- REAL-TIME EXCEL EXPORT WITH EXCELJS (MULTI-SHEET) ---
  const handleExportToExcel = async () => {
    if (rows.length === 0) {
      alert("No data to export.");
      return;
    }

    const workbook = new ExcelJS.Workbook();

    const headers = [
      'SL.No', 'Time Duration', 'Model Name', 'Planned Manpower', 'Actual Manpower',
      'Total Available Time (min)', 'Planned Downtime (min)\n(Break + Offline + Change Over)', 
      'Actual Available Time (min)', 'Un-Planned Downtime (min)', 'Actual Run Time (min)', 
      'Line Utilization (Actual) %', 'Line Utilization (Total) %', 'Target Output (Qty)', 
      'Actual Output (Qty)', 'Efficiency %', 'Good Output (Qty)', 'Quality (FPY) %', 'Remarks'
    ];

    let sheetsAdded = 0;

    ALL_TEAMS.forEach((team) => {
      const teamRows = rows.filter(r => r.team === team);

      if (teamRows.length === 0) return; 
      sheetsAdded++;

      const safeSheetName = team.substring(0, 31).replace(/[/*?:\[\]\\]/g, '');
      const sheet = workbook.addWorksheet(safeSheetName);

      sheet.addRow(headers);
      const headerRow = sheet.getRow(1);
      headerRow.height = 45; 
      
      for (let i = 1; i <= headers.length; i++) {
        const cell = headerRow.getCell(i);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }

      teamRows.forEach((row, index) => {
        const rowIndex = index + 2; 
        const defects = row.actualOutput - row.goodOutput;

        sheet.addRow([
          index + 1,
          row.timeDuration,
          row.modelName || '-',
          row.plannedMp,
          row.actualMp,
          row.totalAvailTime,
          row.plannedDt,
          { formula: `F${rowIndex}-G${rowIndex}` }, 
          row.unplannedDt,
          { formula: `H${rowIndex}-I${rowIndex}` }, 
          { formula: `IF(H${rowIndex}>0, J${rowIndex}/H${rowIndex}, 0)` }, 
          { formula: `IF(F${rowIndex}>0, J${rowIndex}/F${rowIndex}, 0)` }, 
          row.targetOutput,
          row.actualOutput,
          { formula: `IF(M${rowIndex}>0, N${rowIndex}/M${rowIndex}, 0)` }, 
          { formula: `N${rowIndex}-${defects}` }, 
          { formula: `IF(N${rowIndex}>0, P${rowIndex}/N${rowIndex}, 0)` }, 
          row.remarks || '-'
        ]);
      });

      const lastRow = teamRows.length + 2;
      sheet.addRow([
        '', '', 'AVERAGES / TOTALS:',
        { formula: `ROUND(AVERAGE(D2:D${lastRow-1}), 0)` }, 
        { formula: `ROUND(AVERAGE(E2:E${lastRow-1}), 0)` }, 
        { formula: `SUM(F2:F${lastRow-1})/1440` }, 
        { formula: `SUM(G2:G${lastRow-1})/1440` }, 
        { formula: `SUM(H2:H${lastRow-1})/1440` }, 
        { formula: `SUM(I2:I${lastRow-1})/1440` }, 
        { formula: `SUM(J2:J${lastRow-1})/1440` }, 
        { formula: `IF(H${lastRow}>0, J${lastRow}/H${lastRow}, 0)` }, 
        { formula: `IF(F${lastRow}>0, J${lastRow}/F${lastRow}, 0)` }, 
        { formula: `SUM(M2:M${lastRow-1})` },
        { formula: `SUM(N2:N${lastRow-1})` },
        { formula: `IF(M${lastRow}>0, N${lastRow}/M${lastRow}, 0)` }, 
        { formula: `SUM(P2:P${lastRow-1})` },
        { formula: `IF(N${lastRow}>0, P${lastRow}/N${lastRow}, 0)` }, 
        ''
      ]);

      const footerRow = sheet.getRow(lastRow);
      for (let i = 1; i <= headers.length; i++) {
        const cell = footerRow.getCell(i);
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
      }

      sheet.columns.forEach((column) => { 
        column.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        column.width = 18; 
      });

      sheet.getColumn('C').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      sheet.getColumn('R').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      
      sheet.getColumn('A').width = 6;  
      sheet.getColumn('C').width = 30; 
      sheet.getColumn('R').width = 40; 
      sheet.getColumn('B').width = 22; 

      ['K', 'L', 'O', 'Q'].forEach(col => {
        sheet.getColumn(col).numFmt = '0.0%';
      });

      ['F', 'G', 'H', 'I', 'J'].forEach(col => {
        sheet.getCell(`${col}${lastRow}`).numFmt = '[h]"h "m"m"'; 
      });

      const pctCols = ['K', 'L', 'O', 'Q'];
      pctCols.forEach(col => {
        sheet.addConditionalFormatting({
          ref: `${col}2:${col}${lastRow}`,
          rules: [
            { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [0.90], style: { font: { color: { argb: 'FF16A34A' }, bold: true } } },
            { type: 'cellIs', operator: 'between', formulae: [0.75, 0.8999], style: { font: { color: { argb: 'FFEAB308' }, bold: true } } },
            { type: 'cellIs', operator: 'between', formulae: [0.60, 0.7499], style: { font: { color: { argb: 'FFEA580C' }, bold: true } } },
            { type: 'cellIs', operator: 'lessThan', formulae: [0.60], style: { font: { color: { argb: 'FFDC2626' }, bold: true } } }
          ]
        });
      });
    });

    if (sheetsAdded === 0) {
      alert("No data available to export for the selected criteria.");
      return;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    
    anchor.download = `Utilization_All_Teams_${selectedDate}.xlsx`;
    
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const cellClass = "border border-slate-300 px-2 py-2 h-10 text-slate-700 leading-tight";
  const numCellClass = `${cellClass} text-center font-mono`;
  const preWrapCellClass = `${cellClass} whitespace-pre-wrap`;

  return (
    <div className="max-w-[100vw] mx-auto p-4 md:p-6 bg-slate-50 min-h-screen font-sans">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        
        {/* Header and Controls */}
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
            <div className="flex items-center bg-blue-800 border border-blue-600 rounded-lg px-3 py-2 shadow-inner">
              <Calendar size={16} className="text-blue-300 mr-2" />
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm text-white outline-none cursor-pointer [color-scheme:dark]"
              />
            </div>

           {/* <button 
              onClick={fetchReportData}
              className="flex items-center justify-center bg-white text-blue-700 px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-blue-50 transition-colors"
            >
              <Search size={16} className="mr-2" /> Load Data
            </button> */}

            {/* EXPORT EXCEL BUTTON */}
            <button 
              onClick={handleExportToExcel}
              disabled={rows.length === 0}
              className={`flex items-center justify-center px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors ${
                rows.length === 0 
                  ? 'bg-blue-900/50 text-blue-300 cursor-not-allowed border border-blue-800' 
                  : 'bg-emerald-500 text-white hover:bg-emerald-600 border border-emerald-400'
              }`}
            >
              <Download size={16} className="mr-2" /> Export Excel
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 pt-3 pb-0 hide-scrollbar">
          {ALL_TEAMS.map(team => (
            <button
              key={team}
              onClick={() => setActiveTab(team)}
              className={`px-5 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-all outline-none ${
                activeTab === team
                  ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-[0_-2px_6px_-2px_rgba(0,0,0,0.1)]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-t-xl'
              }`}
            >
              {team}
            </button>
          ))}
        </div>

        {/* TABLE CONTAINER */}
        <div className="overflow-x-auto relative min-h-[400px]">
          {loading ? (
            <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center text-blue-600">
              <RefreshCw size={32} className="animate-spin mb-4" />
              <p className="font-bold">Fetching Records...</p>
            </div>
          ) : displayedRows.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-white">
              <Activity size={48} className="mb-4 opacity-20" />
              <p className="font-semibold">No production records found for {activeTab} on this date.</p>
            </div>
          ) : null}

          <table className="w-full text-xs border-collapse whitespace-nowrap min-w-[1600px] bg-white">
            <thead className="bg-[#1E40AF] text-white sticky top-0 z-20 shadow-md">
              <tr>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-10 text-center text-[10px] whitespace-normal leading-tight font-bold">SL.No</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-48 text-[10px] whitespace-normal leading-tight font-bold text-center">Time Duration</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 min-w-[160px] text-[10px] whitespace-normal leading-tight font-bold text-left">Model Name</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-16 text-[10px] whitespace-normal leading-tight font-bold text-center">Planned Manpower</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-16 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Manpower</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Total Available Time (min)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-28 text-[10px] whitespace-normal leading-tight font-bold text-center text-amber-200">Planned Downtime (min)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Available Time (min)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-24 text-[10px] whitespace-normal leading-tight font-bold text-center text-amber-200">Un-Planned Downtime (min)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Run Time (min)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-emerald-200">Line Utilization (Actual) %</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-emerald-200">Line Utilization (Total) %</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Target Output (Qty)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Output (Qty)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-blue-200">Efficiency(%)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Good Output(Qty)</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-blue-200">Quality (FPY) %</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 min-w-[250px] text-[10px] whitespace-normal leading-tight font-bold text-left">Remarks</th>
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {displayedRows.map((row, index) => {
                const isEditing = editingRowId === row.id;

                const currentPlannedDt = isEditing ? editForm.plannedDt : row.plannedDt;
                const currentUnplannedDt = isEditing ? editForm.unplannedDt : row.unplannedDt;
                const currentActualOutput = isEditing ? editForm.actualOutput : row.actualOutput;
                const currentTargetOutput = isEditing ? editForm.targetOutput : row.targetOutput;

                const originalDefects = row.actualOutput - row.goodOutput; 
                const currentGoodOutput = isEditing ? Math.max(0, currentActualOutput - originalDefects) : row.goodOutput;

                const actualAvailTime = row.totalAvailTime - currentPlannedDt;
                const actualRunTime = actualAvailTime - currentUnplannedDt;
                
                const pctUtilActual = actualAvailTime > 0 ? (actualRunTime / actualAvailTime) * 100 : 0;
                const pctUtilTotal = row.totalAvailTime > 0 ? (actualRunTime / row.totalAvailTime) * 100 : 0;
                const pctEff = currentTargetOutput > 0 ? (currentActualOutput / currentTargetOutput) * 100 : 0;
                const pctQual = currentActualOutput > 0 ? (currentGoodOutput / currentActualOutput) * 100 : 0;

                return (
                  <tr key={row.id} className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className={`${numCellClass} text-slate-500 font-bold`}>{index + 1}</td>
                    <td className={`${numCellClass} font-semibold`}>{row.timeDuration}</td>
                    <td className={`${preWrapCellClass} font-medium`}>
                      {row.modelName || '-'}
                    </td>
                    <td className={numCellClass}>{row.plannedMp}</td>
                    
                    <td className={numCellClass}>
                      {isEditing ? (
                        <input type="number" className="w-12 border border-blue-400 rounded text-center outline-none" value={editForm.actualMp} onChange={(e) => setEditForm({...editForm, actualMp: Number(e.target.value)})} />
                      ) : row.actualMp}
                    </td>

                    <td className={`${numCellClass} font-bold`}>{row.totalAvailTime}</td>
                    
                    <td className={`${numCellClass} ${isEditing ? '' : 'bg-rose-50/30'}`}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-rose-400 rounded text-center outline-none text-rose-600" value={editForm.plannedDt} onChange={(e) => setEditForm({...editForm, plannedDt: Number(e.target.value)})} />
                      ) : <span className="text-rose-600">{row.plannedDt || ''}</span>}
                    </td>

                    <td className={`${numCellClass} bg-slate-100 font-bold text-slate-700`}>{actualAvailTime}</td>
                    
                    <td className={`${numCellClass} ${isEditing ? '' : 'bg-orange-50/30'}`}>
                      {isEditing ? (
                         <input type="number" className="w-16 border border-orange-400 rounded text-center outline-none text-orange-600" value={editForm.unplannedDt} onChange={(e) => setEditForm({...editForm, unplannedDt: Number(e.target.value)})} />
                      ) : <span className="text-orange-600">{row.unplannedDt || ''}</span>}
                    </td>

                    <td className={`${numCellClass} bg-slate-100 font-bold text-slate-700`}>{actualRunTime}</td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctUtilActual, false)}>{pctUtilActual.toFixed(1)}%</td>
                    <td className={numCellClass} style={getPercentageStyle(pctUtilTotal, false)}>{pctUtilTotal.toFixed(1)}%</td>
                    
                    <td className={numCellClass}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-blue-400 rounded text-center outline-none" value={editForm.targetOutput} onChange={(e) => setEditForm({...editForm, targetOutput: Number(e.target.value)})} />
                      ) : row.targetOutput}
                    </td>

                    <td className={`${numCellClass} font-bold`}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-blue-400 rounded text-center outline-none" value={editForm.actualOutput} onChange={(e) => setEditForm({...editForm, actualOutput: Number(e.target.value)})} />
                      ) : row.actualOutput}
                    </td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctEff, false)}>{pctEff.toFixed(1)}%</td>
                    
                    <td className={`${numCellClass} font-bold`}>{currentGoodOutput}</td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctQual, false)}>{pctQual.toFixed(1)}%</td>
                    
                    <td className={`${preWrapCellClass} text-[11px]`}>
                      {isEditing ? (
                        <textarea className="w-full min-h-[40px] border border-blue-400 rounded p-1 outline-none resize-none" value={editForm.remarks} onChange={(e) => setEditForm({...editForm, remarks: e.target.value})} />
                      ) : row.remarks || '-'}
                    </td>

                    <td className={`${cellClass} text-center`}>
                      {isEditing ? (
                        <div className="flex justify-center gap-2">
                          <button onClick={handleSaveEdit} className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors" title="Save"><Save size={16} /></button>
                          <button onClick={() => setEditingRowId(null)} className="p-1 text-slate-500 hover:bg-slate-200 rounded transition-colors" title="Cancel"><X size={16} /></button>
                        </div>
                      ) : (
                        <div className="flex justify-center gap-2">
                          <button onClick={() => handleEditClick(row)} className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Edit"><Edit2 size={16} /></button>
                          <button onClick={() => handleDeleteClick(row.id)} className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {displayedRows.length > 0 && (
                <tr className="bg-slate-800 text-white font-bold sticky bottom-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                  <td colSpan={3} className="border border-slate-700 px-4 py-3 text-right text-slate-300 uppercase">
                    {activeTab} TOTALS:
                  </td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.avgPlannedMp}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.avgActualMp}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.totalAvail)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-rose-300">{formatMinutes(totals.plannedDt)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.actualAvail)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-orange-300">{formatMinutes(totals.unplannedDt)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{formatMinutes(totals.runTime)}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center" style={getPercentageStyle(pctUtilActualTotal, true)}>{pctUtilActualTotal.toFixed(1)}%</td>
                  <td className="border border-slate-700 px-2 py-3 text-center" style={getPercentageStyle(pctUtilTotalAll, true)}>{pctUtilTotalAll.toFixed(1)}%</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.target}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.actual}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center" style={getPercentageStyle(pctEffTotal, true)}>{pctEffTotal.toFixed(1)}%</td>
                  <td className="border border-slate-700 px-2 py-3 text-center text-white">{totals.good}</td>
                  <td className="border border-slate-700 px-2 py-3 text-center" style={getPercentageStyle(pctQualTotal, true)}>{pctQualTotal.toFixed(1)}%</td>
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
