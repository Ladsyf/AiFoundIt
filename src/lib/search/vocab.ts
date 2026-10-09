import type { FileKind } from '@/lib/native/contract';

export const STOPWORDS = new Set(
  (
    'a an the with my of from for that this in on to i me find show where is was it and some any all file files please can you get me have had one what whats about there here ' +
    'na ng nang sa ang yung mga ko mo niya namin natin akin aking kaniya siya ako ikaw ito iyan iyon dito diyan doon nasaan saan ano alin ba po opo pa rin din lang lamang kasi para pati pero at o hindi wala meron may mayroon nung noong nitong nito itong yun dun'
  ).split(' '),
);

export const KIND_WORDS: Record<string, { kinds?: FileKind[]; screenshot?: boolean; category?: string }> = {
  screenshot: { kinds: ['image'], screenshot: true },
  screenshots: { kinds: ['image'], screenshot: true },
  photo: { kinds: ['image'] },
  photos: { kinds: ['image'] },
  picture: { kinds: ['image'] },
  pictures: { kinds: ['image'] },
  larawan: { kinds: ['image'] },
  litrato: { kinds: ['image'] },
  image: { kinds: ['image'] },
  selfie: { kinds: ['image'] },
  pdf: { kinds: ['pdf'] },
  document: { kinds: ['pdf', 'doc', 'text'] },
  documents: { kinds: ['pdf', 'doc', 'text'] },
  doc: { kinds: ['doc'] },
  docx: { kinds: ['doc'] },
  word: { kinds: ['doc'] },
  excel: { kinds: ['doc'] },
  spreadsheet: { kinds: ['doc'] },
  powerpoint: { kinds: ['doc'] },
  pptx: { kinds: ['doc'] },
  text: { kinds: ['text'] },
  txt: { kinds: ['text'] },
  note: { kinds: ['text'] },
  notes: { kinds: ['text', 'doc'] },
  scan: { kinds: ['pdf', 'image'] },
  video: { kinds: ['video'] },
  videos: { kinds: ['video'] },
  recording: { kinds: ['audio'] },
  recordings: { kinds: ['audio'] },
  audio: { kinds: ['audio'] },
  voice: { kinds: ['audio'] },
  memo: { kinds: ['audio'] },
  receipt: { category: 'receipt' },
  receipts: { category: 'receipt' },
  resibo: { category: 'receipt' },
  id: { category: 'id' },
  ids: { category: 'id' },
};

export const TIDY_WORDS = new Set([
  'tidy',
  'organize',
  'organise',
  'organize',
  'clean',
  'sort',
  'declutter',
  'ilipat',
  'ilagay',
  'ayusin',
  'lipat',
  'move',
  'piliin',
]);

export const COMPUTE_WORDS = new Set([
  'magkano',
  'gastos',
  'nagastos',
  'spend',
  'spent',
  'total',
  'much',
  'cost',
  'binayaran',
  'bayad',
]);

export const COUNT_WORDS = new Set(['ilan', 'ilang', 'many', 'count', 'bilang', 'damihan']);

export const DESCRIBE_WORDS = new Set([
  'describe',
  'summarize',
  'summarise',
  'summary',
  'laman',
  'sabi',
  'nakasulat',
  'explain',
]);

export const PRIVACY_WORDS = new Set(['sensitive', 'private', 'otp', 'password', 'passwords']);

export const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export const MERCHANTS = [
  'jollibee',
  "mcdonald's",
  'mcdonalds',
  'gcash',
  'maya',
  'paymaya',
  '7-eleven',
  '7 eleven',
  'meralco',
  'sm',
  'shopee',
  'lazada',
  'grab',
  'angkas',
  'kfc',
  'chowking',
  'mang inasal',
  'walter mart',
  'robinsons',
  'puregold',
  'starbucks',
  'pldt',
  'globe',
  'smart',
  'converge',
  'manila water',
  'maynilad',
  'petron',
  'shell',
  'caltex',
  'lto',
  'dfa',
  'philhealth',
  'sss',
  'pag-ibig',
];

export const RECEIPTS_FOLDER = 'Documents/Receipts';
export const PRIVATE_FOLDER = 'Documents/Private';
