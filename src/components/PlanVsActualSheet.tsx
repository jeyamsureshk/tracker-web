import { useState, useEffect, useCallback } from 'react';
import { X, Save, Copy, EyeOff, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';

const formatETA = (dateString: string | null | undefined) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '-';
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'short' });
  const year = d.getFullYear();
  return `${day}-${month}-${year}`; 
};

interface HourlyProductionSheetProps {
  selectedDate: string;
}

interface DailySummaryRow {
  sno: number;
  date: string;
  fg_part_number: string;
  model_name: string;
  category: string;
  plan: number | string;
  actual: number;
  remark: string;
  eta: string;
  team: string; 
}

export default function HourlyProductionSheet({ selectedDate }: HourlyProductionSheetProps) {
  const [summaryData, setSummaryData] = useState<DailySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [editingEtaIdx, setEditingEtaIdx] = useState<number | null>(null);
  
  // Visibility States
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
  const [showHiddenRows, setShowHiddenRows] = useState(false);

  // --- Data Fetching Logic ---
  const fetchDailySummary = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Item Master Data
      const { data: itemsData } = await supabase.from('items').select('part_id, description, model, item_group');

      // 2. Fetch Plan Data
      const { data: planData } = await supabase.from('plan').select('*').eq('entry_date', selectedDate);
      
      // 3. Fetch Production Data
      const { data: prodData } = await supabase.from('production_records').select('item, team').eq('date', selectedDate);

      const actualQtyMap: Record<string, number> = {};
      const actualTeamMap: Record<string, string> = {}; 

      if (prodData) {
        prodData.forEach(record => {
          if (Array.isArray(record.item)) {
            record.item.forEach((i: any) => {
              if (i.model) {
                actualQtyMap[i.model] = (actualQtyMap[i.model] || 0) + (Number(i.quantity) || 0);
                actualTeamMap[i.model] = record.team || actualTeamMap[i.model];
              }
            });
          }
        });
      }

      const allModels = new Set([...(planData || []).map(p => p.model_name), ...Object.keys(actualQtyMap)]);
      const formattedDate = new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');

      const summaryRows: DailySummaryRow[] = Array.from(allModels).map((model) => {
        const planObj = planData?.find(p => p.model_name === model);
        const itemObj = itemsData?.find(i => i.model === model); 
        
        const planQty = planObj?.plan_qty !== undefined ? planObj.plan_qty : '';
        const actualQty = actualQtyMap[model] || 0;
        const teamAssigned = planObj?.team || actualTeamMap[model] || '';
        
        let derivedCategory = itemObj?.item_group || 'SFG'; 
        const teamLower = teamAssigned.toLowerCase();
        if (teamLower.includes('panel')) derivedCategory = 'Panel';
        else if (teamLower.includes('accessories')) derivedCategory = 'Accessories';

        let defaultRemark = planObj?.remarks || '';
        if (!defaultRemark) {
            if (actualQty >= Number(planQty) && Number(planQty) > 0) defaultRemark = 'Completed';
            else if (actualQty > 0) defaultRemark = 'Pending Plan';
            else defaultRemark = 'Pending Plan';
        }

        return {
          sno: 0, 
          date: formattedDate,
          fg_part_number: itemObj?.part_id || '-',
          model_name: model,
          category: derivedCategory,
          plan: planQty,
          actual: actualQty,
          remark: defaultRemark,
          eta: planObj?.eta ? planObj.eta : '',
          team: teamAssigned
        };
      });

      const catOrder: Record<string, number> = { 'Panel': 1, 'Accessories': 2 };
      const getCatWeight = (cat: string) => catOrder[cat] || 3;

      summaryRows.sort((a, b) => {
        const diff = getCatWeight(a.category) - getCatWeight(b.category);
        if (diff !== 0) return diff;
        return a.model_name.localeCompare(b.model_name);
      });

      setSummaryData(summaryRows);
    } catch (err) {
      console.error("Error fetching summary data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchDailySummary();
  }, [fetchDailySummary]);

  // --- Handlers ---
  const handleCellChange = (index: number, field: keyof DailySummaryRow, value: string) => {
    const newData = [...summaryData];
    newData[index] = { ...newData[index], [field]: value };
    
    if (field === 'plan') {
      const planQty = Number(value);
      const actualQty = newData[index].actual;
      if (actualQty >= planQty && planQty > 0) newData[index].remark = 'Completed';
      else if (newData[index].remark === 'Completed' && actualQty < planQty) newData[index].remark = 'Pending Plan';
    }
    setSummaryData(newData);
  };

  const toggleRowVisibility = (modelName: string) => {
    setHiddenModels(prev => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
  };

  const handleSavePlanUpdates = async () => {
    setSavingPlan(true);
    try {
      const upsertData = summaryData.map(row => ({
        entry_date: selectedDate,
        model_name: row.model_name,
        plan_qty: parseInt(String(row.plan)) || 0,
        remarks: row.remark,
        eta: row.eta || null,
        team: row.team || null
      }));

      const { error } = await supabase.from('plan').upsert(upsertData, { onConflict: 'entry_date, model_name' });
      if (error) throw error;
      alert("Plan updates saved successfully!");
      fetchDailySummary(); 
    } catch (err: any) {
      alert(`Failed to save plan: ${err.message}`);
    } finally {
      setSavingPlan(false);
    }
  };

  const handleCopySummaryTable = async () => {
    if (summaryData.length === 0) return alert("No data to copy!");
    
    // EXCLUDE hidden rows for copy
    const visibleData = summaryData.filter(row => !hiddenModels.has(row.model_name));
    
    const headers = ["Date", "S.no", "FG part number", "Model Name", "Category", "Plan", "Actual", "Remark", "ETA"];
    
    let html = `<table border="1" style="border-collapse: collapse; font-family: Calibri, sans-serif; font-size: 11pt;">`;
    html += `<thead><tr>`;
    headers.forEach(h => {
      html += `<th style="background-color: #70ad47; color: white; text-align: center; font-weight: bold; border: 1px solid #d1d5db; padding: 4px;">${h}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Process visible rows to HTML
    visibleData.forEach((row, idx) => {
      html += `<tr>`;
      
      // Date Column (Merged)
      if (idx === 0) {
        html += `<td rowspan="${visibleData.length}" style="text-align: center; vertical-align: middle; border: 1px solid #d1d5db; background-color: #f3f4f6; font-weight: bold;">${row.date}</td>`;
      }
      
      // Data Columns
      html += `<td style="text-align: center; vertical-align: middle; border: 1px solid #d1d5db; background-color: #f3f4f6;">${idx + 1}</td>`;
      html += `<td style="text-align: left; vertical-align: middle; border: 1px solid #d1d5db;">${row.fg_part_number}</td>`;
      html += `<td style="text-align: left; vertical-align: middle; border: 1px solid #d1d5db; font-weight: 500;">${row.model_name}</td>`;
      html += `<td style="text-align: left; vertical-align: middle; border: 1px solid #d1d5db;">${row.category}</td>`;
      html += `<td style="text-align: center; vertical-align: middle; border: 1px solid #d1d5db;">${row.plan}</td>`;
      html += `<td style="text-align: center; vertical-align: middle; border: 1px solid #d1d5db; font-weight: bold;">${row.actual}</td>`;
      html += `<td style="text-align: left; vertical-align: middle; border: 1px solid #d1d5db;">${(row.remark || '').replace(/\n/g, '<br>')}</td>`;
      html += `<td style="text-align: center; vertical-align: middle; border: 1px solid #d1d5db;">${formatETA(row.eta)}</td>`;
      
      html += `</tr>`;
    });
    html += `</tbody></table>`;

    try {
      const blobHtml = new Blob([html], { type: "text/html" });
      const clipboardItem = new ClipboardItem({ "text/html": blobHtml });
      await navigator.clipboard.write([clipboardItem]);
      alert("Summary table copied perfectly! You can now paste it into Excel.");
    } catch (err) {
      alert("Copy failed. Please check browser clipboard permissions.");
    }
  };

  const autoResizeTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  if (loading) return (
    <div className="flex justify-center p-12 items-center space-x-2 text-slate-500 font-medium">
      <div className="w-5 h-5 border-2 border-[#70ad47] border-t-transparent rounded-full animate-spin"></div>
      <span>Generating Daily Summary...</span>
    </div>
  );

  // Pre-calculate visible variables for the Date Rowspan and Sno
  const visibleCount = showHiddenRows ? summaryData.length : summaryData.filter(r => !hiddenModels.has(r.model_name)).length;
  const firstVisibleIdx = summaryData.findIndex(r => showHiddenRows || !hiddenModels.has(r.model_name));
  
  let dynamicSno = 1;

  return (
    <div className="space-y-4 p-4 md:p-6 bg-slate-50 min-h-screen relative">
      
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 relative z-10">
        <div className="flex gap-2">
            <button onClick={handleSavePlanUpdates} disabled={savingPlan} className="flex items-center gap-2 px-4 py-2 bg-[#70ad47] text-white rounded-lg hover:bg-green-700 transition-all shadow-md font-bold disabled:opacity-50">
                {savingPlan ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Save size={16} />} 
                Save Plan Changes
            </button>
            <button onClick={handleCopySummaryTable} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-bold">
                <Copy size={16} /> Copy Summary
            </button>
            
            {hiddenModels.size > 0 && (
              <button 
                onClick={() => setShowHiddenRows(!showHiddenRows)} 
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-all shadow-sm font-bold ${showHiddenRows ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {showHiddenRows ? <EyeOff size={16} /> : <Eye size={16} />} 
                {showHiddenRows ? 'Hide Masked Rows' : `Show Hidden (${hiddenModels.size})`}
              </button>
            )}
        </div>
      </div>

      {/* --- EXCEL STYLE SUMMARY TABLE --- */}
      <div className="bg-white shadow-md border border-gray-300 overflow-x-auto relative">
        <table className="w-full border-collapse" style={{ fontFamily: 'Calibri, sans-serif' }}>
          <thead>
            <tr className="bg-[#70ad47] text-white">
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300 w-[100px]">Date</th>
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300 w-[60px]">S.no</th>
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300">FG part number</th>
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300">Model Name</th>
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300">Category</th>
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300 w-[90px]">Plan</th>
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300 w-[80px]">Actual</th>
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300 min-w-[200px]">Remark</th>
              <th className="px-3 py-2 text-center align-middle text-sm font-bold border border-gray-300 w-[140px]">ETA</th>
              <th className="px-2 py-2 text-center align-middle text-sm font-bold border border-gray-300 w-[40px] select-none" title="Hide Row">👁️</th>
            </tr>
          </thead>
          <tbody className="bg-white text-gray-800">
            {summaryData.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500 border border-gray-300">No data found.</td></tr>
            ) : (
              summaryData.map((row, idx) => {
                const isHidden = hiddenModels.has(row.model_name);
                
                // If it is hidden and we aren't displaying hidden rows, don't render it at all.
                if (isHidden && !showHiddenRows) return null;

                // Calculate the visible Sno
                const currentSno = isHidden ? '-' : dynamicSno++;

                return (
                  <tr key={idx} className={`transition-colors ${isHidden ? 'bg-gray-200/50 opacity-60 hover:bg-gray-200/70' : 'hover:bg-gray-50'}`}>
                    
                    {/* Date Column Merge */}
                    {idx === firstVisibleIdx && (
                      <td 
                        rowSpan={visibleCount} 
                        className="px-3 py-1.5 text-center text-sm border border-gray-300 bg-gray-100 font-bold whitespace-nowrap align-middle"
                      >
                        {row.date}
                      </td>
                    )}
                    
                    <td className="px-3 py-1.5 text-center align-middle text-sm border border-gray-300 bg-gray-100 font-medium">
                      {currentSno}
                    </td>
                    <td className="px-3 py-1.5 text-left align-middle text-sm border border-gray-300">
                      {row.fg_part_number}
                    </td>
                    <td className="px-3 py-1.5 text-left align-middle text-sm border border-gray-300 font-medium">
                      {row.model_name}
                    </td>
                    <td className="px-3 py-1.5 text-left align-middle text-sm border border-gray-300">
                      {row.category}
                    </td>
                    
                    {/* Plan Input */}
                    <td className="p-0 border border-gray-300 align-middle">
                      <input 
                          type="number" 
                          value={row.plan} 
                          onChange={(e) => handleCellChange(idx, 'plan', e.target.value)}
                          className="w-full h-full min-h-[32px] px-3 py-1.5 text-center align-middle text-sm bg-transparent border-none focus:ring-2 focus:ring-[#70ad47] focus:bg-white outline-none m-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>
                    
                    <td className="px-3 py-1.5 text-center align-middle text-sm border border-gray-300 font-bold">
                      {row.actual}
                    </td>
                    
                    {/* Remarks Textarea */}
                    <td className="p-0 border border-gray-300 align-middle">
                      <textarea 
                          value={row.remark} 
                          onChange={(e) => {
                            handleCellChange(idx, 'remark', e.target.value);
                            autoResizeTextarea(e);
                          }}
                          onFocus={autoResizeTextarea}
                          rows={Math.max(1, (row.remark || '').split('\n').length)}
                          className="w-full min-h-[32px] px-3 py-1.5 text-left text-sm bg-transparent border-none focus:ring-2 focus:ring-[#70ad47] focus:bg-white outline-none m-0 resize-none overflow-hidden block align-middle leading-relaxed"
                      />
                    </td>
                    
                    {/* ETA Date Picker */}
                    <td 
                       className="p-0 border border-gray-300 relative group cursor-pointer align-middle text-center" 
                       onClick={() => setEditingEtaIdx(idx)}
                    >
                       {editingEtaIdx === idx ? (
                           <input 
                               type="date" 
                               autoFocus
                               value={row.eta || ''} 
                               onChange={(e) => handleCellChange(idx, 'eta', e.target.value)}
                               onBlur={() => setEditingEtaIdx(null)}
                               className="w-full h-full min-h-[32px] px-2 py-1.5 text-center align-middle text-sm bg-transparent border-none focus:ring-2 focus:ring-[#70ad47] focus:bg-white outline-none"
                           />
                       ) : (
                           <div className="w-full h-full min-h-[32px] px-2 py-1.5 flex items-center justify-center relative">
                               <span className="font-medium text-gray-700 select-none text-center block w-full">
                                   {formatETA(row.eta)}
                               </span>
                               {row.eta && (
                                   <button 
                                       onClick={(e) => { 
                                           e.stopPropagation(); 
                                           handleCellChange(idx, 'eta', ''); 
                                       }}
                                       className="absolute right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                       title="Clear Date"
                                   >
                                       <X size={14} />
                                   </button>
                               )}
                           </div>
                       )}
                    </td>
                    
                    {/* Visibility Action */}
                    <td className="p-0 border border-gray-300 align-middle text-center">
                       <button 
                         onClick={() => toggleRowVisibility(row.model_name)}
                         className={`p-1.5 rounded-md transition-colors ${isHidden ? 'text-amber-600 hover:bg-amber-100' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                         title={isHidden ? "Show Row" : "Hide Row"}
                       >
                         {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                       </button>
                    </td>
                    
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
