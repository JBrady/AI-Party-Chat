import Ajv from "ajv/dist/2020";
import schema from "../schemas/playplan.schema.json";
import { PlayPlan } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: true });

const validatePlayPlan = ajv.compile<PlayPlan>(schema);

export function assertValidPlayPlan(plan: PlayPlan): void {
  const ok = validatePlayPlan(plan);
  if (!ok) {
    const errors = validatePlayPlan.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? [];
    const message = `Invalid PlayPlan: ${errors.join("; ")}`;
    throw new Error(message);
  }
}
