export interface TrustInput {
  integrationCount: number;
  consistencyDays30: number;
  anomalyCount: number;
}

export function computeTrustScore(input: TrustInput): number {
  const base = 30;
  const integrationBonus = Math.min(40, input.integrationCount * 10);
  const consistencyBonus = Math.min(30, input.consistencyDays30);
  const anomalyPenalty = Math.min(60, input.anomalyCount * 15);
  const score = base + integrationBonus + consistencyBonus - anomalyPenalty;
  return Math.max(0, Math.min(100, score));
}

export function confidenceLabel(score: number): 'Verified' | 'Self Reported' | 'Low Confidence' {
  if (score >= 70) {
    return 'Verified';
  }
  if (score >= 40) {
    return 'Self Reported';
  }
  return 'Low Confidence';
}
