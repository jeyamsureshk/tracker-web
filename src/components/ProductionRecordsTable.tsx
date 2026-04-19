import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, User, Calendar, Hash, Clipboard, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ProductionRow {
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

const getPercentageStyle = (val: number, isDarkBackground = false): React.CSSProperties => {
  if (val > 100 || val < 0) {
    return { backgroundColor: '#dc2626', color: 'white', fontWeight: 'bold' }; 
  }
  
  let textColor = '';
  if (val >= 90) {
    textColor = isDarkBackground ? '#4ade80' : '#16a34a';
  } else if (val >= 75) {
    textColor = isDarkBackground ? '#facc15' : '#eab308';
  } else if (val >= 60) {
    textColor = isDarkBackground ? '#fb923c' : '#991b1b';
  } else {
    textColor = isDarkBackground ? '#ef4444' : '#dc2626';
  }

  return { color: textColor, fontWeight: 'bold' };
};

export default function AddProductionRecord() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [operatorId, setOperatorId] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [team, setTeam] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [rows, setRows] = useState<ProductionRow[]>([
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

    // Automatic Break Detection
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
    }else if (nextDuration.includes('20:00 - 21:00')) {
      defaultPlannedDt = 25;
      defaultRemarks = 'Break 25 Minutes';
    }


    setRows([...rows, { 
      timeDuration: nextDuration, 
      modelName: '', 
      plannedMp: 1, actualMp: 1, totalAvailTime: 60, 
      plannedDt: defaultPlannedDt, 
      unplannedDt: 0, 
      targetOutput: 0, actualOutput: 0, goodOutput: 0, 
      remarks: defaultRemarks 
    }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof ProductionRow, value: any) => {
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

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, colKey: keyof ProductionRow) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const parsedRows = parseExcelClipboard(pasteData);
    if (parsedRows.length === 0) return;

    const excelColumnMap: (keyof ProductionRow | 'SKIP')[] = [
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
      setRows([{ 
        timeDuration: '08:30 - 09:00', modelName: '', plannedMp: 1, actualMp: 1, 
        totalAvailTime: 30, plannedDt: 0, unplannedDt: 0, targetOutput: 0, actualOutput: 0, goodOutput: 0, remarks: '' 
      }]);
    }
    setIsSaving(false);
  };

  const inputClass = "w-full h-full px-2 py-2 bg-transparent outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-all text-xs";
  const numInputClass = `${inputClass} text-center font-mono`;
  const cellClass = "border border-slate-300 p-0 text-center align-middle font-bold text-slate-700 h-10";

  return (
    <div className="max-w-[100vw] mx-auto p-4 md:p-6 bg-slate-50 min-h-screen font-sans">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        
        {/* Header Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6 border-b border-slate-100 bg-slate-800 text-white rounded-t-xl">
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

        {/* Excel-like Table Container */}
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

        {/* Footer Actions */}
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
    </div>
  );
}
