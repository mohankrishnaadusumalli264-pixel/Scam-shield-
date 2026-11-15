export interface ClientRedactionOutcome {
  redactedText: string;
  redactionCount: number;
  redactionTypes: string[];
}

interface RedactionRule {
  label: string;
  pattern: RegExp;
  replacement: string;
}

const CLIENT_REDACTION_RULES: RedactionRule[] = [
  {
    label: 'Embedded Image Data',
    pattern: /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
    replacement: '[REDACTED_IMAGE_DATA]',
  },
  {
    label: 'Password / PIN',
    pattern: /\b(?:password|passwd|pwd|pin|passcode|mpin|cvv|cvc)\s*(?:is\s+|[=:\-])\s*([^\s,;]{3,32})/gi,
    replacement: '[REDACTED_CREDENTIAL]',
  },
  {
    label: 'OTP / Verification Code',
    pattern: /\b(?:otp|one[- ]time[- ]pass(?:word|code)?|verification code|security code|auth code|2fa code)\b(?:\s*(?:is|was|:|\-|#))*\s*\d{4,8}\b/gi,
    replacement: '[REDACTED_OTP]',
  },
  {
    label: 'Payment Card Number',
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: '[REDACTED_CARD]',
  },
  {
    label: 'IBAN / Bank Account',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,28}\b|\b(?:a\/c|acct|account(?:\s*no\.?|\s*number)?|routing|ifsc|iban)\s*(?:is|#|:|=|\-)?\s*(?=[A-Z0-9]*\d)[A-Z0-9]{6,22}\b/gi,
    replacement: '[REDACTED_BANK_ACCOUNT]',
  },
  {
    label: 'National ID / SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED_ID]',
  },
  {
    label: 'Email Address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
  {
    label: 'Phone Number',
    pattern: /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
];

export function redactPiiPreview(input: string): ClientRedactionOutcome {
  if (!input) {
    return { redactedText: '', redactionCount: 0, redactionTypes: [] };
  }

  let redactedText = input;
  let redactionCount = 0;
  const foundLabels = new Set<string>();

  for (const rule of CLIENT_REDACTION_RULES) {
    let matchedInRule = false;
    redactedText = redactedText.replace(rule.pattern, (match) => {
      if (rule.label === 'Payment Card Number') {
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length < 13 || digitsOnly.length > 19) {
          return match;
        }
      }
      matchedInRule = true;
      redactionCount += 1;
      return rule.replacement;
    });
    if (matchedInRule) {
      foundLabels.add(rule.label);
    }
  }

  return {
    redactedText,
    redactionCount,
    redactionTypes: Array.from(foundLabels),
  };
}
