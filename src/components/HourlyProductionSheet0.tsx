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
  const logoBase64 = "data:image/png;base64,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"; 
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
