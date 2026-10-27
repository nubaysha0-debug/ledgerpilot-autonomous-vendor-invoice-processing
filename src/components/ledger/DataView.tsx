import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  RotateCcw,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react';
import type { Business, BusinessProfileInput, DemoState } from '../../ledger/types';
import type { LedgerMode } from '../../ledger/store';
import { formatDateTime, formatINR } from '../../ledger/money';
import {
  INDIAN_STATES,
  INVOICE_CSV_TEMPLATE,
  VENDOR_CSV_TEMPLATE,
  WORKSPACE_CSV_NOTE,
  invoicesToCsv,
  normalizeAsOf,
  parseBackup,
  previewImport,
  serializeBackup,
  validateBusinessProfile,
  vendorsToCsv,
  type ImportPreview,
  type WorkspaceImportInput,
} from '../../ledger/importer';
import {
  Button,
  Card,
  SectionHeading,
  cn,
  type ToastTone,
} from './ui';

interface DataViewProps {
  state: DemoState;
  canEdit: boolean;
  mode?: LedgerMode;
  onSaveProfile: (input: BusinessProfileInput) => void;
  onImport: (
    input: WorkspaceImportInput,
    summary: { vendorCount: number; invoiceCount: number; warningCount: number },
  ) => void;
  onRestore: (
    backupJson: string,
    summary: { vendorCount: number; invoiceCount: number },
  ) => void;
  onReset: () => void;
  onNotify: (tone: ToastTone, message: string, detail?: string) => void;
}

const labelClass = 'block text-[10.5px] font-medium text-[#4e5a52]';
const inputClass =
  'mt-1 w-full rounded-lg border border-[#d9d7ce] bg-white px-2.5 py-1.5 text-[12px] text-[#1c2420] outline-none transition-colors focus:border-[#1f5c45] focus:ring-1 focus:ring-[#1f5c45] disabled:cursor-not-allowed disabled:bg-[#f5f4ef] disabled:text-[#66706a]';

function toDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 16);
}

function profileFromBusiness(business: Business): BusinessProfileInput {
  return {
    name: business.name,
    gstin: business.gstin,
    address: business.address,
    city: business.city,
    state: business.state,
    pincode: business.pincode,
    phone: business.phone,
    email: business.email,
    fy: business.fy,
    asOf: toDateTimeInput(business.asOf),
  };
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCsv(filename: string, text: string) {
  downloadText(filename, `\uFEFF${text}`, 'text/csv;charset=utf-8');
}

function downloadJson(filename: string, text: string) {
  downloadText(filename, text, 'application/json;charset=utf-8');
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e7e5dc] bg-[#fafaf7] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.08em] text-[#8a938d]">{label}</div>
      <div className="mt-0.5 lp-num text-[13px] font-semibold tabular-nums text-[#1c2420]">
        {value}
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: ImportPreview['issues'][number] }) {
  const error = issue.severity === 'error';
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed',
        error
          ? 'border-[#efc9c5] bg-[#fdf4f3] text-[#8f2a23]'
          : 'border-[#efd7ad] bg-[#fdf8ee] text-[#7a4a12]',
      )}
    >
      {error ? (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <div className="min-w-0">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.04em]">
          {issue.scope} row {issue.row}
        </span>
        {issue.field ? (
          <span className="ml-1.5 rounded bg-white/70 px-1 py-0.5 font-mono text-[9px]">
            {issue.field}
          </span>
        ) : null}
        <div className="mt-0.5 break-words">{issue.message}</div>
      </div>
    </div>
  );
}

