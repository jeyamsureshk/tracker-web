import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Activity, FileSpreadsheet, Search, RefreshCw, 
  Edit2, Trash2, Save, X, Download, Copy, Plus, User, Hash, Clipboard 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import ExcelJS from 'exceljs';

// --- Types ---
interface ProductionRow {
  id: string;
  team: string; 
  timeDuration: string;
  modelName: string;
  items: any[]; 
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

interface NewProductionRow {
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

const getPercentageStyle = (val: number, isDarkBackground = false): React.CSSProperties => {
  if (val > 100 || val < 0) return { backgroundColor: '#dc2626', color: 'white', fontWeight: 'bold' }; 
  let textColor = '';
  if (val >= 90) textColor = isDarkBackground ? '#4ade80' : '#16a34a'; 
  else if (val >= 75) textColor = isDarkBackground ? '#facc15' : '#eab308'; 
  else if (val >= 60) textColor = isDarkBackground ? '#fb923c' : '#ea580c'; 
  else textColor = isDarkBackground ? '#ef4444' : '#dc2626'; 
  return { color: textColor, fontWeight: 'bold' };
};

// ============================================================================
// ADD PRODUCTION SECTION COMPONENT
// ============================================================================
function AddProductionSection({ initialDate, onClose, onSuccess }: { initialDate: string, onClose: () => void, onSuccess: () => void }) {
  const [date, setDate] = useState(initialDate);
  const [operatorId, setOperatorId] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [team, setTeam] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [rows, setRows] = useState<NewProductionRow[]>([
    { 
      timeDuration: '08:30 - 09:00', modelName: '', 
      plannedMp: 1, actualMp: 1, totalAvailTime: 30, 
      plannedDt: 0, unplannedDt: 0, 
      targetOutput: 0, actualOutput: 0, goodOutput: 0, remarks: '' 
    }
  ]);

  useEffect(() => {
    const fetchOperator = async () => {
      if (operatorId.length >= 3) {
        const { data } = await supabase
          .from('operators')
          .select('name, team')
          .eq('id', operatorId)
          .single();

        if (data) {
          setOperatorName(data.name);
          setTeam(data.team);
        } else {
          setOperatorName('Not found');
          setTeam('');
        }
      }
    };
    fetchOperator();
  }, [operatorId]);

  const addRow = () => {
    const lastRow = rows[rows.length - 1];
    let nextDuration = '09:00 - 10:00'; 

    if (lastRow && lastRow.timeDuration.includes('-')) {
      const parts = lastRow.timeDuration.split('-').map(t => t.trim());
      const lastEndTime = parts[1];

      if (lastEndTime) {
        const [hours, minutes] = lastEndTime.split(':').map(Number);
        const newStart = lastEndTime;
        const newEndHours = (hours + 1).toString().padStart(2, '0');
        const newEnd = `${newEndHours}:${minutes.toString().padStart(2, '0')}`;
        nextDuration = `${newStart} - ${newEnd}`;
      }
    }

    let defaultPlannedDt = 0;
    let defaultRemarks = '';

    if (nextDuration.includes('10:00 - 11:00')) {
      defaultPlannedDt = 15;
      defaultRemarks = 'Break 15 Minutes';
    } else if (nextDuration.includes('12:00 - 13:00')) {
      defaultPlannedDt = 25;
      defaultRemarks = 'Break 25 Minutes';
    } else if (nextDuration.includes('15:00 - 16:00')) {
      defaultPlannedDt = 15;
      defaultRemarks = 'Break 15 Minutes';
    } else if (nextDuration.includes('18:00 - 19:00')) {
      defaultPlannedDt = 10;
      defaultRemarks = 'Break 10 Minutes';
    } else if (nextDuration.includes('20:00 - 21:00')) {
      defaultPlannedDt = 25;
      defaultRemarks = 'Break 25 Minutes';
    }

    setRows([...rows, { 
      timeDuration: nextDuration, modelName: '', 
      plannedMp: 1, actualMp: 1, totalAvailTime: 60, 
      plannedDt: defaultPlannedDt, unplannedDt: 0, 
      targetOutput: 0, actualOutput: 0, goodOutput: 0, remarks: defaultRemarks 
    }]);
  };

  const removeRow = (index: number) => setRows(rows.filter((_, i) => i !== index));

  const updateRow = (index: number, field: keyof NewProductionRow, value: any) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    if (field === 'actualOutput' && newRows[index].goodOutput === 0) {
       newRows[index].goodOutput = value;
    }
    setRows(newRows);
  };

