import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"

const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean)

const forbiddenEnv = tracked.filter(
  (file) =>
    (file === ".env" || file.startsWith(".env.")) && file !== ".env.example",
)

if (forbiddenEnv.length > 0) {
  throw new Error(`Tracked environment files are forbidden: ${forbiddenEnv.join(", ")}`)
}

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk_live_[A-Za-z0-9]+\b/,
  /\bpk_live_[A-Za-z0-9]+\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
]

const findings = []

for (const file of tracked) {
  if (statSync(file).size > 1024 * 1024) continue

  let text
  try {
    text = readFileSync(file, "utf8")
  } catch {
    continue
  }

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      findings.push(`${file}: ${pattern}`)
    }
  }
}

if (findings.length > 0) {
  throw new Error(`Potential committed secrets found:\n${findings.join("\n")}`)
}

console.log(`Secret scan PASS (${tracked.length} tracked files checked).`)
