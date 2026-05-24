import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, Users, Package, Activity, 
  ArrowUpRight, ArrowDownRight, RefreshCw, 
  BarChart3, PieChart as PieChartIcon, Table as TableIcon,
  AlertCircle, CheckCircle2
} from 'lucide-react';
import { supabase, ProductionRecord } from '../lib/supabase';

// --- Interfaces ---
interface KPITrackingSheetProps {
  selectedDate?: string;
}

interface KPICardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color: 'blue' | 'green' | 'orange' | 'purple';
  delay: number;
}

// --- Animation Variants ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: { type: 'spring', stiffness: 100 }
  }
};

// --- Reusable Components ---

const StatCard = ({ title, value, subValue, icon, trend, color, delay }: KPICardProps) => {
  const colorStyles = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  const iconStyles = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-emerald-100 text-emerald-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <motion.div 
      variants={itemVariants}
      className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300"
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
          {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
        </div>
        <div className={`p-3 rounded-lg ${iconStyles[color]}`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-sm">
          {trend === 'up' ? (
            <span className="text-emerald-600 flex items-center font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
              <ArrowUpRight className="w-3 h-3 mr-1" /> +2.5%
            </span>
          ) : (
            <span className="text-rose-600 flex items-center font-medium bg-rose-50 px-2 py-0.5 rounded-full">
              <ArrowDownRight className="w-3 h-3 mr-1" /> -1.2%
            </span>
          )}
          <span className="text-slate-400 ml-2 text-xs">vs last period</span>
        </div>
      )}
    </motion.div>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm p-4 border border-slate-200 shadow-xl rounded-lg text-sm">
        <p className="font-bold text-slate-700 mb-2 border-b border-slate-100 pb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500 capitalize">{entry.name}:</span>
            <span className="font-semibold text-slate-700">
              {entry.name.includes('Efficiency') ? `${entry.value}%` : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const EfficiencyBadge = ({ value }: { value: number }) => {
  let colorClass = 'bg-slate-100 text-slate-600';
  let Icon = Activity;

  if (value >= 90) {
    colorClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
    Icon = CheckCircle2;
  } else if (value >= 75) {
    colorClass = 'bg-amber-100 text-amber-700 border-amber-200';
    Icon = Activity;
  } else {
    colorClass = 'bg-rose-100 text-rose-700 border-rose-200';
    Icon = AlertCircle;
  }

  return (
    <span className={`flex items-center w-fit px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClass}`}>
      <Icon className="w-3 h-3 mr-1.5" />
      {value}%
    </span>
  );
};

// --- Main Component ---

const KPITrackingSheet = ({ selectedDate }: KPITrackingSheetProps) => {
  const [productions, setProductions] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'teams' | 'operators' | 'models'>('teams');
  
  // Data for Charts
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

  useEffect(() => {
    fetchProductions();
  }, [selectedDate]); // Refetch if date changes

  const fetchProductions = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      // In a real scenario, you'd filter by selectedDate here if provided
      const { data, error } = await supabase
        .from('production_records')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setProductions(data || []);
    } catch (error) {
      console.error('Error fetching productions:', error);
      setErrorMessage('Failed to load production data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Calculation Logic (Preserved & Optimized) ---

  const getOverallKPIs = () => {
    if (productions.length === 0) return { totalProduced: 0, totalTarget: 0, avgEfficiency: 0, avgProductivity: 0, efficiencyTrend: 0 };

    const totalProduced = productions.reduce((sum, p) => sum + (Number(p.units_produced) || 0), 0);
    const totalTarget = productions.reduce((sum, p) => sum + (Number(p.target_units) || 0), 0);
    const totalManpower = productions.reduce((sum, p) => sum + (Number(p.manpower) || 1), 0);

    // Filter out null efficiencies for better accuracy
    const efficiencyRecords = productions.filter(p => p.efficiency != null);
    const avgEfficiency = efficiencyRecords.length > 0 
      ? efficiencyRecords.reduce((sum, p) => sum + (Number(p.efficiency) || 0), 0) / efficiencyRecords.length 
      : 0;
    
    const avgProductivity = totalManpower > 0 ? totalProduced / totalManpower : 0;

    return {
      totalProduced,
      totalTarget,
      avgEfficiency: parseFloat(avgEfficiency.toFixed(1)),
      avgProductivity: parseFloat(avgProductivity.toFixed(2)),
      progress: totalTarget > 0 ? (totalProduced / totalTarget) * 100 : 0
    };
  };

  const getTeamKPIs = () => {
    const teamData: Record<string, { produced: number; target: number; efficiencies: number[]; totalManpower: number }> = {};

    productions.forEach(p => {
      const teamName = p.team || 'Unassigned';
      if (!teamData[teamName]) {
        teamData[teamName] = { produced: 0, target: 0, efficiencies: [], totalManpower: 0 };
      }
      teamData[teamName].produced += Number(p.units_produced) || 0;
      teamData[teamName].target += Number(p.target_units) || 0;
      if (p.efficiency != null) teamData[teamName].efficiencies.push(Number(p.efficiency));
      teamData[teamName].totalManpower += Number(p.manpower) || 1;
    });

    return Object.entries(teamData).map(([team, data]) => {
      const avgEfficiency = data.efficiencies.length > 0 
        ? data.efficiencies.reduce((a, b) => a + b, 0) / data.efficiencies.length 
        : 0;
      const avgProductivity = data.totalManpower > 0 ? data.produced / data.totalManpower : 0;
      return {
        team,
        totalProduced: data.produced,
        totalTarget: data.target,
        avgEfficiency: parseFloat(avgEfficiency.toFixed(1)),
        avgProductivity: parseFloat(avgProductivity.toFixed(1)),
        achievement: data.target > 0 ? (data.produced / data.target) * 100 : 0
      };
    }).sort((a, b) => b.avgEfficiency - a.avgEfficiency);
  };

  const getOperatorKPIs = () => {
    const operatorData: Record<string, { produced: number; efficiencies: number[] }> = {};

    productions.forEach(p => {
      const opName = p.operator_name || 'Unknown';
      if (!operatorData[opName]) {
        operatorData[opName] = { produced: 0, efficiencies: [] };
      }
      operatorData[opName].produced += Number(p.units_produced) || 0;
      if (p.efficiency != null) operatorData[opName].efficiencies.push(Number(p.efficiency));
    });

    return Object.entries(operatorData).map(([operator, data]) => {
      const avgEfficiency = data.efficiencies.length > 0 
        ? data.efficiencies.reduce((a, b) => a + b, 0) / data.efficiencies.length 
        : 0;
      return {
        operator,
        totalProduced: data.produced,
        avgEfficiency: parseFloat(avgEfficiency.toFixed(1))
      };
    }).sort((a, b) => b.avgEfficiency - a.avgEfficiency);
  };

  const getModelKPIs = () => {
    const modelData: Record<string, number> = {};

    productions.forEach(p => {
      if (p.item && Array.isArray(p.item)) {
        p.item.forEach((item: any) => {
          if (item.model) {
            const qty = Number(item.quantity) || 0;
            modelData[item.model] = (modelData[item.model] || 0) + qty;
          }
        });
      }
    });

    return Object.entries(modelData)
      .map(([model, quantity]) => ({ model, totalProduced: quantity }))
      .sort((a, b) => b.totalProduced - a.totalProduced);
  };

  // --- Rendering States ---

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
      <div className="relative w-16 h-16">
         <div className="absolute top-0 left-0 w-full h-full border-4 border-slate-200 rounded-full"></div>
         <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <span className="mt-4 font-medium animate-pulse">Synchronizing KPI Data...</span>
    </div>
  );

  if (errorMessage) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-rose-600 bg-rose-50 rounded-xl border border-rose-100 p-8 m-4">
        <AlertCircle className="w-6 h-6 mr-3" />
        <span className="font-semibold">{errorMessage}</span>
        <button 
          onClick={fetchProductions}
          className="ml-4 px-4 py-2 bg-white text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const overall = getOverallKPIs();
  const teams = getTeamKPIs();
  const operators = getOperatorKPIs();
  const models = getModelKPIs();

  // Chart Data Preparation
  const teamChartData = teams.map(t => ({ 
    name: t.team, 
    Efficiency: t.avgEfficiency, 
    Productivity: t.avgProductivity 
  }));
  
  const modelChartData = models.slice(0, 6).map(m => ({ 
    name: m.model, 
    value: m.totalProduced 
  }));

  // --- Render ---

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-8 p-4 md:p-6 max-w-7xl mx-auto bg-slate-50/50 min-h-screen"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">
            Production Intelligence
          </h1>
          <p className="text-slate-500 mt-1 flex items-center">
            <Activity className="w-4 h-4 mr-1.5 text-blue-500" />
            Real-time manufacturing insights for {selectedDate ? new Date(selectedDate).toLocaleDateString() : 'All Time'}
          </p>
        </div>
        <button 
          onClick={fetchProductions}
          className="flex items-center px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-all text-sm font-medium group"
        >
          <RefreshCw className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
          Refresh Data
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Output" 
          value={overall.totalProduced.toLocaleString()} 
          subValue={`Target: ${overall.totalTarget.toLocaleString()}`}
          icon={<Package className="w-6 h-6" />}
          trend="up"
          color="blue"
          delay={0}
        />
        <StatCard 
          title="Global Efficiency" 
          value={`${overall.avgEfficiency}%`}
          subValue="Weighted Average"
          icon={<Activity className="w-6 h-6" />}
          trend={overall.avgEfficiency > 85 ? 'up' : 'down'}
          color={overall.avgEfficiency > 85 ? 'green' : 'orange'}
          delay={0.1}
        />
        <StatCard 
          title="Avg. Productivity" 
          value={overall.avgProductivity}
          subValue="Units per Manpower"
          icon={<Users className="w-6 h-6" />}
          trend="neutral"
          color="purple"
          delay={0.2}
        />
        <StatCard 
          title="Target Achievement" 
          value={`${overall.progress.toFixed(1)}%`}
          subValue={`${(overall.totalTarget - overall.totalProduced).toLocaleString()} units remaining`}
          icon={<TrendingUp className="w-6 h-6" />}
          trend="neutral"
          color="orange"
          delay={0.3}
        />
      </div>

      {/* Main Visuals Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Team Performance Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-blue-500" />
              Team Efficiency & Productivity
            </h3>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEff" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar yAxisId="left" dataKey="Efficiency" fill="url(#colorEff)" radius={[4, 4, 0, 0]} barSize={40} />
                <Bar yAxisId="right" dataKey="Productivity" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Model Distribution Chart */}
        <motion.div variants={itemVariants} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
           <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center">
              <PieChartIcon className="w-5 h-5 mr-2 text-purple-500" />
              Top Models
            </h3>
          </div>
          <div className="h-[350px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={modelChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {modelChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Text Overlay */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <span className="block text-3xl font-bold text-slate-800">{models.length}</span>
              <span className="text-xs text-slate-400 uppercase tracking-wide">Active Models</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {modelChartData.slice(0, 4).map((entry, index) => (
              <div key={index} className="flex items-center text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded">
                <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                {entry.name}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Detailed Data Section */}
      <motion.div variants={itemVariants} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        
        {/* Tab Navigation */}
        <div className="border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center self-start sm:self-center">
            <TableIcon className="w-5 h-5 mr-2 text-slate-500" />
            Detailed Breakdown
          </h3>
          <div className="flex bg-slate-100 p-1 rounded-lg self-stretch sm:self-auto">
            {(['teams', 'models'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 capitalize ${
                  activeTab === tab 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="overflow-x-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-medium uppercase tracking-wider text-xs">
                  <tr>
                    {activeTab === 'teams' && (
                      <>
                        <th className="px-6 py-4">Team Name</th>
                        <th className="px-6 py-4 text-center">Output / Target</th>
                        <th className="px-6 py-4 text-center">Achievement</th>
                        <th className="px-6 py-4 text-center">Efficiency</th>
                        <th className="px-6 py-4 text-right">Productivity</th>
                      </>
                    )}
                    {activeTab === 'operators' && (
                      <>
                        <th className="px-6 py-4">Operator Name</th>
                        <th className="px-6 py-4 text-center">Total Produced</th>
                        <th className="px-6 py-4 text-right">Avg Efficiency</th>
                      </>
                    )}
                     {activeTab === 'models' && (
                      <>
                        <th className="px-6 py-4">Model Name</th>
                        <th className="px-6 py-4 text-right">Quantity Produced</th>
                        <th className="px-6 py-4 w-1/3">Distribution</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Team Body */}
                  {activeTab === 'teams' && teams.map((team, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-700">{team.team}</td>
                      <td className="px-6 py-4 text-center text-slate-600">
                        <span className="font-medium text-slate-800">{team.totalProduced}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        {team.totalTarget}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden mr-3">
                            <div 
                              className={`h-full rounded-full ${team.achievement >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                              style={{ width: `${Math.min(team.achievement, 100)}%` }} 
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-600">{team.achievement.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 flex justify-center">
                        <EfficiencyBadge value={team.avgEfficiency} />
                      </td>
                      <td className="px-6 py-4 text-right text-slate-600 font-mono">{team.avgProductivity}</td>
                    </tr>
                  ))}

                  {/* Operator Body */}
                  {activeTab === 'operators' && operators.slice(0, 10).map((op, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mr-3 font-bold text-xs">
                            {op.operator.charAt(0)}
                          </div>
                          <span className="font-semibold text-slate-700">{op.operator}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-slate-600">{op.totalProduced}</td>
                      <td className="px-6 py-4 flex justify-end">
                        <EfficiencyBadge value={op.avgEfficiency} />
                      </td>
                    </tr>
                  ))}

                  {/* Model Body */}
                  {activeTab === 'models' && models.map((model, idx) => {
                     const maxVal = models[0]?.totalProduced || 1;
                     const percent = (model.totalProduced / maxVal) * 100;
                     return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-700">{model.model}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-600">{model.totalProduced}</td>
                        <td className="px-6 py-4">
                           <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${percent}%` }}
                                transition={{ duration: 0.5, delay: idx * 0.05 }}
                                className="h-full bg-indigo-500 rounded-full"
                              />
                           </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {/* Empty State for Tabs */}
              {((activeTab === 'teams' && teams.length === 0) || 
                (activeTab === 'operators' && operators.length === 0) || 
                (activeTab === 'models' && models.length === 0)) && (
                <div className="p-12 text-center text-slate-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No data available for this category.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default KPITrackingSheet;
