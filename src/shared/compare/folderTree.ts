import type { CompareRow, FolderTreeNode } from '../schemas/compare'

export type PairTreeLabel = { pairId: string; label: string }

export type FolderTreeRow = Pick<CompareRow, 'pairId' | 'relPath' | 'action'> & {
  fromRelPath?: string
  category?: CompareRow['category']
  left?: { isDir?: boolean }
  right?: { isDir?: boolean }
}

export function parentRel(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(0, idx) : ''
}

export function pathMatchesPrefix(relPath: string, prefix: string): boolean {
  if (!prefix) return true
  const normalized = relPath.replace(/\\/g, '/')
  const folder = prefix.replace(/\\/g, '/')
  return normalized === folder || normalized.startsWith(`${folder}/`)
}

/** True when any path segment equals the folder name (any depth). */
export function pathMatchesFolderName(relPath: string, folderName: string): boolean {
  const name = folderName.replace(/\\/g, '/').split('/').filter(Boolean).pop()
  if (!name) return false
  const key = name.toLowerCase()
  return relPath
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => segment.toLowerCase() === key)
}

export function pairLabelFromLeftPath(leftPath: string): string {
  const trimmed = leftPath.replace(/[\\/]+$/, '')
  const base = trimmed.split(/[\\/]/).filter(Boolean).pop()
  return base || trimmed || 'Pair'
}

export function isMultiPairTree(pairLabels: PairTreeLabel[] | undefined): boolean {
  return Boolean(pairLabels && pairLabels.length > 1)
}

export function pairTreeRootPath(pairId: string): string {
  return `@${pairId}`
}

/** Decode a tree path. Plain paths are pair-relative; `@pairId/...` scopes to one pair. */
export function parsePairTreePath(treePath: string): { pairId?: string; relPath: string } {
  if (!treePath || !treePath.startsWith('@')) {
    return { relPath: treePath }
  }
  const rest = treePath.slice(1)
  const slash = rest.indexOf('/')
  if (slash < 0) {
    return { pairId: rest, relPath: '' }
  }
  return { pairId: rest.slice(0, slash), relPath: rest.slice(slash + 1) }
}

export function rowMatchesTreePath(
  row: Pick<CompareRow, 'pairId' | 'relPath' | 'fromRelPath'>,
  treePath: string,
  multiPair: boolean,
): boolean {
  if (!treePath) return true
  if (!multiPair) {
    return (
      pathMatchesPrefix(row.relPath, treePath) ||
      pathMatchesPrefix(row.fromRelPath ?? '', treePath)
    )
  }
  const { pairId, relPath } = parsePairTreePath(treePath)
  if (pairId && row.pairId !== pairId) return false
  if (!relPath) return true
  return (
    pathMatchesPrefix(row.relPath, relPath) ||
    pathMatchesPrefix(row.fromRelPath ?? '', relPath)
  )
}

export function displayTreePath(treePath: string, pairLabels: PairTreeLabel[]): string {
  const { pairId, relPath } = parsePairTreePath(treePath)
  if (!pairId) return treePath
  const label = pairLabels.find((p) => p.pairId === pairId)?.label ?? pairId
  return relPath ? `${label}/${relPath}` : label
}

function emptyNode(path: string, name: string): FolderTreeNode {
  return {
    path,
    name,
    count: 0,
    creates: 0,
    updates: 0,
    deletes: 0,
    moves: 0,
    children: [],
  }
}

function accountAction(node: FolderTreeNode, action: CompareRow['action']): void {
  node.count++
  if (action === 'Create') node.creates++
  else if (action === 'Update' || action === 'UpdateStreamsOnly') node.updates++
  else if (action === 'Delete') node.deletes++
  else if (action === 'Move' || action === 'Rename') node.moves++
}

