export function parseCommand(text) {
  if (!text.startsWith("/")) return null

  const parts = text.slice(1).split(" ")
  const command = parts[0]
  const args = parts.slice(1)

  return { command, args }
}
