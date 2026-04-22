export interface MomentumInput {
  codedToday: boolean;
  completedFocusSessions: number;
  outputEvents: number;
  learningLogs: number;
  streakLength: number;
  inactiveHours: number;
}

export function computeMomentumScore(input: MomentumInput): number {
  let score = 0;
  if (input.codedToday) {
    score += 10;
  }
  score += input.completedFocusSessions * 5;
  score += input.outputEvents * 8;
  score += input.learningLogs * 4;
  score += Math.min(20, Math.floor(input.streakLength / 2));

  const halfLifeHours = 72;
  const decay = Math.pow(0.5, input.inactiveHours / halfLifeHours);
  return Math.max(0, Math.round(score * decay));
}
