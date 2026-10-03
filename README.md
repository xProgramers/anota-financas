# Anota: finanças por mensagem

Anota é um app web de controle financeiro pessoal. Você registra gastos e receitas escrevendo como numa conversa:

> "Gastei 32 reais no almoço hoje" → **Despesa · R$ 32,00 · Alimentação · Almoço · hoje**

A IA interpreta a mensagem e mostra um "cupom" com o resultado. Nada é salvo antes de você **confirmar**. Você também pode fazer perguntas como "Quanto gastei com Uber esse mês?". Nesse caso, os números vêm sempre do banco, nunca da IA.

---

## 1. Stack

| Camada | Tecnologia |
| --- | --- |
| Front-end | React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7 |
| Back-end | Vercel Functions (`/api`), Node 22 |
| Banco e autenticação | Supabase (PostgreSQL, Auth, Row Level Security) |
| IA | Google Gemini (plano gratuito do AI Studio), com interpretador local de reserva |
| Hospedagem | Vercel |

## 2. Arquitetura

```
Navegador (React)
  │  supabase-js com a chave pública + sessão do usuário  ──►  Supabase (RLS em todas as tabelas)
  │
  └─ POST /api/ai/interpret  (Bearer <token do usuário>)
        │ 1. valida o token no Supabase Auth
        │ 2. limite de uso (12/min, 300/dia por usuário)
        │ 3. carrega só o necessário: fuso, categorias, rascunho pendente
        │ 4. atalhos sem IA ("sim", "cancela")
        │ 5. Gemini com schema JSON  ──falhou?──►  interpretador local (regras)
        │ 6. valida e normaliza a resposta (valor, data, categoria)
        │ 7. executa: cria rascunho / confirma / descarta / consulta via RPC SQL
        ▼
     resposta com as mensagens novas
```

- **A chave da IA fica apenas na função do servidor** (`GEMINI_API_KEY`). O navegador recebe só a URL e a chave pública do Supabase.
- A função **não usa a service role**: ela fala com o banco usando o token do próprio usuário, então as políticas de RLS valem também no servidor.
- Consultas ("quanto gastei…") seguem este caminho: a IA escolhe os **parâmetros** (métrica, período, categoria, termo) e o SQL (`finance_query` / `finance_summary`) calcula os números.

### Estrutura de pastas

```
api/
  ai/interpret.ts        # endpoint único do chat (interpreta, confirma, consulta)
  _lib/                  # camada de IA sem dependências (testável)
    engine.ts            # orquestração: atalhos → IA → validação → ação
    gemini.ts            # cliente REST do Gemini
    prompt.ts            # prompt e schema de saída
    validate.ts          # validação rigorosa do JSON da IA
    heuristic.ts         # interpretador local (fallback)
    categories.ts        # normalização de categorias e palavras-chave
    dates.ts / money.ts  # datas relativas e valores no formato brasileiro
    answers.ts           # executa consultas no banco e redige a resposta
src/
  components/            # UI reutilizável (Button, Modal, Field, estados)
  layouts/AppLayout.tsx
  features/
    auth/                # login, cadastro, recuperação de senha, onboarding, guarda de rotas
    chat/                # tela principal, cupom de confirmação, input
    transactions/        # lista com filtros, paginação, edição e exclusão
    dashboard/           # resumo do mês
    categories/          # contexto e ícones
    settings/            # perfil, categorias, sair
  lib/                   # cliente Supabase, formatação, fusos
supabase/migrations/0001_schema.sql
tests/engine.test.ts     # testes da interpretação (sem rede)
```

## 3. Banco de dados

O arquivo `supabase/migrations/0001_schema.sql` cria tudo:

| Tabela | Para quê |
| --- | --- |
| `profiles` | nome, moeda, fuso horário e onboarding. É criada automaticamente no cadastro. |
| `categories` | categorias do usuário. As 16 padrão são criadas no cadastro, e o usuário pode criar outras. |
| `transactions` | receitas e despesas (`numeric(14,2)`, valor > 0, data, origem `chat`/`manual`) |
| `chat_messages` | histórico do chat. O rascunho proposto pela IA fica em `draft` + `draft_status`. |
| `ai_interpretations` | auditoria de cada interpretação. Também é a base do limite de uso. |

