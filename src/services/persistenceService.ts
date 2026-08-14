import { supabase } from '../lib/supabase';
import { ModelHistoryItem, Dataset, ResearchQuestion, ModuleTab } from '../types';
import { RobustnessItem, TeachingState } from '../store/useStore';

// Note: the Firestore version of this file had sanitizeForFirestore/
// deserializeFromFirestore helpers to work around Firestore's restriction
// on directly nesting arrays inside arrays. Postgres JSONB has no such
// restriction -- arbitrary nested JSON is stored natively -- so those
// helpers are dropped here rather than ported; payloads are stored as-is.

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const DB_NAME = 'EconomicsLearningLabDB';
const DB_VERSION = 1;
const STORE_NAME = 'session_state';

function getIDBDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        } catch (e) {
          console.error('Failed to create store:', e);
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        resolve(null);
      };
    } catch (e) {
      console.error('IndexedDB open failed:', e);
      resolve(null);
    }
  });
}

interface SupabaseErrorInfo {
  error: string;
  operationType: OperationType;
  table: string | null;
  authInfo: any;
}

async function currentUserInfo() {
  const { data: { user } } = await supabase.auth.getUser();
  return {
    userId: user?.id,
    email: user?.email,
    emailVerified: !!user?.email_confirmed_at,
    isAnonymous: user?.is_anonymous,
  };
}

async function handleSupabaseError(error: unknown, operationType: OperationType, table: string | null) {
  const errInfo: SupabaseErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: await currentUserInfo(),
    operationType,
    table
  };
  console.error('Supabase Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const persistenceService = {
  async saveWorkspace(data: {
    activeModule: ModuleTab;
    researchQuestion: ResearchQuestion;
    teachingState: TeachingState;
    currentDataset: Dataset | null;
    selectedConceptId: string | null;
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Stripping data from dataset to save only metadata as requested
      const datasetMetadata = data.currentDataset ? {
        name: data.currentDataset.name,
        variables: data.currentDataset.variables,
        rowCount: data.currentDataset.rowCount,
        colCount: data.currentDataset.colCount,
        structure: data.currentDataset.structure,
      } : null;

      const { error } = await supabase.from('workspaces').upsert({
        user_id: user.id,
        data: {
          ...data,
          currentDataset: datasetMetadata,
        },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (error) {
      await handleSupabaseError(error, OperationType.WRITE, 'workspaces');
    }
  },

  async loadWorkspace() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('data')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.data ?? null;
    } catch (error) {
      await handleSupabaseError(error, OperationType.GET, 'workspaces');
    }
  },

  async saveModelRun(run: ModelHistoryItem) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error } = await supabase.from('model_runs').upsert({
        id: run.id,
        user_id: user.id,
        data: run,
      });
      if (error) throw error;
    } catch (error) {
      await handleSupabaseError(error, OperationType.WRITE, 'model_runs');
    }
  },

  async updateModelRunNote(id: string, notes: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { data: existing, error: fetchError } = await supabase
        .from('model_runs')
        .select('data')
        .eq('user_id', user.id)
        .eq('id', id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      const { error } = await supabase
        .from('model_runs')
        .update({ data: { ...(existing?.data ?? {}), notes } })
        .eq('user_id', user.id)
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      await handleSupabaseError(error, OperationType.UPDATE, 'model_runs');
    }
  },

  async loadModelHistory() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('model_runs')
        .select('id, data')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []).map(row => ({ ...(row.data as object), id: row.id } as ModelHistoryItem));
    } catch (error) {
      await handleSupabaseError(error, OperationType.LIST, 'model_runs');
    }
  },

  async saveRobustnessEntry(item: RobustnessItem) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error } = await supabase.from('robustness_items').upsert({
        id: item.id,
        user_id: user.id,
        data: item,
      });
      if (error) throw error;
    } catch (error) {
      await handleSupabaseError(error, OperationType.WRITE, 'robustness_items');
    }
  },

  async loadRobustnessItems() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('robustness_items')
        .select('data')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []).map(row => row.data as RobustnessItem);
    } catch (error) {
      await handleSupabaseError(error, OperationType.LIST, 'robustness_items');
    }
  },

  async saveReportDraft(draft: any) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error } = await supabase.from('report_drafts').upsert({
        id: draft.id || 'current',
        user_id: user.id,
        data: {
          ...draft,
          timestamp: new Date().toISOString()
        },
      });
      if (error) throw error;
    } catch (error) {
      await handleSupabaseError(error, OperationType.WRITE, 'report_drafts');
    }
  },

  async loadReportDrafts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('report_drafts')
        .select('data')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []).map(row => row.data);
    } catch (error) {
      await handleSupabaseError(error, OperationType.LIST, 'report_drafts');
    }
  },

  async savePipelineNote(note: { id: string; stageId: string; content: string; authorName: string; authorUid: string; createdAt: string }) {
    try {
      const { error } = await supabase.from('pipeline_notes').insert({
        id: note.id,
        stage_id: note.stageId,
        content: note.content,
        author_name: note.authorName,
        author_uid: note.authorUid,
        created_at: note.createdAt,
      });
      if (error) throw error;
    } catch (error) {
      await handleSupabaseError(error, OperationType.WRITE, 'pipeline_notes');
    }
  },

  async updatePipelineNote(id: string, content: string) {
    try {
      const { error } = await supabase
        .from('pipeline_notes')
        .update({ content })
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      await handleSupabaseError(error, OperationType.UPDATE, 'pipeline_notes');
    }
  },

  async deletePipelineNote(id: string) {
    try {
      const { error } = await supabase.from('pipeline_notes').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      await handleSupabaseError(error, OperationType.DELETE, 'pipeline_notes');
    }
  },

  async saveToIndexedDB(key: string, value: any): Promise<void> {
    try {
      const dbInstance = await getIDBDatabase();
      if (!dbInstance) return;
      return new Promise<void>((resolve, reject) => {
        try {
          const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      console.error('saveToIndexedDB failed:', e);
    }
  },

  async getFromIndexedDB(key: string): Promise<any> {
    try {
      const dbInstance = await getIDBDatabase();
      if (!dbInstance) return null;
      return new Promise((resolve, reject) => {
        try {
          const tx = dbInstance.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      console.error('getFromIndexedDB failed:', e);
      return null;
    }
  }
};
