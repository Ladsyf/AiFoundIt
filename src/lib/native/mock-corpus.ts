import type { InboxItem } from '@/lib/native/contract';

// Demo inbox rows shaped like the curated ~150-file demo set, trimmed to a
// representative slice. Paths look like real external-storage paths so the UI
// and file actions exercise production code paths in Expo Go.

const ROOT = '/storage/emulated/0';
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-10T00:30:00');

let seq = 0;

type ItemSeed = Omit<InboxItem, 'id' | 'op' | 'path' | 'uri' | 'folder' | 'ext' | 'chunks'> & {
  folder: string;
  chunks: InboxItem['chunks'];
};

function item(seed: ItemSeed): InboxItem {
  const ext = seed.name.includes('.') ? (seed.name.split('.').pop() ?? '') : '';
  return {
    ...seed,
    id: ++seq,
    op: 'upsert',
    path: `${ROOT}/${seed.folder}/${seed.name}`,
    uri: `content://media/external/file/${1000 + seq}`,
    ext,
  } as InboxItem;
}

const text = (t: string, page?: number): InboxItem['chunks'][number] => ({ kind: 'text', text: t, page });
const image = (): InboxItem['chunks'][number] => ({ kind: 'image' });

const img = (
  name: string,
  folder: string,
  daysAgo: number,
  opts: { ocr?: string; labels?: [string, number][]; screenshot?: boolean; size?: number },
) =>
  item({
    name,
    folder,
    mime: 'image/jpeg',
    kind: 'image',
    size: opts.size ?? 2_900_000,
    modifiedAt: NOW - daysAgo * DAY,
    takenAt: NOW - daysAgo * DAY,
    isScreenshot: opts.screenshot ?? false,
    labels: (opts.labels ?? []).map(([label, confidence]) => ({ label, confidence })),
    chunks: [image(), ...(opts.ocr ? [text(opts.ocr)] : [])],
  });

const shot = (name: string, daysAgo: number, ocr: string, labels: [string, number][] = []) =>
  img(name, 'Pictures/Screenshots', daysAgo, { ocr, labels, screenshot: true, size: 410_000 });

const doc = (
  name: string,
  folder: string,
  daysAgo: number,
  pages: string[],
  opts: { mime?: string; kind?: 'pdf' | 'doc' | 'text'; size?: number; labels?: [string, number][] } = {},
) =>
  item({
    name,
    folder,
    mime: opts.mime ?? 'application/pdf',
    kind: opts.kind ?? 'pdf',
    size: opts.size ?? 480_000,
    modifiedAt: NOW - daysAgo * DAY,
    isScreenshot: false,
    labels: (opts.labels ?? []).map(([label, confidence]) => ({ label, confidence })),
    chunks: pages.map((t, i) => text(t, i + 1)),
  });

