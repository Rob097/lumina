import { ProductInputSchema, type ProductInput } from '@lumina/shared';

/**
 * Parse a products CSV (the Products → Import flow) into validated `ProductInput` rows. Pure +
 * fully unit-tested. Recognizes header aliases, honors quoted fields, skips blanks, and returns
 * per-row errors (1-based file line numbers) instead of throwing — the UI surfaces them inline.
 */
export interface CsvParseError {
  line: number;
  message: string;
}
export interface CsvParseResult {
  rows: ProductInput[];
  errors: CsvParseError[];
}

const HEADER_ALIASES: Record<string, 'name' | 'imageUrl' | 'category' | 'externalId'> = {
  name: 'name',
  title: 'name',
  imageurl: 'imageUrl',
  image_url: 'imageUrl',
  image: 'imageUrl',
  img: 'imageUrl',
  category: 'category',
  type: 'category',
  externalid: 'externalId',
  external_id: 'externalId',
  sku: 'externalId',
  id: 'externalId',
};

/** Split one CSV line into fields, honoring double-quoted fields with embedded commas/quotes. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

export function parseProductsCsv(text: string): CsvParseResult {
  const errors: CsvParseError[] = [];
  const rows: ProductInput[] = [];

  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() !== '');
  if (headerIdx === -1) {
    return { rows, errors: [{ line: 1, message: 'The file is empty.' }] };
  }

  const header = splitCsvLine(lines[headerIdx]!).map(
    (h) => HEADER_ALIASES[h.toLowerCase().replace(/\s+/g, '')] ?? null,
  );
  const col = (key: 'name' | 'imageUrl' | 'category' | 'externalId') => header.indexOf(key);

  if (col('name') === -1) {
    return { rows, errors: [{ line: headerIdx + 1, message: 'Missing required column: name.' }] };
  }
  if (col('imageUrl') === -1) {
    return {
      rows,
      errors: [{ line: headerIdx + 1, message: 'Missing required column: imageUrl (or image).' }],
    };
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const lineNo = i + 1;
    const cells = splitCsvLine(raw);

    const at = (key: 'name' | 'imageUrl' | 'category' | 'externalId') => {
      const idx = col(key);
      const v = idx === -1 ? '' : (cells[idx] ?? '');
      return v.trim();
    };

    const candidate: Record<string, unknown> = {
      name: at('name'),
      imageUrl: at('imageUrl'),
    };
    const category = at('category');
    if (category) candidate.category = category.toLowerCase();
    const externalId = at('externalId');
    if (externalId) candidate.externalId = externalId;

    const parsed = ProductInputSchema.safeParse(candidate);
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join('.') || 'row';
      errors.push({ line: lineNo, message: `${field}: ${issue?.message ?? 'invalid'}` });
    }
  }

  return { rows, errors };
}