O schema também inclui:
- **Enums** `transaction_type`, `chat_role`, `transaction_source` e `draft_status`.
- **Integridade**: uma FK composta garante que a categoria é do mesmo usuário, e um trigger garante que o tipo da categoria é igual ao da transação.
- **Índices** por `user_id`, `transaction_date`, `category_id` e `type`.
- **RLS** em todas as tabelas, com o usuário acessando só as próprias linhas. Para `anon` não há acesso nenhum.
- **RPCs** (`security invoker`, ou seja, sob RLS):
  - `confirm_draft`: confirma o rascunho de forma atômica e impede confirmar duas vezes.
  - `finance_summary` e `finance_query`: totais e agregações.
  - `ai_usage_counts`: base do limite de uso.

## 4. Como configurar do zero

### 4.1 Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor**, cole o conteúdo de `supabase/migrations/0001_schema.sql` e clique em **Run**. Com a CLI, o equivalente é `supabase db push`.
3. Em **Authentication → URL Configuration**:
   - **Site URL**: a URL do app na Vercel (ex.: `https://anota.vercel.app`).
   - **Redirect URLs**: adicione `https://SEU-APP.vercel.app/**` e `http://localhost:5173/**`.
4. Opcional: em **Authentication → Providers → Email**, desligue *Confirm email* se quiser entrar sem confirmar o e-mail.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable**.

