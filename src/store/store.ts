import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ROOM_STATE } from "../config.js";
import { PlayPlan, RoomState, TranscriptEvent } from "../types.js";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "room_events.jsonl");

export class RoomStore {
  private roomState: RoomState = JSON.parse(JSON.stringify(DEFAULT_ROOM_STATE));

  getState(): RoomState {
    return this.roomState;
  }

  reset(): RoomState {
    this.roomState = JSON.parse(JSON.stringify(DEFAULT_ROOM_STATE));
    return this.roomState;
  }

  applyTurn(plan: PlayPlan, transcript: TranscriptEvent[]): RoomState {
    const state = this.roomState;

    state.turn_index += 1;
    state.energy = clamp01(state.energy + plan.state_updates.energy_delta);
    state.tension = clamp01(state.tension + plan.state_updates.tension_delta);

    if (plan.state_updates.topic) state.scene.topic = plan.state_updates.topic;
    if (plan.state_updates.tone) state.scene.tone = plan.state_updates.tone;
    if (plan.state_updates.language_mode) state.language_mode = plan.state_updates.language_mode;
    if (plan.state_updates.budget_mode) state.budget_mode = plan.state_updates.budget_mode;

    if (plan.state_updates.running_bits_add) {
      for (const bit of plan.state_updates.running_bits_add) {
        const existing = state.running_bits.find((b) => b.bit_id === bit.bit_id);
        if (existing) {
          existing.strength = bit.strength;
          existing.last_used_turn = bit.last_used_turn;
        } else {
          state.running_bits.push(bit);
        }
      }
    }

    if (plan.state_updates.running_bits_decay) {
      state.running_bits = state.running_bits.filter((b) => !plan.state_updates.running_bits_decay?.includes(b.bit_id));
    }

    // Cooldowns: decrement, then set primary and interrupters
    for (const agent of Object.keys(state.cooldowns.speaking) as Array<keyof typeof state.cooldowns.speaking>) {
      state.cooldowns.speaking[agent] = Math.max(0, state.cooldowns.speaking[agent] - 1);
      state.cooldowns.interrupt[agent] = Math.max(0, state.cooldowns.interrupt[agent] - 1);
    }
    state.cooldowns.speaking[plan.primary_speaker] = 2;
    for (const interrupt of plan.interruptions) {
      state.cooldowns.interrupt[interrupt.agent] = 2;
    }

    // Recent speakers
    state.recent_speakers = [plan.primary_speaker, ...plan.secondary_speakers].slice(0, 6);
    state.last_turns_digest.last_speaker = plan.primary_speaker;
    state.last_turns_digest.last_primary_agent = plan.primary_speaker;
    state.last_turns_digest.last_interrupt_agent = plan.interruptions[0]?.agent ?? null;

    this.roomState = state;
    this.appendLog({ plan, transcript, room_state: state });
    return state;
  }

  private appendLog(entry: unknown): void {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  }
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
