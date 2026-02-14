import { AgentConfig, PlayPlan, RoomState, TranscriptEvent } from "../types.js";
import { generateContent } from "./generator.js";
import { clamp, estimateSpeakMs, findSplitIndexNearWhitespace } from "./timing.js";

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
  const wantsDynamicSplit =
    plan.beat_type === "argument_spike" && plan.interruptions.length > 0;
  const primaryRequest = wantsDynamicSplit
    ? plan.content_requests.find(
        (r) => r.kind === "full_reply" && r.agent === plan.primary_speaker
      )
    : undefined;
  const primaryAgent = primaryRequest ? agentMap.get(primaryRequest.agent) : undefined;
  const primaryText =
    primaryRequest && primaryAgent
      ? generateContent(primaryRequest, primaryAgent, room, plan.beat_type, userText)
      : undefined;
  const shouldSplitPrimary = wantsDynamicSplit && Boolean(primaryText);
  const durationMs = shouldSplitPrimary
    ? estimateSpeakMs(primaryText ?? "", plan.pacing.pace_wpm)
    : 0;
  const interruptionAt = shouldSplitPrimary
    ? clamp(Math.round(durationMs * 0.5), 220, 900)
    : 0;
  const localInterruptions = shouldSplitPrimary
    ? [{ ...plan.interruptions[0], at_ms: interruptionAt }, ...plan.interruptions.slice(1)]
    : plan.interruptions;
  const suffixTime = shouldSplitPrimary ? interruptionAt + 120 : 0;
  const deferredRequests: typeof plan.content_requests = [];

  let cursor = 0;
  for (const req of plan.content_requests) {
    if (req.kind === "interruption") continue;
    if (primaryRequest && req === primaryRequest && shouldSplitPrimary && primaryText) {
      const ratio = interruptionAt / Math.max(1, durationMs);
      const baseIndex = clamp(
        Math.round(primaryText.length * ratio),
        12,
        primaryText.length - 12
      );
      const splitIndex = clamp(
        findSplitIndexNearWhitespace(primaryText, baseIndex, 12),
        12,
        primaryText.length - 12
      );
      const prefix = `${primaryText.slice(0, splitIndex).trimEnd()}...`;
      const suffix = primaryText.slice(splitIndex).trimStart();
      events.push({ at_ms: 0, speaker: req.agent, text: prefix });
      if (suffix.length > 0 && suffix !== primaryText && suffix !== prefix) {
        events.push({
          at_ms: suffixTime,
          speaker: req.agent,
          text: suffix
        });
      }
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

  for (const interruption of localInterruptions) {
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
    let deferredCursor = suffixTime + microDelay;
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
