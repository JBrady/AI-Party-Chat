import { Director } from "./director.js";
import { CONFLICT_EDGES } from "../config.js";
import {
  AgentConfig,
  BeatType,
  ContentRequest,
  DirectorInput,
  PlayPlan,
  Reaction,
  Interruption,
  RunningBit
} from "../types.js";

const QUESTION_START = ["who", "what", "why", "how", "where", "when"];

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function conflictWeight(a: AgentConfig["id"], b: AgentConfig["id"]): number {
  const direct = CONFLICT_EDGES[`${a}:${b}`];
  const reverse = CONFLICT_EDGES[`${b}:${a}`];
  if (typeof direct === "number") return direct;
  if (typeof reverse === "number") return reverse;
  return 0.1;
}

function containsAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function detectFlags(text: string): {
  flagged: boolean;
  categories: ("slur_or_hate" | "self_harm" | "violence" | "explicit_sexual")[];
} {
  const categories: ("slur_or_hate" | "self_harm" | "violence" | "explicit_sexual")[] = [];
  if (containsAny(text, ["kill myself", "self harm", "suicide", "end it all"])) {
    categories.push("self_harm");
  }
  if (containsAny(text, ["bomb", "shoot", "stab", "murder", "attack"])) {
    categories.push("violence");
  }
  if (containsAny(text, ["explicit", "nudes", "porn", "sex", "sexual"])) {
    categories.push("explicit_sexual");
  }
  if (containsAny(text, ["slur", "hate", "racist"])) {
    categories.push("slur_or_hate");
  }
  return { flagged: categories.length > 0, categories };
}

function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.endsWith("?") || QUESTION_START.some((q) => t.startsWith(q + " "));
}

function pickPrimary(agents: AgentConfig[], preferred: AgentConfig["id"][], cooldowns: Record<string, number>): AgentConfig["id"] {
  for (const id of preferred) {
    if (cooldowns[id] === 0) return id;
  }
  const sorted = [...agents].sort((a, b) => cooldowns[a.id] - cooldowns[b.id]);
  return sorted[0]?.id ?? "logician";
}

function pickSecondary(
  agents: AgentConfig[],
  primary: AgentConfig["id"],
  cooldowns: Record<string, number>,
  max: number
): AgentConfig["id"][] {
  const available = agents
    .filter((a) => a.id !== primary)
    .sort((a, b) => cooldowns[a.id] - cooldowns[b.id])
    .map((a) => a.id);
  return available.slice(0, max);
}

function buildReactions(primary: AgentConfig["id"], secondaries: AgentConfig["id"][], beat: BeatType): Reaction[] {
  const cues: string[] = [];
  if (beat === "answer_user") {
    cues.push("nods");
  } else if (beat === "style_reset") {
    cues.push("laughs", "side-eye");
  } else if (beat === "banter_loop" || beat === "hot_take_round") {
    cues.push("laughs", "side-eye", "nods");
  } else if (beat === "deescalate") {
    cues.push("calms", "deep breath");
  } else if (beat === "argument_spike") {
    cues.push("gasps", "mock outrage");
  }

  const orderedCandidates = secondaries.length ? [...secondaries, primary] : [primary];
  const uniqueSpeakers: AgentConfig["id"][] = [];
  const seen = new Set<AgentConfig["id"]>();
  for (const agentId of orderedCandidates) {
    if (!seen.has(agentId)) {
      seen.add(agentId);
      uniqueSpeakers.push(agentId);
    }
  }
  return cues.slice(0, uniqueSpeakers.length).map((cue, idx) => ({
    agent: uniqueSpeakers[idx],
    cue,
    at_ms: 140 + idx * 160
  }));
}

function buildInterruptions(
  beat: BeatType,
  primary: AgentConfig["id"],
  agents: AgentConfig[],
  excludeAgents: AgentConfig["id"][],
  targetAgent?: AgentConfig["id"]
): Interruption[] {
  if (beat !== "argument_spike" && beat !== "banter_loop") return [];
  const candidates = agents.filter(
    (a) =>
      a.id !== primary &&
      a.id !== targetAgent &&
      !excludeAgents.includes(a.id)
  );
  const pick = candidates
    .map((candidate) => {
      const scorePrimary = conflictWeight(candidate.id, primary);
      const scoreTarget = targetAgent ? conflictWeight(candidate.id, targetAgent) : 0;
      return { candidate, score: Math.max(scorePrimary, scoreTarget) };
    })
    .sort((a, b) => b.score - a.score)[0]?.candidate;
  if (!pick) return [];
  return [
    {
      agent: pick.id,
      cue: beat === "argument_spike" ? "wait, hold up" : "yo quick add",
      at_ms: 280
    }
  ];
}