function FileDrop({
  id,
  title,
  hint,
  fileName,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  fileName: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'block rounded-lg border border-dashed px-3 py-3 transition-colors',
        disabled
          ? 'cursor-not-allowed border-[#e2e0d8] bg-[#fafaf7] opacity-70'
          : 'cursor-pointer border-[#cfcdc3] bg-white hover:border-[#1f5c45] hover:bg-[#f8faf8]',
      )}
    >
      <input
        id={id}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={disabled}
        onChange={onChange}
      />
      <div className="flex items-start gap-2.5">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-[#1f5c45]" />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold text-[#1c2420]">{title}</div>
          <div className="mt-0.5 truncate text-[10px] text-[#66706a]" title={fileName || hint}>
            {fileName || hint}
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-[#d9d7ce] bg-[#fafaf7] px-1.5 py-0.5 text-[9.5px] font-medium text-[#4e5a52]">
          Browse
        </span>
      </div>
    </label>
  );
}

export function DataView({
  state,
  canEdit,
  mode = 'local',
  onSaveProfile,
  onImport,
  onRestore,
  onReset,
  onNotify,
}: DataViewProps) {
  const [profile, setProfile] = useState<BusinessProfileInput>(() =>
    profileFromBusiness(state.business),
  );
  const [profileErrors, setProfileErrors] = useState<string[]>([]);
  const [vendorsText, setVendorsText] = useState('');
  const [vendorsName, setVendorsName] = useState('');
  const [invoicesText, setInvoicesText] = useState('');
  const [invoicesName, setInvoicesName] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoreName, setRestoreName] = useState('');

  useEffect(() => {
    setProfile(profileFromBusiness(state.business));
    setProfileErrors([]);
  }, [state.business]);

  const previewResult = useMemo(() => {
    if (!vendorsText.trim() || !invoicesText.trim()) {
      return { preview: null as ImportPreview | null, crash: '' };
    }
    try {
      return {
        preview: previewImport({
          business: state.business,
          vendorsCsv: vendorsText,
          invoicesCsv: invoicesText,
        }),
        crash: '',
      };
    } catch (error) {
      return {
        preview: null as ImportPreview | null,
        crash: error instanceof Error ? error.message : 'The CSV files could not be read.',
      };
    }
  }, [vendorsText, invoicesText, state.business]);

  const preview = previewResult.preview;
  const savedProfile = profileFromBusiness(state.business);
  const profileDirty = JSON.stringify(profile) !== JSON.stringify(savedProfile);

  const updateProfile = (key: keyof BusinessProfileInput, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setProfileErrors([]);
  };

  const saveProfile = () => {
    const normalized = { ...profile, asOf: normalizeAsOf(profile.asOf) };
    const errors = validateBusinessProfile(normalized);
    setProfileErrors(errors);
    if (errors.length > 0) return;
    onSaveProfile(normalized);
  };

  const readText = async (file: File): Promise<string> => file.text();

  const handleCsvFile = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: 'vendors' | 'invoices',
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      onNotify('error', 'File too large', 'Keep each CSV under 2 MB.');
      input.value = '';
      return;
    }
    try {
      const text = await readText(file);
      if (kind === 'vendors') {
        setVendorsText(text);
        setVendorsName(file.name);
      } else {
        setInvoicesText(text);
        setInvoicesName(file.name);
      }
    } catch {
      onNotify(
        'error',
        'Could not read the file',
        'Save it as CSV UTF-8 and select it again.',
      );
    } finally {
      input.value = '';
    }
  };

  const handleRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) {
      setRestoreError('Keep backup files under 5 MB.');
      input.value = '';
      return;
    }
    try {
      const raw = await readText(file);
      const restored = parseBackup(raw);
      setRestoreError('');
      setRestoreName(file.name);
      onRestore(raw, {
        vendorCount: restored.vendors.length,
        invoiceCount: restored.invoices.length,
      });
    } catch (error) {
      setRestoreName('');
      setRestoreError(
        error instanceof Error ? error.message : 'The backup file could not be read.',
      );
    } finally {
      input.value = '';
    }
  };

  const clearImportFiles = () => {
    setVendorsText('');
    setVendorsName('');
    setInvoicesText('');
    setInvoicesName('');
  };

  const issueCount = preview?.issues.length ?? 0;
  const visibleIssues = preview?.issues.slice(0, 24) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight text-[#1c2420]">
            Data &amp; backups
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[#66706a]">
            {mode === 'api'
              ? 'Load vendors and invoices from CSV into the PostgreSQL workspace. The FastAPI service validates and stores each import.'
              : 'Load your own vendors and invoices from CSV. Files are read in this browser and nothing is uploaded to a server.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-[#d9ded8] bg-[#f3f5f2] px-2 py-1 text-[10px] font-medium text-[#4e5a52]">
            <Database className="h-3 w-3" />
            {mode === 'api' ? 'PostgreSQL API' : 'Local only'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-[#d9ded8] bg-[#f3f5f2] px-2 py-1 text-[10px] font-medium text-[#4e5a52]">
            <ShieldAlert className="h-3 w-3" />
            Owner only
          </span>
        </div>
      </div>

      {!canEdit ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#c9dced] bg-[#eef5fb] p-3 text-[11.5px] leading-relaxed text-[#245b89]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Read-only for this role</div>
            <div className="mt-0.5">
              Only the owner can change the company profile, import data, restore a backup or
              reset the demo. Switch to Ramesh Patil in Demo controls.
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-2.5 rounded-lg border border-[#efd7ad] bg-[#fdf8ee] p-3 text-[11.5px] leading-relaxed text-[#7a4a12]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">
            {mode === 'api'
              ? 'Shared demo workspace, not a system of record'
              : 'Local demo storage, not a system of record'}
          </div>
          <div className="mt-0.5">
            {mode === 'api'
              ? 'Records are stored in the local PostgreSQL demo database through the FastAPI service. The data is synthetic, unencrypted and not backed up like production data. Do not import live bank credentials, full account numbers or customer data. A full account number is reduced to its last four digits on import. Reset demo data overwrites the whole workspace.'
              : 'Records live in this browser’s localStorage. They are not encrypted, not backed up by a server, and can be read or changed by anyone with access to this browser. Do not import live bank credentials, full account numbers or customer data. A full account number is reduced to its last four digits on import. Reset demo data overwrites everything here.'}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="p-4 sm:p-5">
            <SectionHeading
              title="Import vendors & invoices"
              subtitle="Two CSV files. Preview every row before the current workspace is replaced."
              action={
                <span className="rounded-md border border-[#e7e5dc] bg-[#fafaf7] px-2 py-1 text-[9.5px] font-medium text-[#66706a]">
                  Replaces current data
                </span>
              }
            />

            <div className="rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a938d]">
                Step 1 · Start from a template
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[#66706a]">
                Download the starter files, replace the sample rows, then upload them below.
                You can also download the current workspace as CSV to edit what is already here.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    downloadCsv('ledgerpilot-vendors-template.csv', VENDOR_CSV_TEMPLATE)
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  Vendors template
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    downloadCsv('ledgerpilot-invoices-template.csv', INVOICE_CSV_TEMPLATE)
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  Invoices template
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    downloadCsv(
                      `ledgerpilot-vendors-${dateStamp()}.csv`,
                      vendorsToCsv(state.vendors),
                    );
                  }}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Current vendors
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    downloadCsv(
                      `ledgerpilot-invoices-${dateStamp()}.csv`,
                      invoicesToCsv(state),
                    );
                  }}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Current invoices
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a938d]">
                    Step 2 · Vendors CSV
                  </span>
                  {vendorsName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setVendorsText('');
                        setVendorsName('');
                      }}
                      className="text-[9.5px] font-medium text-[#8a5a1f] hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <FileDrop
                  id="vendors-csv"
                  title="Vendor master"
                  hint="Choose a vendors CSV"
                  fileName={vendorsName}
                  disabled={!canEdit}
                  onChange={(event) => void handleCsvFile(event, 'vendors')}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a938d]">
                    Invoices CSV
                  </span>
                  {invoicesName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setInvoicesText('');
                        setInvoicesName('');
                      }}
                      className="text-[9.5px] font-medium text-[#8a5a1f] hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <FileDrop
                  id="invoices-csv"
                  title="Invoice lines"
                  hint="Choose an invoices CSV"
                  fileName={invoicesName}
                  disabled={!canEdit}
                  onChange={(event) => void handleCsvFile(event, 'invoices')}
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a938d]">
                Step 3 · Preview
              </div>

              {previewResult.crash ? (
                <div className="mt-2 rounded-lg border border-[#efc9c5] bg-[#fdf4f3] p-3 text-[11.5px] text-[#8f2a23]">
                  {previewResult.crash}
                </div>
              ) : null}

              {!preview && !previewResult.crash ? (
                <div className="mt-2 rounded-lg border border-dashed border-[#d9d7ce] px-3 py-6 text-center text-[11px] leading-relaxed text-[#8a938d]">
                  Select both CSV files to validate vendors, GSTINs, dates, GST arithmetic and
                  opening paid amounts. Nothing changes until you confirm the import.
                </div>
              ) : null}

              {preview ? (
                <div className="mt-2 space-y-3">
                  {profileDirty ? (
                    <div className="flex items-start gap-2 rounded-lg border border-[#efd7ad] bg-[#fdf8ee] px-3 py-2 text-[10.5px] leading-relaxed text-[#7a4a12]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        The company profile has unsaved changes. Save or discard them before
                        importing so the GST split and as-of date match this preview.
                      </span>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Vendors" value={String(preview.vendorCount)} />
                    <Stat label="Invoices" value={String(preview.invoiceCount)} />
                    <Stat label="Line items" value={String(preview.lineCount)} />
                    <Stat label="Opening payments" value={String(preview.openingPaymentCount)} />
                  </div>

                  <div className="rounded-lg border border-[#e7e5dc] bg-white px-3 py-2.5 text-[11px] text-[#66706a]">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span>
                        Billable value{' '}
                        <span className="font-semibold text-[#1c2420]">
                          {formatINR(preview.invoiceValuePaise)}
                        </span>
                      </span>
                      <span>
                        Opening paid{' '}
                        <span className="font-semibold text-[#2f7a54]">
                          {formatINR(preview.openingPaidPaise)}
                        </span>
                      </span>
                      <span>
                        Balance{' '}
                        <span className="font-semibold text-[#1c2420]">
                          {formatINR(preview.balancePaise)}
                        </span>
                      </span>
                      {preview.duplicateInvoiceCount > 0 ? (
                        <span className="text-[#9a4a0d]">
                          {preview.duplicateInvoiceCount} duplicate cop
                          {preview.duplicateInvoiceCount === 1 ? 'y' : 'ies'}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {issueCount === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-[#c7ddce] bg-[#f2f9f4] px-3 py-2 text-[11.5px] font-medium text-[#1f5c45]">
                      <CheckCircle2 className="h-4 w-4" />
                      Validation passed. Review the caution below, then import.
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11.5px] font-semibold text-[#1c2420]">
                          {preview.errorCount > 0 ? (
                            <span className="text-[#a3261f]">
                              {preview.errorCount} blocking error
                              {preview.errorCount === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="text-[#2f7a54]">No blocking errors</span>
                          )}
                          <span className="text-[#8a938d]">
                            {' '}
                            · {preview.warningCount} warning
                            {preview.warningCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        <span className="text-[9.5px] text-[#8a938d]">
                          Showing {visibleIssues.length} of {issueCount}
                        </span>
                      </div>
                      <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                        {visibleIssues.map((item, index) => (
                          <IssueRow key={`${item.scope}-${item.row}-${item.field ?? 'row'}-${index}`} issue={item} />
                        ))}
                      </div>
                      {issueCount > visibleIssues.length ? (
                        <p className="mt-1.5 text-[10.5px] text-[#8a938d]">
                          {issueCount - visibleIssues.length} more issue
                          {issueCount - visibleIssues.length === 1 ? '' : 's'} not shown. Fix
                          the first rows and re-upload.
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3 text-[10.5px] leading-relaxed text-[#66706a]">
                    Importing replaces the current vendors, invoices, payments and audit events.
                    Vendor bank accounts are imported as verified unless{' '}
                    <span className="font-mono">bank_status</span> is set to{' '}
                    <span className="font-mono">verify</span>. Confirm bank details with the
                    supplier before paying. Download a JSON backup first if you need the exact
                    current state.
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        disabled={
                          !canEdit ||
                          preview.errorCount > 0 ||
                          preview.vendorCount === 0 ||
                          previewResult.crash !== '' ||
                          profileDirty
                        }
                        onClick={() =>
                          onImport(
                            { vendorsCsv: vendorsText, invoicesCsv: invoicesText },
                            {
                              vendorCount: preview.vendorCount,
                              invoiceCount: preview.invoiceCount,
                              warningCount: preview.warningCount,
                            },
                          )
                        }
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Import and replace workspace
                      </Button>
                      <Button variant="ghost" onClick={clearImportFiles}>
                        Clear files
                      </Button>
                    </div>
                    {preview.errorCount > 0 ? (
                      <span className="text-[10.5px] text-[#a3261f]">
                        Fix all errors before importing.
                      </span>
                    ) : profileDirty ? (
                      <span className="text-[10.5px] text-[#9a4a0d]">
                        Save or discard profile changes before importing.
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionHeading
              title="How the CSV import works"
              subtitle="A few rules keep the ledger arithmetic honest."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#1c2420]">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-[#1f5c45]" />
                  One row per invoice line
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[#66706a]">
                  Repeat the same <span className="font-mono">vendor_gstin</span> and{' '}
                  <span className="font-mono">invoice_number</span> on extra rows to add more
                  line items to one invoice.
                </p>
              </div>
              <div className="rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#1c2420]">
                  <Building2 className="h-3.5 w-3.5 text-[#1f5c45]" />
                  GST is recalculated
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[#66706a]">
                  Intra-state vs inter-state is derived from the business and vendor GSTIN state
                  codes. The rate defaults to 18%; set{' '}
                  <span className="font-mono">gst_rate</span> for 5%, 12% or 28%.
                </p>
              </div>
              <div className="rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#1c2420]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#1f5c45]" />
                  Opening balances are allowed
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[#66706a]">
                  <span className="font-mono">amount_paid</span> becomes a simulated historical
                  payment. It reduces the invoice balance but is not proof that money moved.
                </p>
              </div>
              <div className="rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#1c2420]">
                  <XCircle className="h-3.5 w-3.5 text-[#a3261f]" />
                  Errors block the whole file
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[#66706a]">
                  A row with a bad GSTIN, unmatched vendor, broken date or overpaid amount is
                  never imported. Warnings are shown but do not block the import.
                </p>
              </div>
            </div>

            <details className="mt-3 rounded-lg border border-[#e7e5dc] bg-white px-3 py-2.5">
              <summary className="cursor-pointer text-[11px] font-semibold text-[#1c2420]">
                CSV columns and examples
              </summary>
              <div className="mt-2 grid gap-3 text-[10.5px] leading-relaxed text-[#66706a] sm:grid-cols-2">
                <div>
                  <div className="font-semibold text-[#3e4742]">Vendors · required</div>
                  <p className="mt-0.5 font-mono text-[9.5px] leading-relaxed">
                    vendor_name, gstin, bank_name, account_number (or account_masked), ifsc
                  </p>
                  <div className="mt-2 font-semibold text-[#3e4742]">Vendors · optional</div>
                  <p className="mt-0.5 font-mono text-[9.5px] leading-relaxed">
                    category, address, city, state, pincode, phone, email, terms_days, upi_id,
                    bank_status
                  </p>
                </div>
                <div>
                  <div className="font-semibold text-[#3e4742]">Invoices · required</div>
                  <p className="mt-0.5 font-mono text-[9.5px] leading-relaxed">
                    invoice_number, issue_date, description, rate, vendor_gstin (or vendor_name)
                  </p>
                  <div className="mt-2 font-semibold text-[#3e4742]">Invoices · optional</div>
                  <p className="mt-0.5 font-mono text-[9.5px] leading-relaxed">
                    received_date, due_date, terms_days, po_number, grn_number, gst_type,
                    gst_rate, place_of_supply, hsn, qty, unit, amount_paid, paid_date,
                    payment_mode, payment_reference, stated_total, duplicate_of, notes
                  </p>
                </div>
              </div>
              <p className="mt-2 border-t border-[#eeede8] pt-2 text-[10px] leading-relaxed text-[#8a938d]">
                Dates accept YYYY-MM-DD, DD/MM/YYYY or DD-MMM-YYYY. Money accepts digits, commas,
                ₹ or an Rs. prefix. Use <span className="font-mono">duplicate_of</span> with the
                original invoice number to record a duplicate copy.
              </p>
            </details>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card className="p-4 sm:p-5">
            <SectionHeading
              title="Business profile"
              subtitle="Printed on invoice documents and used for GST and ageing."
            />
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className={cn(labelClass, 'sm:col-span-2')}>
                Business or trade name
                <input
                  className={inputClass}
                  value={profile.name}
                  onChange={(event) => updateProfile('name', event.target.value)}
                  disabled={!canEdit}
                  autoComplete="organization"
                />
              </label>
              <label className={labelClass}>
                GSTIN
                <input
                  className={cn(inputClass, 'font-mono uppercase')}
                  value={profile.gstin}
                  onChange={(event) => updateProfile('gstin', event.target.value.toUpperCase())}
                  disabled={!canEdit}
                  maxLength={15}
                  spellCheck={false}
                />
              </label>
              <label className={labelClass}>
                Financial year
                <input
                  className={inputClass}
                  value={profile.fy}
                  onChange={(event) => updateProfile('fy', event.target.value)}
                  disabled={!canEdit}
                  placeholder="2026-27"
                />
              </label>
              <label className={cn(labelClass, 'sm:col-span-2')}>
                Shop or office address
                <input
                  className={inputClass}
                  value={profile.address}
                  onChange={(event) => updateProfile('address', event.target.value)}
                  disabled={!canEdit}
                  autoComplete="street-address"
                />
              </label>
              <label className={labelClass}>
                City
                <input
                  className={inputClass}
                  value={profile.city}
                  onChange={(event) => updateProfile('city', event.target.value)}
                  disabled={!canEdit}
                  autoComplete="address-level2"
                />
              </label>
              <label className={labelClass}>
                State
                <select
                  className={inputClass}
                  value={profile.state}
                  onChange={(event) => updateProfile('state', event.target.value)}
                  disabled={!canEdit}
                >
                  {INDIAN_STATES.map((item) => (
                    <option key={item.code} value={item.name}>
                      {item.name} ({item.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                PIN code
                <input
                  className={cn(inputClass, 'font-mono')}
                  value={profile.pincode}
                  onChange={(event) => updateProfile('pincode', event.target.value)}
                  disabled={!canEdit}
                  inputMode="numeric"
                  maxLength={6}
                />
              </label>
              <label className={labelClass}>
                Phone
                <input
                  className={inputClass}
                  value={profile.phone}
                  onChange={(event) => updateProfile('phone', event.target.value)}
                  disabled={!canEdit}
                  autoComplete="tel"
                />
              </label>
              <label className={cn(labelClass, 'sm:col-span-2')}>
                Email
                <input
                  className={inputClass}
                  value={profile.email}
                  onChange={(event) => updateProfile('email', event.target.value)}
                  disabled={!canEdit}
                  autoComplete="email"
                />
              </label>
              <label className={cn(labelClass, 'sm:col-span-2')}>
                As-of date and time (IST)
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={profile.asOf}
                  onChange={(event) => updateProfile('asOf', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
            </div>

            <p className="mt-2.5 text-[10px] leading-relaxed text-[#8a938d]">
              Currently showing {formatDateTime(state.business.asOf)} IST. Changing the as-of date
              changes which invoices count as overdue.
            </p>

            {profileErrors.length > 0 ? (
              <div className="mt-2.5 rounded-lg border border-[#efc9c5] bg-[#fdf4f3] p-2.5 text-[10.5px] leading-relaxed text-[#8f2a23]">
                {profileErrors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                size="sm"
                disabled={!canEdit || !profileDirty}
                onClick={saveProfile}
              >
                <Building2 className="h-3.5 w-3.5" />
                {profileDirty ? 'Save profile' : 'Profile saved'}
              </Button>
              {profileDirty ? (
                <button
                  type="button"
                  className="text-[10px] font-medium text-[#66706a] hover:underline"
                  onClick={() => {
                    setProfile(profileFromBusiness(state.business));
                    setProfileErrors([]);
                  }}
                >
                  Discard changes
                </button>
              ) : null}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionHeading
              title="Backup & restore"
              subtitle="JSON is the exact workspace. CSV is for editing master data."
            />
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() =>
                  downloadJson(
                    `ledgerpilot-backup-${dateStamp()}.json`,
                    serializeBackup(state),
                  )
                }
              >
                <FileJson className="h-4 w-4 text-[#1f5c45]" />
                <span className="flex-1 text-left">
                  Download JSON backup
                  <span className="block text-[9.5px] font-normal text-[#8a938d]">
                    Vendors, invoices, payments, audit trail and profile
                  </span>
                </span>
                <Download className="h-3.5 w-3.5 text-[#8a938d]" />
              </Button>

              <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[#d9d7ce] bg-white px-3 py-2 text-[12.5px] font-medium text-[#1c2420] transition-colors hover:border-[#b9b7ac] hover:bg-[#f8f7f3]">
                <Upload className="h-4 w-4 text-[#1f5c45]" />
                <span className="flex-1">
                  Restore a JSON backup
                  <span className="block text-[9.5px] font-normal text-[#8a938d]">
                    {restoreName || 'Replaces the whole workspace after confirmation'}
                  </span>
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  disabled={!canEdit}
                  onChange={(event) => void handleRestore(event)}
                />
                <Download className="h-3.5 w-3.5 rotate-180 text-[#8a938d]" />
              </label>
              {restoreError ? (
                <p className="rounded-md border border-[#efc9c5] bg-[#fdf4f3] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#8f2a23]">
                  {restoreError}
                </p>
              ) : null}
            </div>

            <div className="my-3 border-t border-[#eeede8]" />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadCsv(`ledgerpilot-vendors-${dateStamp()}.csv`, vendorsToCsv(state.vendors))
                }
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Vendors CSV
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadCsv(`ledgerpilot-invoices-${dateStamp()}.csv`, invoicesToCsv(state))
                }
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Invoices CSV
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-[#8a938d]">{WORKSPACE_CSV_NOTE}</p>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionHeading
              title="Demo data"
              subtitle="The seeded story is always restorable."
            />
            <Button
              variant="secondary"
              className="w-full justify-start text-[#8f2a23]"
              disabled={!canEdit}
              onClick={onReset}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="flex-1 text-left">
                Reset to demo data
                <span className="block text-[9.5px] font-normal text-[#8a938d]">
                  12 vendors, 16 invoices, 10 payments and 19 audit events
                </span>
              </span>
            </Button>
            <p className="mt-2 text-[10px] leading-relaxed text-[#8a938d]">
              {mode === 'api'
                ? 'Reset discards imported vendors, invoices, payments and profile changes in the PostgreSQL workspace. Download a backup first if you need to keep them.'
                : 'Reset discards imported vendors, invoices, payments and profile changes in this browser. Download a backup first if you need to keep them.'}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
