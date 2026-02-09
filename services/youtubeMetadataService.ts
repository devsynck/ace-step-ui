import { GoogleGenAI } from '@google/genai';

// Use Vite proxy for Ollama in development to avoid CORS
const OLLAMA_PROXY_URL = '/ollama';
const OLLAMA_DIRECT_URL = 'http://127.0.0.1:11434';

function getOllamaBaseUrl(userUrl?: string): string {
  const isDev = import.meta.env.DEV;
  if (isDev) {
    return OLLAMA_PROXY_URL;
  }
  return userUrl || OLLAMA_DIRECT_URL;
}

// Import AIProvider from api.ts (snake_case version from backend)
type AIProvider = import('./api.js').AIProvider;

export interface EnhanceYouTubeMetadataParams {
  currentTitle?: string;
  currentDescription?: string;
  currentTags?: string[];
  songLyrics?: string;
  songStyle?: string;
}

export interface EnhanceYouTubeMetadataResult {
  success: boolean;
  title?: string;
  description?: string;
  tags?: string[];
  error?: string;
}

interface AIMetadataResponse {
  title: string;
  description: string;
  tags: string[];
}

/**
 * Enhance YouTube metadata (title, description, tags) using an AI provider
 */
export async function enhanceYouTubeMetadataWithProvider(
  params: EnhanceYouTubeMetadataParams,
  provider: AIProvider
): Promise<EnhanceYouTubeMetadataResult> {
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

  try {
    const result = await enhanceMetadataInternal(params, provider);
    return {
      success: true,
      ...result
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('YouTube metadata enhancement error:', errorMessage);

    let userError = `Failed to enhance metadata with ${provider.provider_type}.`;
    if (provider.provider_type === 'ollama') {
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        userError += ' Make sure Ollama is running (ollama serve).';
      } else if (errorMessage.includes('404')) {
        userError += ' Model not found. Pull it with: ollama pull ' + provider.model;
      } else if (errorMessage.includes('CORS')) {
        userError += ' CORS error. Set OLLAMA_ORIGINS="*" when running Ollama.';
      } else {
        userError += ' Error: ' + errorMessage;
      }
    }

    return {
      success: false,
      error: userError
    };
  }
}

async function enhanceMetadataInternal(
  params: EnhanceYouTubeMetadataParams,
  provider: AIProvider
): Promise<AIMetadataResponse> {
  const { currentTitle = '', currentDescription = '', currentTags = [], songLyrics = '', songStyle = '' } = params;

  const prompt = `You are optimizing YouTube video metadata for music content. Return a JSON object with:
{
  "title": "Catchy, SEO-optimized title (max 100 chars)",
  "description": "Engaging description with keywords, hashtags, and call-to-action (max 5000 chars)",
  "tags": ["array", "of", "relevant", "tags", "max", "15", "items"]
}

Based on:
- Current title: "${currentTitle}"
- Current description: "${currentDescription.slice(0, 500)}"
- Song lyrics: "${songLyrics.slice(0, 300)}"
- Style: "${songStyle}"

Make it compelling for music discovery on YouTube. Include relevant genre tags.

IMPORTANT: Return ONLY valid JSON. Do not include any other text, markdown formatting, or code blocks.`;

  let responseText = '';

  if (provider.provider_type === 'gemini') {
    responseText = await generateWithGemini(prompt, provider.api_key!, provider.model || 'gemini-2.5-flash');
  } else if (provider.provider_type === 'ollama') {
    responseText = await generateWithOllama(prompt, provider.api_url, provider.model!);
  } else if (provider.provider_type === 'openai') {
    responseText = await generateWithOpenAI(prompt, provider.api_key!, provider.model || 'gpt-4o');
  } else if (provider.provider_type === 'anthropic') {
    responseText = await generateWithAnthropic(prompt, provider.api_key!, provider.model || 'claude-3-haiku-20240307');
  } else if (provider.provider_type === 'custom') {
    responseText = await generateWithCustom(prompt, provider.api_url!, provider.api_key || '', provider.model || 'default', provider.headers);
  }

  // Parse the response, handling potential markdown code blocks
  let cleanedResponse = responseText.trim();

  // Remove markdown code blocks if present
  if (cleanedResponse.startsWith('```json')) {
    cleanedResponse = cleanedResponse.slice(7);
  } else if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse.slice(3);
  }

  if (cleanedResponse.endsWith('```')) {
    cleanedResponse = cleanedResponse.slice(0, -3);
  }

  cleanedResponse = cleanedResponse.trim();

  let parsed: AIMetadataResponse;
  try {
    parsed = JSON.parse(cleanedResponse);
  } catch (parseError) {
    // Try to extract JSON from the response
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse AI response as JSON');
    }
  }

  // Validate and truncate results
  const result: AIMetadataResponse = {
    title: parsed.title || currentTitle || 'Untitled Music Video',
    description: parsed.description || currentDescription || 'Music video created with AI',
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 15) : currentTags.slice(0, 15)
  };

  // Ensure title is within YouTube limits
  if (result.title.length > 100) {
    result.title = result.title.slice(0, 100);
  }

  // Ensure description is within YouTube limits
  if (result.description.length > 5000) {
    result.description = result.description.slice(0, 5000);
  }

  return result;
}

async function generateWithGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt
  });
  return response.text?.trim() || '';
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
  return data.response?.trim() || '';
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
      max_tokens: 500,
      response_format: { type: 'json_object' }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
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
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || '';
}

async function generateWithCustom(
  prompt: string,
  apiUrl: string,
  apiKey: string,
  model: string,
  headers?: string | Record<string, string>
): Promise<string> {
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    requestHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  // Add custom headers if provided
  if (headers) {
    if (typeof headers === 'string') {
      try {
        const parsedHeaders = JSON.parse(headers);
        Object.assign(requestHeaders, parsedHeaders);
      } catch {
        // If headers is a string but not valid JSON, skip it
      }
    } else {
      Object.assign(requestHeaders, headers);
    }
  }

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Custom API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}
