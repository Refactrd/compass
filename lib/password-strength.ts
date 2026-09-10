/**
 * Password strength, scored locally.
 *
 * A heuristic rather than zxcvbn: the dictionary alone is several hundred
 * kilobytes, which is a lot of bundle for a screen each consultant sees once.
 * The rules below catch what actually matters here, which is people reaching
 * for a short word plus a digit.
 *
 * Length dominates, deliberately. A long passphrase beats a short password with
 * a symbol in it, and scoring that the other way round teaches the wrong habit.
 */

export const MIN_LENGTH = 12;

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export type Strength = {
  level: StrengthLevel;
  label: string;
  /** Actionable, or null when there is nothing useful left to say. */
  advice: string | null;
};

const COMMON = [
  "password",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "refactrd",
  "compass",
  "123456",
];

export function scorePassword(password: string): Strength {
  if (!password) {
    return { level: 0, label: "Empty", advice: null };
  }

  const lower = password.toLowerCase();

  if (COMMON.some((word) => lower.includes(word))) {
    return {
      level: 0,
      label: "Very weak",
      advice: "Contains a word an attacker would guess first.",
    };
  }

  // A single character or a short sequence repeated to reach the length.
  if (/^(.{1,3})\1+$/.test(password)) {
    return {
      level: 0,
      label: "Very weak",
      advice: "Repeating a short pattern does not add strength.",
    };
  }

  let score = 0;
  if (password.length >= MIN_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 24) score += 1;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;

  const level = Math.min(4, Math.max(0, score - 1)) as StrengthLevel;

  const LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];

  let advice: string | null = null;
  if (password.length < MIN_LENGTH) {
    advice = `${MIN_LENGTH - password.length} more character${
      MIN_LENGTH - password.length === 1 ? "" : "s"
    } needed.`;
  } else if (level < 3) {
    advice =
      password.length < 16
        ? "Longer is the cheapest way to make this stronger. Three or four unrelated words work well."
        : "Mixing in a capital, a digit or a symbol would help.";
  }

  return { level, label: LABELS[level], advice };
}

export type PasswordProblem = "too-short" | "mismatch" | null;

/** The blocking problems, in the order worth telling someone about. */
export function validatePasswords(
  password: string,
  confirm: string,
): PasswordProblem {
  if (password.length < MIN_LENGTH) return "too-short";
  if (confirm.length > 0 && password !== confirm) return "mismatch";
  return null;
}
