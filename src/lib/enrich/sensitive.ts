const SENSITIVE_PATTERNS: [RegExp, string][] = [
  [/philsys|philsys|national id/i, 'National ID'],
  [/philhealth/i, 'PhilHealth'],
  [/\bsss\b|social security/i, 'SSS'],
  [/\btin\b|tax identification/i, 'TIN'],
  [/\bumid\b/i, 'UMID'],
  [/passport/i, 'Passport'],
  [/driver'?s?\s*licen[cs]e/i, "Driver's license"],
  [/pag-?ibig/i, 'Pag-IBIG'],
  [/one[- ]time (pin|password)|\botp\b/i, 'OTP'],
  [/password|passwd|\bpin:\s*\d/i, 'Password'],
  [/credit card|card number|cvv/i, 'Card details'],
];

export function detectSensitive(text: string, fileName = ''): { sensitive: boolean; flags: string[] } {
  const haystack = `${text}\n${fileName}`;
  const flags = SENSITIVE_PATTERNS.filter(([re]) => re.test(haystack)).map(([, label]) => label);
  return { sensitive: flags.length > 0, flags };
}
