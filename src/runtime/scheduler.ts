import { AgentConfig, PlayPlan, RoomState, TranscriptEvent } from "../types.js";
import { generateContent } from "./generator.js";

function sortByTime(events: TranscriptEvent[]): TranscriptEvent[] {
  return [...events].sort((a, b) => a.at_ms - b.at_ms);
}

export function executePlayPlan(
  plan: PlayPlan,
  agents: AgentConfig[],
  room: RoomState,
  userText: string
): TranscriptEvent[] {
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const events: TranscriptEvent[] = [];

  const microDelay = Math.max(plan.pacing.micro_delay_ms_min, 80);
  const shouldSplitPrimary =
    plan.beat_type === "argument_spike" && plan.interruptions.length > 0;
  const primaryRequest = shouldSplitPrimary
    ? plan.content_requests.find(
        (r) => r.kind === "full_reply" && r.agent === plan.primary_speaker
      )
    : undefined;
  const interruptionAt = shouldSplitPrimary ? plan.interruptions[0]?.at_ms ?? 0 : 0;
  const suffixTime = shouldSplitPrimary ? interruptionAt + 120 : 0;
  const postInterruptionStart = shouldSplitPrimary ? Math.max(suffixTime, interruptionAt + 200) : 0;
  const deferredRequests: typeof plan.content_requests = [];

  let cursor = 0;
  for (const req of plan.content_requests) {
    if (req.kind === "interruption") continue;
    if (primaryRequest && req === primaryRequest) {
      const agent = agentMap.get(req.agent);
      if (agent) {
        const text = generateContent(req, agent, room, plan.beat_type, userText);
        const baseIndex = Math.floor(text.length * 0.6);
        let splitIndex = baseIndex;
        let foundWhitespace = false;
        for (let i = baseIndex; i < text.length; i += 1) {
          if (text[i] === " ") {
            splitIndex = i;
            foundWhitespace = true;
            break;
          }
        }
        if (!foundWhitespace) {
          splitIndex = baseIndex;
        }
        const prefix = `${text.slice(0, splitIndex).trimEnd()}...`;
        const suffix = text.slice(splitIndex).trimStart();
        events.push({ at_ms: cursor, speaker: req.agent, text: prefix });
        if (
          suffix.length > 0 &&
          suffix !== text &&
          suffix !== prefix &&
          plan.interruptions[0]
        ) {
          events.push({
            at_ms: suffixTime,
            speaker: req.agent,
            text: suffix
          });
        }
      }
      cursor += microDelay + Math.floor(Math.random() * (plan.pacing.micro_delay_ms_max - microDelay + 1));
      continue;
    }
    if (shouldSplitPrimary) {
      deferredRequests.push(req);
      continue;
    }
    const agent = agentMap.get(req.agent);
    if (!agent) continue;
    const text = generateContent(req, agent, room, plan.beat_type, userText);
    events.push({ at_ms: cursor, speaker: req.agent, text });
    cursor += microDelay + Math.floor(Math.random() * (plan.pacing.micro_delay_ms_max - microDelay + 1));
  }

  for (const reaction of plan.reactions) {
    events.push({
      at_ms: reaction.at_ms,
      speaker: "narrator",
      text: `(${reaction.agent} ${reaction.cue})`
    });
  }

  for (const interruption of plan.interruptions) {
    const req = plan.content_requests.find(
      (r) => r.kind === "interruption" && r.agent === interruption.agent
    );
    const agent = agentMap.get(interruption.agent);
    const text =
      req && agent
        ? generateContent(req, agent, room, plan.beat_type, userText)
        : interruption.cue;
    events.push({
      at_ms: interruption.at_ms,
      speaker: interruption.agent,
      text
    });
  }

  if (shouldSplitPrimary && deferredRequests.length > 0) {
    let deferredCursor = postInterruptionStart + microDelay;
    for (const req of deferredRequests) {
      const agent = agentMap.get(req.agent);
      if (!agent) continue;
      const text = generateContent(req, agent, room, plan.beat_type, userText);
      events.push({ at_ms: deferredCursor, speaker: req.agent, text });
      deferredCursor += microDelay + Math.floor(Math.random() * (plan.pacing.micro_delay_ms_max - microDelay + 1));
    }
  }

  return sortByTime(events);
}
