import { GoogleGenAI } from '@google/genai';

// Use Vite proxy for Ollama in development to avoid CORS
const OLLAMA_PROXY_URL = '/ollama';
const OLLAMA_DIRECT_URL = 'http://127.0.0.1:11434';

function getOllamaBaseUrl(userUrl?: string): string {
  // In development, use the proxy; in production, use direct URL or user-provided URL
  const isDev = import.meta.env.DEV;
  if (isDev) {
    return OLLAMA_PROXY_URL;
  }
  return userUrl || OLLAMA_DIRECT_URL;
}

export type AIProviderType = 'gemini' | 'ollama' | 'openai' | 'anthropic' | 'custom';

// Re-export AIProvider from api.ts for convenience
export type { AIProvider } from './api.js';

export interface GenerateTitleParams {
  lyrics?: string;
  style: string;
  customTitle?: string;
}

export interface GenerateTitleResult {
  success: boolean;
  title?: string;
  error?: string;
}

// Legacy AISettings interface for backward compatibility
// @deprecated Use AIProvider from api.ts instead
export interface AISettings {
  provider: AIProviderType;
  geminiApiKey?: string;
  geminiModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

// Legacy entry point for backward compatibility
export async function generateTitle(
  params: GenerateTitleParams,
  settings: AISettings
): Promise<GenerateTitleResult> {
  // Validate settings
  if (settings.provider === 'gemini' && !settings.geminiApiKey) {
    return {
      success: false,
      error: 'Please configure your Gemini API key in Settings'
    };
  }

  if (settings.provider === 'ollama' && !settings.ollamaModel) {
    return {
      success: false,
      error: 'Please configure Ollama model in Settings'
    };
  }

  return generateTitleInternal(params, settings.provider, {
    geminiApiKey: settings.geminiApiKey,
    geminiModel: settings.geminiModel,
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
    openaiApiKey: undefined,
    anthropicApiKey: undefined,
  });
}

// New function that works with AIProvider from the settings API
export async function generateTitleWithProvider(
  params: GenerateTitleParams,
  provider: import('./api.js').AIProvider
): Promise<GenerateTitleResult> {
  // Validate provider
  if (provider.provider_type === 'gemini' && !provider.api_key) {
    return {
      success: false,
      error: 'Please configure your Gemini API key in Settings'
    };
  }

  if (provider.provider_type === 'ollama' && !provider.model) {
    return {
      success: false,
      error: 'Please configure Ollama model in Settings'
    };
  }

  if (provider.provider_type === 'openai' && !provider.api_key) {
    return {
      success: false,
      error: 'Please configure your OpenAI API key in Settings'
    };
  }

  if (provider.provider_type === 'anthropic' && !provider.api_key) {
    return {
      success: false,
      error: 'Please configure your Anthropic API key in Settings'
    };
  }

  if (provider.provider_type === 'custom' && !provider.api_url) {
    return {
      success: false,
      error: 'Please configure API URL for custom provider in Settings'
    };
  }

  return generateTitleInternal(params, provider.provider_type, {
    geminiApiKey: provider.api_key,
    geminiModel: provider.model,
    ollamaUrl: provider.api_url,
    ollamaModel: provider.model,
    openaiApiKey: provider.api_key,
    anthropicApiKey: provider.api_key,
  });
}

async function generateTitleInternal(
  params: GenerateTitleParams,
  providerType: AIProviderType,
  config: {
    geminiApiKey?: string;
    geminiModel?: string;
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
  }
): Promise<GenerateTitleResult> {
  const lyricsSnippet = params.lyrics ? params.lyrics.slice(0, 200) : 'instrumental';
  const customHint = params.customTitle ? `User has this idea: "${params.customTitle}"` : '';

  const prompt = `Generate a creative song title (2-6 words, no quotes) based on:
- Style/Mood: "${params.style}"
- Lyrics themes: "${lyricsSnippet}"
- ${customHint}

Return ONLY the title, nothing else.`;

  try {
    let title = '';

    if (providerType === 'gemini') {
      title = await generateWithGemini(prompt, config.geminiApiKey!, config.geminiModel || 'gemini-2.5-flash');
    } else if (providerType === 'ollama') {
      title = await generateWithOllama(prompt, config.ollamaUrl, config.ollamaModel!);
    } else if (providerType === 'openai') {
      title = await generateWithOpenAI(prompt, config.openaiApiKey!, config.geminiModel || 'gpt-4o');
    } else if (providerType === 'anthropic') {
      title = await generateWithAnthropic(prompt, config.anthropicApiKey!, config.geminiModel || 'claude-3-haiku-20240307');
    } else if (providerType === 'custom') {
      // For custom providers, attempt a basic OpenAI-compatible call
      title = await generateWithCustom(prompt, config.ollamaUrl!, config.openaiApiKey!, config.geminiModel || 'default');
    }

    return {
      success: true,
      title: title || getFallbackTitle(params.style)
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Title generation error:', errorMessage);

    let userError = `Failed to generate title with ${providerType}.`;
    if (providerType === 'ollama') {
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        userError += ' Make sure Ollama is running (ollama serve).';
      } else if (errorMessage.includes('404')) {
        userError += ' Model not found. Pull it with: ollama pull ' + config.ollamaModel;
      } else if (errorMessage.includes('CORS')) {
        userError += ' CORS error. Set OLLAMA_ORIGINS="*" when running Ollama.';
      } else {
        userError += ' Error: ' + errorMessage;
      }
    }

    return {
      success: false,
      error: userError,
      title: getFallbackTitle(params.style)
    };
  }
}

async function generateWithGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt
  });
  return response.text?.trim().replace(/^"|"$/g, '') || '';
}

async function generateWithOllama(prompt: string, userUrl: string | undefined, model: string): Promise<string> {
  const baseUrl = getOllamaBaseUrl(userUrl);

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.response?.trim().replace(/^"|"$/g, '') || '';
}

async function generateWithOpenAI(prompt: string, apiKey: string, model: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, '') || '';
}

async function generateWithAnthropic(prompt: string, apiKey: string, model: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim().replace(/^"|"$/g, '') || '';
}

async function generateWithCustom(prompt: string, apiUrl: string, apiKey: string, model: string): Promise<string> {
  // Parse headers from the provider if available (for custom providers)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Custom API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, '') || '';
}

function getFallbackTitle(style: string): string {
  const styleWords = style.split(' ').slice(0, 2);
  return styleWords.length > 0
    ? `Untitled ${styleWords.join(' ')} Track`
    : 'Untitled Song';
}

export async function validateConnection(settings: AISettings): Promise<{ success: boolean; error?: string }> {
  try {
    if (settings.provider === 'gemini') {
      if (!settings.geminiApiKey) return { success: false, error: 'No API key' };
      const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
      await ai.models.generateContent({
        model: settings.geminiModel || 'gemini-2.5-flash',
        contents: 'Hi'
      });
    } else if (settings.provider === 'ollama') {
      const baseUrl = getOllamaBaseUrl(settings.ollamaUrl);
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET'
      });
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }
    }
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return { success: false, error: 'Cannot connect to Ollama. Make sure it is running (ollama serve).' };
    }
    return { success: false, error: errorMessage };
  }
}
