import { useEffect, useState, type FormEvent } from "react"
import { ArrowUp } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Free text, always present at the foot of the main column. It always advances
 * the current beat — the demo cannot break on unexpected input, so whatever
 * gets typed, the story moves on.
 */
export function Composer({
  onSay,
  suggestion,
  disabled,
}: {
  onSay: (text: string) => void
  /** The scripted line for this turn, dropped in ready to send. */
  suggestion?: string
  disabled?: boolean
}) {
  const [text, setText] = useState("")

  // Each turn arrives with its line already typed. Editable, and clearing it
  // and writing something else works exactly the same.
  useEffect(() => {
    setText(suggestion ?? "")
  }, [suggestion])

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value || disabled) return
    setText("")
    onSay(value)
  }

  return (
    <div className="bg-background pt-4 pb-5">
      <form
        onSubmit={submit}
        className={cn(
          "surface flex items-end gap-3 px-5 py-4 transition-shadow",
          "focus-within:border-ring/40 focus-within:ring-[3px] focus-within:ring-ring/20",
          disabled && "opacity-60"
        )}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e)
          }}
          rows={2}
          disabled={disabled}
          placeholder={
            disabled
              ? "Load a repository to start"
              : "Ask, approve, or escalate anything…"
          }
          className="min-h-14 flex-1 resize-none bg-transparent text-[0.9375rem] leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0 rounded-full"
          disabled={disabled || !text.trim()}
          aria-label="Send"
        >
          <ArrowUp />
        </Button>
      </form>
    </div>
  )
}
