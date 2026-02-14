import express from "express";
import { AGENTS } from "./config.js";
import { RuleDirector } from "./director/rule_director.js";
import { assertValidPlayPlan } from "./validator.js";
import { executePlayPlan } from "./runtime/scheduler.js";
import { RoomStore } from "./store/store.js";
import { DirectorInput, UserPacket } from "./types.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const store = new RoomStore();
const director = new RuleDirector();

app.post("/turn", async (req, res) => {
  try {
    const { user_id, text } = req.body ?? {};
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const userPacket: UserPacket = {
      user_id: typeof user_id === "string" && user_id ? user_id : "user",
      text: text.trim()
    };

    const input: DirectorInput = {
      agents: AGENTS,
      room_state: store.getState(),
      user_packet: userPacket
    };

    const plan = await director.generatePlayPlan(input);
    assertValidPlayPlan(plan);

    const transcript = await executePlayPlan(plan, AGENTS, store.getState(), userPacket.text);
    const room_state = store.applyTurn(plan, transcript);

    return res.json({ play_plan: plan, transcript, room_state });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
});

app.get("/state", (_req, res) => {
  res.json(store.getState());
});

app.post("/reset", (_req, res) => {
  const state = store.reset();
  res.json(state);
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(`Voice party chat MVP listening on ${port}`);
});
