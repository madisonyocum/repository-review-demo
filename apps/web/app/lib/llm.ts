/**
 * The one place the product does live inference.
 *
 * The user types their naming convention as a sentence; Claude turns it into
 * the `Convention` object the rest of the app renders names from. Everything
 * else in this demo is deterministic on purpose — the counts, the piles, the
 * manifest — and none of it depends on this call succeeding.
 *
 * No key configured, or the call fails: `parseConvention` falls back to
 * `parseConventionLocally` and the UI says which reader answered. The demo
 * runs identically offline; the difference is how much slack the sentence is
 * allowed to have.
 */
import type Anthropic from "@anthropic-ai/sdk"

import {
  DEFAULT_CONVENTION,
  parseConventionLocally,
  type Convention,
  type ConventionParse,
} from "./convention"

/**
 * Vite inlines this at build time. A browser-side key is fine for a local
 * demo and wrong for a deployment — in production the same call belongs
 * behind a route that holds the key server-side. The public build ships
 * without one, which is why the local reader is not a token gesture.
 */
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined

export const MODEL = "claude-opus-5"

export function hasApiKey(): boolean {
  return Boolean(API_KEY)
}

const SYSTEM = `You turn a person's description of a file naming convention into a strict JSON structure.

You are working on a contract repository clean-up. Files get renamed from what is actually known about them: the counterparty, the document type, the date modified, and a version number when there is one.

Rules:
- Only report what the person actually asked for. If they say nothing about folders, keep the current folder setting.
- "tokens" is the order the parts appear in the new filename.
- Use "original" only if they explicitly want the existing filename kept as part of the new one.
- notes: one short line per thing you changed, in their words, no more than five. Do not explain what you did not change.`

const TOOL: Anthropic.Tool = {
  name: "set_convention",
  description:
    "Record the naming convention the person described, as the file-renaming settings it implies.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      tokens: {
        type: "array",
        items: {
          type: "string",
          enum: ["counterparty", "type", "date", "version", "original"],
        },
        description: "Parts of the new filename, in order.",
      },
      separator: {
        type: "string",
        enum: ["_", "-", " ", ""],
        description: 'What joins the parts. "" means run them together.',
      },
      dateFormat: {
        type: "string",
        enum: ["iso", "compact", "year"],
        description: "iso = 2024-03-11, compact = 20240311, year = 2024.",
      },
      caseStyle: {
        type: "string",
        enum: ["pascal", "lower", "keep"],
        description:
          "pascal = PinnacleInsurance, lower = pinnacleinsurance, keep = Pinnacle Insurance.",
      },
      folders: {
        type: "string",
        enum: ["by-type", "by-counterparty", "keep"],
        description:
          "Where files are filed. keep = leave every file where it is.",
      },
      archive: {
        type: "string",
        description:
          'Folder a superseded copy moves to, with a leading slash, e.g. "/Archive".',
      },
      notes: {
        type: "array",
        items: { type: "string" },
        description: "Short lines naming what you understood.",
      },
    },
    required: [
      "tokens",
      "separator",
      "dateFormat",
      "caseStyle",
      "folders",
      "archive",
      "notes",
    ],
    additionalProperties: false,
  },
}

async function client(): Promise<Anthropic> {
  // Loaded on demand: without a key the SDK never enters the bundle.
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  return new Anthropic({ apiKey: API_KEY, dangerouslyAllowBrowser: true })
}

export async function parseConventionWithClaude(
  text: string,
  current: Convention = DEFAULT_CONVENTION
): Promise<ConventionParse> {
  const anthropic = await client()

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "low" },
    tools: [TOOL],
    tool_choice: { type: "tool", name: "set_convention" },
    messages: [
      {
        role: "user",
        content: `Current settings: ${JSON.stringify(current)}\n\nWhat they said: ${text}`,
      },
    ],
  })

  const call = response.content.find((block) => block.type === "tool_use")
  if (!call) throw new Error("No convention came back from the model.")

  // Tool input is JSON the model wrote — validate it against what this app
  // can actually render rather than trusting the shape.
  const raw = call.input as Partial<Convention> & { notes?: unknown }
  const convention: Convention = {
    ...current,
    ...pick(raw, current),
  }
  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((n): n is string => typeof n === "string").slice(0, 5)
    : []

  return { convention, via: "claude", notes }
}

const TOKENS = ["counterparty", "type", "date", "version", "original"]
const SEPARATORS = ["_", "-", " ", ""]
const DATE_FORMATS = ["iso", "compact", "year"]
const CASE_STYLES = ["pascal", "lower", "keep"]
const FOLDERS = ["by-type", "by-counterparty", "keep"]

/** Keep only fields with values this app knows how to render. */
function pick(
  raw: Partial<Convention>,
  current: Convention
): Partial<Convention> {
  const out: Partial<Convention> = {}
  const tokens = Array.isArray(raw.tokens)
    ? raw.tokens.filter((t) => TOKENS.includes(t as string))
    : []
  if (tokens.length) out.tokens = tokens as Convention["tokens"]
  if (SEPARATORS.includes(raw.separator as string))
    out.separator = raw.separator
  if (DATE_FORMATS.includes(raw.dateFormat as string))
    out.dateFormat = raw.dateFormat
  if (CASE_STYLES.includes(raw.caseStyle as string))
    out.caseStyle = raw.caseStyle
  if (FOLDERS.includes(raw.folders as string)) out.folders = raw.folders
  if (typeof raw.archive === "string" && /^\/?[\w -]{1,40}$/.test(raw.archive))
    out.archive = raw.archive.startsWith("/") ? raw.archive : `/${raw.archive}`
  else out.archive = current.archive
  return out
}

/**
 * Read a typed convention, however it can be read. The caller doesn't need to
 * know which path ran — the result says so, and the UI shows it.
 */
export async function parseConvention(
  text: string,
  current: Convention = DEFAULT_CONVENTION
): Promise<ConventionParse> {
  if (!hasApiKey()) return parseConventionLocally(text, current)
  try {
    return await parseConventionWithClaude(text, current)
  } catch (error) {
    const local = parseConventionLocally(text, current)
    console.warn("[llm] falling back to the local reader", error)
    return {
      ...local,
      notes: [...local.notes, "Claude couldn't be reached, so I read it here."],
    }
  }
}
