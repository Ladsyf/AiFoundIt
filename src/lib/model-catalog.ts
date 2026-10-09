// The models people can download in the app. Repos, file names, sizes and pinned revisions come from
// Google AI Edge Gallery's own allowlist (model_allowlists/1_0_20.json), so the links match files that exist.

export type ModelRole = 'embedder' | 'llm';

export type CatalogModel = {
  id: string;
  role: ModelRole;
  name: string;
  maker: string;
  summary: string;
  // Hugging Face repo and the file inside it. The file keeps this name on the phone.
  repo: string;
  file: string;
  // Pinned commit, so the file is the one the size below describes.
  revision: string;
  sizeBytes: number;
  // Memory the phone needs to run it comfortably.
  minRamGb?: number;
  // Can look at photos (needed for "Describe this photo").
  vision?: boolean;
  recommended?: boolean;
  // Known to ask for a Hugging Face login and license acceptance. Only a hint for the screen.
  gated?: boolean;
};

export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: 'embeddinggemma-2',
    role: 'embedder',
    name: 'EmbeddingGemma 2',
    maker: 'Google',
    summary:
      'Turns photos, screenshots and text into numbers, so search can find things by meaning. Needed for searches like "beach photo".',
    repo: 'litert-community/embeddinggemma-2-740m-litert-lm',
    file: 'embeddinggemma-2-740m.litertlm',
    revision: '86b903a293f96d042bb92e1b7af333d94114458f',
    sizeBytes: 484_622_336,
    recommended: true,
  },
  {
    id: 'gemma-4-e2b',
    role: 'llm',
    name: 'Gemma 4 E2B',
    maker: 'Google',
    summary: 'Writes the answers and can describe photos. The best fit for phones with 8 GB of memory or more.',
    repo: 'litert-community/gemma-4-E2B-it-litert-lm',
    file: 'gemma-4-E2B-it.litertlm',
    revision: '6e5c4f1e395deb959c494953478fa5cec4b8008f',
    sizeBytes: 2_588_147_712,
    minRamGb: 8,
    vision: true,
    recommended: true,
  },
  {
    id: 'gemma-4-e4b',
    role: 'llm',
    name: 'Gemma 4 E4B',
    maker: 'Google',
    summary: 'Smarter answers than E2B, but it needs a lot of memory. For phones with 12 GB or more.',
    repo: 'litert-community/gemma-4-E4B-it-litert-lm',
    file: 'gemma-4-E4B-it.litertlm',
    revision: '28299f30ee4d43294517a4ac93abd6163412f07f',
    sizeBytes: 3_659_530_240,
    minRamGb: 12,
    vision: true,
  },
  {
    id: 'gemma-3-1b',
    role: 'llm',
    name: 'Gemma 3 1B',
    maker: 'Google',
    summary: 'Small and quick. It reads text only, so it cannot describe photos. A good choice for phones with 6 GB.',
    repo: 'litert-community/Gemma3-1B-IT',
    file: 'gemma3-1b-it-int4.litertlm',
    revision: '42d538a932e8d5b12e6b3b455f5572560bd60b2c',
    sizeBytes: 584_417_280,
    minRamGb: 6,
    gated: true,
  },
  {
    id: 'qwen-2-5-1-5b',
    role: 'llm',
    name: 'Qwen2.5 1.5B',
    maker: 'Alibaba',
    summary: 'Another small, text-only model, if you would rather not use a Google one.',
    repo: 'litert-community/Qwen2.5-1.5B-Instruct',
    file: 'Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm',
    revision: '19edb84c69a0212f29a6ef17ba0d6f278b6a1614',
    sizeBytes: 1_597_931_520,
    minRamGb: 6,
  },
];

export function catalogById(id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function catalogByFile(file: string): CatalogModel | undefined {
  const lower = file.toLowerCase();
  return MODEL_CATALOG.find((m) => m.file.toLowerCase() === lower);
}

/** Download URLs in the order to try: the pinned revision, then the main branch if that is not found. */
export function downloadUrls(m: CatalogModel): string[] {
  const base = `https://huggingface.co/${m.repo}/resolve`;
  return [`${base}/${m.revision}/${m.file}?download=true`, `${base}/main/${m.file}?download=true`];
}

export function modelPageUrl(m: CatalogModel): string {
  return `https://huggingface.co/${m.repo}`;
}

export const TOKEN_PAGE_URL = 'https://huggingface.co/settings/tokens';

export type Fit = 'ok' | 'tight' | 'too-big';

const GIB = 1024 * 1024 * 1024;

/**
 * Phones report less memory than they are sold with (an 8 GB phone shows about 7.4 GiB),
 * so a little is added back before comparing with the model's requirement.
 */
export function fitFor(m: CatalogModel, totalRamBytes: number | null | undefined): Fit {
  if (!m.minRamGb || !totalRamBytes) return 'ok';
  const gb = totalRamBytes / GIB + 0.7;
  if (gb >= m.minRamGb - 0.5) return 'ok';
  if (gb >= m.minRamGb - 2) return 'tight';
  return 'too-big';
}

/** The pair to suggest first: the search model, plus the chat model that suits this phone's memory. */
export function recommendedPair(totalRamBytes: number | null | undefined): { embedder: CatalogModel; llm: CatalogModel } {
  const embedder = MODEL_CATALOG.find((m) => m.role === 'embedder' && m.recommended) ?? MODEL_CATALOG[0];
  const e2b = catalogById('gemma-4-e2b')!;
  const small = catalogById('gemma-3-1b')!;
  const llm = !totalRamBytes || fitFor(e2b, totalRamBytes) === 'ok' ? e2b : small;
  return { embedder, llm };
}

/** Which model to use when the person has not picked one: the first one in this list that is on the phone. */
export const LLM_PREFERENCE = ['gemma-4-e2b', 'gemma-4-e4b', 'gemma-3-1b', 'qwen-2-5-1-5b'];
export const EMBEDDER_PREFERENCE = ['embeddinggemma-2'];