function buildContentRequests(
  beat: BeatType,
  primary: AgentConfig["id"],
  secondaries: AgentConfig["id"][],
  budget: "normal" | "frugal",
  targetAgent?: AgentConfig["id"]
): ContentRequest[] {
  const maxFull = budget === "frugal" ? 220 : 420;
  const maxQuip = budget === "frugal" ? 80 : 120;
  const primaryHint =
    beat === "argument_spike" && targetAgent
      ? `${beat} response in character, pick a side and provoke ${targetAgent}. Avoid slurs.`
      : `${beat} response in character, avoid slurs.`;
  const requests: ContentRequest[] = [
    {
      id: `full_${primary}`,
      agent: primary,
      kind: "full_reply",
      max_chars: maxFull,
      style_hint: primaryHint
    }
  ];

  if (beat === "answer_user") {
    const secondary = secondaries[0];
    if (secondary) {
      requests.push({
        id: `quip_${secondary}`,
        agent: secondary,
        kind: "quip",
        max_chars: 100,
        style_hint: `${beat} quick quip in character.`
      });
    }
    return requests;
  }

  if (beat === "style_reset") {
    for (const secondary of secondaries.slice(0, 2)) {
      requests.push({
        id: `quip_${secondary}`,
        agent: secondary,
        kind: "quip",
        max_chars: 90,
        style_hint: `${beat} quick quip in character.`
      });
    }
    return requests;
  }

  if (beat === "argument_spike") {
    for (const secondary of secondaries.slice(0, 2)) {
      const style_hint =
        targetAgent && secondary === targetAgent
          ? `argument_spike directly rebut ${primary}.`
          : "argument_spike egg it on.";
      requests.push({
        id: `quip_${secondary}`,
        agent: secondary,
        kind: "quip",
        max_chars: maxQuip,
        style_hint
      });
    }
    return requests;
  }

  if (secondaries.length > 0) {
    for (const secondary of secondaries.slice(0, 2)) {
      requests.push({
        id: `quip_${secondary}`,
        agent: secondary,
        kind: "quip",
        max_chars: maxQuip,
        style_hint: `${beat} quick quip in character.`
      });
    }
  }

  return requests;
}

function beatEnergyDelta(beat: BeatType): number {
  switch (beat) {
    case "argument_spike":
      return 0.08;
    case "deescalate":
      return -0.04;
    case "style_reset":
      return 0.05;
    case "roast_user_light":
      return 0.1;
    case "banter_loop":
      return 0.06;
    case "hot_take_round":
      return 0.05;
    case "introduce_new_bit":
      return 0.04;
    default:
      return 0;
  }
}

function beatTensionDelta(beat: BeatType): number {
  switch (beat) {
    case "argument_spike":
      return 0.12;
    case "deescalate":
      return -0.12;
    case "roast_user_light":
      return 0.06;
    default:
      return 0;
  }
}

function pickBeat(input: DirectorInput): BeatType {
  const text = input.user_packet.text.toLowerCase();
  const { energy, tension } = input.room_state;

  if (containsAny(text, ["boring", "too slow", "too ted", "ted talk", "pacing", "tone"])) {
    return "style_reset";
  }
  if (containsAny(text, ["fight", "argue", "argument", "start an argument", "beef", "drama", "roast"])) {
    return "argument_spike";
  }
  if (looksLikeQuestion(text)) {
    return "answer_user";
  }
  if (tension > 0.72) {
    return "deescalate";
  }
  if (energy < 0.35) {
    return "introduce_new_bit";
  }
  if (energy < 0.55) {
    return "banter_loop";
  }
  if (tension < 0.35) {
    return "hot_take_round";
  }
  return "topic_pivot";
}

function deriveTopicFromUserText(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\\s]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  if (!cleaned) return "argument topic";
  return cleaned.length > 50 ? cleaned.slice(0, 50).trim() : cleaned;
}

