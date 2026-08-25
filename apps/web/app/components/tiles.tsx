import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useAppState, useStore } from "@/state/store"
import type { Piles, StoryId } from "@/state/types"
import { AnimatedCount } from "./animated-count"

/**
 * Pile colours follow the design: primary, foreground, destructive. The
 * ok / warn tokens carry confidence instead, where three states have to be
 * told apart at a glance.
 */
const TILES: {
  key: keyof Piles
  label: string
  tone: string
  blurb: string
  cta: string
  story: StoryId
  beat: string
}[] = [
  {
    key: "ready",
    label: "Ready to apply",
    tone: "text-primary",
    blurb: "Counterparty and type confirmed by the contents. Nothing renamed yet.",
    cta: "Review the",
    story: "B",
    beat: "b1",
  },
  {
    key: "review",
    label: "Needs review",
    tone: "text-foreground",
    blurb: "A name has been proposed, but the evidence doesn't fully hold up.",
    cta: "Review the",
    story: "A",
    beat: "a1",
  },
  {
    key: "unknown",
    label: "Can't identify",
    tone: "text-destructive",
    blurb: "No counterparty in the filename or the contents, left unchanged.",
    cta: "View the",
    story: "A",
    beat: "a1",
  },
]

/**
 * Always on screen. Full height on the dashboard; a single row once the
 * conversation is running, so the numbers stay visible while they move.
 */
export function Tiles({ compact }: { compact?: boolean }) {
  const { result, piles, bumped } = useAppState()
  const { dispatch } = useStore()
  const loaded = !!result

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {TILES.map((tile) => (
        <div
          key={tile.key}
          className={cn(
            "surface",
            compact ? "flex items-center gap-4 px-5 py-3.5" : "p-5"
          )}
        >
          <div className={cn(compact && "min-w-0")}>
            <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {tile.label}
            </p>
            <AnimatedCount
              value={piles[tile.key]}
              bump={bumped.includes(tile.key)}
              className={cn(
                "block font-sans font-semibold",
                tile.tone,
                compact
                  ? "mt-0.5 text-3xl leading-none"
                  : "mt-2 text-[2.75rem] leading-none"
              )}
            />
          </div>

          {!compact && (
            <p className="mt-4 min-h-11 text-[0.9375rem] leading-relaxed text-muted-foreground">
              {tile.blurb}
            </p>
          )}

          <Button
            variant={tile.key === "ready" ? "default" : "outline"}
            size={compact ? "sm" : "lg"}
            disabled={!loaded}
            className={cn(compact ? "ml-auto" : "mt-4 h-11 w-full text-[0.9375rem]")}
            onClick={() =>
              dispatch({ type: "story", id: tile.story, firstBeat: tile.beat })
            }
          >
            {compact
              ? "View All"
              : loaded
                ? `${tile.cta} ${piles[tile.key]}`
                : tile.cta.split(" ")[0]}
          </Button>
        </div>
      ))}
    </div>
  )
}
