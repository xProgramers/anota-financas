// Normalização de categorias e dicionário de palavras-chave.
import type { CategoryRef, TxType } from './types.js';

export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Apelidos comuns (inclusive em inglês) → nome da categoria padrão. */
const ALIASES: Record<string, string> = {
  food: 'alimentacao', comida: 'alimentacao', alimentacao: 'alimentacao', restaurante: 'alimentacao', mercado: 'alimentacao', supermercado: 'alimentacao',
  transport: 'transporte', transportation: 'transporte', transporte: 'transporte',
  housing: 'moradia', home: 'moradia', rent: 'moradia', moradia: 'moradia', casa: 'moradia',
  bills: 'contas', utilities: 'contas', contas: 'contas', conta: 'contas',
  shopping: 'compras pessoais', compras: 'compras pessoais', 'personal shopping': 'compras pessoais',
  health: 'saude', saude: 'saude',
  leisure: 'lazer', entertainment: 'lazer', lazer: 'lazer',
  education: 'educacao', educacao: 'educacao',
  subscriptions: 'assinaturas', subscription: 'assinaturas', assinaturas: 'assinaturas', assinatura: 'assinaturas',
  travel: 'viagens', trips: 'viagens', viagens: 'viagens', viagem: 'viagens',
  other: 'outros', others: 'outros', outros: 'outros', outro: 'outros',
  salary: 'salario', salario: 'salario',
  freelance: 'freelance', freela: 'freelance',
  investments: 'investimentos', investment: 'investimentos', investimentos: 'investimentos', investimento: 'investimentos',
  sales: 'vendas', venda: 'vendas', vendas: 'vendas',
};

/**
 * Encontra a categoria do usuário que corresponde ao nome devolvido pela IA.
 * Ordem: nome exato → apelido → prefixo. Sem correspondência → "Outros" do tipo.
 */
export function matchCategory(
  name: string | null | undefined,
  type: TxType,
  categories: CategoryRef[],
): CategoryRef | null {
  const ofType = categories.filter((c) => c.type === type);
  const fallback = ofType.find((c) => norm(c.name) === 'outros') ?? null;
  if (!name) return null;

  const n = norm(name);
  const exact = ofType.find((c) => norm(c.name) === n);
  if (exact) return exact;

  const alias = ALIASES[n];
  if (alias) {
    const byAlias = ofType.find((c) => norm(c.name) === alias);
    if (byAlias) return byAlias;
  }

  const partial = ofType.find((c) => norm(c.name).startsWith(n) || n.startsWith(norm(c.name)));
  return partial ?? fallback;
}

/** Palavras-chave para o interpretador local (fallback sem IA). */
export const KEYWORDS: Array<{ category: string; type: TxType; words: string[] }> = [
  {
    category: 'Alimentação',
    type: 'expense',
    words: [
      'almoco', 'almocei', 'jantar', 'jantei', 'cafe', 'cafezinho', 'lanche', 'lanchei', 'restaurante', 'mercado',
      'supermercado', 'padaria', 'ifood', 'pizza', 'hamburguer', 'burger', 'acai', 'comida', 'feira', 'acougue',
      'sorvete', 'refeicao', 'marmita', 'delivery', 'rappi', 'hortifruti', 'cerveja', 'bar', 'churrasco', 'sushi',
    ],
  },
  {
    category: 'Transporte',
    type: 'expense',
    words: [
      'uber', '99pop', '99 taxi', 'taxi', 'onibus', 'metro', 'gasolina', 'combustivel', 'etanol', 'alcool', 'diesel', 'posto',
      'estacionamento', 'pedagio', 'passagem', 'trem', 'brt', 'bilhete', 'cabify', 'patinete', 'oficina', 'mecanico',
    ],
  },
  { category: 'Moradia', type: 'expense', words: ['aluguel', 'condominio', 'iptu', 'reforma', 'moveis', 'movel', 'diarista', 'faxina'] },
  {
    category: 'Contas',
    type: 'expense',
    words: ['luz', 'energia', 'agua', 'internet', 'telefone', 'celular', 'gas', 'boleto', 'fatura', 'conta', 'tarifa', 'seguro', 'imposto', 'ipva'],
  },
  {
    category: 'Compras pessoais',
    type: 'expense',
    words: [
      'camiseta', 'camisa', 'roupa', 'roupas', 'calca', 'tenis', 'sapato', 'vestido', 'shopping', 'loja', 'perfume',
      'maquiagem', 'presente', 'eletronico', 'fone', 'livro', 'amazon', 'shopee', 'mercadolivre', 'cabelo', 'barbeiro', 'salao',
    ],
  },
  {
    category: 'Saúde',
    type: 'expense',
    words: ['farmacia', 'remedio', 'remedios', 'medico', 'consulta', 'exame', 'dentista', 'hospital', 'academia', 'psicologo', 'terapia', 'plano de saude'],
  },
  {
    category: 'Lazer',
    type: 'expense',
    words: ['cinema', 'show', 'teatro', 'festa', 'balada', 'jogo', 'game', 'ingresso', 'parque', 'passeio', 'boliche', 'museu'],
  },
  { category: 'Educação', type: 'expense', words: ['curso', 'faculdade', 'escola', 'mensalidade', 'apostila', 'material escolar', 'udemy', 'aula', 'livros'] },
  {
    category: 'Assinaturas',
    type: 'expense',
    words: ['netflix', 'spotify', 'disney', 'hbo', 'max', 'prime', 'youtube', 'icloud', 'chatgpt', 'claude', 'assinatura', 'globoplay', 'deezer', 'gympass'],
  },
  { category: 'Viagens', type: 'expense', words: ['hotel', 'pousada', 'airbnb', 'voo', 'aereo', 'passagem aerea', 'viagem', 'hospedagem', 'mala'] },
  { category: 'Salário', type: 'income', words: ['salario', 'pagamento do mes', 'holerite', 'adiantamento', 'decimo terceiro', 'ferias'] },
  { category: 'Freelance', type: 'income', words: ['freela', 'freelance', 'job', 'projeto', 'cliente', 'bico'] },
  { category: 'Investimentos', type: 'income', words: ['dividendo', 'dividendos', 'rendimento', 'rendimentos', 'juros', 'cdb', 'tesouro', 'acoes', 'fii'] },
  { category: 'Vendas', type: 'income', words: ['vendi', 'venda', 'vendas', 'olx', 'enjoei'] },
];

/** Procura palavra-chave no texto normalizado. Devolve a categoria e a palavra encontrada. */
export function findKeyword(
  normalizedText: string,
  type?: TxType,
): { category: string; type: TxType; word: string } | null {
  for (const group of KEYWORDS) {
    if (type && group.type !== type) continue;
    for (const w of group.words) {
      const re = new RegExp(`(^|[^a-z0-9])${w.replace(/ /g, '\\s+')}($|[^a-z0-9])`);
      if (re.test(normalizedText)) return { category: group.category, type: group.type, word: w };
    }
  }
  return null;
}
