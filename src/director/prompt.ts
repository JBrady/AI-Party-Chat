import { DirectorInput } from "../types.js";

export function buildDirectorPrompt(input: DirectorInput): string {
  return [
    "You are the Director for a multi-agent voice party chat.",
    "Return ONLY valid Play Plan JSON. No markdown.",
    "Agents:",
    JSON.stringify(input.agents, null, 2),
    "ROOM_STATE:",
    JSON.stringify(input.room_state, null, 2),
    "USER_PACKET:",
    JSON.stringify(input.user_packet, null, 2),
    "Obey the schema and output strict JSON with no additional properties."
  ].join("\n");
}
