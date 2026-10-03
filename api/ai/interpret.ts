// POST /api/ai/interpret
// Recebe a mensagem do chat, interpreta (Gemini → fallback local), executa a
// ação (rascunho, confirmação, consulta) e devolve as mensagens geradas.
// Toda leitura/escrita usa o token do próprio usuário → RLS do Supabase vale aqui também.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { answerQuery } from '../_lib/answers.js';
import { todayIn } from '../_lib/dates.js';
import { describeDraft, interpret, type Provider } from '../_lib/engine.js';
import { callGemini } from '../_lib/gemini.js';
import { formatBRL } from '../_lib/money.js';
import type { CategoryRef, Draft, InterpretContext } from '../_lib/types.js';

const MAX_MESSAGE = 500;
const LIMIT_PER_MINUTE = 12;
const LIMIT_PER_DAY = 300;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Converte o JSON salvo no banco em um Draft confiável. */
function toDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.transaction_type !== 'expense' && d.transaction_type !== 'income') return null;
  if (typeof d.date !== 'string') return null;
  return {
    transaction_type: d.transaction_type,
    amount: typeof d.amount === 'number' ? d.amount : d.amount != null ? Number(d.amount) || null : null,
    category_id: typeof d.category_id === 'string' ? d.category_id : null,
    category_name: typeof d.category_name === 'string' ? d.category_name : null,
    description: typeof d.description === 'string' ? d.description : null,
    date: d.date,
    confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
    clarification_question: typeof d.clarification_question === 'string' ? d.clarification_question : null,
  };
}

