import { DirectorInput, PlayPlan } from "../types.js";

export interface Director {
  generatePlayPlan(input: DirectorInput): Promise<PlayPlan>;
}
