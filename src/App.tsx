import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { 
  BarChart3, TrendingUp, Calendar, Bell, Settings, Sun, Target, FileSpreadsheet, 
  LayoutDashboard, ClipboardList, CalendarDays, PieChart, Activity, Clock
} from 'lucide-react'; 
import { ThemeProvider } from './theme-context';
import ThemeSettings from './components/ThemeSettings';
import confetti from 'canvas-confetti';

// Project Component Imports
import YieldCalendar from './components/YieldCalendar';
import HourlyProductionSheet from './components/HourlyProductionSheet';
import DayProductionSheet from './components/DayProductionSheet';
import SummaryChartSheet from './components/SummaryChartSheet';
import PlanVsActualSheet from './components/PlanVsActualSheet'; 
import ProductionRecordsTable from'./components/ProductionRecordsTable';
import ViewUtlizationReport from'./components/ViewUtlizationReport';
import CycleTimeSheet from'./components/CycleTimeSheet';

// import skLogo from './assets/sk.png'; // Uncomment if using

function Dashboard() {
  const [activeTab, setActiveTab] = useState('summary'); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
    { id: 'summary', label: 'Summary & Charts', icon: LayoutDashboard },
    { id: 'records', label: 'Hourly Records', icon: ClipboardList },
    { id: 'calendar', label: 'Yield Calendar', icon: CalendarDays },
    { id: 'cycletime', label: 'Cycle Time', icon: Clock },
    { id: 'utlization', label: 'Utilization Report', icon: PieChart },
    { id: 'planvsactual', label: 'Plan Vs Actual', icon: Activity },
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
    <div 
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-400/20 dark:selection:bg-blue-500/30 transition-all duration-500"
    >
      
      {/* HEADER SECTION WITH TABS INTEGRATED */}
      <header 
        className={`sticky top-0 z-50 w-full border-b border-slate-200/60 backdrop-blur-xl px-4 md:px-6 transition-all duration-300 ease-in-out ${
          isScrolled ? 'py-2 bg-white/95 shadow-sm' : 'py-3 bg-white/95'
        }`}
      >
        {/* CHANGED: Switched to flex-row and added horizontal scroll behavior to keep it on one line */}
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 overflow-x-auto w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          
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
 <a 
                href="https://jeyamsureshk.netlify.app" 
                target="_blank" 
                rel="noopener noreferrer"
className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1"
              >
                SK Tech Daily Operations Center
              </a>
                
            </div>
          </div>

          {/* Middle: Tab Navigation */}
          <div className="flex shrink-0 items-center">
            <div className="inline-flex bg-slate-200/50 p-1 rounded-xl border border-slate-200/60 relative">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-[11px] md:text-xs font-bold transition-colors duration-500 whitespace-nowrap ${
                      isActive ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <tab.icon 
                      size={14} 
                      strokeWidth={isActive ? 2.5 : 2} 
                      className="relative z-20"
                    />
                    <span className="relative z-20">{tab.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="active-tab-pill"
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
          {/* CHANGED: Removed 'hidden md:flex' so it displays on mobile, and added shrink-0 */}
          <div className="flex items-center gap-3 shrink-0">
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
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
              title="Theme Settings"
            >
              <Settings size={16} />
            </button>
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
            {activeTab === 'cycletime' && <CycleTimeSheet selectedDate={selectedDate} />}
            {activeTab === 'utlization' && <ViewUtlizationReport selectedDate={selectedDate} />}
            {activeTab === 'planvsactual' && <PlanVsActualSheet selectedDate={selectedDate} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Theme Settings Modal */}
      <ThemeSettings 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}

// App Wrapper
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/dashboard" element={<ThemeProvider><Dashboard /></ThemeProvider>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
