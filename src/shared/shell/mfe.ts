/** Registered file-explorer protocol (reveal = parent folder + select item). */
export function mfeRevealUri(filePath: string): string {
  return `mfe://reveal?path=${encodeURIComponent(filePath)}`
}
