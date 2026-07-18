import React, { useState, useEffect } from 'react';
import { Activity, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

// --- Types mapping to your Supabase schema ---
interface ProductionItem {
  uph: string;
  model: string;
  target: number;
  actual: number;
  startTime: string;
  endTime: string;
}

interface ProductionRow {
  id: string;
  team: string;
  hour: number;
  hourText: string;
  manpower: number;
  remarks: string;
  planDt: number;
  unplanDt: number;
  defectQty: number;
  items: ProductionItem[];
}

interface ViewUtilizationReportProps {
  selectedDate: string;
}

// --- Constants ---
const ALL_TEAMS = [
  'Packing Accessories',
  'Packing Panel',
  'THT Panel',
  'THT Accessories',
  'FG Panel',
  'FG Accessories'
];

// --- Helper to convert numeric hour back to text for display ---
const formatHourToTimeRange = (hour: number): string => {
  if (hour === 8.5) return '8.30 to 9.00';
  const h = Math.floor(hour);
  return `${h}.00 to ${h + 1}.00`;
};

// ============================================================================
// MAIN VIEW COMPONENT (READ ONLY)
// ============================================================================
export default function ViewUtilizationReport({ selectedDate }: ViewUtilizationReportProps) {
  const [activeTab, setActiveTab] = useState(ALL_TEAMS[0]);
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReportData = async () => {
    if (!selectedDate) return;
    setLoading(true);

    try {
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
        // Ensure item is treated as an array of objects
        const itemsList = Array.isArray(record.item) ? record.item.map((item: any) => ({
          uph: item.uph || '',
          model: item.model || '',
          target: item.target || 0, 
          actual: item.quantity || item.qty || item.actual || 0, 
          startTime: item.startTime || '',
          endTime: item.endTime || ''
        })) : [];

        return {
          id: record.id,
          team: record.team || 'Unknown',
          hour: record.hour,
          hourText: formatHourToTimeRange(record.hour),
          manpower: record.manpower || 0,
          planDt: record.plan_dt || 0,
          unplanDt: record.unplan_dt || 0,
          defectQty: record.defect_qty || 0,
          remarks: record.remarks || '',
          items: itemsList
        };
      });

      setRows(transformedRows);
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [selectedDate]);

  // Filter rows based on the selected tab
  const displayedRows = rows.filter(row => row.team === activeTab);

  // Styling constants
  const thClass = "border border-slate-300 px-2 py-3 text-[11px] font-bold text-center bg-slate-100 text-slate-700 whitespace-nowrap";
  const tdClass = "border border-slate-300 align-middle text-center text-xs text-slate-700 bg-white";

  return (
    <div className="max-w-[100vw] mx-auto p-4 md:p-6 bg-slate-50 min-h-screen font-sans">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#1E40AF] px-6 py-4 text-white flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <FileSpreadsheet size={24} className="text-blue-100" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Production Hourly Summary Report</h2>
            <p className="text-xs text-blue-200">Date: {selectedDate}</p>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 pt-3 pb-0 hide-scrollbar">
          {ALL_TEAMS.map(team => {
            // Check if there is data for this team to show an indicator
            const hasData = rows.some(r => r.team === team);
            
            return (
              <button
                key={team}
                onClick={() => setActiveTab(team)}
                className={`px-5 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-all outline-none flex items-center gap-2 ${
                  activeTab === team
                    ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-[0_-2px_6px_-2px_rgba(0,0,0,0.1)]'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-t-xl'
                }`}
              >
                {team}
                {hasData && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
              </button>
            )
          })}
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

          <table className="w-full text-xs border-collapse min-w-[1200px] bg-white">
            <thead className="sticky top-0 z-20 shadow-sm">
              <tr>
                <th className={`${thClass} w-32`}>Hourly Time</th>
                <th className={`${thClass} w-16`}>UPH</th>
                <th className={`${thClass} min-w-[200px]`}>Model Name / Part No.</th>
                <th className={`${thClass} w-24`}>Manpower</th>
                <th className={`${thClass} w-24`}>Target Qty</th>
                <th className={`${thClass} w-24`}>Actual Qty</th>
                <th className={`${thClass} w-32`}>Start - End Time</th>
                <th className={`${thClass} min-w-[250px]`}>Remarks & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {displayedRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  
                  {/* Root Column: Vertically Centered Hourly Time */}
                  <td className={`${tdClass} font-bold text-slate-800 bg-slate-50/50 w-32`}>
                    {row.hourText}
                  </td>

                  {/* Nested JSONB Columns Group 1 (UPH, Model) */}
                  <td colSpan={2} className="p-0 border border-slate-300">
                    <div className="flex flex-col w-full h-full divide-y divide-slate-200">
                      {row.items.length > 0 ? (
                        row.items.map((item, idx) => (
                          <div key={idx} className="flex w-full items-stretch min-h-[44px]">
                            {/* UPH */}
                            <div className="w-16 border-r border-slate-200 p-2 flex items-center justify-center font-semibold text-slate-600">
                              {item.uph || '-'}
                            </div>
                            
                            {/* Model */}
                            <div className="flex-1 p-2 flex items-center font-semibold text-slate-800">
                              {item.model || '-'}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex w-full items-stretch min-h-[44px] text-slate-400">
                           <div className="w-16 border-r border-slate-200 p-2 flex items-center justify-center">-</div>
                           <div className="flex-1 p-2 flex items-center justify-center">-</div>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Root Column: Manpower (Centered between the item details) */}
                  <td className={`${tdClass} font-mono bg-slate-50/30 w-24`}>{row.manpower}</td>

                  {/* Nested JSONB Columns Group 2 (Target, Actual, Time Range) */}
                  <td colSpan={3} className="p-0 border border-slate-300">
                    <div className="flex flex-col w-full h-full divide-y divide-slate-200">
                      {row.items.length > 0 ? (
                        row.items.map((item, idx) => (
                          <div key={idx} className="flex w-full items-stretch min-h-[44px]">
                            {/* Individual Target */}
                            <div className="w-24 border-r border-slate-200 p-2 flex items-center justify-center font-bold text-slate-700">
                              {item.target || 0}
                            </div>
                            
                            {/* Individual Actual */}
                            <div className="w-24 border-r border-slate-200 p-2 flex items-center justify-center font-bold text-blue-700 bg-blue-50/20">
                              {item.actual || 0}
                            </div>
                            
                            {/* Time Range */}
                            <div className="w-32 p-2 flex items-center justify-center text-slate-600 font-mono text-[10px]">
                              {item.startTime || '--:--'} <span className="mx-1">-</span> {item.endTime || '--:--'}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex w-full items-stretch min-h-[44px] text-slate-400">
                           <div className="w-24 border-r border-slate-200 p-2 flex items-center justify-center">-</div>
                           <div className="w-24 border-r border-slate-200 p-2 flex items-center justify-center">-</div>
                           <div className="w-32 p-2 flex items-center justify-center">-</div>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Root Column: Remarks with Badges */}
                  <td className={`${tdClass} text-left p-2 align-top`}>
                    
                    {/* Badges Container */}
                    {(row.planDt > 0 || row.unplanDt > 0 || row.defectQty > 0) && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5 border-b border-slate-100 pb-1.5">
                        {row.planDt > 0 && (
                          <span className="px-1.5 py-0.5 bg-green-100 border border-green-300 text-green-800 text-[9px] font-bold rounded shadow-sm flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-green-500"></span> Plan DT: {row.planDt}m
                          </span>
                        )}
                        {row.unplanDt > 0 && (
                          <span className="px-1.5 py-0.5 bg-amber-100 border border-rose-300 text-amber-800 text-[9px] font-bold rounded shadow-sm flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-amber-500"></span> Unplan DT: {row.unplanDt}m
                          </span>
                        )}
                        {row.defectQty > 0 && (
                          <span className="px-1.5 py-0.5 bg-red-100 border border-red-300 text-red-800 text-[9px] font-bold rounded shadow-sm flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-red-500"></span> Defects: {row.defectQty}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Remarks Text */}
                    <div className="whitespace-pre-wrap text-[11px] text-slate-600">
                      {row.remarks || '-'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
