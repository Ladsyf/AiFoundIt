import { describe, expect, it } from 'vitest';

import { matchesExclude, normalizeFolderInput, relativeFolderOf, treeUriToRelativePath } from '@/lib/scan-paths';

const BS = String.fromCharCode(92);

describe('matchesExclude (same cases as ScanRulesTest.kt)', () => {
  const defaults = ['Android/data', 'Android/obb'];

  it('skips app private folders but not Android/media', () => {
    expect(matchesExclude('Android/data/com.example/files', defaults)).toBe(true);
    expect(matchesExclude('android/obb', defaults)).toBe(true);
    expect(matchesExclude('Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images', defaults)).toBe(false);
  });

  it('a plain name skips that folder at any depth', () => {
    expect(matchesExclude('Android/media/foo', ['Android'])).toBe(true);
    expect(matchesExclude('Documents/Private', ['private'])).toBe(true);
    expect(matchesExclude('WhatsApp/.Statuses', ['.Statuses'])).toBe(true);
  });

  it('a name matches whole folder names only', () => {
    expect(matchesExclude('Documents/Privately', ['Private'])).toBe(false);
    expect(matchesExclude('Documents/My Android notes', ['Android'])).toBe(false);
  });

  it('a path skips that folder and what is under it, anchored at the root', () => {
    const rule = ['Documents/Private'];
    expect(matchesExclude('Documents/Private', rule)).toBe(true);
    expect(matchesExclude('documents/private/2024', rule)).toBe(true);
    expect(matchesExclude('Download/Documents/Private', rule)).toBe(false);
    expect(matchesExclude('Documents/PrivateStuff', rule)).toBe(false);
  });

  it('blank rules never skip everything', () => {
    expect(matchesExclude('DCIM/Camera', ['', '  ', '/'])).toBe(false);
  });

  it('tolerates backslashes and edge slashes', () => {
    expect(matchesExclude('Documents/Private', [`${BS}Documents${BS}Private${BS}`])).toBe(true);
  });
});

describe('treeUriToRelativePath', () => {
  it('reads the folder out of a picker URI', () => {
    expect(
      treeUriToRelativePath('content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FPrivate/'),
    ).toBe('Documents/Private');
    expect(treeUriToRelativePath('content://com.android.externalstorage.documents/tree/primary%3AAndroid')).toBe(
      'Android',
    );
  });

  it('copes with a single slash after the scheme and with other volumes', () => {
    expect(treeUriToRelativePath('content:/com.android.externalstorage.documents/tree/1234-ABCD%3AMusic')).toBe(
      'Music',
    );
  });

  it('refuses the root of a volume and unknown providers', () => {
    expect(treeUriToRelativePath('content://com.android.externalstorage.documents/tree/primary%3A')).toBeNull();
    expect(treeUriToRelativePath('content://example.provider/other/thing')).toBeNull();
  });

  it('knows the Downloads provider', () => {
    expect(treeUriToRelativePath('content://com.android.providers.downloads.documents/tree/downloads')).toBe('Download');
  });
});

describe('normalizeFolderInput', () => {
  it('accepts plain names and paths', () => {
    expect(normalizeFolderInput('Android')).toBe('Android');
    expect(normalizeFolderInput('  Documents/Private/ ')).toBe('Documents/Private');
  });

  it('strips storage prefixes', () => {
    expect(normalizeFolderInput('/storage/emulated/0/Download/Bank')).toBe('Download/Bank');
    expect(normalizeFolderInput('Internal storage/Download/Bank')).toBe('Download/Bank');
    expect(normalizeFolderInput('/sdcard/DCIM')).toBe('DCIM');
  });

  it('turns backslashes into slashes', () => {
    expect(normalizeFolderInput(`Documents${BS}Private`)).toBe('Documents/Private');
  });

  it('rejects empty input and parent folder tricks', () => {
    expect(normalizeFolderInput('   ')).toBeNull();
    expect(normalizeFolderInput('/')).toBeNull();
    expect(normalizeFolderInput('Documents/../Android')).toBeNull();
  });
});

describe('relativeFolderOf', () => {
  it('gives the folder of a file path', () => {
    expect(relativeFolderOf('/storage/emulated/0/DCIM/Camera/IMG_1.jpg')).toBe('DCIM/Camera');
    expect(relativeFolderOf('/storage/emulated/0/readme.txt')).toBe('');
    expect(relativeFolderOf('/storage/1234-ABCD/Music/a.mp3')).toBe('Music');
  });
});
