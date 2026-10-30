import React, { createContext, useContext, useState, useEffect } from 'react';
import type { BusinessSettings } from '../types';
import { api } from '../api/client';

interface SettingsContextType {
  settings: BusinessSettings;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<BusinessSettings>) => Promise<boolean>;
  formatCurrency: (amount: number | undefined | null) => string;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const defaultSettings: BusinessSettings = {
  id: 'default',
  businessName: 'Freshway Water',
  tagline: 'Pure & Refreshing Drinking Water Supply',
  phone: '+92 300 1234567',
  email: 'info@freshwaywater.com',
  address: 'Main Commercial Area, Freshway Water Plant, Karachi, Pakistan',
  currencySymbol: 'Rs',
  taxPercentage: 0,
  receiptFooter: 'Thank you for choosing Freshway Water! Clean & Pure Water For Healthy Living.',
  invoicePrefix: 'INV',
  lowStockDefaultThreshold: 10,
  theme: 'light',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const refreshSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSettings();
      if (data) {
        setSettings(data);
        if (data.theme) {
          setTheme(data.theme);
          document.documentElement.classList.toggle('dark', data.theme === 'dark');
        }
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setError('Unable to load business settings. Check server connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  const toggleTheme = async () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    try {
      await api.updateSettings({ theme: nextTheme });
      setSettings((prev) => ({ ...prev, theme: nextTheme }));
    } catch (e) {
      console.error('Failed to save theme preference', e);
    }
  };

  const updateSettings = async (newSettings: Partial<BusinessSettings>): Promise<boolean> => {
    try {
      await api.updateSettings(newSettings);
      await refreshSettings();
      return true;
    } catch (e: any) {
      setError(e.message || 'Failed to update settings');
      return false;
    }
  };

  const formatCurrency = (amount: number | undefined | null): string => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return `${settings.currencySymbol} 0`;
    }
    const formatted = new Intl.NumberFormat('en-PK', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(amount);
    return `${settings.currencySymbol} ${formatted}`;
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        error,
        refreshSettings,
        updateSettings,
        formatCurrency,
        theme,
        toggleTheme,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
