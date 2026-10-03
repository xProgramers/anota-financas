// Cliente mínimo da API do Gemini (Google AI Studio), via REST.
import { buildSystemPrompt, buildUserPrompt, RESPONSE_SCHEMA } from './prompt.js';
import type { InterpretContext } from './types.js';

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export interface ProviderOutput {
  raw: string;
  provider: string;
}

export async function callGemini(ctx: InterpretContext, apiKey: string, model: string): Promise<ProviderOutput> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    maxOutputTokens: 600,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  };
  // Modelos 2.5 "pensam" por padrão; para extrair dados isso só adiciona latência.
  if (model.startsWith('gemini-2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(ctx) }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(ctx) }] }],
        generationConfig,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AIProviderError(`Gemini respondeu ${res.status}: ${body.slice(0, 300)}`, res.status);
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!raw) throw new AIProviderError('Gemini não retornou conteúdo');
    return { raw, provider: `gemini:${model}` };
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    throw new AIProviderError(err instanceof Error && err.name === 'AbortError' ? 'Tempo esgotado na IA' : String(err));
  } finally {
    clearTimeout(timer);
  }
}