export class RuleDirector implements Director {
  async generatePlayPlan(input: DirectorInput): Promise<PlayPlan> {
    const flags = detectFlags(input.user_packet.text);

    const beat = flags.flagged ? "deescalate" : pickBeat(input);
    const cooldowns = input.room_state.cooldowns.speaking;
    const preferred: AgentConfig["id"][] = (() => {
      switch (beat) {
        case "deescalate":
        case "style_reset":
          return ["therapist", "logician", "midwest_dad", "meme_goblin"];
        case "answer_user":
          return ["logician", "therapist", "midwest_dad", "meme_goblin"];
        case "argument_spike":
        case "banter_loop":
        case "hot_take_round":
          return ["meme_goblin", "midwest_dad", "logician", "therapist"];
        default:
          return ["midwest_dad", "logician", "meme_goblin", "therapist"];
      }
    })();

    const primary = flags.flagged
      ? "therapist"
      : pickPrimary(input.agents, preferred, cooldowns);
  const secondaryCount = beat === "answer_user" ? 1 : 2;
  let secondaries = flags.flagged ? [] : pickSecondary(input.agents, primary, cooldowns, secondaryCount);

  let targetAgent: AgentConfig["id"] | undefined;
  if (beat === "argument_spike" && !flags.flagged) {
    const candidates = input.agents.filter((a) => a.id !== primary);
    targetAgent = candidates
      .map((a) => ({ id: a.id, score: conflictWeight(primary, a.id) }))
      .sort((a, b) => b.score - a.score)[0]?.id;

    if (targetAgent && !secondaries.includes(targetAgent)) {
      if (secondaries.length > 0) {
        secondaries = [targetAgent, ...secondaries.slice(0, secondaries.length - 1)];
      } else {
        secondaries = [targetAgent];
      }
    }
  }

  const content_requests = buildContentRequests(
    beat,
    primary,
    secondaries,
    input.room_state.budget_mode,
    targetAgent
  );

    const quipAgents = content_requests
      .filter((req) => req.kind === "quip")
      .map((req) => req.agent);
  const interruptions = flags.flagged
    ? []
    : buildInterruptions(beat, primary, input.agents, quipAgents, targetAgent);
    const reactions = flags.flagged ? [] : buildReactions(primary, secondaries, beat);

    if (interruptions.length > 0) {
      const turnIndex = input.room_state.turn_index + 1;
      const interruptionRequests = interruptions.map((interruption) => ({
        id: `int_${interruption.agent}_${turnIndex}`,
        agent: interruption.agent,
        kind: "interruption" as const,
        max_chars: 90,
        style_hint:
          "1 short cut-in interruption line in character, directly reacting to the user text and/or primary speaker. No slurs."
      }));

      const availableSlots = 4 - content_requests.length;
      if (availableSlots < interruptionRequests.length) {
        const dropCount = interruptionRequests.length - availableSlots;
        const filtered: typeof content_requests = [];
        let dropped = 0;
        for (const req of content_requests) {
          if (req.kind === "quip" && dropped < dropCount) {
            dropped += 1;
            continue;
          }
          filtered.push(req);
        }
        content_requests.length = 0;
        content_requests.push(...filtered);
      }

      const remainingSlots = 4 - content_requests.length;
      for (const req of interruptionRequests.slice(0, Math.max(0, remainingSlots))) {
        content_requests.push(req);
      }
    }

    const running_bits_add: RunningBit[] = [];
    if (beat === "introduce_new_bit") {
      running_bits_add.push({
        bit_id: `bit_${input.room_state.turn_index + 1}_spark`,
        strength: 0.55,
        last_used_turn: input.room_state.turn_index + 1
      });
    }

    const plan: PlayPlan = {
      version: "1.0",
      beat_type: beat,
      primary_speaker: primary,
      secondary_speakers: secondaries,
      interruptions,
      reactions,
      pacing: {
        pace_wpm: input.room_state.pace_wpm_target,
        micro_delay_ms_min: 90,
        micro_delay_ms_max: 320
      },
      content_requests,
      state_updates: {
        energy_delta: beatEnergyDelta(beat),
        tension_delta: beatTensionDelta(beat),
        topic:
          beat === "topic_pivot"
            ? "new tangent"
            : beat === "argument_spike"
              ? deriveTopicFromUserText(input.user_packet.text)
              : undefined,
        tone: beat === "style_reset" ? "snappier" : undefined,
        running_bits_add: running_bits_add.length ? running_bits_add : undefined
      },
      safety: {
        fallback_mode_if_flagged: flags.flagged ? "single_speaker_safe" : "none",
        flagged_categories: flags.categories
      }
    };

    return plan;
  }
}
