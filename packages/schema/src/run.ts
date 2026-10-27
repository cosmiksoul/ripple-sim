import { z } from 'zod';
import { PlayerEvent } from './events.js';

export const RunRecord = z.object({
  v: z.literal(1),
  dataVersion: z.string(),
  seed: z.number().int(),
  startYear: z.number().int(),
  endYear: z.number().int(),
  liveHistory: z.number().min(0).max(1).default(0), // «живая история»: how far the player world may drift from history on its own before «today»
  interventions: z.array(PlayerEvent),
});
export type RunRecord = z.infer<typeof RunRecord>;
