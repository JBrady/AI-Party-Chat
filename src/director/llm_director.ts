import { Director } from "./director.js";
import { DirectorInput, PlayPlan } from "../types.js";
import { buildDirectorPrompt } from "./prompt.js";

export class LlmDirector implements Director {
  async generatePlayPlan(input: DirectorInput): Promise<PlayPlan> {
    const prompt = buildDirectorPrompt(input);
    void prompt;
    throw new Error("LLM director not implemented. Use RuleDirector for MVP.");
  }
}
