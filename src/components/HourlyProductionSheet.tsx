import { useState, useEffect, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Plus, Trash2, Edit2, Check, X, Search, Clock, Users, Target, Activity, Layout, 
  Download, Camera, BellRing, FileText, FileSpreadsheet, Copy 
} from 'lucide-react';
import { supabase, ProductionRecord, Operator } from '../lib/supabase';
import * as XLSX from 'xlsx'; 
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { GoogleGenerativeAI } from "@google/generative-ai"; 

// Initialize Gemini
const genAI = new GoogleGenerativeAI("AIzaSyD38xBkfShURvHpbWsbg-YTlTdvXbND3p0");

// Helper to get local date string (YYYY-MM-DD)
const getLocalDateStr = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

// Global Parsing Helpers
const parseDowntime = (remarks) => {
  if (!remarks) return { planned: 0, unplanned: 0 };
  let planned = 0;
  let unplanned = 0;
  const plannedRegex = /(?:break|change\s*over|setup|meeting)\s*(\d+)/gi;
  const unplannedRegex = /(?:delay|breakdown|power\s*cut|shortage)\s*(\d+)/gi;
  let match;
  while ((match = plannedRegex.exec(remarks)) !== null) {
    planned += parseInt(match[1]);
  }
  while ((match = unplannedRegex.exec(remarks)) !== null) {
    unplanned += parseInt(match[1]);
  }
  return { planned, unplanned };
};

