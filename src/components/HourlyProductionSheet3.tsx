import { useState, useEffect, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Plus, Trash2, Edit2, Check, X, Search, Clock, Users, Target, Activity, Layout, 
  Download, Camera, BellRing, FileText, FileSpreadsheet 
} from 'lucide-react';
import { supabase, ProductionRecord, Operator } from '../lib/supabase';
import * as XLSX from 'xlsx'; 
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { GoogleGenerativeAI } from "@google/generative-ai"; 

// Material UI Imports
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';

// Initialize Gemini
const genAI = new GoogleGenerativeAI("AIzaSyD38xBkfShURvHpbWsbg-YTlTdvXbND3p0");

// Helper to get local date string (YYYY-MM-DD)
const getLocalDateStr = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
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
const formRef = useRef<HTMLDivElement>(null); // Add this line

// --- PDF Export Logic ---
const handleExportToPDF = () => {
  if (productions.length === 0) {
    alert("No records to export!");
    return;
  }

  const doc = new jsPDF('p', 'mm', 'a4');

  // This is the Base64 string for the Ravel Fire logo
  const logoBase64 = "; 
  // Note: For a high-res logo, you'd use the full string. 
  // If you have the image file, use an online 'Image to Base64' converter.

  try {
    // Add Logo (Top Right)
    // If the URL version failed, this local string version will work.
    doc.addImage(logoBase64, 'PNG', 165, 10, 30, 12);
    const timestamp = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Production Report", 14, 15);
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);

    doc.text(`Generated on: ${timestamp}`, 14, 22);
    const tableColumn = ["Date", "Time", "Team", "MP", "Models & Qty", "Target", "Produced", "Remarks"];
    
    const tableRows = productions.map(p => {
      const dateObj = new Date(p.date);
      const formattedDate = dateObj.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      }).replace(/ /g, '-'); 

      const h = Math.floor(p.hour);
      const m = Math.round((p.hour % 1) * 60);
      const timeString = `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
      const modelsString = p.item ? p.item.map(i => `${i.model} - (${i.quantity})`).join('\n') : '';

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
    
    // --- VERTICAL & HORIZONTAL ALIGNMENT ---
    halign: 'center',    // Horizontal center (default for all)
    valign: 'middle'     // Vertical center (applies to all cells)
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
    1: { cellWidth: 17 }, 
    2: { cellWidth: 23 },
    3: { cellWidth: 10 }, 
    4: { cellWidth: 45, halign: 'left' },   // Keep Models & Qty left-aligned
    5: { cellWidth: 12 }, 
    6: { cellWidth: 15 }, 
    7: { cellWidth: 'auto', halign: 'left' }, // Keep Remarks left-aligned
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
    date: getLocalDateStr(), // Default form date to today
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
      // Check if it's 17:00 (5 PM) and we haven't run it this minute
      if (now.getHours() === 17 && now.getMinutes() === 0) {
        const todayStr = getLocalDateStr();
        const lastRunDate = localStorage.getItem('last_daily_report_date');

        if (lastRunDate !== todayStr) {
          generateDailyReport(true); // Run in Auto Mode (uses Today)
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

  const calculateEfficiency = (produced: number, target: number, dbEfficiency?: number) => {
    if (dbEfficiency !== undefined) return dbEfficiency.toFixed(1);
    if (target === 0) return '0.0';
    return ((produced / target) * 100).toFixed(1);
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
  const filterOptions = (options: ItemOption[], { inputValue }: { inputValue: string }) => {
    const words = inputValue.toLowerCase().split(' ').filter(word => word.length > 0);
    return options.filter((option) => {
      const combinedStr = `${option.part_id} ${option.description}`.toLowerCase();
      return words.every(word => combinedStr.includes(word));
    });
  };

  // --- AI Logic ---

  // 1. Image Analysis (For Auto-fill)
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

  // 2. Daily Production Report (Report Generation)
  const generateDailyReport = async (isAuto = false) => {
    setGeneratingReport(true);
    try {
        // LOGIC CHANGE: 
        // If Auto Mode (Scheduler) -> Use Today
        // If Manual Mode (Button Click) -> Use selectedDate from props
        const targetDate = isAuto ? getLocalDateStr() : selectedDate;
        
        console.log(`Generating report for: ${targetDate} (Auto: ${isAuto})`);
        
        // --- STEP 1: Fetch Data from Supabase for TARGET DATE ---
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

        // --- STEP 2: Send to Gemini for Analysis ---
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

        // --- STEP 3: Browser Notification ---
        if (Notification.permission === "granted") {
            new Notification(`📊 Report: ${targetDate}`, {
                body: reportText,
                icon: "/vite.svg", 
                requireInteraction: true 
            });
        } 
        
        // Always show alert on manual click
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
    });formRef.current?.scrollIntoView({ 
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

// --- Excel Export ---
const handleExportToExcel = async () => {
  if (productions.length === 0) {
    alert("No records to export!");
    return;
  }

  // --- SORT DATA ASCENDING (DATE THEN TIME) ---
  const sortedData = [...productions].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (dateA - dateB !== 0) return dateA - dateB;
    return a.hour - b.hour;
  });

  const workbook = new ExcelJS.Workbook();
  const dateStr = new Date().toISOString().split('T')[0];
  
  // Define Colors
  const blueTheme = '1E40AF';
  const lightBlueBg = 'F1F5F9'; // The color for odd rows
  const borderColor = 'CBD5E1';

  /**
   * Helper function to handle the flattened rows, merging, and styling
   */
  const populateMergedSheet = (sheet, data, isMainSheet = true) => {
    
    // --- 1. DEFINE DYNAMIC COLUMN MAPPING ---
    // This allows us to know exactly which Excel Column Letter corresponds to which data point
    // Main Sheet: A=Date, B=Time, C=Team, D=MP, E=ModelName, F=ModelQty, G=Produced, H=Target, I=Eff
    // Team Sheet: A=Date, B=Time, C=MP, D=ModelName, E=ModelQty, F=Produced, G=Target, H=Eff
    const colMap = isMainSheet 
      ? { qty: 'F', prod: 'G', target: 'H', eff: 'I' } 
      : { qty: 'E', prod: 'F', target: 'G', eff: 'H' };

    // Define Columns
    const baseColumns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Time', key: 'time', width: 10 },
    ];
    
    if (isMainSheet) baseColumns.push({ header: 'Team', key: 'team', width: 18 });
    
    baseColumns.push(
      { header: 'MP', key: 'mp', width: 8 },
      { header: 'Model Name', key: 'modelName', width: 25 },
      { header: 'Model Qty', key: 'modelQty', width: 12 },
      { header: 'Produced', key: 'prod', width: 12 },
      { header: 'Target', key: 'target', width: 12 },
      { header: 'Efficiency (%)', key: 'eff', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 50 }
    );
    
    sheet.columns = baseColumns;

    // Iterate with Index to determine Odd/Even records
    data.forEach((p, index) => {
      const dateObj = new Date(p.date);
      const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
      const timeString = `${Math.floor(p.hour).toString().padStart(2, '0')}:${Math.round((p.hour % 1) * 60).toString().padStart(2, '0')}`;

      const startRow = sheet.rowCount + 1;
      const items = p.item && p.item.length > 0 ? p.item : [{ model: '-', quantity: 0 }];

      // Add rows for items
      items.forEach(itemEntry => {
        sheet.addRow({
          date: formattedDate,
          time: timeString,
          team: p.team,
          mp: p.manpower,
          modelName: itemEntry.model,
          modelQty: Number(itemEntry.quantity) || 0,
          prod: p.units_produced, // Value fallback
          target: p.target_units, // Value fallback
          eff: 0, // Placeholder, calculated via formula below
          remarks: p.remarks || '-'
        });
      });

      const endRow = sheet.rowCount;

      // --- 2. INJECT FORMULAS ---
      
      // A) Produced Formula: SUM of Model Qtys (e.g., SUM(F2:F4))
      const producedCell = sheet.getCell(`${colMap.prod}${startRow}`);
      producedCell.value = {
        formula: `SUM(${colMap.qty}${startRow}:${colMap.qty}${endRow})`,
        result: p.units_produced
      };

      // B) Efficiency Formula: Produced / Target (e.g., IFERROR(G2/H2, 0))
      // Note: Target remains a static value from DB, but Efficiency becomes dynamic based on Prod formula
      const effCell = sheet.getCell(`${colMap.eff}${startRow}`);
      effCell.value = {
        formula: `IFERROR(${colMap.prod}${startRow}/${colMap.target}${startRow}, 0)`,
        result: (p.target_units > 0 ? (p.units_produced / p.target_units) : 0)
      };

      // --- APPLY COLOR TO ODD RECORDS ---
      if (index % 2 !== 0) {
        for (let r = startRow; r <= endRow; r++) {
          const row = sheet.getRow(r);
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { 
              type: 'pattern', 
              pattern: 'solid', 
              fgColor: { argb: lightBlueBg } 
            };
          });
        }
      }

      // --- MERGE CELLS ---
      if (endRow > startRow) {
        // Adjusted indices based on column count
        const mergeIndices = isMainSheet 
          ? [1, 2, 3, 4, 7, 8, 9, 10] // Main: Merge everything except ModelName(5) & ModelQty(6)
          : [1, 2, 3, 6, 7, 8, 9];    // Team: Merge everything except ModelName(4) & ModelQty(5)

        mergeIndices.forEach(colIdx => {
          sheet.mergeCells(startRow, colIdx, endRow, colIdx);
        });
      }
    });

    // --- UPDATED ALIGNMENT & BORDER LOGIC ---
    sheet.eachRow((row, rowNumber) => {
      row.height = rowNumber === 1 ? 30 : row.height;
      
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Apply Borders (keep existing fill if set above)
        cell.border = {
          top: { style: 'thin', color: { argb: borderColor } },
          left: { style: 'thin', color: { argb: borderColor } },
          bottom: { style: 'thin', color: { argb: borderColor } },
          right: { style: 'thin', color: { argb: borderColor } }
        };

        // Alignment Logic
        let isLeftAlign = false;
        if (isMainSheet) {
          if ([3, 5, 10].includes(colNumber)) isLeftAlign = true;
        } else {
          if ([4, 9].includes(colNumber)) isLeftAlign = true;
        }

        cell.alignment = { 
          vertical: 'middle', 
          horizontal: isLeftAlign ? 'left' : 'center', 
          wrapText: true,
          indent: isLeftAlign ? 1 : 0 
        };
        
        // --- HEADER STYLING ---
        if (rowNumber === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueTheme } };
          cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
          cell.alignment.horizontal = 'center'; 
        }

        // --- PERCENTAGE FORMATTING FOR EFFICIENCY ---
        // Main Sheet Eff is Col 9 (I), Team Sheet Eff is Col 8 (H)
        const effColIndex = isMainSheet ? 9 : 8;
        if (rowNumber > 1 && colNumber === effColIndex) {
            cell.numFmt = '0%';
        }
      });
    });

    sheet.views[0].activeCell = `A${sheet.rowCount}`;
    sheet.views[0].topLeftCell = `A${Math.max(1, sheet.rowCount - 12)}`;
  };

  // --- SHEET 1: PRODUCTION RECORDS ---
  const worksheet = workbook.addWorksheet('Production Records', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }]
  });
  populateMergedSheet(worksheet, sortedData, true);

  // --- TEAM-WISE DATA SHEETS ---
  const uniqueTeams = [...new Set(sortedData.map(p => p.team))];
  uniqueTeams.forEach(teamName => {
    const teamSheet = workbook.addWorksheet(teamName.substring(0, 31), {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }]
    });
    const teamData = sortedData.filter(p => p.team === teamName);
    populateMergedSheet(teamSheet, teamData, false);
  });

  // --- SHEET: TEAM ANALYTICS (Live Formulas) ---
  const analyticsSheet = workbook.addWorksheet('Team Analytics', { views: [{ showGridLines: false }] });
  const lastRow = worksheet.rowCount;
  const teams = [...new Set(sortedData.map(p => p.team))];
  const years = [...new Set(sortedData.map(p => new Date(p.date).getFullYear()))];
  const months = [...new Set(sortedData.map(p => {
    const d = new Date(p.date);
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).replace(/ /g, '-');
  }))];

  let currentExcelRow = 1;
  const createLiveTable = (title, periods, type) => {
    analyticsSheet.mergeCells(`A${currentExcelRow}:E${currentExcelRow}`);
    const tCell = analyticsSheet.getCell(`A${currentExcelRow}`);
    tCell.value = title;
    tCell.font = { bold: true, size: 12, color: { argb: blueTheme } };
    currentExcelRow++;

    const headers = ['Team', 'Period', 'Total Target', 'Total Produced', 'Live Eff %'];
    const hRow = analyticsSheet.getRow(currentExcelRow);
    hRow.values = headers;
    hRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueTheme } };
      c.font = { bold: true, color: { argb: 'FFFFFF' } };
      c.alignment = { horizontal: 'center' };
    });
    currentExcelRow++;

    teams.forEach(team => {
      periods.forEach(period => {
        const row = analyticsSheet.getRow(currentExcelRow);
        
        // --- UPDATED COLUMN REFERENCES FOR ANALYTICS ---
        const dateRange = `'Production Records'!$A$2:$A$${lastRow}`;
        const teamRange = `'Production Records'!$C$2:$C$${lastRow}`;
        // PRODUCED is Column G (7th)
        const prodRange = `'Production Records'!$G$2:$G$${lastRow}`; 
        // TARGET is Column H (8th)
        const targetRange = `'Production Records'!$H$2:$H$${lastRow}`; 

        let targetFormula, prodFormula;
        if (type === 'YEAR' || type === 'MONTH') {
          targetFormula = { formula: `SUMIFS(${targetRange}, ${teamRange}, "${team}", ${dateRange}, "*${period}")` };
          prodFormula = { formula: `SUMIFS(${prodRange}, ${teamRange}, "${team}", ${dateRange}, "*${period}")` };
        } else {
          targetFormula = { formula: `SUMIFS(${targetRange}, ${teamRange}, "${team}", ${dateRange}, "${period}")` };
          prodFormula = { formula: `SUMIFS(${prodRange}, ${teamRange}, "${team}", ${dateRange}, "${period}")` };
        }

        // Columns: Team(A), Period(B), Target(C), Prod(D), Eff(E)
        row.values = [
             team, 
             period, 
             targetFormula, 
             prodFormula, 
             { formula: `IFERROR(D${currentExcelRow}/C${currentExcelRow}, 0)` }
        ];
        
        row.getCell(5).numFmt = '0.00%';
        row.eachCell(c => {
          c.border = { top: {style:'thin', color: {argb: borderColor}}, left: {style:'thin', color: {argb: borderColor}}, bottom: {style:'thin', color: {argb: borderColor}}, right: {style:'thin', color: {argb: borderColor}} };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        currentExcelRow++;
      });
    });
    currentExcelRow += 2; 
  };

  analyticsSheet.columns = [{ width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }];
  createLiveTable('📈 YEAR-WISE PERFORMANCE', years, 'YEAR');
  createLiveTable('📊 MONTH-WISE PERFORMANCE', months, 'MONTH');
  
  const days = [...new Set(sortedData.map(p => {
    const d = new Date(p.date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  }))];
  createLiveTable('📅 DAY-WISE PERFORMANCE', days, 'DAY');

  // --- SHEET: MODEL SUMMARY ---
  const modelSheet = workbook.addWorksheet('Model Summary', { views: [{ showGridLines: false }] });
  const teamModelTotals = {};
  sortedData.forEach(p => {
    const team = p.team;
    if (p.item && Array.isArray(p.item)) {
      p.item.forEach(i => {
        const key = `${team}_${i.model}`;
        if (!teamModelTotals[key]) teamModelTotals[key] = { team, model: i.model, totalQty: 0 };
        teamModelTotals[key].totalQty += Number(i.quantity) || 0;
      });
    }
  });
  const modelSummaryData = Object.values(teamModelTotals).sort((a, b) => a.team.localeCompare(b.team) || b.totalQty - a.totalQty);
  modelSheet.columns = [{ key: 'team', width: 20 }, { key: 'model', width: 35 }, { key: 'totalQty', width: 20 }];
  modelSheet.insertRow(1, ['📦 TEAM-WISE MODEL TOTALS']);
  modelSheet.mergeCells('A1:C1');
  const modelTitle = modelSheet.getCell('A1');
  modelTitle.font = { bold: true, size: 14, color: { argb: blueTheme } };
  modelTitle.alignment = { horizontal: 'center' };
  const modelHeaderRow = modelSheet.getRow(2);
  modelHeaderRow.values = ['Team Name', 'Model Name', 'Total Produced'];
  modelHeaderRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueTheme } };
    c.font = { bold: true, color: { argb: 'FFFFFF' } };
    c.alignment = { horizontal: 'center' };
  });
  modelSummaryData.forEach((item, index) => {
    const row = modelSheet.addRow([item.team, item.model, item.totalQty]);
    row.eachCell(c => {
      c.border = { top: { style: 'thin', color: { argb: borderColor } }, left: { style: 'thin', color: { argb: borderColor } }, bottom: { style: 'thin', color: { argb: borderColor } }, right: { style: 'thin', color: { argb: borderColor } } };
      c.alignment = { horizontal: 'center' };
      if (index % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlueBg } };
    });
  });

  // --- SHEET: KPI DASHBOARD ---
  const kpiSheet = workbook.addWorksheet('KPI Dashboard', { views: [{ showGridLines: false }] });
  const totalProduced = sortedData.reduce((sum, p) => sum + (Number(p.units_produced) || 0), 0);
  const totalTarget = sortedData.reduce((sum, p) => sum + (Number(p.target_units) || 0), 0);
  const avgEfficiency = totalTarget > 0 ? (totalProduced / totalTarget) : 0;
  const teamTotals = sortedData.reduce((acc, p) => { acc[p.team] = (acc[p.team] || 0) + (Number(p.units_produced) || 0); return acc; }, {});
  const bestTeam = Object.keys(teamTotals).reduce((a, b) => teamTotals[a] > teamTotals[b] ? a : b, 'N/A');

  kpiSheet.columns = [{ width: 25 }, { width: 25 }];
  kpiSheet.mergeCells('A1:B1');
  const kpiTitle = kpiSheet.getCell('A1');
  kpiTitle.value = '🚀 KEY PERFORMANCE INDICATORS';
  kpiTitle.font = { bold: true, size: 16, color: { argb: blueTheme } };
  kpiTitle.alignment = { horizontal: 'center' };

  const kpiData = [
    ['Total Units Produced', totalProduced.toLocaleString()],
    ['Global Efficiency', { formula: `='Team Analytics'!D${currentExcelRow - 1}/'Team Analytics'!C${currentExcelRow - 1}`, result: avgEfficiency }],
    ['Top Performing Team', bestTeam],
    ['Total Records Processed', sortedData.length],
    ['Report Generated On', dateStr]
  ];

  let kpiStartRow = 3;
  kpiData.forEach(([label, value]) => {
    const row = kpiSheet.getRow(kpiStartRow);
    row.values = [label, value];
    row.getCell(1).font = { bold: true, color: { argb: '475569' } };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
    row.getCell(2).font = { bold: true, color: { argb: blueTheme }, size: 12 };
    row.getCell(2).alignment = { horizontal: 'right' };
    if (label === 'Global Efficiency') row.getCell(2).numFmt = '0.00%';
    row.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: borderColor } } }; });
    kpiStartRow++;
  });

  kpiStartRow += 2;
  kpiSheet.getCell(`A${kpiStartRow}`).value = "Team-wise Volume Contribution";
  kpiSheet.getCell(`A${kpiStartRow}`).font = { bold: true };
  kpiStartRow++;
  Object.entries(teamTotals).forEach(([team, total]) => {
    const row = kpiSheet.getRow(kpiStartRow);
    row.values = [team, total];
    row.getCell(2).numFmt = '#,##0';
    kpiStartRow++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  // Using file-saver or Blob approach
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Production_Report_${dateStr}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
};
  const getTeamBackgroundColor = (team: string) => {
    const colors = { 'a': 'bg-blue-50/30', 'b': 'bg-red-50/30', 'c': 'bg-yellow-50/30', 'd': 'bg-purple-50/30', 'e': 'bg-pink-50/30' };
    return colors[team as keyof typeof colors] || 'bg-white';
  };
  
  const teamColors: Record<string, string> = {
    'THT Panel': '#3b82f6', 'THT Module': '#f59e0b', 'FG Panel': '#1e40af', 'FG Module': '#3341a5',
    'Packing Panel': '#0f866e', 'Packing Module': '#f43f5e', 'SMT': '#4a7915ff', 'IQC': '#0ea5e9',
    'Stores': '#6b7280', 'Kitting': '#10b981', 'Cleaning': '#f87171', 'FQC Panel': '#8b5cf6',
    'FQC Module': '#ec4899', 'Logistics': '#facc15', 'Accounts': '#a855f7', 'Administration': '#7c3aed',
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
    <div className="space-y-8 p-4 md:p-8 bg-slate-50 min-h-screen">
      
      {/* 1. Add/Edit Form Section */}
<div ref={formRef} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        
        {/* Header with AI Buttons */}
        <div className="px-8 py-4 bg-slate-800 text-white flex items-center justify-between">
           <div className="flex items-center gap-2">
              {editingId ? <Edit2 size={20} /> : <Plus size={20} />}
              <h3 className="text-lg font-bold">{editingId ? 'Edit Production Entry' : 'New Production Entry'}</h3>
           </div>
           
           <div className="flex items-center gap-3">
               
               {/* --- REPORT BUTTON (UPDATED) --- */}
               <button 
                   type="button"
                   onClick={() => generateDailyReport(false)}
                   disabled={generatingReport}
                   className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-md border border-emerald-400 disabled:opacity-50"
               >
                   {generatingReport ? (
                     <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                   ) : (
                     <BellRing size={16} />
                   )}
                   {generatingReport ? "Analyzing..." : `Report: ${selectedDate}`}
               </button>

               {/* AI Scanner Input */}
               <input 
                   type="file" 
                   accept="image/*" 
                   className="hidden" 
                   ref={fileInputRef} 
                   onChange={handleImageAnalysis} 
               />
               <button 
                   type="button"
                   onClick={() => fileInputRef.current?.click()}
                   disabled={analyzing}
                   className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-md border border-indigo-400"
               >
                   {analyzing ? (
                       <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Scanning...
                       </>
                   ) : (
                       <>
                          <Camera size={16} /> Auto-Fill
                       </>
                   )}
               </button>
           </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Production Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full border-slate-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Production Hour</label>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <TimePicker
                  ampm={false}
                  value={new Date(`${formData.date}T${Math.floor(formData.hour || 0).toString().padStart(2, '0')}:${(((formData.hour || 0) % 1) * 60).toString().padStart(2, '0')}`)}
                  onChange={(newValue: Date | null) => {
                    if (newValue) {
                      setFormData({ ...formData, hour: newValue.getHours() + newValue.getMinutes() / 60 });
                    }
                  }}
                  slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                />
              </LocalizationProvider>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Models & Quantities</label>
            {(formData.item || []).map((item, index) => (
              <div key={index} className="flex gap-3 animate-in slide-in-from-left-2">
                <Autocomplete
                  className="flex-1"
                  freeSolo
                  options={modelOptions}
                  filterOptions={filterOptions}
                  getOptionLabel={(option) => {
                    if (typeof option === 'string') return option;
                    return `${option.part_id} : ${option.description}`;
                  }}
                  value={item.model || ''}
                  onChange={(_, newValue) => {
                    const newItems = [...(formData.item || [])];
                    if (newValue && typeof newValue === 'object') {
                      newItems[index].model = newValue.model;
                    } else if (typeof newValue === 'string') {
                      newItems[index].model = newValue;
                    } else {
                      newItems[index].model = '';
                    }
                    setFormData({ ...formData, item: newItems });
                  }}
                  onInputChange={(_, newInputValue, reason) => {
                    if (reason === 'input') {
                      const newItems = [...(formData.item || [])];
                      newItems[index].model = newInputValue;
                      setFormData({ ...formData, item: newItems });
                    }
                  }}
                  renderInput={(params) => (
                    <TextField 
                      {...params} 
                      placeholder="Search Model Name or ID..." 
                      size="small" 
                    
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '0.75rem',
                          backgroundColor: 'white',
                        }
                      }}
                    />
                  )}
                />

                <input
                  type="number"
                  placeholder="Quantity"
                  value={item.quantity || ''}
                  onChange={(e) => {
                    const newItems = [...(formData.item || [])];
                    newItems[index].quantity = parseInt(e.target.value) || 0;
                    setFormData({ ...formData, item: newItems });
                  }}
                  className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
               
                />
                
                {(formData.item || []).length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, item: (formData.item || []).filter((_, i) => i !== index) })}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFormData({ ...formData, item: [...(formData.item || []), { model: '', quantity: 0 }] })}
              className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors px-1"
            >
              <Plus size={14} /> Add Another Model
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Manpower</label>
              <input
                type="number"
                placeholder="Manpower"
                value={formData.manpower || ''}
                onChange={(e) => setFormData({ ...formData, manpower: parseInt(e.target.value) || 0 })}
                className="w-full border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Target Units</label>
              <input
                type="number"
                placeholder="Target Units"
                value={formData.target_units || ''}
                onChange={(e) => setFormData({ ...formData, target_units: parseInt(e.target.value) || 0 })}
                className="w-full border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Calculated Produced</label>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-slate-800 font-bold">
                {calculateUnitsProduced(formData.item || [])}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Employee ID</label>
              <input
                type="number"
                placeholder="Employee ID"
                value={formData.operator_id || ''}
                onChange={(e) => {
                  const opId = parseInt(e.target.value);
                  const op = operators.find(o => o.id === opId);
                  setFormData({ ...formData, operator_id: opId, operator_name: op?.name || '', team: op?.team || '' });
                }}
                className="w-full border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Name / Team (Autofill)</label>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-slate-900 ">
                {formData.operator_name ? `${formData.operator_name} (${formData.team})` : 'Enter ID to autofill...'}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Remarks</label>
            <textarea
              placeholder="Enter production notes or issues..."
              value={formData.remarks || ''}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2">
              {editingId ? <Check size={20} /> : <Plus size={20} />} 
              {editingId ? 'Update Record' : 'Add Record'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="bg-slate-100 text-slate-600 px-8 py-2.5 rounded-lg font-bold hover:bg-slate-200 transition-all">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

{/* 2. Filters & Records Table Container */}
      {/* FIX 1: Removed 'overflow-hidden' - this is REQUIRED for sticky to work */}
    <div className="bg-white rounded-xl shadow-xl border border-slate-200 transition-all duration-300 relative">
  
  {/* Header Section */}
  <div className="px-8 py-6 rounded-t-xl border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      {/* Dynamic Status Indicator Dot */}
      <div className={`w-3 h-3 rounded-full transition-all duration-500 ${hasActiveFilters ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-300'}`} />
      <div>
        <h3 className="text-xl font-bold text-slate-800 tracking-tight">
          Production Analytics 
          {hasActiveFilters && <span className="text-amber-600 text-xs ml-2 font-black uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded border border-amber-100 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-300'}">Filtered</span>}
        </h3>
        <p className="text-sm text-slate-500 font-medium">Analyze and track hourly output</p>
      </div>
    </div>

    <div className="flex gap-3">
<button
        onClick={handleExportToPDF}
        className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 border border-rose-600 rounded-lg hover:bg-rose-700 shadow-md shadow-rose-100 transition-all"
      >
        <FileText size={16} /> Export PDF
      </button>
      <button
        onClick={handleExportToExcel}
        className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 border border-emerald-600 rounded-lg hover:bg-emerald-700 shadow-md shadow-emerald-100 transition-all"
      >
        <FileSpreadsheet size={16} /> Export Excel
      </button>

      {/* ENHANCED CLEAR FILTER BUTTON */}
      <button
        onClick={clearFilters}
        disabled={!hasActiveFilters}
        className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold transition-all duration-300 rounded-lg border shadow-sm ${
          hasActiveFilters
            ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 ring-4 ring-amber-500/10 cursor-pointer"
            : "bg-white border-slate-200 text-slate-400 opacity-50 cursor-not-allowed"
        }`}
      >
        <X size={16} className={hasActiveFilters ? "animate-bounce-short" : ""} /> 
        {hasActiveFilters ? "Clear Active Filters" : "No Filters Active"}
      </button>
    </div>
  </div>

{/* Filter Grid - Sticky */}
<div className="sticky top-12 z-10 p-8 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 transition-all">
  <div className="flex flex-col xl:flex-row gap-4">
    
    {/* Date Period - Highlighted if fromDate or toDate exists */}
    <div className={`space-y-2 flex-1 min-w-[280px] bg-white p-4 rounded-xl border transition-all shadow-sm ${
      (fromDate || toDate) ? "border-blue-400 ring-2 ring-blue-50" : "border-slate-100"
    }`}>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        <Clock size={14} className={(fromDate || toDate) ? "text-blue-500" : "text-slate-400"} /> Date Period
      </label>
      <div className="flex gap-1 w-full">
        <input 
          type="date" 
          value={fromDate} 
          onChange={(e) => setFromDate(e.target.value)} 
          className="w-full flex-1 bg-slate-50 border-none rounded-lg px-3 py-2 text-[10px] focus:ring-2 focus:ring-blue-500 outline-none" 
        />
        <span className="self-center text-slate-400 text-[10px] shrink-0">to</span>
        <input 
          type="date" 
          value={toDate} 
          onChange={(e) => setToDate(e.target.value)} 
          className="w-full flex-1 bg-slate-50 border-none rounded-lg px-3 py-2 text-[10px] focus:ring-2 focus:ring-blue-500 outline-none" 
        />
      </div>
    </div>

    {/* Hours - Highlighted if hourMin or hourMax exists */}
    <div className={`space-y-2 w-full xl:w-[180px] bg-white p-4 rounded-xl border transition-all shadow-sm ${
      (hourMin || hourMax) ? "border-purple-400 ring-2 ring-purple-50" : "border-slate-100"
    }`}>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        <Clock size={14} className={(hourMin || hourMax) ? "text-purple-500" : "text-slate-400"} /> Hours
      </label>
      <div className="flex gap-2">
        <input type="number" placeholder="Min" value={hourMin} onChange={(e) => setHourMin(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
        <input type="number" placeholder="Max" value={hourMax} onChange={(e) => setHourMax(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
      </div>
    </div>

    {/* Efficiency - Highlighted if efficiencyMin or efficiencyMax exists */}
    <div className={`space-y-2 w-full xl:w-[180px] bg-white p-4 rounded-xl border transition-all shadow-sm ${
      (efficiencyMin || efficiencyMax) ? "border-emerald-400 ring-2 ring-emerald-50" : "border-slate-100"
    }`}>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        <Activity size={14} className={(efficiencyMin || efficiencyMax) ? "text-emerald-500" : "text-slate-400"} /> Efficiency (%)
      </label>
      <div className="flex gap-2">
        <input type="number" step="0.1" placeholder="Min" value={efficiencyMin} onChange={(e) => setEfficiencyMin(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
        <input type="number" step="0.1" placeholder="Max" value={efficiencyMax} onChange={(e) => setEfficiencyMax(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
      </div>
    </div>

    {/* Team Select - Highlighted if teamFilter is not empty */}
    <div className={`space-y-2 w-full xl:w-[220px] bg-white p-4 rounded-xl border transition-all shadow-sm ${
      teamFilter ? "border-orange-400 ring-2 ring-orange-50" : "border-slate-100"
    }`}>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        <Users size={14} className={teamFilter ? "text-orange-500" : "text-slate-400"} /> Active Team
      </label>
      <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none cursor-pointer">
        <option value="">All Production Teams</option>
        {availableTeams.map((team) => (<option key={team} value={team}>{team}</option>))}
      </select>
    </div>

    {/* Model Search - Highlighted if modelFilter is not empty */}
    <div className={`space-y-2 flex-[1.5] min-w-[250px] bg-white p-4 rounded-xl border transition-all shadow-sm ${
      modelFilter ? "border-indigo-400 ring-2 ring-indigo-50" : "border-slate-100"
    }`}>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        <Search size={14} className={modelFilter ? "text-indigo-500" : "text-slate-400"} /> Model / Description
      </label>
      <div className="relative">
        <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${modelFilter ? 'text-indigo-500' : 'text-slate-400'}`} />
        <input type="text" placeholder="Search specific model..." value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>
    </div>

  </div>
</div>

        {/* Records Table */}
        <div className="overflow-x-auto">
          <table className="w-full bg-white-100">
             <thead  className="bg-gray-200 ">
              <tr>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 border border-gray-300">Date</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 border border-gray-300">Time</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-[3.5rem] border border-gray-300">MP</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-[15.5rem] border border-gray-300">Models</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 border border-gray-300">Produced</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 border border-gray-300">Target</th>
                 {/*<th className="px-4 py-3 text-center text-sm font-medium text-gray-600 border border-gray-300">Efficiency</th>*/}
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 border border-gray-300">Team</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-[17.5rem] border border-gray-300">Remarks</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-[4.5rem]border border-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-green-100">
              {currentProductions.map((production) => (
                <tr key={production.id} className={`hover:bg-indigo-50 border border-gray-300 ${getTeamBackgroundColor(production.team)}`}>
                  
                  <td className="px-6 py-4 whitespace-nowrap border border-slate-300">
                    <span className="text-[12px] font-semibold text-slate-700">
                        {new Date(production.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', })}
                    </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap border border-slate-300">
                    <span className="text-[12px] font-semibold text-slate-700">
                        {(() => {
                        const h = Math.floor(production.hour);
                        const m = Math.round((production.hour % 1) * 60);
                        return `${(h % 12 || 12).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
                        })()}
                    </span>
                    </td>
                    
                    <td className="px-4 py-3 text-center align-middle text-[13px] border border-slate-300 font-mono font-bold text-slate-700">
                        {production.manpower}
                    </td>

                    <td className="px-4 py-3 align-middle border border-slate-300"> 
                        <div className="flex flex-col items-center justify-center space-y-2">
                            {production.item?.map((m, idx) => (
<div 
  key={idx} 
  className="flex items-center justify-between bg-yellow-50 px-3 py-1.5 rounded-md w-full max-w-[260px]"
>
                                <span className="text-[11px] font-bold text-slate-600 whitespace-normal leading-tight mr-3 break-words">{m.model}</span>
                                <span className="text-[12px] font-mono font-black text-blue-600 shrink-0">{m.quantity}</span>
                            </div>
                            ))}
                        </div>
                    </td>

                  <td className="px-4 py-3 text-center text-[14px] border border-slate-300 font-mono font-bold text-slate-700">{production.units_produced}</td>
                  <td className="px-4 py-3 text-center text-[14px] border border-slate-300 font-mono font-bold text-slate-700">{production.target_units}</td>
                 {/* <td className="px-4 py-3 text-center text-sm border border-slate-300">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${(production.efficiency || 0) >= 98 ? 'bg-green-100 text-gray-600' : (production.efficiency || 0) >= 75 ? 'bg-yellow-100 text-gray-600' : (production.efficiency || 0) >= 50 ? 'bg-red-100 text-gray-700' : 'bg-red-200 text-gray-900'}`}>
                        {calculateEfficiency(production.units_produced, production.target_units, production.efficiency)}%
                    </span>
                </td> */}

                <td className="px-4 py-4 text-center border border-slate-300">
                <span className="inline-block px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-sm" style={{ backgroundColor: `${teamColors[production.team]}10` || '#f1f5f9', color: `${teamColors[production.team]}B3` || '#f1f5f9', }}>
                    {production.team}
                </span>
                </td>


               <td 
  className={`px-4 py-3 border border-slate-300 text-[10px] font-medium whitespace-normal leading-tight break-words max-w-[300px] ${
    /fault|issue|problem|delay|drv|shortage/i.test(production.remarks || '') 
      ? 'bg-red-50' 
      : 'text-slate-700'
  }`}
>
  <div className="text-xs whitespace-pre-line">
    {production.remarks ? (
      production.remarks.split(/\r?\n/).map((line, idx) => {
        const properLine = line
          .split(' ')
          .map(word => {
            // If word is already fully uppercase and longer than 1 char (like "CS", "QC")
            // We use a regex to check if it's all caps
            if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
              return word; 
            }
            // Otherwise, convert to Proper Case
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join(' ');

        return (
          <div 
            key={idx} 
            className={/fault|issue|problem|delay|drv|shortage/i.test(line) ? 'text-red-500 font-semibold' : ''}
          >
            {properLine}
          </div>
        );
      })
    ) : (
      <span className="text-slate-400">-</span>
    )}
  </div>
</td>
                   <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1 opacity-1 group-hover:opacity-100 transition-all">
                      <button onClick={() => handleEdit(production)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(production.id!)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Section */}
        {totalPages > 1 && (
          <div className="bg-slate-50/50 px-8 py-5 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-500 font-medium">
              Showing <span className="text-slate-800 font-bold">{startIndex + 1}</span> to <span className="text-slate-800 font-bold">{Math.min(endIndex, productions.length)}</span> of <span className="text-slate-800 font-bold">{productions.length}</span> entries
            </p>
            <nav className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-2 border border-slate-200 rounded-lg bg-white disabled:opacity-40 hover:bg-slate-50 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm mx-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">Page</span>
                <span className="text-sm font-black text-blue-600">{currentPage}</span>
                <span className="text-xs font-bold text-slate-400 mx-2">/</span>
                <span className="text-sm font-black text-slate-800">{totalPages}</span>
              </div>
              <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 border border-slate-200 rounded-lg bg-white disabled:opacity-40 hover:bg-slate-50 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