async function insertAssistant(
  db: SupabaseClient,
  userId: string,
  content: string,
  extra: { draft?: Draft; transaction_id?: string } = {},
) {
  const { data, error } = await db
    .from('chat_messages')
    .insert({
      user_id: userId,
      role: 'assistant',
      content: content.slice(0, 2000),
      draft: extra.draft ?? null,
      draft_status: extra.draft ? 'pending' : null,
      transaction_id: extra.transaction_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
  const supabaseKey = env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Servidor sem configuração do Supabase.' }, 500);
  }

  // ---------- Autenticação ----------
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);

  const db = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Sessão expirada. Faça login novamente.' }, 401);
  const userId = userData.user.id;

  // ---------- Validação de entrada ----------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }
  const rawText = (body as { message?: unknown })?.message;
  if (typeof rawText !== 'string') return json({ error: 'Mensagem ausente.' }, 400);
  const text = rawText.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!text) return json({ error: 'Digite uma mensagem.' }, 400);
  if (text.length > MAX_MESSAGE) return json({ error: `A mensagem pode ter no máximo ${MAX_MESSAGE} caracteres.` }, 400);

  try {
    // ---------- Limite de uso ----------
    const { data: usage, error: usageError } = await db.rpc('ai_usage_counts');
    if (usageError) throw usageError;
    const u = usage as { last_minute: number; last_day: number };
    if (u.last_minute >= LIMIT_PER_MINUTE) {
      return json({ error: 'Muitas mensagens em pouco tempo. Aguarde alguns segundos.' }, 429);
    }
    if (u.last_day >= LIMIT_PER_DAY) {
      return json({ error: 'Você atingiu o limite diário de mensagens. Use o formulário manual ou tente amanhã.' }, 429);
    }

    // ---------- Contexto mínimo (nada de histórico financeiro) ----------
    const [profileRes, categoriesRes, pendingRes] = await Promise.all([
      db.from('profiles').select('timezone, currency').eq('user_id', userId).maybeSingle(),
      db.from('categories').select('id, name, type').eq('user_id', userId).order('created_at'),
      db
        .from('chat_messages')
        .select('id, draft')
        .eq('user_id', userId)
        .eq('draft_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (profileRes.error) throw profileRes.error;
    if (categoriesRes.error) throw categoriesRes.error;
    if (pendingRes.error) throw pendingRes.error;

    const timezone = profileRes.data?.timezone ?? 'America/Sao_Paulo';
    const currency = profileRes.data?.currency ?? 'BRL';
    const { today, weekday } = todayIn(timezone);
    const pendingRow = pendingRes.data;
    const pending = pendingRow ? toDraft(pendingRow.draft) : null;

    const ctx: InterpretContext = {
      text,
      today,
      weekday,
      categories: (categoriesRes.data ?? []) as CategoryRef[],
      pending,
    };

    // ---------- Mensagem do usuário ----------
    const { data: userMessage, error: userMsgError } = await db
      .from('chat_messages')
      .insert({ user_id: userId, role: 'user', content: text })
      .select()
      .single();
    if (userMsgError) throw userMsgError;

    // ---------- Interpretação ----------
    const apiKey = env('GEMINI_API_KEY');
    const model = env('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    const provider: Provider | null = apiKey ? (c) => callGemini(c, apiKey, model) : null;
    const out = await interpret(ctx, provider);
    if (out.error) console.warn('[ai] fallback para interpretador local:', out.error);

    await db.from('ai_interpretations').insert({
      user_id: userId,
      message_id: userMessage.id,
      provider: out.provider,
      raw_response: out.raw?.slice(0, 20000) ?? null,
      parsed_data: out.interpretation,
      confidence: out.interpretation?.confidence ?? null,
    });

    // ---------- Ação ----------
    const updated: Array<{ id: string; draft_status: string }> = [];
    let assistant;
    let transaction = null;
    const r = out.result;

    if (r.kind === 'draft') {
      if (r.replaces_pending && pendingRow) {
        await db.from('chat_messages').update({ draft_status: 'discarded' }).eq('id', pendingRow.id);
        updated.push({ id: pendingRow.id, draft_status: 'discarded' });
      }
      assistant = await insertAssistant(db, userId, describeDraft(r.draft, r.replaces_pending, today), { draft: r.draft });
    } else if (r.kind === 'confirm' && pendingRow && pending) {
      if (pending.amount === null || !pending.category_id) {
        assistant = await insertAssistant(db, userId, pending.clarification_question ?? 'Ainda falta uma informação para registrar. Quanto foi?');
      } else {
        const { data: tx, error } = await db.rpc('confirm_draft', {
          p_message_id: pendingRow.id,
          p_type: pending.transaction_type,
          p_amount: pending.amount,
          p_category_id: pending.category_id,
          p_description: pending.description ?? pending.category_name ?? '',
          p_date: pending.date,
        });
        if (error) throw error;
        transaction = tx;
        updated.push({ id: pendingRow.id, draft_status: 'confirmed' });
        const label = pending.transaction_type === 'income' ? 'Receita registrada' : 'Despesa registrada';
        assistant = await insertAssistant(db, userId, `${label} ✓ ${formatBRL(pending.amount, currency)} em ${pending.category_name}.`, {
          transaction_id: (tx as { id: string }).id,
        });
      }
    } else if (r.kind === 'cancel' && pendingRow) {
      await db.from('chat_messages').update({ draft_status: 'discarded' }).eq('id', pendingRow.id);
      updated.push({ id: pendingRow.id, draft_status: 'discarded' });
      assistant = await insertAssistant(db, userId, 'Ok, descartei esse registro.');
    } else if (r.kind === 'query') {
      assistant = await insertAssistant(db, userId, await answerQuery(db, r.query, currency));
    } else {
      const textOut = r.kind === 'message' ? r.text : 'Não há nenhum registro pendente.';
      assistant = await insertAssistant(db, userId, textOut);
    }

    return json({
      messages: [userMessage, assistant],
      updated,
      transaction,
      provider: out.provider,
    });
  } catch (err) {
    console.error('[ai/interpret]', err);
    return json({ error: 'Não consegui processar sua mensagem agora. Tente novamente.' }, 500);
  }
}

export function GET(): Response {
  return json({ error: 'Use POST.' }, 405);
}
