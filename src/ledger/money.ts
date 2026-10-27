import type { GstType } from './types';

export interface GstBreakup {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function sumPaise(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * GST is computed in paise. Intra-state splits 9% CGST + 9% SGST.
 * Inter-state uses 18% IGST. The invoice total is rounded to the nearest rupee.
 */
export function computeGst(taxablePaise: number, gstType: GstType): GstBreakup {
  const cgstPaise = gstType === 'intra' ? Math.round((taxablePaise * 9) / 100) : 0;
  const sgstPaise = gstType === 'intra' ? Math.round((taxablePaise * 9) / 100) : 0;
  const igstPaise = gstType === 'inter' ? Math.round((taxablePaise * 18) / 100) : 0;
  const totalTaxPaise = cgstPaise + sgstPaise + igstPaise;
  const beforeRound = taxablePaise + totalTaxPaise;
  const totalPaise = Math.round(beforeRound / 100) * 100;

  return {
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalTaxPaise,
    roundOffPaise: totalPaise - beforeRound,
    totalPaise,
  };
}

export function formatINR(paise: number, decimals: 0 | 2 = 2): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(paise / 100);
}

export function formatPlainNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function asDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+05:30`);
  }
  return new Date(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(asDate(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(asDate(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(asDate(value));
}

export function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function utcDay(value: string): number {
  const datePart = dateOnly(value);
  const [year, month, day] = datePart.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

export function dueLabel(dueDate: string, asOf: string): string {
  const days = daysBetween(asOf, dueDate);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

export function monthLabel(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(asDate(value));
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigits(value: number): string {
  if (value < 20) return ONES[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${TENS[tens]}${ones ? ` ${ONES[ones]}` : ''}`;
}

function threeDigits(value: number): string {
  if (value < 100) return twoDigits(value);
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return `${ONES[hundreds]} Hundred${rest ? ` ${twoDigits(rest)}` : ''}`;
}

export function numberToWordsIndian(value: number): string {
  if (value === 0) return 'Zero';
  if (value < 0) return `Minus ${numberToWordsIndian(Math.abs(value))}`;

  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1000);
  const hundred = value % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(' ');
}

export function amountInWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const paisePart = Math.abs(paise) % 100;
  const rupeeWords = `Rupees ${numberToWordsIndian(rupees)}`;
  if (!paisePart) return `${rupeeWords} Only`;
  return `${rupeeWords} and ${twoDigits(paisePart)} Paise Only`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
