import React, { createContext, useContext, useReducer, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'white';
type BgImage = string | null;

interface ThemeState {
  theme: Theme;
  bgImage: BgImage;
}

type ThemeAction = 
  | { type: 'SET_THEME'; payload: Theme }
  | { type: 'SET_BG_IMAGE'; payload: string }
  | { type: 'RESET_BG_IMAGE' };

const initialState: ThemeState = {
  theme: (localStorage.getItem('theme') as Theme) || 'light',
  bgImage: localStorage.getItem('bgImage') || null,
};

const themeReducer = (state: ThemeState, action: ThemeAction): ThemeState => {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_BG_IMAGE':
      return { ...state, bgImage: action.payload };
    case 'RESET_BG_IMAGE':
      return { ...state, bgImage: null };
    default:
      return state;
  }
};

interface ThemeContextType {
  state: ThemeState;
  dispatch: React.Dispatch<ThemeAction>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(themeReducer, initialState);

  useEffect(() => {
    // Persist to localStorage
    localStorage.setItem('theme', state.theme);
    if (state.bgImage) {
      localStorage.setItem('bgImage', state.bgImage);
    } else {
      localStorage.removeItem('bgImage');
    }

    // Update document theme class
    if (state.theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    }

    // Update bg image
    const root = document.documentElement;
    if (state.bgImage) {
      root.style.setProperty('--bg-image', `url(${state.bgImage})`);
    } else {
      root.style.removeProperty('--bg-image');
    }
  }, [state.theme, state.bgImage]);

  return (
    <ThemeContext.Provider value={{ state, dispatch }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
