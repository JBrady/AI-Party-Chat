export type BeatType =
  | "answer_user"
  | "style_reset"
  | "banter_loop"
  | "argument_spike"
  | "roast_user_light"
  | "hot_take_round"
  | "callback_bit"
  | "introduce_new_bit"
  | "deescalate"
  | "topic_pivot";

export type LanguageMode = "clean" | "normal" | "spicy";

export interface AgentConfig {
  id: "logician" | "therapist" | "meme_goblin" | "midwest_dad";
  display_name: string;
  profanity_level: number; // 0..1
  style_rules: string[];
  taboos: string[];
}

export interface RunningBit {
  bit_id: string;
  strength: number; // 0..1
  last_used_turn: number;
}

export interface Cooldowns {
  speaking: Record<AgentConfig["id"], number>; // 0..4
  interrupt: Record<AgentConfig["id"], number>; // 0..4
}

export interface RoomState {
  turn_index: number;
  scene: {
    topic: string;
    tone: string;
  };
  energy: number; // 0..1
  tension: number; // 0..1
  pace_wpm_target: number;
  running_bits: RunningBit[];
  last_turns_digest: {
    last_speaker: AgentConfig["id"] | "user" | null;
    last_primary_agent: AgentConfig["id"] | null;
    last_interrupt_agent: AgentConfig["id"] | null;
  };
  budget_mode: "normal" | "frugal";
  cooldowns: Cooldowns;
  recent_speakers: AgentConfig["id"][];
  language_mode: LanguageMode;
}

export interface UserPacket {
  user_id: string;
  text: string;
}

export interface DirectorInput {
  agents: AgentConfig[];
  room_state: RoomState;
  user_packet: UserPacket;
}

export interface Interruption {
  agent: AgentConfig["id"];
  cue: string;
  at_ms: number;
}

export interface Reaction {
  agent: AgentConfig["id"];
  cue: string;
  at_ms: number;
}

export interface Pacing {
  pace_wpm: number;
  micro_delay_ms_min: number;
  micro_delay_ms_max: number;
}

export type ContentKind = "full_reply" | "quip" | "tagline" | "interruption";

export interface ContentRequest {
  id: string;
  agent: AgentConfig["id"];
  kind: ContentKind;
  max_chars: number;
  style_hint: string;
}

export interface StateUpdates {
  energy_delta: number;
  tension_delta: number;
  topic?: string;
  tone?: string;
  running_bits_add?: RunningBit[];
  running_bits_decay?: string[]; // bit_ids
  language_mode?: LanguageMode;
  budget_mode?: "normal" | "frugal";
}

export interface SafetyBlock {
  fallback_mode_if_flagged: "none" | "single_speaker_safe";
  flagged_categories: (
    | "slur_or_hate"
    | "self_harm"
    | "violence"
    | "explicit_sexual"
  )[];
}

export interface PlayPlan {
  version: "1.0";
  beat_type: BeatType;
  primary_speaker: AgentConfig["id"];
  secondary_speakers: AgentConfig["id"][];
  interruptions: Interruption[];
  reactions: Reaction[];
  pacing: Pacing;
  content_requests: ContentRequest[];
  state_updates: StateUpdates;
  safety: SafetyBlock;
}

export interface TranscriptEvent {
  at_ms: number;
  speaker: AgentConfig["id"] | "narrator";
  text: string;
}
