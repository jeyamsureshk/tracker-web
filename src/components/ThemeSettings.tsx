import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, Image, Upload, RefreshCw } from 'lucide-react';
import { useTheme } from '../theme-context';

interface ThemeSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const ThemeSettings: React.FC<ThemeSettingsProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useTheme();
  const [tempTheme, setTempTheme] = useState(state.theme);
  const [tempBgImage, setTempBgImage] = useState(state.bgImage || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const themes: Array<{ id: string; label: string; icon: React.ReactNode; value: 'light' | 'dark' | 'white' }> = [
    { id: 'light', label: 'Light', icon: <Sun className="w-5 h-5" />, value: 'light' },
    { id: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" />, value: 'dark' },
    { id: 'white', label: 'White', icon: <Sun className="w-5 h-5" />, value: 'white' },
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setTempBgImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const applyChanges = () => {
    dispatch({ type: 'SET_THEME', payload: tempTheme });
    if (tempBgImage) {
      dispatch({ type: 'SET_BG_IMAGE', payload: tempBgImage });
    } else {
      dispatch({ type: 'RESET_BG_IMAGE' });
    }
    onClose();
  };

  const resetBg = () => {
    setTempBgImage('');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 p-6 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Theme Settings</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Theme Selection */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-3">
                {themes.map((theme) => (
                  <label key={theme.id} className="flex flex-col items-center p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 cursor-pointer transition-all group">
                    <input
                      type="radio"
                      name="theme"
                      value={theme.value}
                      checked={tempTheme === theme.value}
                      onChange={() => setTempTheme(theme.value)}
                      className="sr-only"
                    />
                    <div className={`w-12 h-12 rounded-lg mb-2 shadow-md transition-all group-hover:scale-105 ${
                      tempTheme === theme.value 
                        ? 'ring-4 ring-blue-500/30 shadow-blue-500/25' 
                        : 'bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600'
                    }`}>
                      {theme.icon}
                    </div>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 capitalize">
                      {theme.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Background Image */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Background Image
              </label>
              <div className="space-y-3">
                {/* URL Input */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={tempBgImage}
                    onChange={(e) => setTempBgImage(e.target.value)}
                    placeholder="https://example.com/image.jpg or upload below"
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                  <button
                    onClick={resetBg}
                    className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Reset"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>

                {/* File Upload */}
                <div className="flex items-center gap-2 p-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl hover:border-blue-400 transition-colors cursor-pointer bg-slate-50/50 dark:bg-slate-800/50">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="sr-only"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors font-medium"
                  >
                    <Upload size={16} />
                    Upload Image
                  </button>
                </div>

                {/* Preview */}
                {tempBgImage && (
                  <div className="relative">
                    <div 
                      className="w-full h-32 rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700"
                      style={{ 
                        backgroundImage: `url(${tempBgImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    />
                    <button
                      onClick={resetBg}
                      className="absolute top-2 right-2 p-1.5 bg-white/90 dark:bg-slate-900/90 rounded-full shadow-md hover:bg-white dark:hover:bg-slate-900 transition-all"
                    >
                      <X size={14} className="text-slate-500" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 p-6 border-t border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={applyChanges}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition-all"
            >
              Apply Changes
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ThemeSettings;