const parseDefectsFromRemarks = (remarks) => {
  if (!remarks) return 0;
  let total = 0;
  const defectRegex = /(?:fault|damage|drv|missing)\s*(\d+)(?:\s*no['s]*|\s*nos)?/gi;
  let match;
  while ((match = defectRegex.exec(remarks)) !== null) {
    total += parseInt(match[1]);
  }
  return total;
};

// Global Time Formatter (9 -> 08:30 - 09:00, 10 -> 09:00 - 10:00)
const formatTimeRange = (hourNum) => {
  const endH = Math.floor(hourNum);
  const endM = Math.round((hourNum % 1) * 60);
  
  let startH = endH - 1;
  let startM = endM;
  
  // Special case: If end time is 09:00, start time becomes 08:30
  if (endH === 9 && endM === 0) {
    startH = 8;
    startM = 30;
  }

  const startStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
  const endStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  
  return `${startStr} - ${endStr}`;
};

interface HourlyProductionSheetProps {
  selectedDate: string;
}

interface ItemOption {
  part_id: string | number;
  description: string;
  model?: string;
}

export default function HourlyProductionSheet({ selectedDate }: HourlyProductionSheetProps) {
  const [productions, setProductions] = useState<ProductionRecord[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [modelOptions, setModelOptions] = useState<ItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filters & Pagination
  const [teamFilter, setTeamFilter] = useState('');
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [hourMin, setHourMin] = useState('');
  const [hourMax, setHourMax] = useState('');
  const [efficiencyMin, setEfficiencyMin] = useState('');
  const [efficiencyMax, setEfficiencyMax] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 50;

  const [error, setError] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // AI State
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // --- PDF Export Logic ---
  const handleExportToPDF = () => {
    if (productions.length === 0) {
      alert("No records to export!");
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const logoBase64 = ""; 

    try {
      if(logoBase64) doc.addImage(logoBase64, 'PNG', 165, 10, 30, 12);
      const timestamp = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Production Report", 14, 15);
      
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);

      doc.text(`Generated on: ${timestamp}`, 14, 22);
      const tableColumn = ["Date", "Time", "Team", "MP", "Models", "Target", "Produced", "Remarks"];
      
      const tableRows = productions.map(p => {
        const dateObj = new Date(p.date);
        const formattedDate = dateObj.toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric'
        }).replace(/ /g, '-'); 

        const timeString = formatTimeRange(p.hour);
        
        // Leaves quantity out of the PDF format
        const modelsString = p.item ? p.item.map(i => `${i.model}`).join('\n') : '';

        return [
          formattedDate, timeString, p.team, p.manpower,
          modelsString, p.target_units, p.units_produced, p.remarks || ''
        ];
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 30,
        styles: { 
          font: "helvetica", 
          fontSize: 7, 
          cellPadding: 1.5, 
          overflow: 'linebreak',
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          halign: 'center',
          valign: 'middle'
        },
        headStyles: { 
          fillColor: [30, 64, 175], 
          textColor: 255,
          halign: 'center',
          valign: 'middle' 
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 10, right: 10 },
        columnStyles: {
          0: { cellWidth: 20 }, 
          1: { cellWidth: 15 }, 
          2: { cellWidth: 23 },
          3: { cellWidth: 10 }, 
          4: { cellWidth: 40, halign: 'left' },
          5: { cellWidth: 12 }, 
          6: { cellWidth: 15 }, 
          7: { cellWidth: 'auto', halign: 'left' },
        }
      });
      const dateStr = new Date().toISOString().split('T')[0];
      doc.save(`Production_Report_${dateStr}.pdf`);
      
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("Failed to generate PDF. Check console for details.");
    }
  };

  const initialFormState: Partial<ProductionRecord> = {
    date: getLocalDateStr(),
    hour: 0,
    units_produced: 0,
    target_units: 0,
    manpower: 0,
    operator_id: undefined,
    operator_name: '',
    team: '',
    remarks: '',
    item: [{ model: '', quantity: 0 }],
  };

  const [formData, setFormData] = useState<Partial<ProductionRecord>>(initialFormState);

  // --- Data Fetching ---
  useEffect(() => {
    fetchProductions();
    fetchOperators();
    fetchModelsList();

    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  // --- Scheduler for 20:00 Daily Report (Auto Mode) ---
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      if (now.getHours() === 17 && now.getMinutes() === 0) {
        const todayStr = getLocalDateStr();
        const lastRunDate = localStorage.getItem('last_daily_report_date');

        if (lastRunDate !== todayStr) {
          generateDailyReport(true); 
          localStorage.setItem('last_daily_report_date', todayStr);
        }
      }
    };

    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchModelsList = async () => {
    const { data, error } = await supabase.from('items').select('part_id, description, model').order('description');
    if (!error && data) {
      const uniqueItems = data.filter((v, i, a) => a.findIndex(t => t.description === v.description) === i);
      setModelOptions(uniqueItems as ItemOption[]);
    }
  };

  const fetchOperators = async () => {
    const { data, error } = await supabase.from('operators').select('*').order('name');
    if (!error) setOperators(data || []);
  };

  const fetchProductions = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    let query = supabase.from('production_records').select('*').order('date', { ascending: false }).order('hour', { ascending: false });

    if (teamFilter) query = query.ilike('team', `%${teamFilter}%`);
    if (fromDate) query = query.gte('date', fromDate);
    if (toDate) query = query.lte('date', toDate);
    if (hourMin) query = query.gte('hour', parseFloat(hourMin));
    if (hourMax) query = query.lte('hour', parseFloat(hourMax));
    if (efficiencyMin) query = query.gte('efficiency', parseFloat(efficiencyMin));
    if (efficiencyMax) query = query.lte('efficiency', parseFloat(efficiencyMax));

    const { data, error } = await query;
    if (!error) {
      let filteredData = data || [];
      if (modelFilter) {
        const normalizedFilter = modelFilter.toLowerCase().replace(/\s+/g, '');
        filteredData = filteredData.filter(record =>
          record.item && record.item.some((item: any) =>
            item.model && item.model.toLowerCase().replace(/\s+/g, '').includes(normalizedFilter)
          )
        );
      }
      setProductions(filteredData);
      const uniqueTeams = [...new Set((data || []).map(record => record.team).filter(Boolean))].sort();
      setAvailableTeams(uniqueTeams);
    }
    if (showLoading) setLoading(false);
  }, [teamFilter, modelFilter, fromDate, toDate, hourMin, hourMax, efficiencyMin, efficiencyMax]);

  useEffect(() => {
    fetchProductions(true);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    fetchProductions(false);
  }, [teamFilter, modelFilter, fromDate, toDate, hourMin, hourMax, efficiencyMin, efficiencyMax]);

  // --- Helpers ---
  const calculateUnitsProduced = (items: { model: string; quantity: number | string }[]) => {
    return items.reduce((sum, item) => sum + (parseFloat(String(item.quantity)) || 0), 0);
  };

  const clearFilters = () => {
    setTeamFilter('');
    setModelFilter('');
    setFromDate('');
    setToDate('');
    setHourMin('');
    setHourMax('');
    setEfficiencyMin('');
    setEfficiencyMax('');
    setCurrentPage(1);
  };
  
  const hasActiveFilters = 
    fromDate !== "" || 
    toDate !== "" || 
    hourMin !== "" || 
    hourMax !== "" || 
    efficiencyMin !== "" || 
    efficiencyMax !== "" || 
    teamFilter !== "" || 
    modelFilter !== ""; 
  
  // --- AI Logic ---
  const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  };

  const handleImageAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    try {
      const model = genAI.getGenerativeModel({ 
       model: "gemini-2.5-flash", 
       generationConfig: { responseMimeType: "application/json" } 
      });

      const prompt = `Analyze this image of a production record log. Extract data: date (YYYY-MM-DD), hour (number), team, manpower, target_units, remarks, operator_name, items (array of {model, quantity}). Return JSON.`;
      const imagePart = await fileToGenerativePart(file);
      const result = await model.generateContent([prompt, imagePart as any]);
      const parsedData = JSON.parse(result.response.text());

      setFormData(prev => ({
        ...prev,
        ...parsedData,
        units_produced: Array.isArray(parsedData.items) ? calculateUnitsProduced(parsedData.items) : 0,
        item: Array.isArray(parsedData.items) ? parsedData.items : [{ model: '', quantity: 0 }]
      }));
      alert("Data auto-filled successfully!");
    } catch (err: any) {
      console.error("AI Error:", err);
      alert(`Failed to analyze: ${err.message}`);
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const generateDailyReport = async (isAuto = false) => {
    setGeneratingReport(true);
    try {
        const targetDate = isAuto ? getLocalDateStr() : selectedDate;
        
        const { data: records, error } = await supabase
            .from('production_records')
            .select('hour, team, target_units, units_produced, efficiency, remarks') 
            .eq('date', targetDate);

        if (error) {
            console.error("Supabase Error:", error);
            throw new Error("Database query failed");
        }

        if (!records || records.length === 0) {
            if (!isAuto) alert(`No production records found for ${targetDate}.`);
            setGeneratingReport(false);
            return;
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const prompt = `
            You are a Manufacturing Analyst. Here is the raw production data for DATE: ${targetDate} from the database.
            
            DATA: ${JSON.stringify(records)}

            Analyze this data and produce a daily summary notification text.
            Requirements:
            1. Calculate average efficiency.
            2. Identify the highest performing team.
            3. Highlight any critical issues mentioned in 'remarks' (look for words like issue, problem, delay, breakdown, material shortage).
            4. Keep it concise (under 130 words). Plain text only.
        `;

        const result = await model.generateContent(prompt);
        const reportText = result.response.text();

        if (Notification.permission === "granted") {
            new Notification(`📊 Report: ${targetDate}`, {
                body: reportText,
                icon: "/vite.svg", 
                requireInteraction: true 
            });
        } 
        
        if (!isAuto) {
          new Notification(`📊 Report: ${targetDate}`, {
                body: reportText,
                icon: "/vite.svg", 
                requireInteraction: true 
            });
        }

    } catch (err: any) {
        console.error("Report Gen Error:", err);
        if(!isAuto) alert(`Error analyzing data: ${err.message}`);
    } finally {
        setGeneratingReport(false);
    }
  };

  // --- Form Actions ---
  const resetForm = () => {
    setFormData(initialFormState);
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const calculatedUnitsProduced = calculateUnitsProduced(formData.item || []);
    const dataToSubmit = { ...formData, units_produced: calculatedUnitsProduced };

    if (editingId) {
      const { error } = await supabase
        .from('production_records')
        .update({ ...dataToSubmit, updated_at: new Date().toISOString() })
        .eq('id', editingId);

      if (error) {
        setErrorMessage('Failed to update record.');
      } else {
        resetForm();
        fetchProductions();
      }
    } else {
      const { data: existingRecords } = await supabase
        .from('production_records')
        .select('id')
        .eq('date', formData.date)
        .eq('hour', formData.hour)
        .eq('team', formData.team);

      if (existingRecords && existingRecords.length > 0) {
        setError('Duplicate entry for this date/hour/team.');
        return;
      }

      const { error } = await supabase.from('production_records').insert([dataToSubmit]);
      if (error) {
        setErrorMessage('Failed to add record.');
      } else {
        resetForm();
        fetchProductions();
      }
    }
  };

  const handleEdit = (production: ProductionRecord) => {
    const password = window.prompt("Enter password to edit:");
    if (password !== "787374") { alert("Incorrect password"); return; }
    setEditingId(production.id || null);
    setFormData({
      date: production.date,
      hour: production.hour,
      target_units: production.target_units,
      manpower: production.manpower,
      operator_id: production.operator_id,
      operator_name: production.operator_name,
      team: production.team,
      remarks: production.remarks || '',
      item: production.item && production.item.length > 0 ? production.item : [{ model: '', quantity: 0 }],
    });
    formRef.current?.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start' 
    });
  };

  const handleDelete = async (id: string) => {
    const password = window.prompt("Enter password to delete:");
    if (password !== "787374") { alert("Incorrect password"); return; }
    if (!confirm('Delete this record?')) return;
    await supabase.from('production_records').delete().eq('id', id);
    fetchProductions();
  };

  // --- COPY FULL TABLE LOGIC ---
  const handleCopyFullTable = () => {
    if (productions.length === 0) {
      alert("No records to copy!");
      return;
    }

    const sortedData = [...productions].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      return a.hour - b.hour;
    });

    const headers = [
      "Date", "Time", "Team", "MP", "Model Name", "Produced", "Target", 
      "Planned DT", "Unplanned DT", "Defect Qty", "Remarks"
    ];

    // Wraps multiline content in double quotes to prevent breaking rows in Excel
    const formatForExcel = (val: string | number | null | undefined) => {
      const str = String(val || '');
      if (str.includes('\n') || str.includes('\t') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rowsData = sortedData.map(p => {
      const dateObj = new Date(p.date);
      const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeString = formatTimeRange(p.hour);
      
      const items = p.item && p.item.length > 0 ? p.item : [];
      // Omit quantity from the copy clipboard text
      const modelsString = items.map(i => `${i.model}`).join('\n') || '-';

      const dt = parseDowntime(p.remarks);
      const defectFromRemarks = parseDefectsFromRemarks(p.remarks);
      const finalDefectQty = (Number(p.defect_qty) || 0) + defectFromRemarks;

      return [
        formattedDate,
        timeString,
        p.team,
        p.manpower,
        formatForExcel(modelsString),
        p.units_produced,
        p.target_units,
        dt.planned === 0 ? '' : dt.planned,
        dt.unplanned === 0 ? '' : dt.unplanned,
        finalDefectQty === 0 ? '' : finalDefectQty,
        formatForExcel(p.remarks || '-')
      ].join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rowsData].join('\n');

    navigator.clipboard.writeText(tsvContent).then(() => {
      if (Notification.permission === "granted") {
        new Notification("📋 Copied!", {
          body: "Full table copied to clipboard successfully! You can paste it into Excel.",
          icon: "/vite.svg"
        });
      } else {
        alert("Full table copied to clipboard successfully! You can paste it into Excel.");
      }
    }).catch(err => {
      console.error('Failed to copy table data: ', err);
      if (Notification.permission === "granted") {
        new Notification("⚠️ Copy Failed", {
          body: "Failed to copy table. Please check browser permissions.",
          icon: "/vite.svg"
        });
      } else {
        alert('Failed to copy table. Please check browser permissions.');
      }
    });
  };

  // --- Excel Export Function ---
  const handleExportToExcel = async () => {
    if (productions.length === 0) {
      alert("No records to export!");
      return;
    }

    const sortedData = [...productions].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateA - dateB !== 0) return dateA - dateB;
      return a.hour - b.hour;
    });

    const workbook = new ExcelJS.Workbook();
    const dateStr = new Date().toISOString().split('T')[0];
    
    const blueTheme = '1E40AF';
    const lightBlueBg = 'F1F5F9'; 
    const borderColor = 'CBD5E1';

    const populateMergedSheet = (sheet, data, isMainSheet = true) => {
      const baseColumns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Time', key: 'time', width: 15 },
      ];
      
      if (isMainSheet) baseColumns.push({ header: 'Team', key: 'team', width: 18 });
      
      baseColumns.push(
        { header: 'MP', key: 'mp', width: 8 },
        { header: 'Model Name', key: 'modelName', width: 35 },
        { header: 'Produced', key: 'modelQty', width: 15 },
        { header: 'Target', key: 'target', width: 12 },
        { header: 'Planned DT', key: 'pdt', width: 15 },
        { header: 'Unplanned DT', key: 'udt', width: 18 },
        { header: 'Defect Qty', key: 'defect', width: 12 },
        { header: 'Remarks', key: 'remarks', width: 50 }
      );
      
      sheet.columns = baseColumns;

      data.forEach((p, index) => {
        const dateObj = new Date(p.date);
        const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
        
        const timeString = formatTimeRange(p.hour);

        const items = p.item && p.item.length > 0 ? p.item : [{ model: '-', quantity: 0 }];
        const combinedModels = items.map(i => i.model).join('\n');
        const qtyArray = items.map(i => Number(i.quantity) || 0);
        const sumQtys = qtyArray.reduce((acc, curr) => acc + curr, 0);

        const dt = parseDowntime(p.remarks);
        const defectFromRemarks = parseDefectsFromRemarks(p.remarks);
        const finalDefectQty = (Number(p.defect_qty) || 0) + defectFromRemarks;

        const row = sheet.addRow({
          date: formattedDate,
          time: timeString,
          team: p.team,
          mp: p.manpower,
          modelName: combinedModels,
          modelQty: qtyArray.length > 1 ? { formula: qtyArray.join('+'), result: sumQtys } : sumQtys,
          target: p.target_units,
          pdt: dt.planned === 0 ? null : dt.planned,
          udt: dt.unplanned === 0 ? null : dt.unplanned,
          defect: finalDefectQty === 0 ? null : finalDefectQty,
          remarks: p.remarks || '-'
        });

        if (index % 2 !== 0) {
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlueBg } };
          });
        }
      });

      sheet.eachRow((row, rowNumber) => {
        row.height = rowNumber === 1 ? 30 : row.height;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = {
            top: { style: 'thin', color: { argb: borderColor } },
            left: { style: 'thin', color: { argb: borderColor } },
            bottom: { style: 'thin', color: { argb: borderColor } },
            right: { style: 'thin', color: { argb: borderColor } }
          };

          let isLeftAlign = isMainSheet ? [5, 11].includes(colNumber) : [4, 10].includes(colNumber);
          cell.alignment = { 
            vertical: 'middle', 
            horizontal: isLeftAlign ? 'left' : 'center', 
            wrapText: true,
            indent: isLeftAlign ? 1 : 0 
          };
          
          if (rowNumber === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueTheme } };
            cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
          }

          const pdtCol = isMainSheet ? 8 : 7;
          const udtCol = isMainSheet ? 9 : 8;
          if (rowNumber > 1 && [pdtCol, udtCol].includes(colNumber)) {
              cell.numFmt = '0;-0;;@'; 
          }
        });
      });

      const lastRow = sheet.rowCount;
      sheet.views = [{ 
        state: 'frozen', 
        ySplit: 1, 
        showGridLines: false, 
        activeCell: `A${lastRow}`, 
        topRow: lastRow 
      }];
    };

    const worksheet = workbook.addWorksheet('Production Records');
    populateMergedSheet(worksheet, sortedData, true);

    const uniqueTeams = [...new Set(sortedData.map(p => p.team))];
    uniqueTeams.forEach(teamName => {
      const teamSheet = workbook.addWorksheet(teamName.substring(0, 31));
      populateMergedSheet(teamSheet, sortedData.filter(p => p.team === teamName), false);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Production_Report_${dateStr}.xlsx`;
    anchor.click();
  };

  const getTeamBackgroundColor = (team: string) => {
    const colors = { 'a': 'bg-blue-50/30', 'b': 'bg-red-50/30', 'c': 'bg-yellow-50/30', 'd': 'bg-purple-50/30', 'e': 'bg-pink-50/30' };
    return colors[team as keyof typeof colors] || 'bg-white';
  };
  
  const teamColors: Record<string, string> = {
    'THT Panel': '#3b82f6', 'THT Accessories': '#f59e0b', 'FG Panel': '#1e40af', 'FG Accessories': '#3341a5',
    'Packing Panel': '#0f866e', 'Packing Accessories': '#f43f5e', 'SMT': '#4a7915ff', 'IQC': '#0ea5e9',
    'Stores': '#6b7280', 'Kitting': '#10b981', 'Cleaning': '#f87171', 'FQC Panel': '#8b5cf6',
    'FQC Accessories': '#ec4899', 'Logistics': '#facc15', 'Accounts': '#a855f7', 'Administration': '#7c3aed',
    'Customer Support': '#14b8a6', 'D&D': '#e11d48', 'Engineering': '#2563eb', 'Fabrication': '#f97316',
    'Human Resources': '#6366f1', 'IT': '#e879f9', 'Maintenance': '#9ca3af', 'Products': '#65a30d',
    'Sales & Marketing': '#db2777', 'SAP': '#0284c7', 'SCM': '#d97706',
  };

  const totalPages = Math.ceil(productions.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const currentProductions = productions.slice(startIndex, endIndex);

  if (loading) return (
    <div className="flex justify-center p-12 items-center space-x-2 text-slate-500 font-medium">
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <span>Syncing Production Records...</span>
    </div>
  );

  return (
    <div className="space-y-4 p-4 md:p-6 bg-slate-50 min-h-screen">
      
      {/* Filters & Records Table Container */}
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 transition-all duration-300 relative">
        
        {/* COMPACT Header Section */}
        <div className="px-5 py-3 rounded-t-xl border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${hasActiveFilters ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-300'}`} />
            <div>
              <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                Production Analytics 
                {hasActiveFilters && <span className="text-amber-600 text-[10px] font-black uppercase tracking-widest bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]">Filtered</span>}
              </h3>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleExportToPDF}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 border border-rose-600 rounded-lg hover:bg-rose-700 shadow-sm transition-all"
            >
              <FileText size={14} /> Export PDF
            </button>
            <button
              onClick={handleExportToExcel}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 border border-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition-all"
            >
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <button
              onClick={handleCopyFullTable}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition-all"
            >
              <Copy size={14} /> Copy Table
            </button>

            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all duration-300 rounded-lg border shadow-sm ${
                hasActiveFilters
                  ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 ring-2 ring-amber-500/10 cursor-pointer"
                  : "bg-white border-slate-200 text-slate-400 opacity-50 cursor-not-allowed"
              }`}
            >
              <X size={14} className={hasActiveFilters ? "animate-bounce-short" : ""} /> 
              {hasActiveFilters ? "Clear Filters" : "No Filters"}
            </button>
          </div>
        </div>

        {/* COMPACT Filter Grid - Sticky */}
        <div className="sticky top-12 z-10 px-5 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 transition-all">
          <div className="flex flex-col xl:flex-row gap-3">
            
            {/* Date Period */}
            <div className={`flex flex-col flex-1 min-w-[220px] bg-white p-2.5 rounded-lg border transition-all shadow-sm ${
              (fromDate || toDate) ? "border-blue-400 ring-1 ring-blue-50" : "border-slate-100"
            }`}>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Clock size={12} className={(fromDate || toDate) ? "text-blue-500" : "text-slate-400"} /> Date Period
              </label>
              <div className="flex gap-1 w-full items-center">
                <input 
                  type="date" 
                  value={fromDate} 
                  onChange={(e) => setFromDate(e.target.value)} 
                  className="w-full flex-1 bg-slate-50 border-none rounded-md px-2 py-1 text-[11px] focus:ring-1 focus:ring-blue-500 outline-none" 
                />
                <span className="text-slate-400 text-[10px] shrink-0">to</span>
                <input 
                  type="date" 
                  value={toDate} 
                  onChange={(e) => setToDate(e.target.value)} 
                  className="w-full flex-1 bg-slate-50 border-none rounded-md px-2 py-1 text-[11px] focus:ring-1 focus:ring-blue-500 outline-none" 
                />
              </div>
            </div>

            {/* Hours */}
            <div className={`flex flex-col w-full xl:w-[150px] bg-white p-2.5 rounded-lg border transition-all shadow-sm ${
              (hourMin || hourMax) ? "border-purple-400 ring-1 ring-purple-50" : "border-slate-100"
            }`}>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Clock size={12} className={(hourMin || hourMax) ? "text-purple-500" : "text-slate-400"} /> Hours
              </label>
              <div className="flex gap-1.5">
                <input type="number" placeholder="Min" value={hourMin} onChange={(e) => setHourMin(e.target.value)} className="w-full bg-slate-50 border-none rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-purple-500 outline-none" />
                <input type="number" placeholder="Max" value={hourMax} onChange={(e) => setHourMax(e.target.value)} className="w-full bg-slate-50 border-none rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-purple-500 outline-none" />
              </div>
            </div>

            {/* Efficiency */}
            <div className={`flex flex-col w-full xl:w-[150px] bg-white p-2.5 rounded-lg border transition-all shadow-sm ${
              (efficiencyMin || efficiencyMax) ? "border-emerald-400 ring-1 ring-emerald-50" : "border-slate-100"
            }`}>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Activity size={12} className={(efficiencyMin || efficiencyMax) ? "text-emerald-500" : "text-slate-400"} /> Efficiency (%)
              </label>
              <div className="flex gap-1.5">
                <input type="number" step="0.1" placeholder="Min" value={efficiencyMin} onChange={(e) => setEfficiencyMin(e.target.value)} className="w-full bg-slate-50 border-none rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 outline-none" />
                <input type="number" step="0.1" placeholder="Max" value={efficiencyMax} onChange={(e) => setEfficiencyMax(e.target.value)} className="w-full bg-slate-50 border-none rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 outline-none" />
              </div>
            </div>

            {/* Team Select */}
            <div className={`flex flex-col w-full xl:w-[180px] bg-white p-2.5 rounded-lg border transition-all shadow-sm ${
              teamFilter ? "border-orange-400 ring-1 ring-orange-50" : "border-slate-100"
            }`}>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Users size={12} className={teamFilter ? "text-orange-500" : "text-slate-400"} /> Active Team
              </label>
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="w-full bg-slate-50 border-none rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-orange-500 outline-none cursor-pointer">
                <option value="">All Teams</option>
                {availableTeams.map((team) => (<option key={team} value={team}>{team}</option>))}
              </select>
            </div>

            {/* Model Search */}
            <div className={`flex flex-col flex-[1.5] min-w-[200px] bg-white p-2.5 rounded-lg border transition-all shadow-sm ${
              modelFilter ? "border-indigo-400 ring-1 ring-indigo-50" : "border-slate-100"
            }`}>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Search size={12} className={modelFilter ? "text-indigo-500" : "text-slate-400"} /> Model / Desc
              </label>
              <div className="relative">
                <Search size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${modelFilter ? 'text-indigo-500' : 'text-slate-400'}`} />
                <input type="text" placeholder="Search specific model..." value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className="w-full bg-slate-50 border-none rounded-md pl-8 pr-3 py-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none" />
              </div>
            </div>

          </div>
        </div>

        {/* COMPACT Records Table - Copy-Paste Optimized */}
        <div className="overflow-x-auto">
          <table className="w-full bg-white-100 text-left border-collapse" style={{ borderCollapse: 'collapse' }}>
            <thead className="bg-gray-200">
              <tr>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300">Date</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300 w-[5rem]">Time</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300">Team</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300 w-[3rem]">MP</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300 w-[14rem]">Model Name</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300">Produced</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300">Target</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300">Planned DT</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300">Unplanned DT</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300">Defect Qty</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 border border-gray-300 w-[15rem]">Remarks</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 w-[4rem] border border-gray-300 select-none">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {currentProductions.map((production) => {
                
                const timeString = formatTimeRange(production.hour);

                // Models Render Logic: Shows the quantity in UI, but make it select-none so it skips manual highlighting
                const modelsContent = production.item && production.item.length > 0 
                  ? production.item.map((m, idx, arr) => (
                      <span key={idx}>
                        {m.model}
                        <span className="select-none opacity-60"> ({m.quantity})</span>
                        {idx < arr.length - 1 && <br />}
                      </span>
                    ))
                  : '-';

                const remarksContent = production.remarks
                  ? production.remarks.split(/\r?\n/).map((line, idx, arr) => (
                      <span key={idx}>
                        {line}
                        {idx < arr.length - 1 && <br />}
                      </span>
                    ))
                  : '-';

                // Parse downtimes and defects for UI display
                const dt = parseDowntime(production.remarks);
                const defectFromRemarks = parseDefectsFromRemarks(production.remarks);
                const finalDefectQty = (Number(production.defect_qty) || 0) + defectFromRemarks;

                return (
                  <tr key={production.id} className={`group hover:bg-indigo-50 border border-gray-300 transition-colors ${getTeamBackgroundColor(production.team)}`}>
                    
                    <td className="px-2 py-1.5 whitespace-nowrap border border-slate-300 text-center text-[11px] font-medium text-slate-700">
                      {new Date(production.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>

                    <td className="px-2 py-1.5 whitespace-nowrap border border-slate-300 text-center text-[11px] font-medium text-slate-700">
                      {timeString}
                    </td>

                    <td 
                      className="px-2 py-1.5 text-center border border-slate-300 text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: teamColors[production.team] || '#475569' }}
                    >
                      {production.team}
                    </td>
                      
                    <td className="px-2 py-1.5 text-center align-middle text-[11px] border border-slate-300 font-mono font-bold text-slate-700">
                      {production.manpower}
                    </td>

                    <td 
                      className="px-2 py-1.5 align-middle border border-slate-300 text-[11px] font-mono font-bold text-slate-700"
                      style={{ whiteSpace: 'pre-wrap' }}
                    > 
                      {modelsContent}
                    </td>

                    <td className="px-2 py-1.5 text-center text-[12px] border border-slate-300 font-mono font-bold text-slate-700">
                      {production.units_produced}
                    </td>
                    
                    <td className="px-2 py-1.5 text-center text-[12px] border border-slate-300 font-mono font-bold text-slate-700">
                      {production.target_units}
                    </td>

                    <td className="px-2 py-1.5 text-center text-[12px] border border-slate-300 font-mono text-slate-700">
                      {dt.planned === 0 ? '' : dt.planned}
                    </td>

                    <td className="px-2 py-1.5 text-center text-[12px] border border-slate-300 font-mono text-slate-700">
                      {dt.unplanned === 0 ? '' : dt.unplanned}
                    </td>

                    <td className="px-2 py-1.5 text-center text-[12px] border border-slate-300 font-mono text-slate-700">
                      {finalDefectQty === 0 ? '' : finalDefectQty}
                    </td>

                    <td 
                      className={`px-2 py-1.5 border border-slate-300 text-[11px] font-medium min-w-[10rem] ${
                        /fault|issue|problem|delay|drv|shortage/i.test(production.remarks || '') 
                          ? 'bg-red-50 text-red-700 font-bold' 
                          : 'text-slate-700'
                      }`}
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      {remarksContent}
                    </td>
                    
                    <td className="px-2 py-1.5 text-right border border-slate-300 align-middle select-none">
                      <div className="flex justify-center gap-1 opacity-20 group-hover:opacity-100 transition-all">
                        <button onClick={() => handleEdit(production)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(production.id!)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Section */}
        {totalPages > 1 && (
          <div className="bg-slate-50/50 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
            <p className="text-[11px] text-slate-500 font-medium">
              Showing <span className="text-slate-800 font-bold">{startIndex + 1}</span> to <span className="text-slate-800 font-bold">{Math.min(endIndex, productions.length)}</span> of <span className="text-slate-800 font-bold">{productions.length}</span> entries
            </p>
            <nav className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-1.5 border border-slate-200 rounded-md bg-white disabled:opacity-40 hover:bg-slate-50 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="flex items-center px-3 py-1 bg-white border border-slate-200 rounded-md shadow-sm mx-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">Page</span>
                <span className="text-xs font-black text-blue-600">{currentPage}</span>
                <span className="text-[10px] font-bold text-slate-400 mx-1.5">/</span>
                <span className="text-xs font-black text-slate-800">{totalPages}</span>
              </div>
              <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-1.5 border border-slate-200 rounded-md bg-white disabled:opacity-40 hover:bg-slate-50 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
