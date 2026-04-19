import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { BarChart3, TrendingUp, Calendar, Bell, Settings, Sun, Target, FileSpreadsheet } from 'lucide-react'; 
import confetti from 'canvas-confetti';

// Project Component Imports
import YieldCalendar from './components/YieldCalendar';
import HourlyProductionSheet from './components/HourlyProductionSheet';
import DayProductionSheet from './components/DayProductionSheet';
import SummaryChartSheet from './components/SummaryChartSheet';
import KPITrackingSheet from './components/KPITrackingSheet'; 
import ProductionRecordsTable from'./components/ProductionRecordsTable';
import ViewUtlizationReport from'./components/ViewUtlizationReport';

// import skLogo from './assets/sk.png'; // Uncomment if using

function Dashboard() {
  const [activeTab, setActiveTab] = useState('summary'); 
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isScrolled, setIsScrolled] = useState(false);

  const logoControls = useAnimation();

  useEffect(() => {
    logoControls.start({
      scale: 1,
      rotate: 0,
      transition: { type: "spring", stiffness: 260, damping: 20 }
    });
  }, [logoControls]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Tabs Definition
  const tabs = [
    { id: 'summary', label: 'Summary & Charts', icon: TrendingUp },
    { id: 'records', label: 'Hourly Records', icon: BarChart3 },
    { id: 'calendar', label: 'Yield Calendar', icon: Calendar },
    { id: 'excel', label: 'Excel Entry', icon: FileSpreadsheet },
    { id: 'utlization', label: 'Utilization Report', icon: FileSpreadsheet }
  ];

  const POP_SOUND_URL = 'https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3';

  const handleLogoInteraction = () => {
    const audio = new Audio(POP_SOUND_URL);
    audio.volume = 1; 
    audio.play().catch((e) => console.log("Audio play failed", e));

    confetti({
      particleCount: 200,
      spread: 200,
      origin: { x: 0.06, y: 0.08 },
      colors: ['#2563eb', '#1e293b', '#94a3b8', '#ffffff'],
      gravity: 1.6,
      ticks: 280,
      zIndex: 100,
    });

    logoControls.start({
      y: [0, -10, 0],
      scale: [1, 1.2, 1],
      transition: { duration: 0.3, ease: "easeInOut" }
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      
      {/* HEADER SECTION WITH TABS INTEGRATED */}
      <header 
        className={`sticky top-0 z-50 w-full border-b border-slate-200/60 backdrop-blur-xl px-4 md:px-6 transition-all duration-300 ease-in-out ${
          isScrolled ? 'py-2 bg-white/95 shadow-sm' : 'py-3 bg-white/95'
        }`}
      >
        <div className="max-w-[1600px] mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          
          {/* Left: Title & Logo */}
          <div className="flex items-center gap-4 shrink-0">
           {/* <motion.img 
              src={skLogo} 
              alt="SK Logo"
              onClick={handleLogoInteraction}
              animate={logoControls}
              initial={{ scale: 0, rotate: -180 }}
              className={`object-contain cursor-pointer transition-all duration-300 ${isScrolled ? 'w-10 h-10' : 'w-12 h-12'}`}
            /> */}
              
            <div className={`transition-all duration-300 origin-left ${isScrolled ? 'scale-90' : 'scale-100'}`}>
              <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none whitespace-nowrap">
                Hourly <span className="text-blue-600">Production</span>
              </h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Daily Operations Center
                </p>
            </div>
          </div>

          {/* Middle: Tab Navigation - MADE SMALLER */}
          <div className="flex-1 flex xl:justify-center overflow-x-auto no-scrollbar pb-1 xl:pb-0">
            <div className="inline-flex bg-slate-200/50 p-1 rounded-xl border border-slate-200/60 relative">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    // Adjusted padding (px-3 py-1.5), text size (text-[11px] or text-xs), and rounded corner radius
                    className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-[11px] md:text-xs font-bold transition-colors duration-500 whitespace-nowrap ${
                      isActive ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {/* Made icon smaller (14px) */}
                    <tab.icon 
                      size={14} 
                      strokeWidth={isActive ? 2.5 : 2} 
                      className="relative z-20"
                    />
                    <span className="relative z-20">{tab.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="active-tab-pill"
                        // Adjusted rounded corner to match smaller button size
                        className="absolute inset-0 bg-slate-900 rounded-[10px] shadow-sm"
                        transition={{ type: 'spring', bounce: .4, duration: 0.5 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Actions & Settings */}
          <div className="flex items-center justify-end gap-3 shrink-0 hidden md:flex">
            <div className="flex items-center gap-3 bg-slate-100/50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <Calendar className="w-4 h-4 text-slate-500" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase leading-none">Shift Date</span>
                <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)} 
                  className="bg-transparent border-none p-0 text-xs font-bold text-slate-700 focus:ring-0 outline-none cursor-pointer" 
                />
              </div>
            </div>
            <button className="p-1.5 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded-lg shadow-sm transition-all"><Bell size={16} /></button>
            <button className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-sm transition-all"><Settings size={16} /></button>
          </div>
          
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            {activeTab === 'summary' && <SummaryChartSheet selectedDate={selectedDate} />}
            {activeTab === 'records' && <HourlyProductionSheet selectedDate={selectedDate} />}
            {activeTab === 'dayrecords' && <DayProductionSheet selectedDate={selectedDate} />}
            {activeTab === 'calendar' && <YieldCalendar />}
            {activeTab === 'excel' && <ProductionRecordsTable selectedDate={selectedDate} />}
            {activeTab === 'utlization' && <ViewUtlizationReport selectedDate={selectedDate} />}
            {activeTab === 'kpi' && <KPITrackingSheet selectedDate={selectedDate} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// App Wrapper
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
