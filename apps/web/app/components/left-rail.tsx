import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { buildFolderTree, visibleFolders } from "@/lib/folders"
import { useAppState, useStore } from "@/state/store"
import type { Piles } from "@/state/types"
import { AnimatedCount } from "./animated-count"

const GROUPS: {
  key: keyof Piles
  label: string
  icon: LucideIcon
  iconTone: string
  countTone: string
}[] = [
  {
    key: "ready",
    label: "Ready to apply",
    icon: Check,
    iconTone: "text-primary",
    countTone: "text-primary",
  },
  {
    key: "review",
    label: "Needs review",
    icon: AlertTriangle,
    iconTone: "text-muted-foreground",
    countTone: "text-foreground",
  },
  {
    key: "unknown",
    label: "Can't identify",
    icon: Ban,
    iconTone: "text-destructive",
    countTone: "text-destructive",
  },
]

/** Always present. Zeroed until a repository is loaded. */
export function LeftRail() {
  const { piles, bumped, result } = useAppState()
  const { dispatch } = useStore()

  return (
    <aside className="w-[14rem] shrink-0 overflow-y-auto py-6 pr-2 pl-4">
      <nav className="space-y-1.5">
        {/* Overview goes back to the dashboard. The other two aren't wired to
            anything, so they don't pretend to be: no pointer, no hover. */}
        <button
          type="button"
          onClick={() => dispatch({ type: "view", view: "dashboard" })}
          disabled={!result}
          className="flex h-10 w-full cursor-pointer items-center rounded-[0.625rem] bg-primary/8 px-3.5 text-left text-[0.9375rem] font-medium text-primary transition-colors hover:bg-primary/12 disabled:cursor-default disabled:hover:bg-primary/8"
        >
          Overview
        </button>
        {["All documents", "Activity"].map((item) => (
          <span
            key={item}
            className="flex h-10 items-center rounded-[0.625rem] px-3.5 text-[0.9375rem] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </nav>

      <p className="mt-9 px-3.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Review groups
      </p>

      <ul className="mt-3">
        {GROUPS.map(({ key, label, icon: Icon, iconTone, countTone }) => (
          <li
            key={key}
            className="flex h-10 items-center gap-2.5 rounded-[0.625rem] pr-2 pl-3.5 text-[0.9375rem]"
          >
            <Icon className={cn("size-[1.05rem] shrink-0", iconTone)} />
            <span className="truncate text-foreground">{label}</span>
            <AnimatedCount
              value={piles[key]}
              bump={bumped.includes(key)}
              className={cn("ml-auto text-sm font-medium", countTone)}
            />
          </li>
        ))}
      </ul>

      <FolderTree />
    </aside>
  )
}

/**
 * The repository as it is filed today — every folder the loaded files sit in,
 * with how many are in each. Everything starts closed; a folder with
 * something under it opens on click, and nothing else is wired, so nothing
 * else takes a pointer.
 */
function FolderTree() {
  const { result } = useAppState()
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const roots = useMemo(
    () => buildFolderTree((result?.docs ?? []).map((d) => d.folderPath)),
    [result]
  )
  const rows = visibleFolders(roots, (n) => !!open[n.path])

  return (
    <>
      <p className="mt-9 px-3.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Folders
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 flex h-8 items-center gap-1.5 pl-3.5 text-sm text-muted-foreground">
          <Folder className="size-4 shrink-0" />
          No folders yet
        </p>
      ) : (
        <ul className="mt-3">
          {rows.map((node) => (
            <li
              key={node.path}
              className="flex h-8 items-center gap-1.5 pr-2 text-sm"
              style={{ paddingLeft: `${0.875 + node.depth * 0.75}rem` }}
            >
              {node.children.length ? (
                <button
                  type="button"
                  aria-expanded={!!open[node.path]}
                  onClick={() =>
                    setOpen((o) => ({ ...o, [node.path]: !o[node.path] }))
                  }
                  className="flex min-w-0 cursor-pointer items-center gap-1 text-left"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground transition-transform",
                      open[node.path] && "rotate-90"
                    )}
                  />
                  {open[node.path] ? (
                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{node.name}</span>
                </button>
              ) : (
                // Lines up with the label above it, where the chevron isn't.
                <span className="flex min-w-0 items-center gap-1 pl-[1.125rem]">
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{node.name}</span>
                </span>
              )}
              <span className="ml-auto pl-2 numeric text-xs text-muted-foreground">
                {node.total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
