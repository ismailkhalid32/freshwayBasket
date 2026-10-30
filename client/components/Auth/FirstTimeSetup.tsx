import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FreshwayLogo } from '../Branding/FreshwayLogo';
import { Shield, User, Mail, Lock, Building2, Phone, MapPin, Server, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../../api/client';

export const FirstTimeSetup: React.FC = () => {
  const { setupAdmin } = useAuth();
  const [formData, setFormData] = useState({
    fullName: '',
    username: 'admin',
    email: '',
    password: '',
    confirmPassword: '',
    businessName: 'Freshway Water',
    phone: '+92 300 1234567',
    address: 'Main Commercial Area, Freshway Water Plant',
    mongoDbUri: '',
  });
  const [loading, setLoading] = useState(false);
  const [testingMongo, setTestingMongo] = useState(false);
  const [mongoTestMsg, setMongoTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTestMongo = async () => {
    if (!formData.mongoDbUri.trim()) {
      setMongoTestMsg({ ok: false, text: 'Enter a MongoDB Atlas connection string first.' });
      return;
    }
    try {
      setTestingMongo(true);
      setMongoTestMsg(null);
      const res = await api.testDatabaseConnection(formData.mongoDbUri.trim());
      setMongoTestMsg({ ok: res.success, text: res.message });
    } catch (err: any) {
      setMongoTestMsg({ ok: false, text: err.message || 'Connection test failed.' });
    } finally {
      setTestingMongo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.username || !formData.email || !formData.password) {
      setError('Please complete all required administrator fields.');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await setupAdmin(formData);
    } catch (err: any) {
      setError(err.message || 'Failed to complete administrator setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="p-6 sm:p-8 bg-gradient-to-r from-blue-600 to-cyan-600 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FreshwayLogo size="lg" />
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest bg-white/20 px-2.5 py-0.5 rounded-full">
                First-Time System Initialization
              </span>
              <h1 className="text-xl font-extrabold mt-1">Freshway Water POS & Ledger</h1>
              <p className="text-xs text-blue-100">
                Create your Super Administrator account & configure MongoDB Atlas
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Administrator Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="e.g. Muhammad Ali"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Login Username *
              </label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="admin"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Admin Email *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="admin@freshwaywater.com"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Business Name *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Password (min 6 chars) *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Confirm Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Server className="w-4 h-4 text-emerald-600" />
                <span>MongoDB Atlas URI (Optional now, or configure anytime in Settings)</span>
              </label>
              <button
                type="button"
                onClick={handleTestMongo}
                disabled={testingMongo}
                className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold hover:bg-slate-300 cursor-pointer"
              >
                {testingMongo ? 'Testing...' : 'Test URI'}
              </button>
            </div>
            <input
              type="text"
              value={formData.mongoDbUri}
              onChange={(e) => setFormData({ ...formData, mongoDbUri: e.target.value })}
              placeholder="mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/freshway_pos"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px] text-slate-900 dark:text-white focus:outline-none"
            />
            {mongoTestMsg && (
              <p className={`text-[11px] font-semibold flex items-center gap-1 ${mongoTestMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                {mongoTestMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{mongoTestMsg.text}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-extrabold shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer text-sm disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Initialize System & Create Admin Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
