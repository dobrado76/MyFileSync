import type { CompareRow, FolderTreeNode, SyncActionType } from '../schemas/compare'

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

function accountAction(node: FolderTreeNode, action: SyncActionType): void {
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

function folderForRow(row: Pick<CompareRow, 'relPath' | 'left' | 'right'>): string {
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

function folderForFrom(row: Pick<CompareRow, 'fromRelPath' | 'left' | 'right'>): string {
  const from = (row.fromRelPath ?? '').replace(/\\/g, '/')
  if (!from) return ''
  if (row.left?.isDir || row.right?.isDir) return from
  return parentRel(from)
}

/** Build a FreeFileSync-style folder tree from compare diff rows. */
export function buildFolderTree(rows: CompareRow[]): FolderTreeNode {
  const root = emptyNode('', '')
  const nodes = new Map<string, FolderTreeNode>([['', root]])

  for (const row of rows) {
    if (row.action === 'Skip' && row.category === 'equal') continue
    const folders = new Set(ancestorPaths(folderForRow(row)))
    if (row.fromRelPath) {
      for (const p of ancestorPaths(folderForFrom(row))) folders.add(p)
    }
    for (const folder of folders) {
      const node = ensureNode(nodes, folder)
      accountAction(node, row.action)
    }
  }

  function sortNode(node: FolderTreeNode): void {
    node.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    for (const child of node.children) sortNode(child)
  }
  sortNode(root)
  return root
}
