import { z } from 'zod';

export const LinkType = z.enum(['border', 'trade', 'bloc', 'migration', 'aviation', 'aid', 'sanction']);
export type LinkType = z.infer<typeof LinkType>;

export const Edge = z.object({ a: z.string(), b: z.string(), type: LinkType, weight: z.number().min(0).max(1) });
export type Edge = z.infer<typeof Edge>;

export const Graph = z.object({ dataVersion: z.string(), edges: z.array(Edge) });
export type Graph = z.infer<typeof Graph>;
