import { useState, useEffect } from 'react';

export type VariableType = 'continuous' | 'binary' | 'categorical' | 'date';

export interface VariableMetadataItem {
  label: string;
  type: VariableType;
  missingCode: number | null;
  description: string;
}

export type VariableMetadata = {
  [originalName: string]: VariableMetadataItem;
};

export function useVariableMetadata(headers: string[], variable_labels?: {[col: string]: string}) {
  const [metadata, setMetadata] = useState<VariableMetadata>({});

  useEffect(() => {
    if (!headers || headers.length === 0) {
      setMetadata({});
      return;
    }

    setMetadata(prev => {
      const newMeta: VariableMetadata = { ...prev };
      let changed = false;

      // Add missing headers or update labels if we have custom ones
      headers.forEach(header => {
        const customLabel = variable_labels?.[header] || header;
        if (!newMeta[header]) {
          newMeta[header] = {
            label: customLabel,
            type: 'continuous',
            missingCode: null,
            description: '',
          };
          changed = true;
        } else if (newMeta[header].label !== customLabel) {
          newMeta[header] = {
            ...newMeta[header],
            label: customLabel,
          };
          changed = true;
        }
      });

      // Clean up deleted headers to prevent leak
      const keys = Object.keys(newMeta);
      keys.forEach(key => {
        if (!headers.includes(key)) {
          delete newMeta[key];
          changed = true;
        }
      });

      return changed ? newMeta : prev;
    });
  }, [headers]);

  return { metadata, setMetadata };
}
