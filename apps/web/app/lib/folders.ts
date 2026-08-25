/**
 * The repository's folders, as a tree.
 *
 * Derived from the loaded files and nothing else — a folder exists here
 * because at least one file is filed in it or under it. `files` is what is
 * filed directly in a folder; `total` is that folder's whole contents,
 * subfolders included, which is the number a collapsed row has to show.
 */

export interface FolderNode {
  /** Full path, e.g. "/Legal/Contracts". Unique, so it keys the open state. */
  path: string
  /** The last segment — what the row is labelled with. */
  name: string
  depth: number
  files: number
  total: number
  children: FolderNode[]
}

export function buildFolderTree(paths: string[]): FolderNode[] {
  const roots: FolderNode[] = []
  const byPath = new Map<string, FolderNode>()

  for (const raw of paths) {
    const segments = raw.split("/").filter(Boolean)
    if (!segments.length) continue

    let prefix = ""
    let siblings = roots
    let node: FolderNode | undefined

    segments.forEach((name, depth) => {
      prefix += `/${name}`
      node = byPath.get(prefix)
      if (!node) {
        node = { path: prefix, name, depth, files: 0, total: 0, children: [] }
        byPath.set(prefix, node)
        siblings.push(node)
      }
      siblings = node.children
    })

    // The file itself is filed in the last segment, not in its parents.
    if (node) node.files += 1
  }

  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of nodes) sort(child.children)
  }
  sort(roots)

  const total = (node: FolderNode): number => {
    node.total = node.files + node.children.reduce((n, c) => n + total(c), 0)
    return node.total
  }
  for (const root of roots) total(root)

  return roots
}

/** Flattened for rendering: parents first, and only what is open is listed. */
export function visibleFolders(
  roots: FolderNode[],
  isOpen: (node: FolderNode) => boolean
): FolderNode[] {
  const out: FolderNode[] = []
  const walk = (nodes: FolderNode[]) => {
    for (const node of nodes) {
      out.push(node)
      if (node.children.length && isOpen(node)) walk(node.children)
    }
  }
  walk(roots)
  return out
}
