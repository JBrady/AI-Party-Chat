import { AgentConfig, ContentRequest, RoomState } from "../types.js";

const TIER_ONE_SWEARS = ["damn", "hell"];
const TIER_TWO_SWEARS = ["shit", "fuck"];

function cappedProfanityLevel(agent: AgentConfig, room: RoomState): number {
  if (room.language_mode === "clean") return Math.min(agent.profanity_level, 0.2);
  return agent.profanity_level;
}

function maybeSwear(level: number): string {
  if (level < 0.25) return "";
  if (level < 0.6) {
    return TIER_ONE_SWEARS[Math.floor(Math.random() * TIER_ONE_SWEARS.length)];
  }
  return TIER_TWO_SWEARS[Math.floor(Math.random() * TIER_TWO_SWEARS.length)];
}

function stylePrefix(agentId: AgentConfig["id"]): string {
  switch (agentId) {
    case "logician":
      return "Quick take:";
    case "therapist":
      return "Gentle check-in:";
    case "meme_goblin":
      return "Plot twist:";
    case "midwest_dad":
      return "Dad wisdom:";
  }
}

function coreLine(agentId: AgentConfig["id"], beat: string, userText: string): string {
  const trimmed = userText.length > 120 ? userText.slice(0, 117) + "..." : userText;
  switch (agentId) {
    case "logician":
      return `Here is the clean answer: ${trimmed}`;
    case "therapist":
      return `Let's keep it kind. I hear you: ${trimmed}`;
    case "meme_goblin":
      return `We're in ${beat} mode. ${trimmed}`;
    case "midwest_dad":
      return `Alright kiddo, here's my read: ${trimmed}`;
  }
}

export function generateContent(
  request: ContentRequest,
  agent: AgentConfig,
  room: RoomState,
  beat: string,
  userText: string
): string {
  const cap = request.max_chars;
  const swear = maybeSwear(cappedProfanityLevel(agent, room));
  let base: string;
  if (request.kind === "full_reply") {
    base = `${stylePrefix(agent.id)} ${coreLine(agent.id, beat, userText)}`;
  } else if (request.kind === "interruption") {
    const trimmed = userText.length > 80 ? userText.slice(0, 77) + "..." : userText;
    switch (agent.id) {
      case "logician":
        base = `${stylePrefix(agent.id)} Quick check: ${trimmed}`;
        break;
      case "therapist":
        base = `${stylePrefix(agent.id)} Small pause, ${trimmed}`;
        break;
      case "midwest_dad":
        base = `${stylePrefix(agent.id)} Hold up, buddy, ${trimmed}`;
        break;
      case "meme_goblin":
        base = `${stylePrefix(agent.id)} Wait, wait, ${trimmed}`;
        break;
    }
  } else if (request.kind === "quip" && beat === "argument_spike") {
    switch (agent.id) {
      case "logician":
        base = `${stylePrefix(agent.id)} That's a leap. Show the premise or drop it.`;
        break;
      case "therapist":
        base = `${stylePrefix(agent.id)} Okay, breathe. Say it like adults, not gladiators.`;
        break;
      case "midwest_dad":
        base = `${stylePrefix(agent.id)} Easy there, champ. Your argument's got a flat tire.`;
        break;
      case "meme_goblin":
        base = `${stylePrefix(agent.id)} Ooh, spice level rising. Somebody ring the bell.`;
        break;
    }
  } else {
    base = `${stylePrefix(agent.id)} ${beat} quip.`;
  }

  const withFlavor = swear ? `${base} ${swear}.` : base;
  return withFlavor.slice(0, cap);
}
