import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase, ProductionRecord } from '../lib/supabase';

interface BarChartSheetProps {
  selectedDate: string;
}

export default function BarChartSheet({ selectedDate }: BarChartSheetProps) {
  const [productions, setProductions] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'day' | 'month' | 'year'>('day');

  useEffect(() => {
    fetchProductions();
  }, []);

  const fetchProductions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching productions:', error);
    } else {
      setProductions(data || []);
    }
    setLoading(false);
  };

  const getChartData = () => {
    if (activeTab === 'day') {
      // Group by hour for the selected date
      const dayData = productions.filter(p => p.date === selectedDate);
      const hourData: { [key: number]: { produced: number; target: number } } = {};

      dayData.forEach(p => {
        if (!hourData[p.hour]) {
          hourData[p.hour] = { produced: 0, target: 0 };
        }
        hourData[p.hour].produced += p.units_produced;
        hourData[p.hour].target += p.target_units;
      });

      return Object.entries(hourData)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([hour, data]) => ({
          name: `${hour}:00`,
          produced: data.produced,
          target: data.target,
        }));
    } else if (activeTab === 'month') {
      // Group by day for the selected month
      const monthData = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 7)));
      const dayData: { [key: string]: { produced: number; target: number } } = {};

      monthData.forEach(p => {
        if (!dayData[p.date]) {
          dayData[p.date] = { produced: 0, target: 0 };
        }
        dayData[p.date].produced += p.units_produced;
        dayData[p.date].target += p.target_units;
      });

      return Object.entries(dayData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          produced: data.produced,
          target: data.target,
        }));
    } else {
      // Group by month for the selected year
      const yearData = productions.filter(p => p.date.startsWith(selectedDate.slice(0, 4)));
      const monthData: { [key: string]: { produced: number; target: number } } = {};

      yearData.forEach(p => {
        const month = p.date.slice(0, 7);
        if (!monthData[month]) {
          monthData[month] = { produced: 0, target: 0 };
        }
        monthData[month].produced += p.units_produced;
        monthData[month].target += p.target_units;
      });

      return Object.entries(monthData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          name: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          produced: data.produced,
          target: data.target,
        }));
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  const chartData = getChartData();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex border-b mb-4">
          <button
            onClick={() => setActiveTab('day')}
            className={`flex-1 px-4 py-2 font-medium transition-colors ${
              activeTab === 'day'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setActiveTab('month')}
            className={`flex-1 px-4 py-2 font-medium transition-colors ${
              activeTab === 'month'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setActiveTab('year')}
            className={`flex-1 px-4 py-2 font-medium transition-colors ${
              activeTab === 'year'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Year
          </button>
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-semibold">
            Production Chart for {activeTab === 'day' ? 'Date' : activeTab === 'month' ? 'Month' : 'Year'}
          </h3>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="produced" fill="#3b82f6" name="Units Produced" />
              <Bar dataKey="target" fill="#10b981" name="Target Units" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
