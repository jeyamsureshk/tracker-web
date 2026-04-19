import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Plus, Trash2, Edit2, Check, X, Download, Camera, Save, Clock, Layers, Sparkles, HelpCircle
} from 'lucide-react';
import { supabase, ProductionRecord, Operator } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Material UI Imports
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';

// Initialize Gemini
const genAI = new GoogleGenerativeAI("AIzaSyD38xBkfShURvHpbWsbg-YTlTdvXbND3p0");

interface HourlyProductionSheetProps {
  selectedDate: string;
}

interface ItemOption {
  part_id: string | number;
  description: string;
  model?: string;
}

interface BatchRow {
    localId: number;
    hour: number;
    manpower: number;
    target_units: number;
    units_produced: number;
    remarks: string;
    item: { model: string; quantity: number }[];
}

export default function HourlyProductionSheet({ selectedDate }: HourlyProductionSheetProps) {
  const [productions, setProductions] = useState<ProductionRecord[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [modelOptions, setModelOptions] = useState<ItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 50;

  // --- GLOBAL CONTEXT ---
  const [globalDate, setGlobalDate] = useState(new Date().toISOString().split('T')[0]);
  const [operatorInputId, setOperatorInputId] = useState<string>('');
  const [matchedOperator, setMatchedOperator] = useState<Operator | null>(null);

  // --- BATCH ROW STATE ---
  const [inputRows, setInputRows] = useState<BatchRow[]>([{
      localId: Date.now(),
      hour: new Date().getHours(),
      manpower: 0,
      target_units: 0,
      units_produced: 0,
      remarks: '',
      item: [{ model: '', quantity: 0 }]
  }]);

  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- INIT ---
  useEffect(() => { fetchProductions(); fetchOperators(); fetchModelsList(); }, []);
  
  useEffect(() => {
    if (!operatorInputId) { setMatchedOperator(null); return; }
    const found = operators.find(op => op.id.toString() === operatorInputId.toString());
    setMatchedOperator(found || null);
  }, [operatorInputId, operators]);

  useEffect(() => { fetchProductions(true); }, [globalDate, matchedOperator]);

  const fetchModelsList = async () => {
    const { data } = await supabase.from('items').select('part_id, description, model').order('description');
    if (data) {
      const uniqueItems = data.filter((v, i, a) => a.findIndex(t => t.description === v.description) === i);
      setModelOptions(uniqueItems as ItemOption[]);
    }
  };

  const fetchOperators = async () => {
    const { data } = await supabase.from('operators').select('*').order('name');
    if (data) setOperators(data || []);
  };

  const fetchProductions = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    let query = supabase.from('production_records').select('*').order('date', { ascending: false }).order('hour', { ascending: false }).eq('date', globalDate);
    if (matchedOperator) query = query.eq('team', matchedOperator.team);
    const { data } = await query;
    if (data) setProductions(data);
    if (showLoading) setLoading(false);
  }, [globalDate, matchedOperator]);

  // --- HELPERS ---
  const calculateUnitsProduced = (items: any[]) => items.reduce((sum, item) => sum + (parseFloat(String(item.quantity)) || 0), 0);
  
  const calculateEfficiency = (produced: number, target: number) => {
    if (target === 0) return '0.0';
    return ((produced / target) * 100).toFixed(1);
  };

  // --- BATCH LOGIC ---
  const handleAddHourRow = () => {
    const lastRow = inputRows[inputRows.length - 1];
    setInputRows([...inputRows, { ...lastRow, localId: Date.now(), hour: (lastRow.hour + 1) % 24, item: [{ model: '', quantity: 0 }], target_units: 0, units_produced: 0, remarks: '' }]);
  };

  const handleRemoveRow = (index: number) => {
      if (inputRows.length > 1) setInputRows(inputRows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: string, value: any) => {
      const newRows: any = [...inputRows];
      newRows[index][field] = value;
      setInputRows(newRows);
  };

  const updateRowItems = (rowIndex: number, newItems: any[]) => {
      const newRows = [...inputRows];
      newRows[rowIndex] = { ...newRows[rowIndex], item: newItems, units_produced: calculateUnitsProduced(newItems) };
      setInputRows(newRows);
  };

  // --- AI LOGIC (UPDATED FOR + SYMBOL) ---
  const fileToGenerativePart = async (file: File) => {
    return new Promise<{ inlineData: { data: string; mimeType: string } }>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = (reader.result as string).split(',')[1];
            resolve({ inlineData: { data: base64Data, mimeType: file.type } });
        };
        reader.readAsDataURL(file);
    });
  };

 const handleImageAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    try {
      // 1. Initialize Model with specific JSON config
      const model = genAI.getGenerativeModel({ 
       model: "gemini-2.5-flash",
        // This forces the AI to return ONLY JSON, preventing parsing errors
        generationConfig: { responseMimeType: "application/json" } 
      });
        // --- UPDATED PROMPT ---
        const prompt = `
            Analyze this production log image. Extract data into JSON.
            
            CRITICAL RULE FOR MULTIPLE HOUR:If a row contains Two hours one bye one (e.g., "10:00 and 11:00"), 
            you MUST split them into separate two hour(e.g., 10:00,11:00),
            - Skip the first hour
            - Take the second hour to the hour input make 24 hours, increased only

            CRITICAL RULE FOR MULTIPLE ITEMS:
            If a row contains a '+' symbol in the Model or Quantity column (e.g., "ModelA + ModelB" or "50 + 30"), 
            you MUST split them into separate objects in the 'items' array.
            - Match the first model to the first quantity.
            - Match the second model to the second quantity.

            Return format:
            {
               "date": "YYYY-MM-DD",
               "operator_id": number,
               "records": [
                  { 
                    "hour": 9, 
                    "manpower": 5, 
                    "target_units": 100, 
                    "remarks": "", 
                    "items": [
                        { "model": "A1", "quantity": 50 },
                        { "model": "B2", "quantity": 30 }
                    ] 
                  }
               ]
            }
        `;

        const imagePart = await fileToGenerativePart(file);
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();
        const parsedData = JSON.parse(responseText);

        if (parsedData.date) setGlobalDate(parsedData.date);
        if (parsedData.operator_id) setOperatorInputId(parsedData.operator_id.toString());

        if (parsedData.records && parsedData.records.length > 0) {
            const mappedRows = parsedData.records.map((rec: any) => ({
                localId: Math.random(),
                hour: rec.hour || 0,
                manpower: rec.manpower || 0,
                target_units: rec.target_units || 0,
                units_produced: rec.items ? calculateUnitsProduced(rec.items) : 0,
                remarks: rec.remarks || '',
                item: rec.items || [{ model: '', quantity: 0 }]
            }));
            setInputRows(mappedRows);
            alert(`Success! Loaded ${mappedRows.length} rows.`);
        } else {
            alert("No rows found.");
        }

    } catch (error: any) {
        console.error("AI Error:", error);
        if (error.message.includes("404")) {
            alert("Error: Model not found. Try changing 'gemini-1.5-flash-latest' to 'gemini-1.5-pro' in the code.");
        } else {
            alert(`Scan failed: ${error.message}`);
        }
    } finally {
        setAnalyzing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- SUBMIT ---
  const handleBatchSubmit = async () => {
    if (!matchedOperator) { 
        alert("Invalid Operator ID. Please enter a valid ID in the header."); 
        return; 
    }

    if (inputRows.some(r => r.item.some(i => !i.model && i.quantity > 0))) { 
        alert("Error: Missing model names. Please ensure all items with a quantity have a model name selected."); 
        return; 
    }

    const records = inputRows.map(row => ({
        date: globalDate, 
        team: matchedOperator.team, 
        operator_id: matchedOperator.id, 
        operator_name: matchedOperator.name,
        hour: row.hour,
        manpower: row.manpower,
        target_units: row.target_units,
        units_produced: row.units_produced,
        remarks: row.remarks,
        item: row.item
    }));

    try {
        if (editingId) {
            const { error } = await supabase
                .from('production_records')
                .update({ ...records[0], updated_at: new Date().toISOString() })
                .eq('id', editingId);
            
            if (error) throw error;

            setEditingId(null); 
            fetchProductions();
            alert("Record updated successfully!");
        } else {
            const { error } = await supabase
                .from('production_records')
                .insert(records);
            
            if (error) throw error;

            fetchProductions(); 
            const lastRec = records[records.length - 1];
            setInputRows([{ 
                localId: Date.now(), 
                hour: (lastRec.hour + 1) % 24, 
                manpower: lastRec.manpower,
                target_units: 0,
                units_produced: 0,
                remarks: '',
                item: [{ model: '', quantity: 0 }]
            }]);
            alert("Saved successfully!");
        }
    } catch (err: any) {
        console.error("Save Error:", err);
        alert(`Failed to save: ${err.message || "Unknown error"}`);
    }
  };

  const handleEdit = (rec: ProductionRecord) => {
      setEditingId(rec.id!); setGlobalDate(rec.date); setOperatorInputId(rec.operator_id?.toString() || '');
      setInputRows([{ localId: Date.now(), ...rec, item: rec.item || [] } as any]);
  };

  const handleDelete = async (id: string) => { if(confirm("Delete?")) await supabase.from('production_records').delete().eq('id', id); fetchProductions(); };
  
  const handleExport = () => {
      const ws = XLSX.utils.json_to_sheet(productions.map(p => ({ Date: p.date, Hour: p.hour, Team: p.team, Produced: p.units_produced, Remarks: p.remarks })));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Prod");
      XLSX.writeFile(wb, "Production.xlsx");
  };

  const currentProductions = productions.slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage);

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      <div className="bg-white border-b border-slate-200 p-4 shadow-sm z-20">
        <div className="flex justify-between items-center max-w-[1600px] mx-auto">
            <div className="flex items-center gap-6">
                <h1 className="font-bold text-slate-800">Hourly Log</h1>
                <input type="date" value={globalDate} onChange={(e) => setGlobalDate(e.target.value)} className="border rounded px-2 py-1" />
                <div className="flex items-center gap-2">
                    <input type="number" value={operatorInputId} onChange={(e) => setOperatorInputId(e.target.value)} placeholder="ID" className="border-2 border-blue-100 rounded px-2 py-1 w-20 font-bold text-blue-600" />
                    <span className="text-sm font-bold text-slate-600">{matchedOperator ? `${matchedOperator.name} (${matchedOperator.team})` : 'Unknown'}</span>
                </div>
            </div>
            <div className="flex gap-2">
                 <button onClick={() => fileInputRef.current?.click()} disabled={analyzing} className="flex gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded disabled:opacity-50">
                    {analyzing ? "Scanning..." : <><Sparkles size={16}/> AI Scan</>}
                 </button>
                 <input type="file" ref={fileInputRef} className="hidden" onChange={handleImageAnalysis} accept="image/*" />
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-slate-100">
        <div className="max-w-[1600px] mx-auto space-y-6">
            <div className={`bg-white p-4 rounded-xl shadow-lg border border-blue-200 ring-4 ring-slate-200/50 ${!matchedOperator && 'opacity-50 pointer-events-none'}`}>
                <div className="space-y-4">
                    {inputRows.map((row, index) => (
                        <div key={row.localId} className="flex gap-3 p-3 bg-slate-50 rounded border items-start">
                            <div className="w-28">
                                <label className="text-[10px] font-bold text-slate-400 block">Time</label>
                                <LocalizationProvider dateAdapter={AdapterDateFns}>
                                    <TimePicker ampm={false} value={new Date(`${globalDate}T${Math.floor(row.hour).toString().padStart(2,'0')}:00`)} 
                                        onChange={(v) => v && updateRow(index, 'hour', v.getHours() + v.getMinutes()/60)} 
                                        slotProps={{ textField: { size: 'small', sx: { bgcolor: 'white' } } }} />
                                </LocalizationProvider>
                            </div>
                            <div className="w-16">
                                <label className="text-[10px] font-bold text-slate-400 block">MP</label>
                                <input type="number" value={row.manpower} onChange={(e) => updateRow(index, 'manpower', +e.target.value)} className="w-full border rounded p-2 text-center" />
                            </div>
                            <div className="flex-1 bg-white p-2 rounded border shadow-sm">
                                {row.item.map((it, i) => (
                                    <div key={i} className="flex gap-2 mb-1">
                                        <Autocomplete freeSolo size="small" options={modelOptions} className="flex-1"
                                            getOptionLabel={(o) => typeof o === 'string' ? o : o.description}
                                            value={it.model} onChange={(_, v) => { const ni = [...row.item]; ni[i].model = typeof v==='object'&&v?v.model||'':v||''; updateRowItems(index, ni); }}
                                            renderInput={(p) => <TextField {...p} placeholder="Model" sx={{ '& input': { fontSize: 13, p: '0 6px' } }} />} />
                                        <input type="number" value={it.quantity} onChange={(e) => { const ni = [...row.item]; ni[i].quantity = +e.target.value; updateRowItems(index, ni); }} className="w-16 border rounded text-center" />
                                        <button onClick={() => i===row.item.length-1 ? updateRowItems(index, [...row.item, {model:'', quantity:0}]) : updateRowItems(index, row.item.filter((_,x)=>x!==i))}>
                                            {i===row.item.length-1 ? <Plus size={14} className="text-blue-500"/> : <X size={14} className="text-red-500"/>}
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="w-20">
                                <label className="text-[10px] font-bold text-slate-400 block">Target</label>
                                <input type="number" value={row.target_units} onChange={(e) => updateRow(index, 'target_units', +e.target.value)} className="w-full border rounded p-2 text-center" />
                            </div>
                            <div className="w-20 text-center">
                                <label className="text-[10px] font-bold text-slate-400 block">Actual</label>
                                <div className="p-2 font-black text-blue-600 bg-slate-100 rounded">{row.units_produced}</div>
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-slate-400 block">Remarks</label>
                                <textarea 
                                    value={row.remarks} 
                                    onChange={(e) => updateRow(index, 'remarks', e.target.value)} 
                                    className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[42px]" 
                                    rows={1}
                                    placeholder="..."
                                />
                            </div>
                            {!editingId && inputRows.length > 1 && <button onClick={() => handleRemoveRow(index)} className="mt-6 text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>}
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex justify-between border-t pt-4">
                    {!editingId ? <button onClick={handleAddHourRow} className="flex items-center gap-2 text-blue-600 font-bold"><Plus size={16}/> Add Hour</button> : <div/>}
                    <div className="flex gap-2">
                        {editingId && <button onClick={() => setEditingId(null)} className="px-4 py-2 text-slate-500 font-bold">Cancel</button>}
                        <button onClick={handleBatchSubmit} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 flex gap-2"><Save size={18}/> {editingId ? "Update" : "Save All"}</button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase">
                        <tr>
                            <th className="p-3 text-center">Time</th>
                            <th className="p-3">Models</th>
                            <th className="p-3 text-center">Target</th>
                            <th className="p-3 text-center">Actual</th>
                            <th className="p-3 text-center">Eff%</th>
                            <th className="p-3">Remarks</th>
                            <th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {currentProductions.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50">
                                <td className="p-3 text-center font-mono font-bold">{Math.floor(r.hour)}:{Math.round((r.hour%1)*60).toString().padStart(2,'0')}</td>
                                <td className="p-3">{r.item?.map((m:any,i:number)=><span key={i} className="mr-2 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">{m.model} <b>{m.quantity}</b></span>)}</td>
                                <td className="p-3 text-center text-slate-500">{r.target_units}</td>
                                <td className="p-3 text-center font-bold">{r.units_produced}</td>
                                <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded text-xs font-bold ${+calculateEfficiency(r.units_produced,r.target_units)>=90?'bg-green-100 text-green-700':'bg-orange-100 text-orange-700'}`}>{calculateEfficiency(r.units_produced,r.target_units)}%</span></td>
                                <td className="p-3 text-slate-600 whitespace-pre-wrap max-w-xs">{r.remarks || '-'}</td>
                                <td className="p-3 text-right flex justify-end gap-2"><button onClick={()=>handleEdit(r)}><Edit2 size={16} className="text-blue-500"/></button><button onClick={()=>handleDelete(r.id!)}><Trash2 size={16} className="text-red-500"/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
}
