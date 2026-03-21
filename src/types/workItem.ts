import type { z } from "zod";
import type { WorkItemSchema } from "./workItem.schema";

export type WorkItem = z.infer<typeof WorkItemSchema>;

export type WorkItemStatus = WorkItem["status"];

export const WORK_ITEM_STATUSES: WorkItemStatus[] = [
  "todo",
  "active",
  "done",
  "blocked",
  "cancelled",
];