export function demoCorpus(): InboxItem[] {
  seq = 0;
  return [
    shot(
      'Screenshot_20261009_184522.png',
      1,
      'GCash\nExpress Send\nYou sent ₱1,250.00 to MARIA SANTOS\nRef. No. 4039 812 774211\nOct 9, 2026 6:45 PM\nTotal Amount Sent ₱1,250.00',
      [
        ['receipt', 0.9],
        ['text', 0.95],
      ],
    ),
    shot(
      'Screenshot_20261008_121007.png',
      2,
      'GCash\nPay QR\nPaid to JOLLIBEE - SM MAKATI\nAmount ₱345.00\nRef. No. 8821 004 117233\nOct 8, 2026 12:10 PM',
      [['receipt', 0.88]],
    ),
    shot(
      'Screenshot_20261007_093311.png',
      3,
      'Maya\nPayment successful\n7-ELEVEN Store 2291\nAmount ₱189.75\nReference 7E-99120314\nOctober 7, 2026',
      [['receipt', 0.86]],
    ),
    shot(
      'Screenshot_20261005_201144.png',
      5,
      'GCash\nYou sent ₱500.00 to JUAN DELA CRUZ\nRef. No. 5512 889 003417\nOct 5, 2026 8:11 PM\nNo fee',
      [['receipt', 0.87]],
    ),
    shot(
      'Screenshot_20260928_115520.png',
      12,
      'Jollibee\nORDER #4582\n1-pc Chickenjoy w/ Rice ₱99.00\nPeach Mango Pie ₱48.00\nCoke Regular ₱55.00\nTOTAL ₱202.00\nSep 28, 2026 · SM Makati',
      [['receipt', 0.91]],
    ),
    shot(
      'Screenshot_20260920_174030.png',
      20,
      'McDonald\'s Delivery\n2x Cheeseburger ₱178.00\nFries Medium ₱65.00\nDelivery Fee ₱49.00\nTOTAL ₱292.00\nPaid via GCash',
      [['receipt', 0.85]],
    ),
    shot(
      'Screenshot_20260314_201145.png',
      210,
      'Wi-Fi\nNetwork Casa-5G\nPassword tr0pic-mango-71\nSecurity WPA2-Personal\nConnected',
      [
        ['text', 0.94],
        ['screenshot', 0.8],
      ],
    ),
    shot(
      'Screenshot_20260918_174420.png',
      22,
      'Router admin · 192.168.1.1\nWireless security\nSSID Casa-5G\nWPA2 key tr0pic-mango-71\nChannel Auto',
      [['text', 0.9]],
    ),
    shot(
      'Screenshot_20261002_090812.png',
      8,
      'PhilHealth\nMember Data Record\nName: SANTOS, ALEX DEMO\nPIN: 12-345678901-2\nBirthdate: 01/15/1998\n(SPECIMEN)',
      [
        ['id card', 0.83],
        ['text', 0.92],
      ],
    ),
    doc(
      'Meralco_Bill_Oct2026.pdf',
      'Download',
      4,
      [
        'MERALCO\nService Invoice\nCustomer: ALEX SANTOS\nAccount No. 1100-2233-4455\nBilling period Sep 2026\nAmount Due ₱2,340.55\nDue Date Oct 20, 2026',
        'Charges\nGeneration ₱1,380.20\nDistribution ₱512.40\nTaxes and others ₱447.95\nTotal ₱2,340.55',
      ],
      { size: 320_000 },
    ),
    doc(
      'Payslip_September2026.pdf',
      'Documents',
      14,
      [
        'ACME BPO INC.\nPayslip — September 2026\nEmployee: Alex Santos\nBasic pay ₱28,500.00\nOT pay ₱1,240.00\nDeductions SSS ₱1,350.00 PhilHealth ₱712.50 Pag-IBIG ₱200.00\nNet pay ₱27,477.50',
      ],
      { size: 180_000 },
    ),
    doc(
      'Thesis_Defense_Schedule.pdf',
      'Documents/School',
      30,
      [
        'COLLEGE OF ENGINEERING\nThesis Defense Schedule — 1st Semester AY 2026-2027\nDefense window: October 17–24, 2026\nRoom 402, Engineering Building\nPanel: Dr. Reyes, Dr. Uy, Engr. Lim',
        'Group 7 — AgriSense: Low-cost soil monitoring\nSlot: October 17, 2026, 10:30 AM\nBring 3 hard copies and the signed endorsement form.',
      ],
      { size: 96_000 },
    ),
    doc(
      'Enrollment_Form_1stSem.pdf',
      'Documents/School',
      45,
      ['UNIVERSITY ADMISSIONS\nEnrollment confirmation\nStudent: Alex Santos · 2023-04512\nProgram: BS Computer Engineering\nUnits enrolled: 21\nAssessment ₱34,720.00'],
      { size: 140_000 },
    ),
    doc('Calculus_notes.txt', 'Documents/School', 38, [
      'Calculus notes — integration by parts\n∫u dv = uv − ∫v du\nLIATE: Log, Inverse trig, Algebraic, Trig, Exponential\nMidterm coverage: chapters 4–6',
    ], { mime: 'text/plain', kind: 'text', size: 4_200 }),
    doc('Internship_Report.docx', 'Documents/Work', 25, [
      'Internship Report — Q3 2026\nAlex Santos, Mobile Team\nShipped the offline search prototype\nLearnings: on-device models, sqlite, media store APIs',
    ], {
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      kind: 'doc',
      size: 82_000,
    }),
    doc('Passport_scan.pdf', 'Documents/ID', 60, [
      'PASSPORT\nRepublic of the Philippines\nType P · Passport No. X0000000\nSurname: SANTOS\nGiven names: ALEX DEMO\nExpires 15 Mar 2034\nSPECIMEN — not a real document',
    ], { size: 1_200_000 }),
    img('UMID_photo.jpg', 'Documents/ID', 55, {
      ocr: 'UMID\nUnified Multi-Purpose ID\nSANTOS, ALEX DEMO\nCRN 0112-3456789-0\nSPECIMEN',
      labels: [['id card', 0.86]],
      size: 640_000,
    }),
    img('IMG_20260920_beach.jpg', 'DCIM/Camera', 20, {
      labels: [
        ['beach', 0.93],
        ['ocean', 0.89],
        ['sky', 0.84],
        ['sand', 0.78],
      ],
    }),
    img('IMG_20260921_beach2.jpg', 'DCIM/Camera', 19, {
      labels: [
        ['beach', 0.9],
        ['sunset', 0.87],
        ['ocean', 0.85],
      ],
    }),
    img('IMG_20261001_dog.jpg', 'DCIM/Camera', 9, {
      labels: [
        ['dog', 0.95],
        ['pet', 0.9],
        ['golden retriever', 0.8],
      ],
    }),
    img('IMG_20261005_ramen.jpg', 'DCIM/Camera', 5, {
      labels: [
        ['food', 0.92],
        ['ramen', 0.81],
        ['bowl', 0.76],
      ],
    }),
    img('IMG_20260815_birthday.jpg', 'DCIM/Camera', 56, {
      labels: [
        ['birthday cake', 0.88],
        ['candles', 0.84],
        ['celebration', 0.79],
      ],
    }),
    img('IMG_20260911_cat.jpg', 'DCIM/Camera', 29, {
      labels: [
        ['cat', 0.94],
        ['pet', 0.89],
      ],
    }),
    img('IMG_20260702_graduation.jpg', 'DCIM/Camera', 100, {
      labels: [
        ['graduation', 0.86],
        ['people', 0.82],
        ['gown', 0.77],
      ],
    }),
    item({
      name: 'VID_20260815_candles.mp4',
      folder: 'DCIM/Camera',
      mime: 'video/mp4',
      kind: 'video',
      size: 24_000_000,
      modifiedAt: NOW - 56 * DAY,
      durationMs: 48_000,
      isScreenshot: false,
      labels: [
        { label: 'birthday', confidence: 0.85 },
        { label: 'candles', confidence: 0.8 },
      ],
      chunks: [
        { kind: 'frame', startMs: 0, endMs: 2000 },
        { kind: 'frame', startMs: 20_000, endMs: 22_000 },
        { kind: 'frame', startMs: 40_000, endMs: 42_000 },
      ],
    }),
    item({
      name: 'Voice_memo_grocery.m4a',
      folder: 'Recordings',
      mime: 'audio/mp4',
      kind: 'audio',
      size: 1_100_000,
      modifiedAt: NOW - 6 * DAY,
      durationMs: 95_000,
      isScreenshot: false,
      labels: [],
      chunks: [
        { kind: 'audio', startMs: 0, endMs: 10_000, text: 'grocery list eggs milk rice coffee' },
        { kind: 'audio', startMs: 10_000, endMs: 20_000, text: 'pick up laundry friday 3 pm' },
      ],
    }),
    doc('Gcash_Statement_Sept2026.pdf', 'Download', 11, [
      'GCash Statement of Account\nSeptember 2026\nMobile: 0917-XXX-4321\nTotal cash-in ₱15,000.00\nTotal spend ₱11,430.00\nMerchants: Jollibee, 7-Eleven, Grab, SM Supermarket',
    ]),
    shot(
      'Screenshot_20260930_221045.png',
      10,
      'Shopee\nOrder delivered\nParcel SPX-99120 PH\nTotal ₱1,150.00\nSep 30, 2026',
      [['receipt', 0.84]],
    ),
    shot(
      'Screenshot_20261006_073915.png',
      4,
      'Grab\nRide completed\nSM Makati → BGC\nFare ₱285.00\nPaid via GrabPay\nOct 6, 2026 7:39 AM',
      [['receipt', 0.87]],
    ),
    doc('PLDT_Bill_Oct2026.pdf', 'Download', 6, [
      'PLDT Home\nStatement of Account\nAccount 0234-5678-90\nAmount Due ₱1,699.00\nDue date Oct 25, 2026\nFibr Plan 1699',
    ]),
    doc('Lease_agreement_2026.pdf', 'Documents', 70, [
      'CONTRACT OF LEASE\nUnit 4B, Sunrise Residences\nTerm: 12 months from Feb 2026\nMonthly rent ₱18,000.00\nDeposit: 2 months\nLessor: M. Villanueva · Lessee: A. Santos',
    ]),
    doc('Meralco_Bill_Sept2026.pdf', 'Download', 34, [
      'MERALCO\nService Invoice\nAccount No. 1100-2233-4455\nBilling period Aug 2026\nAmount Due ₱2,105.20\nPaid Sep 15, 2026',
    ]),
    img('Screenshot_meme.jpg', 'Download', 15, {
      labels: [
        ['meme', 0.88],
        ['text', 0.7],
      ],
      ocr: 'Nobody:\nMe looking for the GCash receipt at the counter',
      screenshot: true,
    }),
  ];
}
