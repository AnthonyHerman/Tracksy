import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { WorkItemArraySchema, WorkItemSchema } from "../types/workItem.schema";
import type { WorkItem, WorkItemStatus } from "../types/workItem";

interface StoreState {
  items: Map<string, WorkItem>;
  rootIds: string[];
  childrenMap: Map<string, string[]>;
  isLoading: boolean;
  error: string | null;
}

interface StoreActions {
  loadTree: () => Promise<void>;
  createWorkItem: (params: {
    id: string;
    title: string;
    parentId?: string;
    notes?: string;
    status?: WorkItemStatus;
    sortOrder: number;
  }) => Promise<WorkItem>;
  updateWorkItem: (
    id: string,
    fields: {
      title?: string;
      status?: WorkItemStatus;
      notes?: string;
      sortOrder?: number;
      parentId?: string | null;
    },
  ) => Promise<WorkItem>;
  deleteWorkItem: (id: string) => Promise<void>;
}

function buildDerivedState(items: Map<string, WorkItem>) {
  const rootIds: string[] = [];
  const childrenMap = new Map<string, string[]>();

  for (const item of items.values()) {
    if (item.parent_id === null) {
      rootIds.push(item.id);
    } else {
      const siblings = childrenMap.get(item.parent_id) ?? [];
      siblings.push(item.id);
      childrenMap.set(item.parent_id, siblings);
    }
  }

  // Sort by sort_order within each group
  const sortByOrder = (ids: string[]) =>
    ids.sort((a, b) => {
      const itemA = items.get(a)!;
      const itemB = items.get(b)!;
      return itemA.sort_order - itemB.sort_order;
    });

  sortByOrder(rootIds);
  for (const children of childrenMap.values()) {
    sortByOrder(children);
  }

  return { rootIds, childrenMap };
}

export const useWorkItemStore = create<StoreState & StoreActions>((set, get) => ({
  items: new Map(),
  rootIds: [],
  childrenMap: new Map(),
  isLoading: false,
  error: null,

  loadTree: async () => {
    set({ isLoading: true, error: null });
    try {
      const raw = await invoke("get_tree");
      const items = WorkItemArraySchema.parse(raw);
      const itemMap = new Map<string, WorkItem>();
      for (const item of items) {
        itemMap.set(item.id, item);
      }
      const { rootIds, childrenMap } = buildDerivedState(itemMap);
      set({ items: itemMap, rootIds, childrenMap, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  createWorkItem: async (params) => {
    try {
      const raw = await invoke("create_work_item", {
        id: params.id,
        title: params.title,
        parentId: params.parentId,
        notes: params.notes,
        status: params.status,
        sortOrder: params.sortOrder,
      });
      const item = WorkItemSchema.parse(raw);

      const items = new Map(get().items);
      items.set(item.id, item);
      const { rootIds, childrenMap } = buildDerivedState(items);
      set({ items, rootIds, childrenMap, error: null });
      return item;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  updateWorkItem: async (id, fields) => {
    try {
      const raw = await invoke("update_work_item", {
        id,
        fields: {
          title: fields.title,
          status: fields.status,
          notes: fields.notes,
          sort_order: fields.sortOrder,
          parent_id: fields.parentId,
        },
      });
      const item = WorkItemSchema.parse(raw);

      const items = new Map(get().items);
      items.set(item.id, item);
      const { rootIds, childrenMap } = buildDerivedState(items);
      set({ items, rootIds, childrenMap, error: null });
      return item;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteWorkItem: async (id) => {
    try {
      await invoke("delete_work_item", { id });

      const items = new Map(get().items);
      items.delete(id);
      const { rootIds, childrenMap } = buildDerivedState(items);
      set({ items, rootIds, childrenMap, error: null });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
}));
