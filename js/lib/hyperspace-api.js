// js/lib/hyperspace-api.js - Anthropic API via Hyperspace local proxy
// Reads ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN from storage,
// defaulting to the values Claude Code uses on this machine.

const DEFAULT_BASE_URL = 'http://localhost:6655/anthropic';
const DEFAULT_TOKEN    = '6cb1e31b-b128-4816-818d-e67db4fc5194';

async function getHyperspaceSettings() {
  return chrome.storage.local.get([
    'hyperspaceBaseUrl',
    'hyperspaceToken',
    'hyperspaceModel',
  ]);
}

async function isHyperspaceConfigured() {
  const s = await getHyperspaceSettings();
  return !!(s.hyperspaceToken || DEFAULT_TOKEN);
}

/**
 * Calls the Anthropic messages API through the Hyperspace proxy.
 * @param {Array} messages  Array of {role, content} objects
 * @param {object} [opts]
 * @param {number} [opts.maxTokens]
 * @returns {Promise<string>} Response text
 */
async function callHyperspace(messages, opts = {}) {
  const s = await getHyperspaceSettings();
  const baseUrl = (s.hyperspaceBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token   = s.hyperspaceToken   || DEFAULT_TOKEN;
  const model   = s.hyperspaceModel   || 'claude-sonnet-latest';

  const url = `${baseUrl}/v1/messages`;

  // Separate system message if present (Anthropic API takes it as a top-level param)
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const body = {
    model,
    max_tokens: opts.maxTokens || 2048,
    messages: chatMessages,
    ...(systemMsg ? { system: systemMsg.content } : {}),
  };

  console.log(`[Hyperspace] POST ${url} model=${model}`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Hyperspace inference failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();

  // Anthropic response: content[0].text
  const text = data?.content?.[0]?.text;
  if (text === undefined || text === null) {
    console.error('[Hyperspace] Unexpected response shape:', JSON.stringify(data));
    throw new Error('Hyperspace returned an unexpected response format');
  }

  return text;
}

/**
 * Wraps plain text into Gemini-shaped envelope so all callers need zero changes.
 */
function toGeminiEnvelope(text) {
  return {
    candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP' }],
  };
}

/**
 * Builds a minimal placeholder example object from a JSON schema so Claude
 * has a concrete structural target when forceJson is used.
 */
function buildSchemaExample(schema, depth = 0) {
  if (depth > 4) return null;
  if (!schema) return null;
  switch (schema.type) {
    case 'OBJECT': case 'object': {
      const obj = {};
      for (const [k, v] of Object.entries(schema.properties || {})) {
        obj[k] = buildSchemaExample(v, depth + 1);
      }
      return obj;
    }
    case 'ARRAY': case 'array':
      return [buildSchemaExample(schema.items, depth + 1)];
    case 'STRING': case 'string':   return '<string>';
    case 'INTEGER': case 'integer': return 0;
    case 'NUMBER': case 'number':   return 0.0;
    case 'BOOLEAN': case 'boolean': return false;
    default: return null;
  }
}

async function analyzeTextWithHyperspace(textContent, promptText = 'Summarize the following text:') {
  console.log('[Hyperspace] Starting text analysis');
  const messages = [{ role: 'user', content: `${promptText}\n\n${textContent}` }];
  const text = await callHyperspace(messages);
  console.log('[Hyperspace] Text analysis complete');
  return toGeminiEnvelope(text);
}

async function analyzeImageWithHyperspace(imageDataUrl, promptText = 'Describe this image in detail.', opts = {}) {
  console.log('[Hyperspace] Starting image analysis');

  if (!imageDataUrl || !imageDataUrl.startsWith('data:image')) {
    throw new Error('Invalid image data URL provided.');
  }

  // Extract base64 data and media type
  const [header, base64Data] = imageDataUrl.split(',');
  const mediaType = header.match(/data:(image\/[^;]+)/)?.[1] || 'image/png';

  let effectivePrompt = promptText;
  if (opts.forceJson) {
    let schemaHint = '';
    if (opts.schema?.properties) {
      // Build a minimal example object from the schema so Claude has a concrete structural target
      const example = buildSchemaExample(opts.schema);
      schemaHint = `\n\nYour response MUST be a single JSON object matching this exact structure (types shown as placeholders):\n${JSON.stringify(example, null, 2)}`;
    }
    effectivePrompt += `${schemaHint}\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown fences, commentary, or any text outside the JSON object.`;
  }

  const messages = [{
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64Data },
      },
      { type: 'text', text: effectivePrompt },
    ],
  }];

  const text = await callHyperspace(messages, { maxTokens: opts.maxTokens || 8192 });
  console.log('[Hyperspace] Image analysis complete');

  if (opts.forceJson) {
    const cleaned = extractJsonFromText(text);
    return toGeminiEnvelope(cleaned);
  }

  return toGeminiEnvelope(text);
}

function extractJsonFromText(raw) {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const firstBrace   = stripped.indexOf('{');
  const firstBracket = stripped.indexOf('[');
  const start = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  if (start === -1) return raw;
  const lastBrace   = stripped.lastIndexOf('}');
  const lastBracket = stripped.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (end === -1 || end < start) return raw;
  const candidate = stripped.slice(start, end + 1);
  try { JSON.parse(candidate); return candidate; } catch { return raw; }
}

async function testHyperspaceConnection() {
  try {
    const s = await getHyperspaceSettings();
    const token = s.hyperspaceToken || DEFAULT_TOKEN;
    if (!token) {
      return { success: false, message: 'No token configured.' };
    }
    const result = await analyzeTextWithHyperspace('Hello', 'Reply with exactly: "Connection OK"');
    const reply = result.candidates[0].content.parts[0].text.slice(0, 80);
    return { success: true, message: `Connected. Model replied: "${reply}"` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export {
  analyzeTextWithHyperspace,
  analyzeImageWithHyperspace,
  isHyperspaceConfigured,
  getHyperspaceSettings,
  testHyperspaceConnection,
};
