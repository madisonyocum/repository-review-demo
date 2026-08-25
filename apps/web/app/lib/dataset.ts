import Papa from "papaparse"

import type { RawRow } from "./classify"

/** Papaparse over the real file. Header row, no transforms, no guessing. */
export function parseCsv(text: string): RawRow[] {
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
  })
  return result.data.filter((r) => r && r.file_id)
}

export function parseFile(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data.filter((r) => r && r.file_id)),
      error: (err: Error) => reject(err),
    })
  })
}
