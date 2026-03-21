import { z } from "zod";

export const WorkItemSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  title: z.string(),
  status: z.enum(["todo", "active", "done", "blocked", "cancelled"]),
  notes: z.string().nullable(),
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export const WorkItemArraySchema = z.array(WorkItemSchema);
