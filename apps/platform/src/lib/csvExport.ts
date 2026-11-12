/**
 * CSV export utility — generates a CSV blob from row data and triggers
 * a browser download. Used by list screens' Export buttons.
 */

interface CsvColumn {
  key: string;
  label: string;
}

/**
 * Export rows to a CSV file and trigger download.
 * @param rows - Array of row objects (Record<string, unknown>)
 * @param columns - Column definitions with key + label
 * @param filename - The download filename (without extension)
 */
export function exportToCsv(
  rows: Record<string, unknown>[],
  columns: CsvColumn[],
  filename: string
): void {
  // Build CSV header
  const header = columns.map((c) => escapeCsv(c.label)).join(',');
  // Build CSV rows
  const body = rows.map((row) =>
    columns
      .map((c) => escapeCsv(String(row[c.key] ?? '')))
      .join(',')
  );
  const csv = [header, ...body].join('\n');

  // Create blob and trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Clean up the blob URL
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCsv(value: string): string {
  // If the value contains commas, quotes, or newlines, wrap in quotes and escape quotes.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
