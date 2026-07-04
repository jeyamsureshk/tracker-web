import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Activity,
  Download,
  X,
  Search,
  Filter,
  BarChart2,
  Clock,
  Layers,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import ExcelJS from 'exceljs';

// --- TYPES ---
interface StageData {
  counts: string[];
  average: number;
  description: string;
}

interface CycleTimeRecord {
  id: string;
  team: string;
  model_name: string;
  overall_average: number;
  cycles_per_hour: number;
  stages: StageData[];
}

// --- TEAM COLORS (Adjusted for Light Mode visibility) ---
const TEAM_COLORS: Record<string, string> = {
  'THT': '#3b82f6', 'THT Accessories': '#f59e0b', 'FG Panel': '#0d9488', 'FG': '#6366f1',
  'Packing': '#10b981', 'Packing Accessories': '#f43f5e', 'SMT': '#65a30d', 'Fabrication': '#ea580c',
  'IQC': '#0ea5e9', 'FQC Panel': '#8b5cf6', 'FQC': '#ec4899', 'Cleaning': '#ef4444',
  'Stores': '#6b7280', 'Kitting': '#059669', 'Logistics': '#eab308', 'SCM': '#f97316',
  'Engineering': '#2563eb', 'D&D': '#e11d48', 'Products': '#4d7c0f', 'Maintenance': '#9ca3af',
  'IT': '#d946ef', 'SAP': '#0284c7', 'Accounts': '#a855f7', 'Administration': '#7c3aed',
  'Human Resources': '#4f46e5', 'Sales & Marketing': '#db2777', 'Customer Support': '#14b8a6',
};
const DEFAULT_TEAM_COLOR = '#64748b';

