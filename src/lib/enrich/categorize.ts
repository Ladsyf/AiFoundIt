import { hasWord } from '@/lib/text';

export type Category = 'receipt' | 'id' | 'school' | 'work' | 'screenshot' | 'meme' | 'document';

export const CATEGORIES: Category[] = ['receipt', 'id', 'school', 'work', 'screenshot', 'meme', 'document'];

const CATEGORY_WORDS: Record<Category, string[]> = {
  receipt: [
    'receipt',
    'resibo',
    'gcash',
    'maya',
    'paymaya',
    'grab',
    'jollibee',
    "mcdonald's",
    'mcdonalds',
    '7-eleven',
    'shopee',
    'lazada',
    'angkas',
    'invoice',
    'amount due',
    'total amount',
    'ref. no',
    'ref no',
    'order #',
    'meralco',
    'payslip',
    'statement of account',
    'payment successful',
    'order delivered',
    'you sent',
    'paid to',
    'fare',
  ],
  id: [
    'passport',
    'philsys',
    'philhealth',
    'sss',
    'tin',
    'umid',
    "driver's license",
    'drivers license',
    'prc',
    'voter',
    'national id',
    'member data record',
    'postal id',
    'gsis',
    'pag-ibig',
  ],
  school: [
    'thesis',
    'enrollment',
    'student',
    'university',
    'college',
    'module',
    'grade',
    'semester',
    'professor',
    'classroom',
    'homework',
    'exam',
    'quiz',
    'lecture',
    'defense',
    'calculus',
    'assignment',
    'school',
  ],
  work: [
    'payslip',
    'contract',
    'report',
    'meeting',
    'salary',
    'employee',
    'internship',
    'onboarding',
    'timesheet',
    'memo',
    'work',
    'office',
    'project',
    'deadline',
    'client',
  ],
  screenshot: [],
  meme: ['meme', 'nobody:', 'pov:'],
  document: [],
};

export type CategorizeSeed = {
  name: string;
  folder: string;
  kind: string;
  isScreenshot: boolean;
  ocrText: string;
  labels: string[];
};

export function categorize(seed: CategorizeSeed): Category | null {
  const haystack = `${seed.name} ${seed.folder} ${seed.ocrText} ${seed.labels.join(' ')}`.toLowerCase();
  const scores = new Map<Category, number>();

  for (const [category, words] of Object.entries(CATEGORY_WORDS) as [Category, string[]][]) {
    let score = 0;
    // A single word must stand alone ("tin" is not in "meeting"); a phrase can match anywhere.
    for (const w of words) {
      const phrase = /[^a-z0-9]/.test(w);
      const found = phrase ? haystack.includes(w) : hasWord(haystack, w);
      if (found) score += w.includes(' ') ? 2 : 1;
    }
    if (score > 0) scores.set(category, score);
  }

  if (seed.labels.some((l) => l.toLowerCase() === 'meme')) {
    scores.set('meme', (scores.get('meme') ?? 0) + 2);
  }
  if (seed.labels.some((l) => /id card|identity|document/i.test(l))) {
    scores.set('id', (scores.get('id') ?? 0) + 1);
  }

  const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  if (seed.isScreenshot) return 'screenshot';
  if (seed.kind === 'pdf' || seed.kind === 'doc' || seed.kind === 'text') return 'document';
  return null;
}
