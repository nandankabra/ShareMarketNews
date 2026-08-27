import type { CorporateEventType } from "@/lib/db/enums";

/**
 * Classify an NSE corporate event from its free-text purpose or subject.
 *
 * Order matters: the first match wins, so the more specific patterns sit above
 * the general ones. "Financial Results" must be tested before "Board Meeting",
 * because an earnings board meeting is described as both and the useful label
 * is the earnings one.
 *
 * Anything unrecognised becomes OTHER rather than a guess. A wrong confident
 * label is worse than an honest shrug — OTHER still shows on the calendar with
 * its original description intact.
 */
const RULES: ReadonlyArray<{ type: CorporateEventType; pattern: RegExp }> = [
  { type: "EARNINGS", pattern: /financial\s+result|quarterly\s+result|audited\s+result|unaudited\s+result|q[1-4]\s+result/i },
  { type: "BONUS", pattern: /\bbonus\b/i },
  { type: "SPLIT", pattern: /stock\s+split|sub-?division|face\s+value\s+split/i },
  { type: "RIGHTS", pattern: /rights\s+issue|\brights\b/i },
  { type: "BUYBACK", pattern: /buy\s*-?\s*back/i },
  { type: "DIVIDEND", pattern: /dividend/i },
  { type: "AGM", pattern: /annual\s+general\s+meeting|\bagm\b|extra-?ordinary\s+general\s+meeting|\begm\b/i },
  { type: "BOARD_MEETING", pattern: /board\s+meeting|meeting\s+of\s+the\s+board|consider\s+and\s+approve/i },
];

export function classifyEvent(...texts: Array<string | null | undefined>): CorporateEventType {
  const haystack = texts.filter(Boolean).join(" ");
  if (!haystack.trim()) return "OTHER";

  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) return rule.type;
  }
  return "OTHER";
}