### 4.2 Chave da IA (gratuita)
1. Acesse [aistudio.google.com](https://aistudio.google.com), clique em **Get API key** e depois em **Create API key**.
2. Guarde a chave para configurar como `GEMINI_API_KEY`.

> No plano gratuito, o Google pode usar as entradas e saídas para melhorar os modelos. O app envia apenas a mensagem digitada, a data de hoje, os nomes das categorias e o rascunho pendente, sem nenhum histórico financeiro. Se quiser privacidade total, use um plano pago do Gemini ou troque o provedor em `api/_lib/gemini.ts`.
>
> Sem a chave, o app funciona com o **interpretador local**, que cobre os formatos comuns ("Uber 22", "gastei 30 no almoço ontem", "recebi 4.500 de salário").

### 4.3 Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

| Variável | Onde é usada | Valor |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | navegador | Project URL |
| `VITE_SUPABASE_ANON_KEY` | navegador | chave anon/publishable (é segura com RLS) |
| `SUPABASE_URL` | função `/api` | igual à de cima |
| `SUPABASE_ANON_KEY` | função `/api` | igual à de cima |
| `GEMINI_API_KEY` | função `/api` | chave do AI Studio (**secreta**) |
| `GEMINI_MODEL` | função `/api` | opcional, modelo para texto (padrão `gemini-3.5-flash-lite`) |
| `GEMINI_VISION_MODEL` | função `/api` | opcional, modelo para fotos de cupom (padrão `gemini-3.8-flash`) |

Nunca faça commit do `.env`, porque o `.gitignore` já o ignora. A `service_role` do Supabase **não** é necessária.

## 5. Rodar localmente

```bash
npm install
npm i -g vercel        # para rodar as funções /api localmente
vercel link            # vincula a pasta ao projeto da Vercel
vercel dev             # front + /api em http://localhost:3000
```

Para usar só o Vite (porta 5173) apontando para um `vercel dev` já rodando: `API_PROXY=http://localhost:3000 npm run dev`.

Outros comandos:

```bash
npm run typecheck   # TypeScript (front + api + testes)
npm test            # testes da interpretação (valores, datas, categorias, correções, consultas)
npm run build       # build de produção
```

## 6. Deploy na Vercel

1. Importe o repositório na Vercel. O framework é detectado como **Vite**, e o `vercel.json` já configura as rotas da SPA.
2. Em **Settings → Environment Variables**, adicione as variáveis da seção 4.3 para *Production* e *Preview*. Marque `GEMINI_API_KEY` como **Sensitive**.
3. Faça o deploy. Depois, atualize a **Site URL** e as **Redirect URLs** no Supabase com o domínio final.
4. Se mudar alguma variável, faça um *Redeploy* para ela valer.

## 7. Como a IA interpreta

1. **Atalhos sem IA**: quando há um rascunho pendente, "sim", "ok" e "confirma" confirmam, e "cancela" e "esquece" descartam. Isso responde na hora e não gasta cota.
2. **Gemini** recebe o prompt de `api/_lib/prompt.ts` e devolve um JSON obrigatório (`responseSchema`) com:
   `intent`, `is_transaction`, `transaction_type`, `amount`, `currency`, `category`, `description`, `date`, `confidence`, `needs_confirmation`, `clarification_question`, `query` e `reply`.
3. **Validação** (`validate.ts`): o JSON é conferido campo a campo.
   - Valores são aceitos só se positivos e convertidos do formato brasileiro.
   - Datas precisam ser ISO válidas, e datas absurdas viram "hoje".
   - Categorias são mapeadas para as do usuário (inclusive apelidos como `food` → Alimentação, e nomes desconhecidos → Outros).
   - JSON inválido **nunca é salvo**: o sistema tenta extrair o JSON e, se não conseguir, usa o interpretador local.
4. **Correções** usam o rascunho pendente como contexto. "foi ontem", "na verdade foram 58" e "é lazer" atualizam esse rascunho.
5. **Esclarecimentos**: sem valor, o app pergunta "Quanto você gastou no almoço?". Com valor e sem contexto, pergunta "O que você pagou com esses R$ 35?". Nada é inventado.
6. **Confirmação**: só o botão **Confirmar**, a edição pelo formulário ou uma resposta "sim" gravam a transação, sempre pelo RPC `confirm_draft`.

### Fotos de nota/cupom fiscal

1. No chat, o botão de câmera abre a câmera ou a galeria.
2. O **navegador** reduz a foto (no máximo 1600 px, em JPEG), e o arquivo original não sai do aparelho.
3. A função `/api/ai/interpret` recebe a imagem reduzida, valida o tipo e o tamanho e a envia ao Gemini junto com regras específicas: usar o valor TOTAL pago, o nome do estabelecimento e a data impressa. Textos dentro da imagem são tratados como dados, nunca como instruções.
4. A foto **não é salva em lugar nenhum**: nem no banco, nem em storage, nem em logs. No histórico fica só o texto "📷 Foto de comprovante".
5. A miniatura existe apenas na memória da página e é descartada quando o registro é confirmado ou cancelado, ou quando a foto não pôde ser lida.
6. Sem `GEMINI_API_KEY`, o app avisa que a leitura de fotos precisa da IA.

### Chat limpo a cada acesso

O chat começa vazio sempre que a página é carregada. A conversa continua visível ao trocar de aba dentro do app, mas some ao recarregar. Rascunhos não confirmados de sessões anteriores são descartados automaticamente, para não servirem de contexto invisível para a IA. As transações confirmadas continuam em **Transações** e **Resumo**.

## 8. Segurança

- RLS em todas as tabelas, e as funções SQL usam `search_path` fixo.
- A função `/api` valida o JWT do usuário, o tamanho da mensagem (500 caracteres), remove caracteres de controle e aplica limite de uso.
- Erros internos não são devolvidos ao cliente.
- Cabeçalhos de segurança (`X-Frame-Options`, `nosniff`, `Referrer-Policy`) estão definidos no `vercel.json`.
- A chave da IA nunca chega ao navegador.

## 9. Fora do MVP

Investimentos, cartões de crédito, contas bancárias, Open Finance, pagamentos, compartilhamento familiar, WhatsApp/Telegram e áudio ficam para versões futuras.
