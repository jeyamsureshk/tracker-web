import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { supabase, ProductionRecord } from '../lib/supabase';

interface SummaryChartSheetProps {
  selectedDate: string;
}

const formatHour = (decimalHour: number): string => {
  const hour = Math.floor(decimalHour);
  const minute = (decimalHour - hour) * 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
};

export default function SummaryChartSheet({ selectedDate }: SummaryChartSheetProps) {
  const [productions, setProductions] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'day' | 'month' | 'year'>('day');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [modelTab, setModelTab] = useState<'summary' | 'chart'>('summary');

  useEffect(() => {
    fetchProductions();
  }, []);

  const fetchProductions = async () => {
    setLoading(true);
    setErrorMessage('');
    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching productions:', error);
      setErrorMessage('Failed to load production data. Please try again.');
    } else {
      setProductions(data || []);
    }
    setLoading(false);
  };

  const getStatsForPeriod = (period: 'day' | 'month' | 'year', value: string) => {
    let filteredProductions: ProductionRecord[] = [];
    if (period === 'day') {
      filteredProductions = productions.filter(p => p.date === value);
    } else if (period === 'month') {
      filteredProductions = productions.filter(p => p.date.startsWith(value));
    } else if (period === 'year') {
      filteredProductions = productions.filter(p => p.date.startsWith(value));
    }
    const totalProduced = filteredProductions.reduce((sum, p) => sum + p.units_produced, 0);
    const totalTarget = filteredProductions.reduce((sum, p) => sum + p.target_units, 0);
    return { totalProduced, totalTarget, count: filteredProductions.length };
  };

  const getCurrentStats = () => {
    if (activeTab === 'day') {
      return getStatsForPeriod('day', selectedDate);
    } else if (activeTab === 'month') {
      return getStatsForPeriod('month', selectedDate.slice(0, 7));
    } else {
      return getStatsForPeriod('year', selectedDate.slice(0, 4));
    }
  };

  const calculateEfficiency = (produced: number, target: number) => {
    if (target === 0) return '0.0';
    return ((produced / target) * 100).toFixed(1);
  };

  const getTeamWiseSummary = () => {
    let filteredProductions: ProductionRecord[] = [];
    if (activeTab === 'day') {
      filteredProductions = productions.filter(p => p.date === selectedDate);
    } else if (activeTab === 'month') {
      filteredProductions = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 7)));
    } else if (activeTab === 'year') {
      filteredProductions = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 4)));
    }

    const teams = [...new Set(filteredProductions.map(p => p.team))];
    
    // Include plan_dt, unplan_dt, and track unique dates for accurate 570m shift calculations
    const teamData: { [key: string]: { produced: number; target: number; plan_dt: number; unplan_dt: number; uniqueDays: Set<string> } } = {};
    teams.forEach(team => {
      teamData[team] = { produced: 0, target: 0, plan_dt: 0, unplan_dt: 0, uniqueDays: new Set() };
    });

    filteredProductions.forEach(p => {
      if (teamData[p.team]) {
        teamData[p.team].produced += p.units_produced;
        teamData[p.team].target += p.target_units;
        teamData[p.team].plan_dt += Number(p.plan_dt) || 0;
        teamData[p.team].unplan_dt += Number(p.unplan_dt) || 0;
        teamData[p.team].uniqueDays.add(p.date);
      }
    });

    return teams.map(team => {
      const data = teamData[team];
      const efficiency = data.target === 0 ? 0 : parseFloat(((data.produced / data.target) * 100).toFixed(1));
      
      // Available Time: 570 mins per working day minus total downtime
      const totalShiftMinutes = 570 * (data.uniqueDays.size || 1);
      const availableTime = totalShiftMinutes - (data.plan_dt + data.unplan_dt);

      return { 
        name: team, 
        produced: data.produced, 
        target: data.target, 
        efficiency: efficiency,
        planDt: data.plan_dt,
        unplanDt: data.unplan_dt,
        availableTime: availableTime
      };
    });
  };

  const getOverallModelWiseData = () => {
    let filteredProductions: ProductionRecord[] = [];
    if (activeTab === 'day') {
      filteredProductions = productions.filter(p => p.date === selectedDate);
    } else if (activeTab === 'month') {
      filteredProductions = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 7)));
    } else if (activeTab === 'year') {
      filteredProductions = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 4)));
    }
    const modelData: { [key: string]: number } = {};
    filteredProductions.forEach(p => {
      if (p.item && Array.isArray(p.item)) {
        p.item.forEach(item => {
          if (item.model && item.quantity != null) {
            const qty = parseFloat(String(item.quantity)) || 0;
            modelData[item.model] = (modelData[item.model] || 0) + qty;
          }
        });
      }
    });
    return Object.entries(modelData).sort(([, a], [, b]) => b - a).map(([model, quantity]) => ({ model, quantity }));
  };

  const getModelWiseData = (teamName: string) => {
    let filteredProductions: ProductionRecord[] = [];
    if (activeTab === 'day') {
      filteredProductions = productions.filter(p => p.date === selectedDate && p.team === teamName);
    } else if (activeTab === 'month') {
      filteredProductions = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 7)) && p.team === teamName);
    } else if (activeTab === 'year') {
      filteredProductions = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 4)) && p.team === teamName);
    }
    const modelData: { [key: string]: number } = {};
    filteredProductions.forEach(p => {
      if (p.item && Array.isArray(p.item)) {
        p.item.forEach(item => {
          if (item.model && item.quantity != null) {
            const qty = parseFloat(String(item.quantity)) || 0;
            modelData[item.model] = (modelData[item.model] || 0) + qty;
          }
        });
      }
    });
    return Object.entries(modelData).sort(([, a], [, b]) => b - a).map(([model, quantity]) => ({ model, quantity }));
  };

  const getTeamChartData = (teamName: string) => {
    if (activeTab === 'day') {
      const dayData = productions.filter(p => p.date === selectedDate && p.team === teamName);
      const hourData: { [key: number]: { produced: number; target: number; manpower: number } } = {};
      dayData.forEach(p => {
        if (!hourData[p.hour]) hourData[p.hour] = { produced: 0, target: 0, manpower: 0 };
        hourData[p.hour].produced += p.units_produced;
        hourData[p.hour].target += p.target_units;
        hourData[p.hour].manpower += (p.manpower || 0);
      });
      return Object.entries(hourData).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([hour, data]) => ({
        name: formatHour(parseFloat(hour)),
        produced: data.produced,
        target: data.target,
        manpower: data.manpower
      }));
    } else if (activeTab === 'month') {
      const monthData = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 7)) && p.team === teamName);
      const dayData: { [key: string]: { produced: number; target: number; manpower: number } } = {};
      monthData.forEach(p => {
        if (!dayData[p.date]) dayData[p.date] = { produced: 0, target: 0, manpower: 0 };
        dayData[p.date].produced += p.units_produced;
        dayData[p.date].target += p.target_units;
        dayData[p.date].manpower += (p.manpower || 0);
      });
      return Object.entries(dayData).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({
        name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        produced: data.produced,
        target: data.target,
        manpower: data.manpower
      }));
    } else {
      const yearData = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 4)) && p.team === teamName);
      const monthData: { [key: string]: { produced: number; target: number; manpower: number } } = {};
      yearData.forEach(p => {
        const month = p.date.slice(0, 7);
        if (!monthData[month]) monthData[month] = { produced: 0, target: 0, manpower: 0 };
        monthData[month].produced += p.units_produced;
        monthData[month].target += p.target_units;
        monthData[month].manpower += (p.manpower || 0);
      });
      return Object.entries(monthData).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
        name: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        produced: data.produced,
        target: data.target,
        manpower: data.manpower
      }));
    }
  };

  const getChartData = () => {
    if (activeTab === 'day') {
      const dayData = productions.filter(p => p.date === selectedDate);
      const hourData: { [key: number]: { produced: number; target: number; manpower: number } } = {};
      dayData.forEach(p => {
        if (!hourData[p.hour]) hourData[p.hour] = { produced: 0, target: 0, manpower: 0 };
        hourData[p.hour].produced += p.units_produced;
        hourData[p.hour].target += p.target_units;
        hourData[p.hour].manpower += (p.manpower || 0);
      });
      return Object.entries(hourData).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([hour, data]) => ({
        name: formatHour(parseFloat(hour)),
        produced: data.produced,
        target: data.target,
        manpower: data.manpower
      }));
    } else if (activeTab === 'month') {
      const monthData = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 7)));
      const dayData: { [key: string]: { produced: number; target: number; manpower: number } } = {};
      monthData.forEach(p => {
        if (!dayData[p.date]) dayData[p.date] = { produced: 0, target: 0, manpower: 0 };
        dayData[p.date].produced += p.units_produced;
        dayData[p.date].target += p.target_units;
        dayData[p.date].manpower += (p.manpower || 0);
      });
      return Object.entries(dayData).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({
        name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        produced: data.produced,
        target: data.target,
        manpower: data.manpower
      }));
    } else {
      const yearData = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 4)));
      const monthData: { [key: string]: { produced: number; target: number; manpower: number } } = {};
      yearData.forEach(p => {
        const month = p.date.slice(0, 7);
        if (!monthData[month]) monthData[month] = { produced: 0, target: 0, manpower: 0 };
        monthData[month].produced += p.units_produced;
        monthData[month].target += p.target_units;
        monthData[month].manpower += (p.manpower || 0);
      });
      return Object.entries(monthData).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
        name: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        produced: data.produced,
        target: data.target,
        manpower: data.manpower
      }));
    }
  };

  if (loading) return (
    <div className="flex justify-center p-12 items-center space-x-2 text-slate-500 font-medium">
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <span>Syncing Production Summary...</span>
    </div>
  );

  if (errorMessage) return <div className="flex justify-center p-8 text-red-600">{errorMessage}</div>;

  const chartData = getChartData();
  const stats = getCurrentStats();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex border-b mb-4">
          {(['day', 'month', 'year'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 font-medium transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-semibold">Summary for {activeTab === 'day' ? 'Date' : activeTab === 'month' ? 'Month' : 'Year'}</h3>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded">
            <div className="text-2xl font-bold text-blue-600">{stats.totalProduced}</div>
            <div className="text-sm text-gray-600">Units Produced</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded">
            <div className="text-2xl font-bold text-green-600">{stats.totalTarget}</div>
            <div className="text-sm text-gray-600">Target Units</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded">
            <div className="text-2xl font-bold text-orange-600">{calculateEfficiency(stats.totalProduced, stats.totalTarget)}%</div>
            <div className="text-sm text-gray-600">Efficiency</div>
          </div>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              
              {/* Primary Y-Axis (Left) for Production/Target */}
              <YAxis 
                yAxisId="left" 
                orientation="left" 
                stroke="#3b82f6" 
                label={{ value: 'Units', angle: -90, position: 'insideLeft' }}
              />
              
              {/* Secondary Y-Axis (Right) for Manpower */}
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                stroke="#f59e0b" 
                domain={[0, 'dataMax']} // Set maximum data as chart top plus a small buffer
                label={{ value: 'Manpower', angle: 90, position: 'insideRight' }}
              />
              
              <Tooltip />
              
              <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey="produced" 
                stroke="#3b82f6" 
                strokeWidth={2} 
                name="Units Produced" 
                label={{ value: 'Produced', angle: 0, position: 'insideTop', offset:15, fill:'#3b82f6', fontSize:15 }}
              />
              <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey="target" 
                stroke="#10b981" 
                strokeWidth={2} 
                name="Target Units" 
                label={{ value: 'Target', angle: 0, position: 'insideBottom', offset:15, fill:'#10b981', fontSize:15 }}
              />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="manpower" 
                stroke="#f59e0b" 
                strokeWidth={2} 
                name="Manpower" 
                label={{ value: 'Manpower', angle: 0, position: 'insideTopRight', offset:7, fill:'#f59e0b', fontSize:15 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Model-wise Quantity Section */}
        <div className="mt-6">
          <h4 className="text-lg font-semibold mb-4">Model-wise Quantity ({activeTab === 'day' ? 'Day' : activeTab === 'month' ? 'Month' : 'Year'})</h4>
          <div className="flex border-b mb-4">
            <button onClick={() => setModelTab('summary')} className={`px-4 py-2 font-medium transition-colors ${modelTab === 'summary' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>Summary</button>
            <button onClick={() => setModelTab('chart')} className={`px-4 py-2 font-medium transition-colors ${modelTab === 'chart' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>Chart</button>
          </div>
          {modelTab === 'summary' ? (
            <div className="max-h-64 overflow-y-auto border rounded p-3 bg-gray-50">
              {getOverallModelWiseData().length > 0 ? (
                <div className="space-y-2">
                  {getOverallModelWiseData().map((modelData, index) => (
                    <div key={index} className="flex justify-between items-center bg-white p-3 rounded shadow-sm">
                      <span className="font-medium text-gray-800">{modelData.model}</span>
                      <span className="text-blue-600 font-semibold">{modelData.quantity} units</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-gray-500 text-center py-4">No production data available for the selected period.</div>}
            </div>
          ) : (
            <div className="h-80 mb-12">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getOverallModelWiseData()} margin={{ top: 20, right: 30, left: 20, bottom: 150 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="model" interval={0} angle={-75} textAnchor="end" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#3b82f6" name="Units Produced" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Team-wise Summary Section */}
        <div className="mt-6">
          <h4 className="text-lg font-semibold mb-4">Team-wise Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {getTeamWiseSummary().map((team: any) => (
              <div key={team.name} className={`bg-gray-50 rounded p-4 cursor-pointer transition-colors ${selectedTeam === team.name ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-100'}`} onClick={() => setSelectedTeam(selectedTeam === team.name ? null : team.name)}>
                <div className="font-medium text-gray-800">{team.name}</div>
                <div className="text-sm text-gray-600 mt-1 pb-1 border-b border-gray-200">
                  Produced: {team.produced} | Target: {team.target}
                </div>
                
                {/* Displaying Plan DT, Unplan DT, and Available Time */}
                <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Plan DT:</span> <span>{team.planDt}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unplan DT:</span> <span>{team.unplanDt}m</span>
                  </div>
                  <div className="flex justify-between font-medium text-slate-700">
                    <span>Available Time:</span> <span>{team.availableTime}m</span>
                  </div>
                </div>

                <div className="text-sm font-bold mt-2 pt-1 border-t border-gray-200" style={{ color: team.efficiency >= 100 ? '#10b981' : team.efficiency >= 80 ? '#f59e0b' : '#ef4444' }}>
                  Efficiency: {team.efficiency}%
                </div>
              </div>
            ))}
          </div>

          {selectedTeam && (
            <div className="mt-6 bg-white border rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h5 className="text-lg font-semibold">{selectedTeam} - Detailed View</h5>
                <button onClick={() => setSelectedTeam(null)} className="text-gray-500 hover:text-gray-700 text-xl">×</button>
              </div>
              <div className="space-y-6">
                <div>
                  <h6 className="text-md font-medium mb-2">Model-wise Quantity</h6>
                  <div className="max-h-64 overflow-y-auto border rounded p-3 bg-gray-50">
                    {getModelWiseData(selectedTeam).map((modelData, index) => (
                      <div key={index} className="flex justify-between items-center bg-white p-3 rounded shadow-sm">
                        <span className="font-medium text-gray-800">{modelData.model}</span>
                        <span className="text-blue-600 font-semibold">{modelData.quantity} units</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h6 className="text-md font-medium mb-2">Production Chart</h6>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getTeamChartData(selectedTeam)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        
                        {/* Left Axis */}
                        <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" />
                        
                        {/* Right Axis with Max Scale */}
                        <YAxis 
                          yAxisId="right" 
                          orientation="right" 
                          stroke="#f59e0b" 
                          domain={[0, 'dataMax']} 
                        />
                        
                        <Tooltip />
                        
                        <Line 
                          yAxisId="left" 
                          type="monotone" 
                          dataKey="produced" 
                          stroke="#3b82f6" 
                          strokeWidth={2} 
                          name="Units Produced" 
                          label={{ value: 'Produced', angle: 0, position: 'insideTop', offset:15, fill:'#3b82f6', fontSize:15 }}
                        />
                        <Line 
                          yAxisId="left" 
                          type="monotone" 
                          dataKey="target" 
                          stroke="#10b981" 
                          strokeWidth={2} 
                          name="Target Units" 
                          label={{ value: 'Target', angle: 0, position: 'insideBottom', offset:15, fill:'#10b981', fontSize:15 }}
                        />
                        <Line 
                          yAxisId="right" 
                          type="monotone" 
                          dataKey="manpower" 
                          stroke="#f59e0b" 
                          strokeWidth={2} 
                          name="Manpower" 
                          label={{ value: 'Manpower', angle: 0, position: 'insideTopRight', offset:7, fill:'#f59e0b', fontSize:15 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