function ensureNode(nodes: Map<string, FolderTreeNode>, folderPath: string): FolderTreeNode {
  const existing = nodes.get(folderPath)
  if (existing) return existing

  const parentPath = parentRel(folderPath)
  const parent = ensureNode(nodes, parentPath)
  const name = folderPath.slice(parentPath.length).replace(/^\//, '') || folderPath
  const node = emptyNode(folderPath, name)
  parent.children.push(node)
  nodes.set(folderPath, node)
  return node
}

function folderForRow(row: FolderTreeRow): string {
  const rel = row.relPath.replace(/\\/g, '/')
  if (row.left?.isDir || row.right?.isDir) return rel
  return parentRel(rel)
}

function ancestorPaths(folderPath: string): string[] {
  const out: string[] = []
  let current = folderPath
  for (;;) {
    out.push(current)
    if (current === '') break
    current = parentRel(current)
  }
  return out
}

function folderForFrom(row: FolderTreeRow): string {
  const from = (row.fromRelPath ?? '').replace(/\\/g, '/')
  if (!from) return ''
  if (row.left?.isDir || row.right?.isDir) return from
  return parentRel(from)
}

function pruneEmptyChildren(node: FolderTreeNode): void {
  node.children = node.children.filter((child) => {
    pruneEmptyChildren(child)
    return child.count > 0
  })
}

function sortNode(node: FolderTreeNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  for (const child of node.children) sortNode(child)
}

function prefixNodePaths(node: FolderTreeNode, prefix: string): FolderTreeNode {
  const path = node.path ? `${prefix}/${node.path}` : prefix
  return {
    ...node,
    path,
    children: node.children.map((child) => prefixNodePaths(child, prefix)),
  }
}

function rollupCounts(target: FolderTreeNode, source: FolderTreeNode): void {
  target.count += source.count
  target.creates += source.creates
  target.updates += source.updates
  target.deletes += source.deletes
  target.moves += source.moves
}

function addTreeRow(nodes: Map<string, FolderTreeNode>, row: FolderTreeRow): void {
  if (row.action === 'Skip' && row.category === 'equal') return
  const folders = new Set(ancestorPaths(folderForRow(row)))
  if (row.fromRelPath) {
    for (const p of ancestorPaths(folderForFrom(row))) folders.add(p)
  }
  for (const folder of folders) {
    const node = ensureNode(nodes, folder)
    accountAction(node, row.action)
  }
}

function finishInner(root: FolderTreeNode): FolderTreeNode {
  pruneEmptyChildren(root)
  sortNode(root)
  return root
}

export function createFolderTreeBuilder(pairLabels?: PairTreeLabel[]): {
  add: (row: FolderTreeRow) => void
  finish: () => FolderTreeNode
} {
  if (!isMultiPairTree(pairLabels)) {
    const root = emptyNode('', '')
    const nodes = new Map<string, FolderTreeNode>([['', root]])
    return {
      add: (row) => addTreeRow(nodes, row),
      finish: () => finishInner(root),
    }
  }

  const byPair = new Map<string, { root: FolderTreeNode; nodes: Map<string, FolderTreeNode> }>()
  function accFor(pairId: string): { root: FolderTreeNode; nodes: Map<string, FolderTreeNode> } {
    let acc = byPair.get(pairId)
    if (!acc) {
      const root = emptyNode('', '')
      acc = { root, nodes: new Map([['', root]]) }
      byPair.set(pairId, acc)
    }
    return acc
  }

  return {
    add: (row) => addTreeRow(accFor(row.pairId).nodes, row),
    finish: () => {
      const globalRoot = emptyNode('', '')
      for (const { pairId, label } of pairLabels!) {
        const acc = byPair.get(pairId)
        if (!acc || acc.root.count === 0) continue
        const inner = finishInner(acc.root)
        const pairRootPath = pairTreeRootPath(pairId)
        const pairNode: FolderTreeNode = {
          path: pairRootPath,
          name: label,
          count: inner.count,
          creates: inner.creates,
          updates: inner.updates,
          deletes: inner.deletes,
          moves: inner.moves,
          children: inner.children.map((child) => prefixNodePaths(child, pairRootPath)),
        }
        globalRoot.children.push(pairNode)
        rollupCounts(globalRoot, pairNode)
      }
      pruneEmptyChildren(globalRoot)
      globalRoot.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      return globalRoot
    },
  }
}

export type PairDiskRoots = { id: string; left: string; right: string }

/** Windows-first join of a pair root and a compare-relative path. */
export function joinRootRel(root: string, relPath: string): string {
  const base = root.replace(/[\\/]+$/, '')
  const rel = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!rel) return base
  return `${base}\\${rel.replace(/\//g, '\\')}`
}

/** Absolute source/target paths for a results-tree node. Null when the node is “All folders” with more than one pair. */
export function resolveCompareDiskPaths(
  treePath: string,
  pairs: PairDiskRoots[],
): { left: string; right: string } | null {
  if (pairs.length === 0) return null
  const parsed = parsePairTreePath(treePath)
  const pair = parsed.pairId
    ? pairs.find((item) => item.id === parsed.pairId)
    : pairs.length === 1
      ? pairs[0]
      : undefined
  if (!pair) return null
  return {
    left: joinRootRel(pair.left, parsed.relPath),
    right: joinRootRel(pair.right, parsed.relPath),
  }
}

/** Build a FreeFileSync-style folder tree from compare diff rows. Streams; does not copy the list. */
export function buildFolderTree(
  rows: Iterable<FolderTreeRow>,
  pairLabels?: PairTreeLabel[],
): FolderTreeNode {
  const builder = createFolderTreeBuilder(pairLabels)
  for (const row of rows) builder.add(row)
  return builder.finish()
}
