import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Check, X, Globe, Zap, Key, Server, TestTube, Loader2 } from 'lucide-react';
import { settingsApi, AIProvider, ProviderType } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Toast, ToastType } from './Toast';

interface SettingsViewProps {
  onBack: () => void;
}

interface ProviderFormData {
  name: string;
  providerType: ProviderType;
  apiKey: string;
  apiUrl: string;
  model: string;
  headers: string; // JSON string for custom headers
  isDefault: boolean;
}

interface HeaderEntry {
  key: string;
  value: string;
}

const PROVIDER_CONFIGS: Record<ProviderType, { label: string; icon: React.ReactNode; needsApiKey: boolean; needsApiUrl: boolean; needsModel: boolean; needsHeaders: boolean }> = {
  gemini: {
    label: 'Google Gemini',
    icon: <Zap size={20} />,
    needsApiKey: true,
    needsApiUrl: false,
    needsModel: false,
    needsHeaders: false,
  },
  ollama: {
    label: 'Ollama (Local)',
    icon: <Server size={20} />,
    needsApiKey: false,
    needsApiUrl: true,
    needsModel: true,
    needsHeaders: false,
  },
  openai: {
    label: 'OpenAI',
    icon: <Key size={20} />,
    needsApiKey: true,
    needsApiUrl: false,
    needsModel: true,
    needsHeaders: false,
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    icon: <Globe size={20} />,
    needsApiKey: true,
    needsApiUrl: false,
    needsModel: true,
    needsHeaders: false,
  },
  custom: {
    label: 'Custom Provider',
    icon: <Server size={20} />,
    needsApiKey: true,
    needsApiUrl: true,
    needsModel: true,
    needsHeaders: true,
  },
};