  const parseExcelClipboard = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (inQuote) {
        if (char === '"' && nextChar === '"') { currentCell += '"'; i++; } 
        else if (char === '"') { inQuote = false; } 
        else { currentCell += char; }
      } else {
        if (char === '"') { inQuote = true; } 
        else if (char === '\t') { currentRow.push(currentCell); currentCell = ""; } 
        else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
          currentRow.push(currentCell); rows.push(currentRow);
          currentRow = []; currentCell = "";
          if (char === '\r') i++; 
        } 
        else if (char === '\r') {
           currentRow.push(currentCell); rows.push(currentRow);
           currentRow = []; currentCell = "";
        } 
        else { currentCell += char; }
      }
    }
    if (currentCell || currentRow.length > 0) { currentRow.push(currentCell); rows.push(currentRow); }
    return rows;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, colKey: keyof NewProductionRow) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const parsedRows = parseExcelClipboard(pasteData);
    if (parsedRows.length === 0) return;

    const excelColumnMap: (keyof NewProductionRow | 'SKIP')[] = [
      'timeDuration', 'modelName', 'plannedMp', 'actualMp', 'totalAvailTime', 'plannedDt',
      'SKIP', 'unplannedDt', 'SKIP', 'SKIP', 'SKIP', 'targetOutput', 'actualOutput',
      'SKIP', 'goodOutput', 'SKIP', 'remarks'
    ];

    const startColIndex = excelColumnMap.indexOf(colKey);
    if (startColIndex === -1) return;
    const newRows = [...rows];
    
    parsedRows.forEach((cellValues, i) => {
      if (cellValues.length === 1 && cellValues[0].trim() === '') return;
      const currentRowIndex = rowIndex + i;
      if (!newRows[currentRowIndex]) {
        newRows[currentRowIndex] = { 
          timeDuration: '', modelName: '', plannedMp: 1, actualMp: 1, 
          totalAvailTime: 60, plannedDt: 0, unplannedDt: 0, 
          targetOutput: 0, actualOutput: 0, goodOutput: 0, remarks: '' 
        };
      }
      cellValues.forEach((cellValue, j) => {
        const currentField = excelColumnMap[startColIndex + j];
        if (currentField && currentField !== 'SKIP') {
          let cleanValue: string | number = cellValue.trim();
          if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
             cleanValue = cleanValue.substring(1, cleanValue.length - 1).replace(/""/g, '"');
          }
          if (['plannedMp', 'actualMp', 'totalAvailTime', 'plannedDt', 'unplannedDt', 'targetOutput', 'actualOutput', 'goodOutput'].includes(currentField)) {
            cleanValue = cleanValue === '' ? 0 : Number(String(cleanValue).replace(/,/g, '')) || 0;
          }
          newRows[currentRowIndex] = { ...newRows[currentRowIndex], [currentField]: cleanValue };
        }
      });
    });
    setRows(newRows);
  };

  const handleSave = async () => {
    if (!operatorId || !team) return alert("Please enter a valid Employee ID");
    setIsSaving(true);

    const recordsToSave = rows
      .filter(row => row.modelName || row.actualOutput > 0) 
      .map(row => {
        let decimalHour = 0;
        const timeMatches = row.timeDuration.match(/(\d{1,2}):(\d{2})/g); 
        
        if (timeMatches && timeMatches.length >= 2) {
           const endParts = timeMatches[1].split(':');
           decimalHour = parseInt(endParts[0], 10) + (parseInt(endParts[1], 10) / 60);
        } else if (timeMatches && timeMatches.length === 1) {
           const matchParts = timeMatches[0].split(':');
           decimalHour = parseInt(matchParts[0], 10) + (parseInt(matchParts[1], 10) / 60);
        }

        return {
          date,
          operator_id: parseInt(operatorId),
          operator_name: operatorName, 
          team: team, 
          hour: decimalHour, 
          manpower: row.actualMp,
          target_units: row.targetOutput,
          units_produced: row.actualOutput,
          plan_dt: row.plannedDt,
          unplan_dt: row.unplannedDt,
          defect_qty: row.actualOutput - row.goodOutput,
          remarks: row.remarks,
          item: [{ model: row.modelName, quantity: row.actualOutput }]
        };
      });

    if (recordsToSave.length === 0) {
      setIsSaving(false);
      return alert("No data to save.");
    }

    const { error } = await supabase.from('production_records').insert(recordsToSave);

    if (error) {
      alert("Error saving: " + error.message);
    } else {
      alert("Records saved successfully!");
      onSuccess();
    }
    setIsSaving(false);
  };

  const inputClass = "w-full h-full px-2 py-2 bg-transparent outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-all text-xs";
  const numInputClass = `${inputClass} text-center font-mono`;
  const cellClass = "border border-slate-300 p-0 text-center align-middle font-bold text-slate-700 h-10";

  return (
    <div className="bg-white rounded-xl shadow-lg border border-blue-200 overflow-hidden mb-6 animate-in fade-in slide-in-from-top-4">
      <div className="flex justify-between items-center bg-slate-800 p-4 border-b border-slate-700">
        <h3 className="text-white font-bold flex items-center gap-2"><Plus size={18}/> Bulk Add Production Records</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6 bg-slate-800 text-white border-b border-slate-700">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Date</label>
          <div className="flex items-center bg-slate-700 border border-slate-600 rounded-md px-3 py-2">
            <Calendar size={16} className="text-slate-400 mr-2"/>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-transparent w-full outline-none text-sm text-white [color-scheme:dark]" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Employee ID</label>
          <div className="flex items-center bg-slate-700 border border-slate-600 rounded-md px-3 py-2 focus-within:ring-2 ring-blue-500 transition-all">
            <Hash size={16} className="text-slate-400 mr-2"/>
            <input type="text" placeholder="Enter ID..." value={operatorId} onChange={e => setOperatorId(e.target.value)} className="bg-transparent w-full outline-none font-mono text-sm text-white" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Operator Name</label>
          <div className="flex items-center bg-slate-700/50 border border-slate-600 rounded-md px-3 py-2">
            <User size={16} className="text-slate-400 mr-2"/>
            <input type="text" value={operatorName} readOnly className="bg-transparent w-full outline-none text-slate-300 text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Team Name</label>
          <div className="flex items-center bg-slate-700/50 border border-slate-600 rounded-md px-3 py-2">
            <Activity size={16} className="text-slate-400 mr-2"/>
            <input type="text" value={team} readOnly className="bg-transparent w-full outline-none text-slate-300 text-sm" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse whitespace-nowrap min-w-[1600px]">
          <thead className="bg-[#1E40AF] text-white">
            <tr>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-10 text-center text-[10px] whitespace-normal leading-tight font-bold">SL.No</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 min-w-[120px] text-[10px] whitespace-normal leading-tight font-bold text-center">Time Duration</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 min-w-[150px] text-[10px] whitespace-normal leading-tight font-bold text-left">Model Name</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-16 text-[10px] whitespace-normal leading-tight font-bold text-center">Planned Manpower</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-16 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Manpower</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Total Available Time (min)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-28 text-[10px] whitespace-normal leading-tight font-bold text-center text-amber-200">Planned Downtime (min)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Available Time (min)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-24 text-[10px] whitespace-normal leading-tight font-bold text-center text-amber-200">Un-Planned Downtime (min)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Run Time (min)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-emerald-200">Line Utilization (%)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-emerald-200">Total Utilization (%)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Target Output (Qty)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Actual Output (Qty)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-blue-200">Efficiency (%)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-20 text-[10px] whitespace-normal leading-tight font-bold text-center">Good Output (Qty)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 w-32 text-[10px] whitespace-normal leading-tight font-bold text-center text-blue-200">Quality (FPY) (%)</th>
              <th className="border-[0.5px] border-white/30 px-2 py-3 min-w-[230px] text-[10px] whitespace-normal leading-tight font-bold text-left">Remarks</th>
              <th className="border-[0.5px] border-white/30 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {rows.map((row, index) => {
              const actualAvailTime = row.totalAvailTime - row.plannedDt;
              const actualRunTime = actualAvailTime - row.unplannedDt;
              const pctUtilActual = actualAvailTime > 0 ? (actualRunTime / actualAvailTime) * 100 : 0;
              const pctUtilTotal = row.totalAvailTime > 0 ? (actualRunTime / row.totalAvailTime) * 100 : 0;
              const pctEff = row.targetOutput > 0 ? (row.actualOutput / row.targetOutput) * 100 : 0;
              const pctQual = row.actualOutput > 0 ? (row.goodOutput / row.actualOutput) * 100 : 0;

              return (
                <tr key={index} className={`group hover:bg-slate-50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="border border-slate-300 text-center font-semibold text-slate-500">{index + 1}</td>
                  <td className="border border-slate-300 p-0 h-10">
                    <input type="text" value={row.timeDuration} onChange={e => updateRow(index, 'timeDuration', e.target.value)} onPaste={(e) => handlePaste(e, index, 'timeDuration')} className={`${inputClass} font-mono text-center`} />
                  </td>
                  <td className="border border-slate-300 p-0 h-auto">
                    <textarea value={row.modelName} onChange={e => updateRow(index, 'modelName', e.target.value)} onPaste={(e) => handlePaste(e, index, 'modelName')} className={`${inputClass} resize-none overflow-hidden leading-tight pt-2.5 min-h-[40px]`} rows={1} style={{ height: '100%', whiteSpace: 'pre-wrap' }} placeholder="Model Name" />
                  </td>
                  <td className="border border-slate-300 p-0 h-10">
                    <input type="number" value={row.plannedMp} onChange={e => updateRow(index, 'plannedMp', parseInt(e.target.value))} onPaste={(e) => handlePaste(e, index, 'plannedMp')} className={numInputClass} />
                  </td>
                  <td className="border border-slate-300 p-0 h-10">
                    <input type="number" value={row.actualMp} onChange={e => updateRow(index, 'actualMp', parseInt(e.target.value))} onPaste={(e) => handlePaste(e, index, 'actualMp')} className={numInputClass} />
                  </td>
                  <td className="border border-slate-300 p-0 h-10">
                    <input type="number" value={row.totalAvailTime} onChange={e => updateRow(index, 'totalAvailTime', parseInt(e.target.value))} onPaste={(e) => handlePaste(e, index, 'totalAvailTime')} className={`${numInputClass} font-bold`} />
                  </td>
                  <td className="border border-slate-300 p-0 h-10 bg-rose-50/30">
                    <input type="number" value={row.plannedDt} onChange={e => updateRow(index, 'plannedDt', parseInt(e.target.value))} onPaste={(e) => handlePaste(e, index, 'plannedDt')} className={`${numInputClass} text-rose-600`} />
                  </td>
                  <td className={`${cellClass} bg-slate-100`}>{actualAvailTime}</td>
                  <td className="border border-slate-300 p-0 h-10 bg-orange-50/30">
                    <input type="number" value={row.unplannedDt} onChange={e => updateRow(index, 'unplannedDt', parseInt(e.target.value))} onPaste={(e) => handlePaste(e, index, 'unplannedDt')} className={`${numInputClass} text-orange-600`} />
                  </td>
                  <td className={`${cellClass} bg-slate-100`}>{actualRunTime}</td>
                  <td className={cellClass} style={getPercentageStyle(pctUtilActual)}>{pctUtilActual.toFixed(1)}%</td>
                  <td className={cellClass} style={getPercentageStyle(pctUtilTotal)}>{pctUtilTotal.toFixed(1)}%</td>
                  <td className="border border-slate-300 p-0 h-10">
                    <input type="number" value={row.targetOutput} onChange={e => updateRow(index, 'targetOutput', parseInt(e.target.value))} onPaste={(e) => handlePaste(e, index, 'targetOutput')} className={numInputClass} />
                  </td>
                  <td className="border border-slate-300 p-0 h-10">
                    <input type="number" value={row.actualOutput} onChange={e => updateRow(index, 'actualOutput', parseInt(e.target.value))} onPaste={(e) => handlePaste(e, index, 'actualOutput')} className={`${numInputClass} font-bold`} />
                  </td>
                  <td className={cellClass} style={getPercentageStyle(pctEff)}>{pctEff.toFixed(1)}%</td>
                  <td className="border border-slate-300 p-0 h-10">
                    <input type="number" value={row.goodOutput} onChange={e => updateRow(index, 'goodOutput', parseInt(e.target.value))} onPaste={(e) => handlePaste(e, index, 'goodOutput')} className={`${numInputClass} font-bold`} />
                  </td>
                  <td className={cellClass} style={getPercentageStyle(pctQual)}>{pctQual.toFixed(1)}%</td>
                  <td className="border border-slate-300 p-0 h-auto">
                    <textarea value={row.remarks} onChange={e => updateRow(index, 'remarks', e.target.value)} onPaste={(e) => handlePaste(e, index, 'remarks')} className={`${inputClass} resize-y overflow-auto leading-tight pt-2 min-h-[56px]`} rows={2} style={{ height: '100%', whiteSpace: 'pre-wrap' }} placeholder="Remarks..." />
                  </td>
                  <td className="border border-slate-300 p-0 text-center h-10 bg-white">
                    <button onClick={() => removeRow(index)} className="w-full h-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" tabIndex={-1}>
                      <Trash2 size={16}/>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center">
        <div className="text-xs text-slate-500 italic flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
           <Clipboard size={14} className="text-blue-500" /> Click on "Time Duration" and paste from Excel.
        </div>
        <div className="flex gap-4">
          <button onClick={addRow} className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors shadow-sm text-sm font-bold">
            <Plus size={16} /> Add Row
          </button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 text-sm font-bold">
            {isSaving ? "Saving..." : <><Save size={16} /> Save Data</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN VIEW UTILIZATION COMPONENT
// ============================================================================
export default function ViewUtilizationReport() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState(ALL_TEAMS[0]); 
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Toggle for Add Production Section
  const [showAddRecord, setShowAddRecord] = useState(false);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ 
    actualMp: 0, plannedDt: 0, unplannedDt: 0, targetOutput: 0, actualOutput: 0, goodOutput: 0, remarks: '', items: [] as any[]
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
        items: record.item || [],
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
      
      const initialItems = row.items && row.items.length > 0 
        ? JSON.parse(JSON.stringify(row.items)) 
        : [{ model: '', quantity: 0 }];

      setEditForm({
        actualMp: row.actualMp, plannedDt: row.plannedDt, unplannedDt: row.unplannedDt,
        targetOutput: row.targetOutput, actualOutput: row.actualOutput, goodOutput: row.goodOutput, remarks: row.remarks,
        items: initialItems
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
          manpower: editForm.actualMp, 
          target_units: editForm.targetOutput,
          units_produced: editForm.actualOutput, 
          defect_qty: editForm.actualOutput - editForm.goodOutput,
          plan_dt: editForm.plannedDt,
          unplan_dt: editForm.unplannedDt, 
          remarks: editForm.remarks,
          item: editForm.items
        }).eq('id', editingRowId);

      if (error) throw error;
      setEditingRowId(null);
      fetchReportData();
    } catch (err) {
      console.error("Error updating record:", err);
      alert("Failed to save changes.");
    }
  };

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

  const handleCopyColumn = (colIndex: number, colName: string) => {
    if (displayedRows.length === 0) return;

    const columnData = displayedRows.map((row, index) => {
      const isEditing = editingRowId === row.id;
      const currentPlannedDt = isEditing ? editForm.plannedDt : row.plannedDt;
      const currentUnplannedDt = isEditing ? editForm.unplannedDt : row.unplannedDt;
      const currentActualOutput = isEditing ? editForm.actualOutput : row.actualOutput;
      const currentTargetOutput = isEditing ? editForm.targetOutput : row.targetOutput;
      const currentGoodOutput = isEditing ? editForm.goodOutput : row.goodOutput;

      const actualAvailTime = row.totalAvailTime - currentPlannedDt;
      const actualRunTime = actualAvailTime - currentUnplannedDt;
      
      const pctUtilActual = actualAvailTime > 0 ? (actualRunTime / actualAvailTime) * 100 : 0;
      const pctUtilTotal = row.totalAvailTime > 0 ? (actualRunTime / row.totalAvailTime) * 100 : 0;
      const pctEff = currentTargetOutput > 0 ? (currentActualOutput / currentTargetOutput) * 100 : 0;
      const pctQual = currentActualOutput > 0 ? (currentGoodOutput / currentActualOutput) * 100 : 0;

      const formatForExcel = (val: string) => {
         const str = String(val);
         if (str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
         return str;
      };

      switch(colIndex) {
        case 0: return index + 1;
        case 1: return row.timeDuration;
        case 2: return formatForExcel(row.modelName || '-'); 
        case 3: return row.plannedMp;
        case 4: return isEditing ? editForm.actualMp : row.actualMp;
        case 5: return row.totalAvailTime;
        case 6: return currentPlannedDt;
        case 7: return actualAvailTime;
        case 8: return currentUnplannedDt;
        case 9: return actualRunTime;
        case 10: return `${pctUtilActual.toFixed(1)}%`;
        case 11: return `${pctUtilTotal.toFixed(1)}%`;
        case 12: return currentTargetOutput;
        case 13: return currentActualOutput;
        case 14: return `${pctEff.toFixed(1)}%`;
        case 15: return currentGoodOutput;
        case 16: return `${pctQual.toFixed(1)}%`;
        case 17: return formatForExcel(isEditing ? editForm.remarks : (row.remarks || '-'));
        default: return '';
      }
    });

    const textToCopy = columnData.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      if (Notification.permission === "granted") {
        new Notification("📋 Copied!", {
          body: `${colName} column copied to clipboard successfully!`,
          icon: "/vite.svg" 
        });
      } else {
        alert(`${colName} column copied to clipboard successfully!`);
      }
    }).catch(err => {
      console.error('Failed to copy column data: ', err);
      alert('Failed to copy column. Please check browser permissions.');
    });
  };

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

  const cellClass = "border border-slate-300 px-2 py-2 h-10 text-slate-700 text-center";
  const numCellClass = `${cellClass} font-mono`;
  const preWrapCellClass = `${cellClass} whitespace-pre-wrap`;

  const renderTh = (index: number, title: string, widthClass: string, colorClass = '', alignClass = 'text-center', justifyClass = 'justify-center') => (
    <th key={index} className={`border-[0.5px] border-slate-400 px-2 py-3 ${widthClass} text-[10px] whitespace-normal leading-tight font-bold ${alignClass} ${colorClass} group relative hover:bg-[#254abf] transition-colors`}>
      <div className={`flex items-center ${justifyClass} gap-1.5`}>
        <span>{title}</span>
        <button 
          onClick={() => handleCopyColumn(index, title.split('\n')[0])} 
          className="p-1 hover:bg-blue-400 bg-blue-600/80 rounded opacity-0 group-hover:opacity-100 transition-opacity text-white shrink-0 shadow-sm" 
          title={`Copy ${title.split('\n')[0]} column`}
        >
          <Copy size={12} />
        </button>
      </div>
    </th>
  );

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

            {/* TOGGLE ADD RECORD FORM */}
            <button 
              onClick={() => setShowAddRecord(!showAddRecord)}
              className="flex items-center justify-center px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors bg-blue-600 text-white hover:bg-blue-500 border border-blue-400"
            >
              {showAddRecord ? <X size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />} 
              {showAddRecord ? 'Close Entry' : 'Add Record'}
            </button>

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

        {/* --- DYNAMIC ADD RECORD COMPONENT --- */}
        <div className={`transition-all duration-300 overflow-hidden ${showAddRecord ? 'max-h-[3000px] opacity-100 p-4 bg-slate-50' : 'max-h-0 opacity-0 p-0'}`}>
          {showAddRecord && (
            <AddProductionSection 
              initialDate={selectedDate}
              onClose={() => setShowAddRecord(false)} 
              onSuccess={() => {
                fetchReportData();
                setShowAddRecord(false);
              }}
            />
          )}
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

          <table className="w-full text-xs border-collapse whitespace-nowrap min-w-[1600px] bg-white" style={{ borderCollapse: 'collapse' }}>
            <thead className="bg-[#1E40AF] text-white sticky top-0 z-20 shadow-md">
              <tr>
                {renderTh(0, 'SL.No', 'w-10')}
                {renderTh(1, 'Time Duration', 'w-48')}
                {renderTh(2, 'Model Name', 'min-w-[200px]', '', 'text-left', 'justify-start')}
                {renderTh(3, 'Planned Manpower', 'w-16')}
                {renderTh(4, 'Actual Manpower', 'w-16')}
                {renderTh(5, 'Total Available Time (min)', 'w-20')}
                {renderTh(6, 'Planned Downtime (min)', 'w-28', 'text-amber-200')}
                {renderTh(7, 'Actual Available Time (min)', 'w-20')}
                {renderTh(8, 'Un-Planned Downtime (min)', 'w-24', 'text-amber-200')}
                {renderTh(9, 'Actual Run Time (min)', 'w-32')}
                {renderTh(10, 'Line Utilization (Actual) %', 'w-32', 'text-emerald-200')}
                {renderTh(11, 'Line Utilization (Total) %', 'w-32', 'text-emerald-200')}
                {renderTh(12, 'Target Output (Qty)', 'w-20')}
                {renderTh(13, 'Actual Output (Qty)', 'w-20')}
                {renderTh(14, 'Efficiency(%)', 'w-32', 'text-blue-200')}
                {renderTh(15, 'Good Output(Qty)', 'w-20')}
                {renderTh(16, 'Quality (FPY) %', 'w-32', 'text-blue-200')}
                {renderTh(17, 'Remarks', 'min-w-[250px]', '', 'text-left', 'justify-start')}
                <th className="border-[0.5px] border-slate-400 px-2 py-3 w-10 select-none"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {displayedRows.map((row, index) => {
                const isEditing = editingRowId === row.id;

                const currentPlannedDt = isEditing ? editForm.plannedDt : row.plannedDt;
                const currentUnplannedDt = isEditing ? editForm.unplannedDt : row.unplannedDt;
                const currentActualOutput = isEditing ? editForm.actualOutput : row.actualOutput;
                const currentTargetOutput = isEditing ? editForm.targetOutput : row.targetOutput;

                const currentGoodOutput = isEditing ? editForm.goodOutput : row.goodOutput;

                const actualAvailTime = row.totalAvailTime - currentPlannedDt;
                const actualRunTime = actualAvailTime - currentUnplannedDt;
                
                const pctUtilActual = actualAvailTime > 0 ? (actualRunTime / actualAvailTime) * 100 : 0;
                const pctUtilTotal = row.totalAvailTime > 0 ? (actualRunTime / row.totalAvailTime) * 100 : 0;
                const pctEff = currentTargetOutput > 0 ? (currentActualOutput / currentTargetOutput) * 100 : 0;
                const pctQual = currentActualOutput > 0 ? (currentGoodOutput / currentActualOutput) * 100 : 0;

                const modelsContent = row.items && row.items.length > 0
                  ? row.items.map((m, idx, arr) => (
                      <span key={idx}>
                        {m.model}
                        {idx < arr.length - 1 && <br />}
                      </span>
                    ))
                  : '-';

                const remarksContent = row.remarks
                  ? row.remarks.split(/\r?\n/).map((line, idx, arr) => (
                      <span key={idx}>
                        {line}
                        {idx < arr.length - 1 && <br />}
                      </span>
                    ))
                  : '-';

                return (
                  <tr key={row.id} className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className={`${numCellClass} text-slate-500 font-bold`}>{index + 1}</td>
                    <td className={`${numCellClass} font-semibold`}>{row.timeDuration}</td>
                    
                    <td className={`${preWrapCellClass} font-medium align-top`} style={{ whiteSpace: 'pre-wrap' }}>
                      {isEditing ? (
                        <div className="flex flex-col gap-1 w-full">
                          {editForm.items.map((item, idx) => (
                            <div key={idx} className="flex gap-1 items-center w-full">
                              <input 
                                type="text" 
                                className="flex-1 min-w-[100px] border border-blue-400 rounded px-1.5 py-1 outline-none text-[11px]" 
                                value={item.model} 
                                onChange={(e) => {
                                  const newItems = [...editForm.items];
                                  newItems[idx].model = e.target.value;
                                  setEditForm({...editForm, items: newItems});
                                }} 
                                placeholder="Model"
                              />
                              <input 
                                type="text" 
                                className="w-12 border border-blue-400 rounded text-center px-1 py-1 outline-none text-[11px]" 
                                value={item.quantity === 0 ? '' : item.quantity} 
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  const numVal = val === '' ? 0 : parseInt(val, 10);
                                  
                                  const newItems = [...editForm.items];
                                  newItems[idx].quantity = numVal;
                                  
                                  const newTotalOutput = newItems.reduce((sum, curr) => sum + (Number(curr.quantity) || 0), 0);
                                  
                                  setEditForm({
                                    ...editForm, 
                                    items: newItems,
                                    actualOutput: newTotalOutput
                                  });
                                }} 
                                placeholder="Qty"
                              />
                              {idx === 0 ? (
                                <button 
                                  onClick={() => setEditForm({...editForm, items: [...editForm.items, { model: '', quantity: 0 }]})} 
                                  className="p-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors" 
                                  title="Add Model"
                                >
                                  <Plus size={14} />
                                </button>
                              ) : (
                                <button 
                                  onClick={() => {
                                    const newItems = editForm.items.filter((_, i) => i !== idx);
                                    const newTotalOutput = newItems.reduce((sum, curr) => sum + (Number(curr.quantity) || 0), 0);
                                    setEditForm({...editForm, items: newItems, actualOutput: newTotalOutput});
                                  }} 
                                  className="p-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors" 
                                  title="Remove Model"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        modelsContent
                      )}
                    </td>
                    
                    <td className={numCellClass}>{row.plannedMp}</td>
                    
                    <td className={numCellClass}>
                      {isEditing ? (
                        <input type="number" className="w-12 border border-blue-400 rounded text-center outline-none py-1" value={editForm.actualMp} onChange={(e) => setEditForm({...editForm, actualMp: Number(e.target.value)})} />
                      ) : row.actualMp}
                    </td>

                    <td className={`${numCellClass} font-bold`}>{row.totalAvailTime}</td>
                    
                    <td className={`${numCellClass} ${isEditing ? '' : 'bg-rose-50/30'}`}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-rose-400 rounded text-center outline-none text-rose-600 py-1" value={editForm.plannedDt} onChange={(e) => setEditForm({...editForm, plannedDt: Number(e.target.value)})} />
                      ) : <span className="text-rose-600">{row.plannedDt || ''}</span>}
                    </td>

                    <td className={`${numCellClass} bg-slate-100 font-bold text-slate-700`}>{actualAvailTime}</td>
                    
                    <td className={`${numCellClass} ${isEditing ? '' : 'bg-orange-50/30'}`}>
                      {isEditing ? (
                         <input type="number" className="w-16 border border-orange-400 rounded text-center outline-none text-orange-600 py-1" value={editForm.unplannedDt} onChange={(e) => setEditForm({...editForm, unplannedDt: Number(e.target.value)})} />
                      ) : <span className="text-orange-600">{row.unplannedDt || ''}</span>}
                    </td>

                    <td className={`${numCellClass} bg-slate-100 font-bold text-slate-700`}>{actualRunTime}</td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctUtilActual, false)}>{pctUtilActual.toFixed(1)}%</td>
                    <td className={numCellClass} style={getPercentageStyle(pctUtilTotal, false)}>{pctUtilTotal.toFixed(1)}%</td>
                    
                    <td className={numCellClass}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-blue-400 rounded text-center outline-none py-1" value={editForm.targetOutput} onChange={(e) => setEditForm({...editForm, targetOutput: Number(e.target.value)})} />
                      ) : row.targetOutput}
                    </td>

                    <td className={`${numCellClass} font-bold`}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-blue-400 rounded text-center outline-none py-1" value={editForm.actualOutput} onChange={(e) => setEditForm({...editForm, actualOutput: Number(e.target.value)})} />
                      ) : row.actualOutput}
                    </td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctEff, false)}>{pctEff.toFixed(1)}%</td>
                    
                    <td className={`${numCellClass} font-bold`}>
                      {isEditing ? (
                        <input type="number" className="w-16 border border-blue-400 rounded text-center outline-none py-1" value={editForm.goodOutput} onChange={(e) => setEditForm({...editForm, goodOutput: Number(e.target.value)})} />
                      ) : currentGoodOutput}
                    </td>
                    
                    <td className={numCellClass} style={getPercentageStyle(pctQual, false)}>{pctQual.toFixed(1)}%</td>
                    
                    <td className={`${preWrapCellClass} text-[11px]`} style={{ whiteSpace: 'pre-wrap' }}>
                      {isEditing ? (
                        <textarea className="w-full min-h-[40px] border border-blue-400 rounded p-1 outline-none resize-none text-center" value={editForm.remarks} onChange={(e) => setEditForm({...editForm, remarks: e.target.value})} />
                      ) : remarksContent}
                    </td>

                    <td className={`${cellClass} text-center select-none`}>
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
                  <td className="border border-slate-700 px-2 py-3 text-white select-none"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
