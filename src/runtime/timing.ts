export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function estimateSpeakMs(text: string, paceWpm: number): number {
  const words = Math.max(
    1,
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
  );
  const msPerWord = 60000 / paceWpm;
  return Math.round(words * msPerWord);
}

export function findSplitIndexNearWhitespace(
  text: string,
  targetIndex: number,
  windowSize = 12
): number {
  if (!text) return 0;
  const clampedTarget = clamp(targetIndex, 0, text.length);
  for (let offset = 0; offset <= windowSize; offset += 1) {
    const left = clampedTarget - offset;
    const right = clampedTarget + offset;
    if (left >= 0 && /\s/.test(text[left] ?? "")) {
      return left;
    }
    if (right < text.length && /\s/.test(text[right] ?? "")) {
      return right;
    }
  }
  return clampedTarget;
}