// --- ANIMATION VARIANTS ---
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export default function CycleTimeDashboard() {
  const [records, setRecords] = useState<CycleTimeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('All');
  const [selectedRecord, setSelectedRecord] = useState<CycleTimeRecord | null>(null);

  // --- FETCH DATA ---
  const fetchReportData = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('cycle_time_records')
      .select('*')
      .order('team', { ascending: true })
      .order('model_name', { ascending: true });

    if (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
      return;
    }

    const transformedRows: CycleTimeRecord[] = (data || []).map(
      (record) => ({
        id: record.id,
        team: record.team,
        model_name: record.model_name,
        overall_average: Number(record.overall_average),
        cycles_per_hour: Number(record.cycles_per_hour),
        stages:
          typeof record.stages === 'string'
            ? JSON.parse(record.stages)
            : record.stages || [],
      }),
    );

    setRecords(transformedRows);
    setLoading(false);
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  // --- FILTERING LOGIC ---
  const availableTeams = useMemo(() => {
    return Array.from(new Set(records.map((r) => r.team))).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchQuery
      .replace(/[\s-]/g, '')
      .toLowerCase();

    return records.filter((record) => {
      const matchesTeam =
        teamFilter === 'All' || record.team === teamFilter;

      const normalizedModelName = (record.model_name || '')
        .replace(/[\s-]/g, '')
        .toLowerCase();

      const matchesSearch =
        normalizedModelName.includes(normalizedSearch);

      return matchesTeam && matchesSearch;
    });
  }, [records, teamFilter, searchQuery]);

  // --- FIND HIGHEST STAGE VALUE ---
  const getHighestStageValue = (stages: StageData[]) => {
    if (!stages || stages.length === 0) return 0;
    return Math.max(...stages.map((s) => Number(s.average) || 0));
  };

  // --- EXPORT TO EXCEL ---
  const handleExportToExcel = async () => {
    if (filteredRecords.length === 0) {
      alert('No data to export.');
      return;
    }

    const workbook = new ExcelJS.Workbook();

    // SUMMARY SHEET
    const summarySheet = workbook.addWorksheet('Hourly Summary');
    const summaryHeaders = ['SL.No', 'Team', 'Model Name', 'Total Stages', '1 MP Output (Hourly)', 'Total Output (Hourly)'];
    
    summarySheet.addRow(summaryHeaders);
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // slate-900

    // DETAIL SHEET
    const detailSheet = workbook.addWorksheet('Detailed Stage Data');
    const detailHeaders = ['Team', 'Model Name', 'Stage Description', 'Count 1', 'Count 2', 'Count 3', 'Count 4', 'Count 5', 'Stage Average (s)'];
    
    detailSheet.addRow(detailHeaders);
    detailSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    detailSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; // slate-700

    filteredRecords.forEach((row, index) => {
      const totalStages = Array.isArray(row.stages) && row.stages.length > 0 ? row.stages.length : 1;
      const hourlyOutput = row.cycles_per_hour > 0 ? row.cycles_per_hour : row.overall_average > 0 ? 3600 / row.overall_average : 0;
      const oneMpOutput = hourlyOutput / totalStages;
      const totalOutput = totalStages * oneMpOutput;

      summarySheet.addRow([index + 1, row.team, row.model_name || '-', totalStages, Math.floor(oneMpOutput), Math.floor(totalOutput)]);

      if (Array.isArray(row.stages)) {
        row.stages.forEach((stage: StageData) => {
          const counts = stage.counts || [];
          detailSheet.addRow([
            row.team, row.model_name, stage.description || 'Unknown Stage',
            counts[0] || '-', counts[1] || '-', counts[2] || '-', counts[3] || '-', counts[4] || '-',
            stage.average ? Number(stage.average).toFixed(2) : '-'
          ]);
        });
      }
    });

    summarySheet.columns.forEach((col) => { col.alignment = { vertical: 'middle', horizontal: 'center' }; });
    summarySheet.getColumn('C').width = 25;

    detailSheet.columns.forEach((col) => { col.alignment = { vertical: 'middle', horizontal: 'center' }; });
    detailSheet.getColumn('C').width = 40;
    detailSheet.getColumn('C').alignment = { horizontal: 'left' };
    detailSheet.getColumn('B').width = 25;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'CycleTime_Analytics_Export.xlsx';
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const renderTh = (title: string, align: 'left' | 'center' | 'right' = 'left') => (
    <th className={`px-4 py-3 text-${align} text-[11px] font-bold tracking-widest text-slate-500 uppercase border-b border-slate-200 bg-slate-50 whitespace-nowrap`}>
      {title}
    </th>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans p-4 md:p-8 selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* TOP NAVBAR / HEADER */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                <BarChart2 size={20} className="text-indigo-600" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Production Analytics</h1>
            </div>
            <p className="text-sm text-slate-500 ml-11">Real-time cycle monitoring and throughput data</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            {/* SEARCH */}
            <div className="relative group w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-8 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* FILTER */}
            <div className="relative w-full sm:w-48">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="w-full h-10 pl-9 pr-8 rounded-lg bg-white border border-slate-300 text-sm text-slate-700 font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer transition-all shadow-sm"
              >
                <option value="All">All Teams</option>
                {availableTeams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>

            {/* ACTIONS */}
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={fetchReportData}
                disabled={loading}
                className="flex-1 sm:flex-none h-10 px-4 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
                Sync
              </button>
              <button
                onClick={handleExportToExcel}
                disabled={filteredRecords.length === 0}
                className="flex-1 sm:flex-none h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20"
              >
                <Download size={14} />
                Export
              </button>
            </div>
          </div>
        </header>

        {/* MAIN DATA VIEW */}
        <main className="relative bg-white border border-slate-200 rounded-xl overflow-hidden min-h-[500px] shadow-sm">
          
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
              >
                <RefreshCw size={28} className="animate-spin text-indigo-600 mb-4" />
                <p className="text-sm font-semibold text-slate-600 tracking-wide">Fetching telemetry...</p>
              </motion.div>
            ) : filteredRecords.length === 0 ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
              >
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                  <Layers size={28} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">No matching records</h3>
                <p className="text-sm text-slate-500">Modify your search or filter parameters to view data.</p>
              </motion.div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                    <tr>
                      {renderTh('Team', 'left')}
                      {renderTh('Model Designation', 'left')}
                      {renderTh('Stages', 'center')}
                      {renderTh('1 MP Output / Hr', 'right')}
                      {renderTh('Total Output / Hr', 'right')}
                    </tr>
                  </thead>

                  <motion.tbody 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="divide-y divide-slate-100"
                  >
                    {filteredRecords.map((row) => {
                      const totalStages = Array.isArray(row.stages) && row.stages.length > 0 ? row.stages.length : 1;
                      const hourlyOutput = row.cycles_per_hour > 0 ? row.cycles_per_hour : row.overall_average > 0 ? 3600 / row.overall_average : 0;
                      const oneMpOutput = hourlyOutput / totalStages;
                      const totalOutput = totalStages * oneMpOutput;
                      const teamAccent = TEAM_COLORS[row.team] || DEFAULT_TEAM_COLOR;

                      return (
                        <motion.tr
                          variants={itemVariants}
                          key={row.id}
                          onClick={() => setSelectedRecord(row)}
                          className="group cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2.5">
                              {/* Colored Team indicator and text */}
                              <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: teamAccent }} />
                              <span className="font-bold transition-colors" style={{ color: teamAccent }}>
                                {row.team}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-medium text-slate-900">{row.model_name}</span>
                              <ChevronRight size={16} className="text-slate-400 opacity-0 group-hover:opacity-100 group-hover:text-indigo-600 transition-all transform group-hover:translate-x-1" />
                            </div>
                          </td>

                          <td className="px-4 py-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-slate-100 text-slate-600 font-mono text-xs font-bold border border-slate-200">
                              {totalStages}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-right font-mono text-slate-600">
                            {Math.floor(oneMpOutput).toLocaleString()}
                          </td>

                          <td className="px-4 py-4 text-right">
                            <span className="font-mono font-bold text-indigo-700">
                              {Math.floor(totalOutput).toLocaleString()}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </motion.tbody>
                </table>
              </div>
            )}
          </AnimatePresence>
        </main>

        {/* DETAILS MODAL */}
        <AnimatePresence>
          {selectedRecord && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 20, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden"
              >
                
                {/* MODAL HEADER */}
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                      Stage Analytics
                    </h3>
                    <div className="flex items-center text-sm mt-1 gap-2.5">
                      <div 
                        className="w-2.5 h-2.5 rounded-full shadow-sm" 
                        style={{ backgroundColor: TEAM_COLORS[selectedRecord.team] || DEFAULT_TEAM_COLOR }} 
                      />
                      <span 
                        className="font-bold tracking-wide" 
                        style={{ color: TEAM_COLORS[selectedRecord.team] || DEFAULT_TEAM_COLOR }}
                      >
                        {selectedRecord.team}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                        {selectedRecord.model_name}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedRecord(null)}
                    className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors border border-slate-200"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* MODAL BODY */}
                <div className="overflow-y-auto p-6 flex-1 space-y-6 bg-slate-50/50">
                  
                  {/* METRIC CARDS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Overall Average (μ)</p>
                        <div className="flex items-end gap-1.5">
                          <span className="text-3xl font-black text-slate-900 font-mono leading-none">{selectedRecord.overall_average}</span>
                          <span className="text-slate-500 font-mono text-sm mb-0.5 font-bold">s</span>
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                        <Clock size={24} className="text-slate-400" />
                      </div>
                    </div>
                    
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">Hourly Target</p>
                        <div className="flex items-end gap-1.5">
                          <span className="text-3xl font-black text-indigo-700 font-mono leading-none">
                            {selectedRecord.cycles_per_hour || (3600 / selectedRecord.overall_average).toFixed(2)}
                          </span>
                          <span className="text-indigo-500/80 font-mono text-sm mb-0.5 font-bold">u/hr</span>
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-indigo-100/50 flex items-center justify-center border border-indigo-100">
                        <Activity size={24} className="text-indigo-600" />
                      </div>
                    </div>
                  </div>

                  {/* STAGE TABLE */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-widest">
                          <tr>
                            <th className="px-4 py-4 w-12 text-center">#</th>
                            <th className="px-4 py-4">Operation Description</th>
                            {[1, 2, 3, 4, 5].map((num) => (
                              <th key={num} className="px-3 py-4 text-center">C{num}</th>
                            ))}
                            <th className="px-4 py-4 text-right text-slate-700 bg-slate-100/50">Avg (sec)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {Array.isArray(selectedRecord.stages) && selectedRecord.stages.length > 0 ? (
                            (() => {
                              const highestStageValue = getHighestStageValue(selectedRecord.stages);
                              return selectedRecord.stages.map((stage, idx) => {
                                const counts = stage.counts || [];
                                const isBottleneck = highestStageValue > 0 && Number(stage.average) === highestStageValue;

                                return (
                                  <tr key={idx} className={`hover:bg-slate-50 transition-colors ${isBottleneck ? 'bg-red-50/50' : ''}`}>
                                    <td className="px-4 py-3.5 text-center font-mono font-medium text-slate-400 text-xs">{idx + 1}</td>
                                    
                                    <td className="px-4 py-3.5">
                                      <div className="flex items-center gap-3">
                                        <span className={`font-semibold ${isBottleneck ? 'text-red-700' : 'text-slate-800'}`}>
                                          {stage.description || 'Undefined Operation'}
                                        </span>
                                        {isBottleneck && (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-red-100 text-red-700 border border-red-200">
                                            Bottleneck
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {[0, 1, 2, 3, 4].map((i) => (
                                      <td key={i} className="px-3 py-3.5 text-center font-mono text-slate-500">
                                        {counts[i] || '-'}
                                      </td>
                                    ))}

                                    <td className={`px-4 py-3.5 text-right font-mono font-bold ${isBottleneck ? 'text-red-700 bg-red-50/80' : 'text-slate-900 bg-slate-50/50'}`}>
                                      {stage.average ? Number(stage.average).toFixed(2) : '-'}
                                    </td>
                                  </tr>
                                );
                              });
                            })()
                          ) : (
                            <tr>
                              <td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-sm italic font-medium">
                                No empirical cycle data recorded.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
