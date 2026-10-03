-- Guarda o motivo quando a IA falha e o app usa o interpretador local (diagnóstico).
alter table public.ai_interpretations
  add column error text check (error is null or char_length(error) <= 1000);
