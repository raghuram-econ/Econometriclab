import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard failed, fallback to element method:', err);
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return !!successful;
  } catch (err) {
    console.error('Fallback copy method failed:', err);
    return false;
  }
}

export function safeDownloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);
  } catch (err) {
    console.error('Download failed inside current context:', err);
    copyTextToClipboard(content).then(success => {
      if (success) {
        alert(`File download was blocked by your browser's iframe sandbox. We have copied the content to your clipboard instead!`);
      } else {
        alert(`File download was blocked by your browser's iframe sandbox.`);
      }
    });
  }
}

export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) return '';
      const stringVal = String(val);
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    }).join(','))
  ].join('\n');

  safeDownloadFile(csvContent, `${filename}.csv`, 'text/csv');
}

export function fmt(val: any, decimals = 4): string {
  const num = Number(val);
  if (isNaN(num) || val === null || val === undefined) return '0.0000';
  return num.toFixed(decimals);
}

export function fmtP(val: any): string {
  const num = Number(val);
  if (isNaN(num) || val === null || val === undefined) return '0.000';
  if (num < 0.001) return '< 0.001';
  return num.toFixed(3);
}

export function stars(pValue: number): string {
  if (pValue < 0.01) return '***';
  if (pValue < 0.05) return '**';
  if (pValue < 0.10) return '*';
  return '';
}

