import { useEffect, useState, type MouseEvent } from 'react'
import type { FolderTreeNode } from '@shared/schemas/compare'
import { resolveCompareDiskPaths, type PairDiskRoots } from '@shared/compare/folderTree'
import { CompareInspectMenu } from './CompareInspectMenu'

export type TreeFolderAction = 'excludePath' | 'excludeName' | 'excludeTemp' | 'sync'

type CompareFolderTreeProps = {
  root: FolderTreeNode | null
  selectedPath: string
  rootLabel: string
  pairSourcePaths?: Record<string, string>
  pairRoots?: PairDiskRoots[]
  busy: boolean
  onSelect: (path: string) => void
  onFolderAction: (action: TreeFolderAction, path: string, deletes: number) => void
  onOpenPath: (path: string) => void
  onRevealPath: (path: string) => void
}

type MenuState = {
  x: number
  y: number
  path: string
  name: string
  deletes: number
  count: number
  leftPath?: string
  rightPath?: string
}

function treeNodeTitle(node: FolderTreeNode, rootLabel: string, pairSourcePaths?: Record<string, string>): string {
  if (node.path === '') return rootLabel || 'All folders'
  if (node.path.startsWith('@')) {
    const pairId = node.path.slice(1).split('/')[0]
    return (pairId && pairSourcePaths?.[pairId]) || node.path
  }
  return node.path
}

function FolderIcon() {
  return (
    <svg className="compare-tree-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path fill="#e6b325" d="M1.5 3.5h5l1.2 1.5H14.5v1H1.5z" />
      <path fill="#f0c94a" d="M1.5 6h13v7.5h-13z" />
      <path fill="none" stroke="#c49214" strokeWidth="0.75" d="M1.5 3.5h5l1.2 1.5H14.5v8.5h-13z" />
    </svg>
  )
}

function TreeBranch({
  node,
  selectedPath,
  expanded,
  onToggle,
  onSelect,
  onMenu,
  rootLabel,
  pairSourcePaths,
  isRoot,
}: {
  node: FolderTreeNode
  selectedPath: string
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onMenu: (event: MouseEvent, node: FolderTreeNode) => void
  rootLabel: string
  pairSourcePaths?: Record<string, string>
  isRoot?: boolean
}) {
  const hasChildren = node.children.length > 0
  const open = expanded.has(node.path)
  const selected = selectedPath === node.path
  const label = node.path === '' ? node.name || 'All folders' : node.name

  return (
    <li className={`compare-tree-item${isRoot ? ' compare-tree-item-root' : ''}`}>
      <button
        type="button"
        className={`compare-tree-node ${selected ? 'compare-tree-node-selected' : ''}`}
        onClick={() => onSelect(node.path)}
        onContextMenu={(event) => onMenu(event, node)}
        title={treeNodeTitle(node, rootLabel, pairSourcePaths)}
      >
        {hasChildren ? (
          <span
            className="compare-tree-twist"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.path)
            }}
            aria-expanded={open}
          >
            {open ? '−' : '+'}
          </span>
        ) : (
          <span className="compare-tree-twist compare-tree-twist-leaf" />
        )}
        <FolderIcon />
        <span className="compare-tree-label">{label}</span>
        {node.count > 0 ? <span className="compare-tree-count">{node.count}</span> : null}
      </button>
      {hasChildren && open ? (
        <ul className="compare-tree-list">
          {node.children.map((child) => (
            <TreeBranch
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onMenu={onMenu}
              rootLabel={rootLabel}
              pairSourcePaths={pairSourcePaths}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function CompareFolderTree({
  root,
  selectedPath,
  rootLabel,
  pairSourcePaths,
  pairRoots,
  busy,
  onSelect,
  onFolderAction,
  onOpenPath,
  onRevealPath,
}: CompareFolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    if (!root) return
    const next = new Set<string>([''])
    for (const child of root.children) {
      if (child.path.startsWith('@')) next.add(child.path)
    }
    setExpanded(next)
  }, [root])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!root) {
    return (
      <nav className="compare-tree" aria-label="Folders">
        <p className="compare-tree-empty">Folders appear after Compare.</p>
      </nav>
    )
  }

  const displayRoot: FolderTreeNode = { ...root, name: rootLabel || 'All folders' }
  const isRoot = menu?.path === ''

  return (
    <nav className="compare-tree" aria-label="Folders">
      <ul className="compare-tree-list compare-tree-list-root">
        <TreeBranch
          node={displayRoot}
          selectedPath={selectedPath}
          expanded={expanded}
          isRoot
          onToggle={(path) => {
            setExpanded((prev) => {
              const next = new Set(prev)
              if (next.has(path)) next.delete(path)
              else next.add(path)
              return next
            })
          }}
          onSelect={onSelect}
          onMenu={(event, node) => {
            event.preventDefault()
            event.stopPropagation()
            onSelect(node.path)
            const maxX = Math.max(8, window.innerWidth - 280)
            const maxY = Math.max(8, window.innerHeight - 360)
            const disk = resolveCompareDiskPaths(node.path, pairRoots ?? [])
            setMenu({
              x: Math.min(event.clientX, maxX),
              y: Math.min(event.clientY, maxY),
              path: node.path,
              name: node.path === '' ? rootLabel || 'All folders' : node.name,
              deletes: node.deletes,
              count: node.count,
              leftPath: disk?.left,
              rightPath: disk?.right,
            })
          }}
          rootLabel={rootLabel}
          pairSourcePaths={pairSourcePaths}
        />
      </ul>
      {menu ? (
        <div
          className="tree-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <CompareInspectMenu
            sourcePath={menu.leftPath}
            targetPath={menu.rightPath}
            onOpen={(path) => {
              setMenu(null)
              onOpenPath(path)
            }}
            onReveal={(path) => {
              setMenu(null)
              onRevealPath(path)
            }}
          />
          {menu.leftPath || menu.rightPath ? <div className="tree-context-sep" /> : null}
          {!isRoot ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMenu(null)
                  onFolderAction('excludePath', menu.path, menu.deletes)
                }}
              >
                Exclude this folder permanently
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMenu(null)
                  onFolderAction('excludeName', menu.path, menu.deletes)
                }}
              >
                {`Exclude folders named “${menu.name}” permanently`}
              </button>
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenu(null)
              onFolderAction('excludeTemp', menu.path, menu.deletes)
            }}
          >
            {isRoot ? 'Exclude all from this compare' : 'Exclude this folder from this compare'}
          </button>
          <div className="tree-context-sep" />
          <button
            type="button"
            role="menuitem"
            disabled={busy || menu.count === 0}
            onClick={() => {
              setMenu(null)
              onFolderAction('sync', menu.path, menu.deletes)
            }}
          >
            {isRoot ? 'Sync now' : 'Sync this folder now'}
          </button>
        </div>
      ) : null}
    </nav>
  )
}
