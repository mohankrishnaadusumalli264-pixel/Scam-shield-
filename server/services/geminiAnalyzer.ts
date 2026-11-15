import { GoogleGenAI, Type } from '@google/genai';
import { isGeminiConfigured } from '../config.ts';
import { redactPii } from './piiRedactor.ts';
import type { AnalysisResult, RiskLevel } from '../../src/types/scamshield.ts';

export class GeminiConfigError extends Error {
  statusCode: number;
  errorCode: string;

  constructor(message: string) {
    super(message);
    this.name = 'GeminiConfigError';
    this.statusCode = 503;
    this.errorCode = 'GEMINI_NOT_CONFIGURED';
  }
}

export interface AnalyzePayloadInput {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  channelHint?: string;
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const VALID_RISK_LEVELS = new Set<RiskLevel>(['Safe', 'Low', 'Medium', 'High', 'Critical']);

export async function analyzeScamSubmission(input: AnalyzePayloadInput): Promise<AnalysisResult> {
  if (!isGeminiConfigured()) {
    throw new GeminiConfigError(
      'Server-side GEMINI_API_KEY is not configured. Configure GEMINI_API_KEY in environment secrets to run AI scam analysis.',
    );
  }

  const rawText = (input.text ?? '').trim();
  const hasImage = Boolean(input.imageBase64 && input.imageBase64.trim().length > 0);

  if (!rawText && !hasImage) {
    throw new Error('Provide suspicious message text, a URL, or a screenshot image to analyze.');
  }

  // Redact sensitive PII before forwarding text to the model or returning excerpts
  const redaction = redactPii(rawText);

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (hasImage && input.imageBase64) {
    const mimeType = (input.imageMimeType || 'image/png').toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new Error('Unsupported screenshot format. Allowed types: PNG, JPEG, WEBP.');
    }
    const cleanBase64 = input.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    if (cleanBase64.length > 6_000_000) {
      throw new Error('Screenshot image exceeds 4.5MB decoded size limit.');
    }
    parts.push({
      inlineData: {
        mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
        data: cleanBase64,
      },
    });
  }

  const promptText = [
    `Channel context: ${input.channelHint || 'Unspecified messaging or web channel'}`,
    redaction.redactedText
      ? `Sanitized submitted content:\n"""\n${redaction.redactedText}\n"""`
      : 'No accompanying text provided; inspect the uploaded screenshot in-memory.',
    'Analyze for scam, phishing, impersonation, financial fraud, fake job/investment, or social engineering indicators.',
    'NEVER include raw OTPs, passwords, PINs, card numbers, bank account numbers, private phone numbers, or personal emails in your response—use [REDACTED] if referring to any sensitive credential.',
  ].join('\n\n');

  parts.push({ text: promptText });

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      systemInstruction:
        'You are SCAMSHIELD Threat Triage Analyst, a defensive cybersecurity analyzer. Evaluate user-submitted suspicious messages and screenshots accurately. Be objective: legitimate transactional messages should be rated Safe or Low. Never fabricate certainty; explain concrete evidence. Never output raw PII, OTPs, passwords, or private phone/bank details.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          riskLevel: {
            type: Type.STRING,
            description: 'One of: Safe, Low, Medium, High, Critical',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Model confidence score from 0 to 100',
          },
          category: {
            type: Type.STRING,
            description: 'Concise threat category (e.g. Phishing Link, UPI / Payment Fraud, OTP Hijack, Impersonation, Fake Job Offer, Legitimate Communication)',
          },
          suspiciousIndicators: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Up to 8 concrete observed indicators without personal PII',
          },
          explanation: {
            type: Type.STRING,
            description: 'Clear 2-4 sentence assessment explaining the risk verdict',
          },
          safetyRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Up to 6 actionable user safety steps',
          },
        },
        required: [
          'riskLevel',
          'confidence',
          'category',
          'suspiciousIndicators',
          'explanation',
          'safetyRecommendations',
        ],
      },
    },
  });

  const rawJson = (response.text ?? '').trim();
  if (!rawJson) {
    throw new Error('Gemini returned an empty analysis response.');
  }

  const parsed = JSON.parse(rawJson) as {
    riskLevel?: string;
    confidence?: number;
    category?: string;
    suspiciousIndicators?: string[];
    explanation?: string;
    safetyRecommendations?: string[];
  };

  const normalizedRisk: RiskLevel =
    parsed.riskLevel && VALID_RISK_LEVELS.has(parsed.riskLevel as RiskLevel)
      ? (parsed.riskLevel as RiskLevel)
      : 'Medium';

  const confidence = Math.max(
    0,
    Math.min(100, Math.round(Number(parsed.confidence ?? 50))),
  );

  // Defense-in-depth redaction over AI output
  const cleanExplanation = redactPii(String(parsed.explanation || 'Analysis completed.')).redactedText;
  const cleanIndicators = (Array.isArray(parsed.suspiciousIndicators) ? parsed.suspiciousIndicators : [])
    .slice(0, 10)
    .map((item) => redactPii(String(item)).redactedText.slice(0, 280))
    .filter(Boolean);
  const cleanRecommendations = (Array.isArray(parsed.safetyRecommendations) ? parsed.safetyRecommendations : [])
    .slice(0, 8)
    .map((item) => redactPii(String(item)).redactedText.slice(0, 280))
    .filter(Boolean);

  return {
    riskLevel: normalizedRisk,
    confidence,
    category: String(parsed.category || 'Unclassified').slice(0, 64),
    suspiciousIndicators: cleanIndicators,
    explanation: cleanExplanation.slice(0, 2800),
    safetyRecommendations:
      cleanRecommendations.length > 0
        ? cleanRecommendations
        : ['Do not click unverified links or share verification codes.'],
    verificationStatus: 'ai_suspected',
    redactedText: redaction.redactedText.slice(0, 3800),
    redactionCount: redaction.redactionCount,
    redactionTypes: redaction.redactionTypes,
    hadImageInput: hasImage,
    privacyNotice: hasImage
      ? 'Screenshot was analyzed in memory and discarded immediately without permanent storage.'
      : 'Submitted text was sanitized for personal identifiers before evaluation.',
    analyzedAt: new Date().toISOString(),
  };
}
