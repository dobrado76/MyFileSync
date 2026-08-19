type CompareInspectMenuProps = {
  sourcePath?: string
  targetPath?: string
  onOpen: (path: string) => void
  onReveal: (path: string) => void
}

export function CompareInspectMenu({
  sourcePath,
  targetPath,
  onOpen,
  onReveal,
}: CompareInspectMenuProps) {
  if (!sourcePath && !targetPath) return null
  return (
    <>
      <button
        type="button"
        role="menuitem"
        disabled={!sourcePath}
        title={sourcePath || 'This item is not on the source'}
        onClick={() => sourcePath && onOpen(sourcePath)}
      >
        Open source
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!sourcePath}
        title={sourcePath || 'This item is not on the source'}
        onClick={() => sourcePath && onReveal(sourcePath)}
      >
        Reveal source
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!targetPath}
        title={targetPath || 'This item is not on the target'}
        onClick={() => targetPath && onOpen(targetPath)}
      >
        Open target
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!targetPath}
        title={targetPath || 'This item is not on the target'}
        onClick={() => targetPath && onReveal(targetPath)}
      >
        Reveal target
      </button>
    </>
  )
}
