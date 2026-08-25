import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { parseCsv } from "./dataset"
import { buildFolderTree, visibleFolders } from "./folders"

const rows = parseCsv(
  readFileSync(
    join(__dirname, "../data/contract repository dataset.csv"),
    "utf8"
  )
)

describe("buildFolderTree", () => {
  it("nests by segment and keeps every file counted once", () => {
    const roots = buildFolderTree(rows.map((r) => r.folder_path))
    expect(roots.map((r) => r.name)).toEqual(["Legal", "Shared"])
    expect(roots.reduce((n, r) => n + r.total, 0)).toBe(rows.length)

    const legal = roots[0]!
    const contracts = legal.children.find((c) => c.name === "Contracts")!
    expect(contracts.path).toBe("/Legal/Contracts")
    // Files filed in the folder itself, versus the whole of its contents.
    expect(contracts.files).toBe(9)
    expect(contracts.total).toBe(
      contracts.files + contracts.children.reduce((n, c) => n + c.total, 0)
    )
  })

  it("sorts siblings by name and ignores empty segments", () => {
    const roots = buildFolderTree(["/b/x", "/a//y", "/a/x"])
    expect(roots.map((r) => r.name)).toEqual(["a", "b"])
    expect(roots[0]!.children.map((c) => c.name)).toEqual(["x", "y"])
    expect(roots[0]!.total).toBe(2)
  })
})

describe("visibleFolders", () => {
  it("lists a closed folder without its children", () => {
    const roots = buildFolderTree(["/a/x", "/a/y", "/b"])
    const open = visibleFolders(roots, () => true).map((n) => n.path)
    expect(open).toEqual(["/a", "/a/x", "/a/y", "/b"])
    const shut = visibleFolders(roots, (n) => n.path !== "/a").map(
      (n) => n.path
    )
    expect(shut).toEqual(["/a", "/b"])
  })
})
