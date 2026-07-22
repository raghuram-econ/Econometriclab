import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  getDocs, 
  deleteDoc,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ModelHistoryItem, Dataset, ResearchQuestion, ModuleTab } from '../types';
import { RobustnessItem, TeachingState } from '../store/useStore';

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

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) {
    return null;
  }
  if (obj === null) {
    return null;
  }
  if (Array.isArray(obj)) {
    const isNested = obj.some(item => Array.isArray(item));
    if (isNested) {
      return {
        serialized_nested_array: true,
        data: JSON.stringify(obj.map(item => sanitizeForFirestore(item)))
      };
    }
    return obj.map(item => sanitizeForFirestore(item));
  }
  if (isPlainObject(obj)) {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        res[key] = sanitizeForFirestore(val);
      }
    }
    return res;
  }
  return obj;
}

function deserializeFromFirestore(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deserializeFromFirestore(item));
  }
  if (isPlainObject(obj)) {
    if ((obj.serialized_nested_array || obj.__serialized_nested_array__) && typeof obj.data === 'string') {
      try {
        const parsed = JSON.parse(obj.data);
        return deserializeFromFirestore(parsed);
      } catch (e) {
        console.error('Failed to parse serialized nested array:', e);
        return [];
      }
    }
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = deserializeFromFirestore(obj[key]);
    }
    return res;
  }
  return obj;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
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
    const user = auth.currentUser;
    if (!user) return;

    const path = `users/${user.uid}/workspace/current`;
    try {
      // Stripping data from dataset to save only metadata as requested
      const datasetMetadata = data.currentDataset ? {
        name: data.currentDataset.name,
        variables: data.currentDataset.variables,
        rowCount: data.currentDataset.rowCount,
        colCount: data.currentDataset.colCount,
        structure: data.currentDataset.structure,
      } : null;

      await setDoc(doc(db, path), sanitizeForFirestore({
        ...data,
        currentDataset: datasetMetadata,
        lastUpdated: serverTimestamp(),
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async loadWorkspace() {
    const user = auth.currentUser;
    if (!user) return null;

    const path = `users/${user.uid}/workspace/current`;
    try {
      const snap = await getDoc(doc(db, path));
      return snap.exists() ? deserializeFromFirestore(snap.data()) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  },

  async saveModelRun(run: ModelHistoryItem) {
    const user = auth.currentUser;
    if (!user) return;

    const path = `users/${user.uid}/modelRuns/${run.id}`;
    try {
      await setDoc(doc(db, path), sanitizeForFirestore(run));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async updateModelRunNote(id: string, notes: string) {
    const user = auth.currentUser;
    if (!user) return;

    const path = `users/${user.uid}/modelRuns/${id}`;
    try {
      await updateDoc(doc(db, path), sanitizeForFirestore({ notes }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async loadModelHistory() {
    const user = auth.currentUser;
    if (!user) return [];

    const path = `users/${user.uid}/modelRuns`;
    try {
      const q = query(collection(db, path));
      const snap = await getDocs(q);
      return snap.docs.map(d => deserializeFromFirestore({ ...d.data(), id: d.id } as ModelHistoryItem));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async saveRobustnessEntry(item: RobustnessItem) {
    const user = auth.currentUser;
    if (!user) return;

    const path = `users/${user.uid}/robustness/${item.id}`;
    try {
      await setDoc(doc(db, path), sanitizeForFirestore(item));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async loadRobustnessItems() {
    const user = auth.currentUser;
    if (!user) return [];

    const path = `users/${user.uid}/robustness`;
    try {
      const q = query(collection(db, path));
      const snap = await getDocs(q);
      return snap.docs.map(d => deserializeFromFirestore(d.data() as RobustnessItem));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async saveReportDraft(draft: any) {
    const user = auth.currentUser;
    if (!user) return;

    const path = `users/${user.uid}/reports/${draft.id || 'current'}`;
    try {
      await setDoc(doc(db, path), sanitizeForFirestore({
        ...draft,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async loadReportDrafts() {
    const user = auth.currentUser;
    if (!user) return [];

    const path = `users/${user.uid}/reports`;
    try {
      const snap = await getDocs(collection(db, path));
      return snap.docs.map(d => deserializeFromFirestore(d.data()));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async savePipelineNote(note: { id: string; stageId: string; content: string; authorName: string; authorUid: string; createdAt: string }) {
    const path = `pipelineNotes/${note.id}`;
    try {
      await setDoc(doc(db, path), sanitizeForFirestore(note));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async updatePipelineNote(id: string, content: string) {
    const path = `pipelineNotes/${id}`;
    try {
      await updateDoc(doc(db, path), sanitizeForFirestore({ content }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deletePipelineNote(id: string) {
    const path = `pipelineNotes/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
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
