// ============================================================================
// Follow Builders — Issue archive
// ============================================================================
// One JSON file per day in ~/.follow-builders/archive/YYYY-MM-DD.json.
// Lives in the user dir (not the Desktop) because launchd jobs can't write to
// TCC-protected folders like ~/Desktop.
// ============================================================================

import { readFile, writeFile, readdir, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export const USER_DIR = join(homedir(), '.follow-builders');
export const ARCHIVE_DIR = join(USER_DIR, 'archive');
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function localDate(date = new Date(), timeZone = 'Asia/Shanghai') {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

export async function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, path);
}

export async function writeIssue(issue) {
  await mkdir(ARCHIVE_DIR, { recursive: true });
  await writeJsonAtomic(join(ARCHIVE_DIR, `${issue.date}.json`), issue);
}

export async function listIssueDates() {
  try {
    const files = await readdir(ARCHIVE_DIR);
    return files
      .map((file) => file.replace(/\.json$/, ''))
      .filter((name) => DATE_PATTERN.test(name))
      .sort();
  } catch {
    return [];
  }
}

export async function readIssue(date) {
  if (!DATE_PATTERN.test(date)) return null;
  try {
    return JSON.parse(await readFile(join(ARCHIVE_DIR, `${date}.json`), 'utf-8'));
  } catch {
    return null;
  }
}
