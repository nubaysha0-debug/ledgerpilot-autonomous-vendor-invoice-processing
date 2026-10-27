/**
 * Exports the deterministic browser demo seed for the FastAPI reset endpoint.
 * Run: npx tsx scripts/export-demo-seed.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildInitialState } from '../src/ledger/seed';

const output = path.resolve('backend/seed/demo_workspace.json');
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(buildInitialState(), null, 2)}\n`, 'utf8');
console.log(`Wrote ${output}`);
