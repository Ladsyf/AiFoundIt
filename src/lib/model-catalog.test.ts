import { describe, expect, it } from 'vitest';

import {
  MODEL_CATALOG,
  catalogByFile,
  catalogById,
  downloadUrls,
  fitFor,
  modelPageUrl,
  recommendedPair,
} from '@/lib/model-catalog';

const GIB = 1024 * 1024 * 1024;

describe('model catalog data', () => {
  it('has unique ids and file names', () => {
    expect(new Set(MODEL_CATALOG.map((m) => m.id)).size).toBe(MODEL_CATALOG.length);
    expect(new Set(MODEL_CATALOG.map((m) => m.file.toLowerCase())).size).toBe(MODEL_CATALOG.length);
  });

  it('pins every model to a 40 character commit and a real size', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(m.sizeBytes).toBeGreaterThan(100_000_000);
      expect(m.file).toMatch(/\.litertlm$/);
    }
  });

  it('offers exactly one recommended search model and several chat models', () => {
    expect(MODEL_CATALOG.filter((m) => m.role === 'embedder' && m.recommended)).toHaveLength(1);
    expect(MODEL_CATALOG.filter((m) => m.role === 'llm').length).toBeGreaterThanOrEqual(3);
  });

  it('looks models up by id and by file name, ignoring case', () => {
    expect(catalogById('gemma-4-e2b')?.name).toBe('Gemma 4 E2B');
    expect(catalogByFile('GEMMA-4-E2B-IT.LITERTLM')?.id).toBe('gemma-4-e2b');
    expect(catalogByFile('unknown.litertlm')).toBeUndefined();
  });
});

describe('download urls', () => {
  it('tries the pinned revision first and the main branch second', () => {
    const m = catalogById('gemma-4-e2b')!;
    const [pinned, main] = downloadUrls(m);
    expect(pinned).toBe(
      'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm?download=true',
    );
    expect(main).toContain('/resolve/main/gemma-4-E2B-it.litertlm');
  });

  it('links the model page', () => {
    expect(modelPageUrl(catalogById('embeddinggemma-2')!)).toBe(
      'https://huggingface.co/litert-community/embeddinggemma-2-740m-litert-lm',
    );
  });
});

describe('fitFor', () => {
  const e2b = catalogById('gemma-4-e2b')!;
  const e4b = catalogById('gemma-4-e4b')!;
  const small = catalogById('gemma-3-1b')!;

  it('treats an 8 GB phone (about 7.4 GiB reported) as fine for E2B but too small for E4B', () => {
    expect(fitFor(e2b, 7.4 * GIB)).toBe('ok');
    expect(fitFor(e4b, 7.4 * GIB)).toBe('too-big');
  });

  it('warns on a 6 GB phone for E2B and accepts the 1B model', () => {
    expect(fitFor(e2b, 5.5 * GIB)).toBe('tight');
    expect(fitFor(small, 5.5 * GIB)).toBe('ok');
  });

  it('accepts E4B on a 12 GB phone', () => {
    expect(fitFor(e4b, 11.2 * GIB)).toBe('ok');
  });

  it('says ok when memory is unknown', () => {
    expect(fitFor(e4b, null)).toBe('ok');
  });
});

describe('recommendedPair', () => {
  it('suggests E2B on 8 GB and the 1B model on 6 GB', () => {
    expect(recommendedPair(7.4 * GIB).llm.id).toBe('gemma-4-e2b');
    expect(recommendedPair(5.5 * GIB).llm.id).toBe('gemma-3-1b');
    expect(recommendedPair(7.4 * GIB).embedder.id).toBe('embeddinggemma-2');
  });
});
