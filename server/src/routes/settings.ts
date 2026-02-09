import { Router, Response } from 'express';
import { pool } from '../db/pool.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Helper to generate a unique ID
function generateId(): string {
  return `prov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get all AI providers for the authenticated user
router.get('/providers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      `SELECT id, user_id, name, provider_type, api_url, model, headers, is_default, created_at, updated_at
       FROM ai_providers
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    res.json({ providers: result.rows });
  } catch (error) {
    console.error('Get providers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new AI provider
router.post('/providers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, providerType, apiKey, apiUrl, model, headers, isDefault } = req.body;

    // Validate required fields
    if (!name || !providerType) {
      res.status(400).json({ error: 'Name and provider type are required' });
      return;
    }

    const validProviderTypes = ['gemini', 'ollama', 'openai', 'anthropic', 'custom'];
    if (!validProviderTypes.includes(providerType)) {
      res.status(400).json({ error: 'Invalid provider type' });
      return;
    }

    // If setting as default, remove default from all other providers
    if (isDefault) {
      await pool.query(
        'UPDATE ai_providers SET is_default = 0 WHERE user_id = $1',
        [userId]
      );
    }

    const id = generateId();
    const headersJson = headers ? JSON.stringify(headers) : null;

    await pool.query(
      `INSERT INTO ai_providers (id, user_id, name, provider_type, api_key, api_url, model, headers, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, userId, name, providerType, apiKey || null, apiUrl || null, model || null, headersJson, isDefault ? 1 : 0]
    );

    // Return the created provider (without api_key)
    const result = await pool.query(
      `SELECT id, user_id, name, provider_type, api_url, model, headers, is_default, created_at, updated_at
       FROM ai_providers WHERE id = $1`,
      [id]
    );

    res.json({ provider: result.rows[0] });
  } catch (error) {
    console.error('Add provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update an existing AI provider
router.patch('/providers/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name, providerType, apiKey, apiUrl, model, headers, isDefault } = req.body;

    // Verify the provider belongs to the user
    const existing = await pool.query(
      'SELECT id FROM ai_providers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    // If setting as default, remove default from all other providers
    if (isDefault) {
      await pool.query(
        'UPDATE ai_providers SET is_default = 0 WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (providerType !== undefined) {
      const validProviderTypes = ['gemini', 'ollama', 'openai', 'anthropic', 'custom'];
      if (!validProviderTypes.includes(providerType)) {
        res.status(400).json({ error: 'Invalid provider type' });
        return;
      }
      updates.push(`provider_type = $${paramCount}`);
      values.push(providerType);
      paramCount++;
    }

    if (apiKey !== undefined) {
      updates.push(`api_key = $${paramCount}`);
      values.push(apiKey);
      paramCount++;
    }

    if (apiUrl !== undefined) {
      updates.push(`api_url = $${paramCount}`);
      values.push(apiUrl);
      paramCount++;
    }

    if (model !== undefined) {
      updates.push(`model = $${paramCount}`);
      values.push(model);
      paramCount++;
    }

    if (headers !== undefined) {
      updates.push(`headers = $${paramCount}`);
      values.push(headers ? JSON.stringify(headers) : null);
      paramCount++;
    }

    if (isDefault !== undefined) {
      updates.push(`is_default = $${paramCount}`);
      values.push(isDefault ? 1 : 0);
      paramCount++;
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
    values.push(id);

    await pool.query(
      `UPDATE ai_providers SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    // Return the updated provider (without api_key)
    const result = await pool.query(
      `SELECT id, user_id, name, provider_type, api_url, model, headers, is_default, created_at, updated_at
       FROM ai_providers WHERE id = $1`,
      [id]
    );

    res.json({ provider: result.rows[0] });
  } catch (error) {
    console.error('Update provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete an AI provider
router.delete('/providers/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Verify the provider belongs to the user
    const existing = await pool.query(
      'SELECT id FROM ai_providers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    await pool.query('DELETE FROM ai_providers WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set a provider as the default
router.patch('/providers/:id/default', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Verify the provider belongs to the user
    const existing = await pool.query(
      'SELECT id FROM ai_providers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    // Remove default from all providers and set this one as default
    await pool.query('UPDATE ai_providers SET is_default = 0 WHERE user_id = $1', [userId]);
    await pool.query(
      'UPDATE ai_providers SET is_default = 1, updated_at = datetime(\'now\') WHERE id = $1',
      [id]
    );

    // Return the updated provider
    const result = await pool.query(
      `SELECT id, user_id, name, provider_type, api_url, model, headers, is_default, created_at, updated_at
       FROM ai_providers WHERE id = $1`,
      [id]
    );

    res.json({ provider: result.rows[0] });
  } catch (error) {
    console.error('Set default provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test connection to a provider
router.post('/providers/:id/test', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Get the provider with api_key for testing
    const result = await pool.query(
      'SELECT * FROM ai_providers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    const provider = result.rows[0];
    let testResult: { success: boolean; message: string; details?: any } = {
      success: false,
      message: 'Unknown provider type',
    };

    switch (provider.provider_type) {
      case 'gemini':
        // Test Gemini API connection
        try {
          const testResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            method: 'GET',
            headers: {
              'x-goog-api-key': provider.api_key,
            },
          });

          if (testResponse.ok) {
            const data = await testResponse.json();
            testResult = {
              success: true,
              message: 'Connection successful',
              details: { models: data.models?.length || 0 },
            };
          } else {
            testResult = {
              success: false,
              message: `API error: ${testResponse.status}`,
            };
          }
        } catch (e) {
          testResult = {
            success: false,
            message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
          };
        }
        break;

      case 'ollama':
        // Test Ollama API connection
        try {
          const ollamaUrl = provider.api_url || 'http://localhost:11434';
          const testResponse = await fetch(`${ollamaUrl}/api/tags`);

          if (testResponse.ok) {
            const data = await testResponse.json();
            testResult = {
              success: true,
              message: 'Connection successful',
              details: { models: data.models?.length || 0 },
            };
          } else {
            testResult = {
              success: false,
              message: `API error: ${testResponse.status}`,
            };
          }
        } catch (e) {
          testResult = {
            success: false,
            message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
          };
        }
        break;

      case 'openai':
        // Test OpenAI API connection
        try {
          const testResponse = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${provider.api_key}`,
            },
          });

          if (testResponse.ok) {
            const data = await testResponse.json();
            testResult = {
              success: true,
              message: 'Connection successful',
              details: { models: data.data?.length || 0 },
            };
          } else {
            const errorData = await testResponse.json().catch(() => ({}));
            testResult = {
              success: false,
              message: `API error: ${errorData.error?.message || testResponse.status}`,
            };
          }
        } catch (e) {
          testResult = {
            success: false,
            message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
          };
        }
        break;

      case 'anthropic':
        // Test Anthropic API connection (minimal test)
        try {
          const testResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': provider.api_key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: provider.model || 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }],
            }),
          });

          if (testResponse.ok || testResponse.status === 400) {
            // 400 is OK for this test (means we got through to the API, just bad params)
            testResult = {
              success: true,
              message: 'Connection successful',
            };
          } else {
            const errorData = await testResponse.json().catch(() => ({}));
            testResult = {
              success: false,
              message: `API error: ${errorData.error?.message || testResponse.status}`,
            };
          }
        } catch (e) {
          testResult = {
            success: false,
            message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
          };
        }
        break;

      case 'custom':
        // Test custom provider - basic URL check
        try {
          if (!provider.api_url) {
            testResult = {
              success: false,
              message: 'API URL is required for custom providers',
            };
          } else {
            const testUrl = new URL(provider.api_url);
            testResult = {
              success: true,
              message: 'URL is valid (connection not tested)',
              details: { url: testUrl.origin },
            };
          }
        } catch (e) {
          testResult = {
            success: false,
            message: `Invalid URL: ${e instanceof Error ? e.message : 'Unknown error'}`,
          };
        }
        break;
    }

    res.json(testResult);
  } catch (error) {
    console.error('Test provider error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhance YouTube metadata using the default AI provider
router.post('/providers/enhance-youtube-metadata', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { currentTitle, currentDescription, currentTags, songLyrics, songStyle } = req.body;

    // Get the default provider with api_key
    const result = await pool.query(
      'SELECT * FROM ai_providers WHERE user_id = $1 AND is_default = 1',
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'No default AI provider configured' });
      return;
    }

    const provider = result.rows[0];

    // Build the prompt
    const prompt = `You are optimizing YouTube video metadata for music content. Return a JSON object with:
{
  "title": "Catchy, SEO-optimized title (max 100 chars)",
  "description": "Engaging description with keywords, hashtags, and call-to-action (max 5000 chars)",
  "tags": ["array", "of", "relevant", "tags", "max", "15", "items"]
}

Based on:
- Current title: "${currentTitle || ''}"
- Current description: "${(currentDescription || '').slice(0, 500)}"
- Song lyrics: "${(songLyrics || '').slice(0, 300)}"
- Style: "${songStyle || ''}"

Make it compelling for music discovery on YouTube. Include relevant genre tags.

IMPORTANT: Return ONLY valid JSON. Do not include any other text, markdown formatting, or code blocks.`;

    let responseText = '';

    switch (provider.provider_type) {
      case 'gemini': {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: provider.api_key });
        const aiResponse = await ai.models.generateContent({
          model: provider.model || 'gemini-2.5-flash',
          contents: prompt
        });
        responseText = aiResponse.text?.trim() || '';
        break;
      }

      case 'ollama': {
        const ollamaUrl = provider.api_url || 'http://localhost:11434';
        const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: provider.model,
            prompt,
            stream: false
          })
        });

        if (!ollamaResponse.ok) {
          throw new Error(`Ollama API error: ${ollamaResponse.status}`);
        }

        const ollamaData = await ollamaResponse.json();
        responseText = ollamaData.response?.trim() || '';
        break;
      }

      case 'openai': {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.api_key}`,
          },
          body: JSON.stringify({
            model: provider.model || 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
            response_format: { type: 'json_object' }
          }),
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text().catch(() => 'Unknown error');
          throw new Error(`OpenAI API error: ${errorText}`);
        }

        const openaiData = await openaiResponse.json();
        responseText = openaiData.choices?.[0]?.message?.content?.trim() || '';
        break;
      }

      case 'anthropic': {
        const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.api_key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: provider.model || 'claude-3-haiku-20240307',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!anthropicResponse.ok) {
          const errorText = await anthropicResponse.text().catch(() => 'Unknown error');
          throw new Error(`Anthropic API error: ${errorText}`);
        }

        const anthropicData = await anthropicResponse.json();
        responseText = anthropicData.content?.[0]?.text?.trim() || '';
        break;
      }

      case 'custom': {
        const requestHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (provider.api_key) {
          requestHeaders['Authorization'] = `Bearer ${provider.api_key}`;
        }

        // Add custom headers if provided
        if (provider.headers) {
          try {
            const headersObj = typeof provider.headers === 'string'
              ? JSON.parse(provider.headers)
              : provider.headers;
            Object.assign(requestHeaders, headersObj);
          } catch {
            // Invalid headers, skip
          }
        }

        const customResponse = await fetch(`${provider.api_url}/chat/completions`, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
          }),
        });

        if (!customResponse.ok) {
          const errorText = await customResponse.text().catch(() => 'Unknown error');
          throw new Error(`Custom API error: ${errorText}`);
        }

        const customData = await customResponse.json();
        responseText = customData.choices?.[0]?.message?.content?.trim() || '';
        break;
      }

      default:
        res.status(400).json({ error: 'Unknown provider type' });
        return;
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

    let parsed: { title?: string; description?: string; tags?: string[] };
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
    const enhanced: {
      title: string;
      description: string;
      tags: string[];
    } = {
      title: parsed.title || currentTitle || 'Untitled Music Video',
      description: parsed.description || currentDescription || 'Music video created with AI',
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 15) : (currentTags || []).slice(0, 15)
    };

    // Ensure title is within YouTube limits
    if (enhanced.title.length > 100) {
      enhanced.title = enhanced.title.slice(0, 100);
    }

    // Ensure description is within YouTube limits
    if (enhanced.description.length > 5000) {
      enhanced.description = enhanced.description.slice(0, 5000);
    }

    res.json({ success: true, ...enhanced });
  } catch (error) {
    console.error('Enhance YouTube metadata error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to enhance metadata'
    });
  }
});

export default router;