const EMPTY_FORM: ProviderFormData = {
  name: '',
  providerType: 'gemini',
  apiKey: '',
  apiUrl: 'http://localhost:11434',
  model: '',
  headers: '{}',
  isDefault: false,
};

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack }) => {
  const { token } = useAuth();
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>(EMPTY_FORM);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [headersList, setHeadersList] = useState<HeaderEntry[]>([]);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false,
  });

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  const closeToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  // Load providers
  useEffect(() => {
    loadProviders();
  }, [token]);

  // Auto-migrate localStorage settings on first load
  useEffect(() => {
    const migrationFlag = localStorage.getItem('ace-settings-migrated');
    if (!migrationFlag && providers.length === 0) {
      migrateLocalStorageSettings();
    }
  }, [providers, token]);

  const loadProviders = async () => {
    if (!token) return;
    try {
      const res = await settingsApi.getProviders(token);
      setProviders(res.providers);
    } catch (error) {
      console.error('Failed to load providers:', error);
      showToast('Failed to load providers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const migrateLocalStorageSettings = async () => {
    if (!token) return;

    const storedProvider = localStorage.getItem('ace-ai-provider');
    const geminiKey = localStorage.getItem('ace-ai-gemini-key');
    const ollamaUrl = localStorage.getItem('ace-ai-ollama-url');
    const lmModel = localStorage.getItem('ace-lm-model');

    if (!storedProvider && !geminiKey) return;

    try {
      if (storedProvider === 'gemini' && geminiKey) {
        await settingsApi.addProvider({
          name: 'Migrated Gemini',
          providerType: 'gemini',
          apiKey: geminiKey,
          isDefault: true,
        }, token);
      }

      if (storedProvider === 'ollama') {
        await settingsApi.addProvider({
          name: 'Migrated Ollama',
          providerType: 'ollama',
          apiUrl: ollamaUrl || 'http://localhost:11434',
          model: lmModel || undefined,
          isDefault: true,
        }, token);
      }

      // Clear localStorage after migration
      localStorage.removeItem('ace-ai-provider');
      localStorage.removeItem('ace-ai-gemini-key');
      localStorage.removeItem('ace-ai-ollama-url');
      localStorage.setItem('ace-settings-migrated', 'true');

      // Reload providers
      loadProviders();
      showToast('Settings migrated successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      showToast('Failed to migrate settings', 'error');
    }
  };

  const handleAddProvider = () => {
    setEditingProvider(null);
    setFormData(EMPTY_FORM);
    setHeadersList([]);
    setShowForm(true);
  };

  const handleEditProvider = (provider: AIProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      providerType: provider.provider_type,
      apiKey: provider.api_key || '',
      apiUrl: provider.api_url || 'http://localhost:11434',
      model: provider.model || '',
      headers: provider.headers || '{}',
      isDefault: Boolean(provider.is_default),
    });

    // Parse headers for custom providers
    if (provider.provider_type === 'custom' && provider.headers) {
      try {
        const parsed = typeof provider.headers === 'string'
          ? JSON.parse(provider.headers)
          : provider.headers;
        setHeadersList(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })));
      } catch {
        setHeadersList([]);
      }
    } else {
      setHeadersList([]);
    }

    setShowForm(true);
  };

  const handleDeleteProvider = async (id: string) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to delete this provider?')) return;

    try {
      await settingsApi.deleteProvider(id, token);
      setProviders(prev => prev.filter(p => p.id !== id));
      showToast('Provider deleted');
    } catch (error) {
      console.error('Failed to delete provider:', error);
      showToast('Failed to delete provider', 'error');
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!token) return;
    try {
      await settingsApi.setDefaultProvider(id, token);
      setProviders(prev =>
        prev.map(p => ({ ...p, is_default: p.id === id ? 1 : 0 }))
      );
      showToast('Default provider updated');
    } catch (error) {
      console.error('Failed to set default:', error);
      showToast('Failed to set default provider', 'error');
    }
  };

  const handleTestProvider = async (id: string) => {
    if (!token) return;
    setTestingProviderId(id);
    try {
      const result = await settingsApi.testProvider(id, token);
      setTestResults(prev => ({ ...prev, [id]: { success: result.success, message: result.message } }));
      showToast(result.message, result.success ? 'success' : 'error');
    } catch (error) {
      console.error('Test failed:', error);
      const errorMsg = error instanceof Error ? error.message : 'Test failed';
      setTestResults(prev => ({ ...prev, [id]: { success: false, message: errorMsg } }));
      showToast('Test failed', 'error');
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleSaveProvider = async () => {
    if (!token) return;

    const config = PROVIDER_CONFIGS[formData.providerType];

    // Validate required fields
    if (!formData.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }

    if (config.needsApiKey && !formData.apiKey.trim()) {
      showToast('API Key is required', 'error');
      return;
    }

    if (config.needsApiUrl && !formData.apiUrl.trim()) {
      showToast('API URL is required', 'error');
      return;
    }

    if (config.needsModel && !formData.model.trim()) {
      showToast('Model is required', 'error');
      return;
    }

    if (config.needsHeaders) {
      // Validate headers JSON
      try {
        const headersObj = headersList.reduce((acc, { key, value }) => {
          if (key.trim()) {
            acc[key.trim()] = value;
          }
          return acc;
        }, {} as Record<string, string>);
        formData.headers = JSON.stringify(headersObj);
      } catch {
        showToast('Invalid headers format', 'error');
        return;
      }
    }

    try {
      const params = {
        name: formData.name.trim(),
        providerType: formData.providerType,
        apiKey: config.needsApiKey ? formData.apiKey.trim() : undefined,
        apiUrl: config.needsApiUrl ? formData.apiUrl.trim() : undefined,
        model: config.needsModel ? formData.model.trim() : undefined,
        headers: config.needsHeaders ? formData.headers : undefined,
        isDefault: formData.isDefault,
      };

      if (editingProvider) {
        const res = await settingsApi.updateProvider(editingProvider.id, params, token);
        setProviders(prev =>
          prev.map(p => p.id === editingProvider.id ? res.provider : p)
        );
        showToast('Provider updated');
      } else {
        const res = await settingsApi.addProvider(params, token);
        setProviders(prev => [res.provider, ...prev]);
        showToast('Provider added');
      }

      setShowForm(false);
      setFormData(EMPTY_FORM);
      setHeadersList([]);
    } catch (error) {
      console.error('Failed to save provider:', error);
      showToast('Failed to save provider', 'error');
    }
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setFormData(EMPTY_FORM);
    setEditingProvider(null);
    setHeadersList([]);
  };

  const addHeaderEntry = () => {
    setHeadersList(prev => [...prev, { key: '', value: '' }]);
  };

  const updateHeaderEntry = (index: number, field: 'key' | 'value', value: string) => {
    setHeadersList(prev =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  };

  const removeHeaderEntry = (index: number) => {
    setHeadersList(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-zinc-900">
        <Loader2 className="animate-spin text-pink-500" size={32} />
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white flex flex-col overflow-hidden transition-colors duration-300">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-white/5 px-6 py-4 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">AI Provider Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-zinc-900">
        {/* Add Provider Button */}
        <button
          onClick={handleAddProvider}
          className="mb-6 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Add AI Provider
        </button>

        {/* Providers List */}
        <div className="space-y-4">
          {providers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
              <p>No AI providers configured yet.</p>
              <p className="text-sm mt-2">Click "Add AI Provider" to get started.</p>
            </div>
          ) : (
            providers.map(provider => {
              const config = PROVIDER_CONFIGS[provider.provider_type];
              const testResult = testResults[provider.id];

              return (
                <div
                  key={provider.id}
                  className="border border-zinc-200 dark:border-white/10 rounded-xl p-4 bg-zinc-50 dark:bg-zinc-900/30 hover:border-pink-500/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white">
                        {config.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-zinc-900 dark:text-white">{provider.name}</h3>
                          {provider.is_default && (
                            <span className="text-xs px-2 py-0.5 bg-pink-500/20 text-pink-500 rounded-full font-medium">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{config.label}</p>
                        {provider.model && (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Model: {provider.model}</p>
                        )}
                        {provider.api_url && provider.provider_type !== 'gemini' && (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">URL: {provider.api_url}</p>
                        )}
                        {testResult && (
                          <p className={`text-xs mt-2 ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                            {testResult.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!provider.is_default && (
                        <button
                          onClick={() => handleSetDefault(provider.id)}
                          className="p-2 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors"
                          title="Set as default"
                        >
                          <Check size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleTestProvider(provider.id)}
                        disabled={testingProviderId === provider.id}
                        className="p-2 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors disabled:opacity-50"
                        title="Test connection"
                      >
                        {testingProviderId === provider.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <TestTube size={16} />
                        )}
                      </button>
                      <button
                        onClick={() => handleEditProvider(provider)}
                        className="p-2 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteProvider(provider.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto m-4 border border-zinc-200 dark:border-white/10">
            <div className="p-6">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">
                {editingProvider ? 'Edit AI Provider' : 'Add AI Provider'}
              </h2>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="My AI Provider"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                {/* Provider Type */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Provider Type
                  </label>
                  <select
                    value={formData.providerType}
                    onChange={(e) => setFormData(prev => ({ ...prev, providerType: e.target.value as ProviderType }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500 [&>option]:bg-white [&>option]:dark:bg-zinc-800"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="custom">Custom Provider</option>
                  </select>
                </div>

                {PROVIDER_CONFIGS[formData.providerType].needsApiKey && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={formData.apiKey}
                      onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                      placeholder="Enter your API key"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                )}

                {PROVIDER_CONFIGS[formData.providerType].needsApiUrl && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      API URL
                    </label>
                    <input
                      type="text"
                      value={formData.apiUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, apiUrl: e.target.value }))}
                      placeholder="http://localhost:11434"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                )}

                {PROVIDER_CONFIGS[formData.providerType].needsModel && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Model
                    </label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                      placeholder={formData.providerType === 'ollama' ? 'llama3.2' : formData.providerType === 'openai' ? 'gpt-4o' : 'claude-3-haiku-20240307'}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                )}

                {formData.providerType === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Custom Headers
                    </label>
                    <div className="space-y-2">
                      {headersList.map((entry, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            value={entry.key}
                            onChange={(e) => updateHeaderEntry(index, 'key', e.target.value)}
                            placeholder="Header name"
                            className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                          />
                          <input
                            type="text"
                            value={entry.value}
                            onChange={(e) => updateHeaderEntry(index, 'value', e.target.value)}
                            placeholder="Header value"
                            className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                          />
                          <button
                            onClick={() => removeHeaderEntry(index)}
                            className="p-2 hover:bg-red-500/20 rounded-lg text-red-500 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addHeaderEntry}
                        className="text-sm text-pink-500 hover:text-pink-600 font-medium"
                      >
                        + Add Header
                      </button>
                    </div>
                  </div>
                )}

                {/* Set as Default */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-white/10 text-pink-500 focus:ring-pink-500"
                  />
                  <label htmlFor="isDefault" className="text-sm text-zinc-700 dark:text-zinc-300">
                    Set as default provider
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCancelForm}
                  className="flex-1 px-4 py-2 border border-zinc-300 dark:border-white/10 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProvider}
                  className="flex-1 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg font-medium transition-colors"
                >
                  {editingProvider ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={closeToast}
      />
    </div>
  );
};
