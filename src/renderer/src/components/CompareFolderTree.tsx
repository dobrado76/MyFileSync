import { useEffect, useState, type MouseEvent } from 'react'
import type { FolderTreeNode } from '@shared/schemas/compare'

export type TreeFolderAction = 'excludePath' | 'excludeName' | 'excludeTemp' | 'sync'

type CompareFolderTreeProps = {
  root: FolderTreeNode | null
  selectedPath: string
  rootLabel: string
  busy: boolean
  onSelect: (path: string) => void
  onFolderAction: (action: TreeFolderAction, path: string, deletes: number) => void
}

type MenuState = {
  x: number
  y: number
  path: string
  name: string
  deletes: number
  count: number
}

function TreeBranch({
  node,
  selectedPath,
  expanded,
  onToggle,
  onSelect,
  onMenu,
}: {
  node: FolderTreeNode
  selectedPath: string
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onMenu: (event: MouseEvent, node: FolderTreeNode) => void
}) {
  const hasChildren = node.children.length > 0
  const open = expanded.has(node.path)
  const selected = selectedPath === node.path
  const label = node.path === '' ? node.name || 'All folders' : node.name

  return (
    <div className="compare-tree-branch">
      <button
        type="button"
        className={`compare-tree-node ${selected ? 'compare-tree-node-selected' : ''}`}
        onClick={() => onSelect(node.path)}
        onContextMenu={(event) => onMenu(event, node)}
        title={node.path || 'All folders'}
      >
        {hasChildren ? (
          <span
            className="compare-tree-twist"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.path)
            }}
          >
            {open ? '▾' : '▸'}
          </span>
        ) : (
          <span className="compare-tree-twist compare-tree-twist-leaf" />
        )}
        <span className="compare-tree-label">{label}</span>
        {node.count > 0 ? <span className="compare-tree-count">{node.count}</span> : null}
      </button>
      {hasChildren && open
        ? node.children.map((child) => (
            <TreeBranch
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onMenu={onMenu}
            />
          ))
        : null}
    </div>
  )
}

export function CompareFolderTree({
  root,
  selectedPath,
  rootLabel,
  busy,
  onSelect,
  onFolderAction,
}: CompareFolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    setExpanded(new Set(['']))
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
      <TreeBranch
        node={displayRoot}
        selectedPath={selectedPath}
        expanded={expanded}
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
          const maxY = Math.max(8, window.innerHeight - 220)
          setMenu({
            x: Math.min(event.clientX, maxX),
            y: Math.min(event.clientY, maxY),
            path: node.path,
            name: node.path === '' ? rootLabel || 'All folders' : node.name,
            deletes: node.deletes,
            count: node.count,
          })
        }}
      />
      {menu ? (
        <div
          className="tree-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
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
