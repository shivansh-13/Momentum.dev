export interface StreakInput {
  activeCodingMinutes: number;
  completedSessions: number;
  verifiedOutputEvents: number;
}

export function qualifiesForStreak(input: StreakInput): boolean {
  return (
    input.activeCodingMinutes >= 30 ||
    input.completedSessions >= 1 ||
    input.verifiedOutputEvents >= 1
  );
}
