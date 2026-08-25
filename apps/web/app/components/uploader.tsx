import { useRef, useState } from "react"
import { FileText } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import sampleCsv from "../data/contract repository dataset.csv?raw"
import { parseCsv, parseFile } from "@/lib/dataset"
import { useStore } from "@/state/store"
import { Sparkle } from "./icons"

const SAMPLE_LABEL = "Ashworth Textiles - Repository Clean-up"
/** Parsed once, at module scope — the sample's size is read, not asserted. */
const SAMPLE_ROWS = parseCsv(sampleCsv)

/**
 * The whole card is the drop target, so there is no nested dashed box and no
 * divider — just the ask and the two ways to answer it, on one row.
 */
export function Uploader() {
  const { dispatch } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(file: File) {
    setError(null)
    try {
      const rows = await parseFile(file)
      if (!rows.length) {
        setError("No rows with a file_id in that file. Is it the right export?")
        return
      }
      dispatch({ type: "load", rows, source: file.name.replace(/\.csv$/i, "") })
    } catch {
      setError("Couldn't read that file as CSV.")
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file) void load(file)
      }}
      className={cn(
        "surface p-5 transition-colors",
        over && "border-ring/50 bg-secondary"
      )}
    >
      <h1 className="text-base font-semibold">Point me at a repository</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        A CSV export of the folder - file name, path, type, size, date
        modified, contents. Nothing leaves this browser.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button
          onClick={() =>
            dispatch({
              type: "load",
              rows: SAMPLE_ROWS,
              source: SAMPLE_LABEL,
            })
          }
        >
          <Sparkle data-icon="inline-start" className="size-4" />
          Use the sample repository
        </Button>
        <Button variant="outline" onClick={() => input.current?.click()}>
          <FileText data-icon="inline-start" /> Choose a file
        </Button>
        <p className="text-xs text-muted-foreground">
          or drop a CSV here &middot; the bundled sample is{" "}
          {SAMPLE_ROWS.length} files
        </p>
      </div>

      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void load(file)
        }}
      />

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
