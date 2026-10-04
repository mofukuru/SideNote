// Prototype (not wired into the plugin yet, see ROADMAP.md): per-note Markdown sidecar as the source of truth for SideNote comments.
//
// Block layout written by the plugin:
//
//   ## <quoted text>                       <- display only, regenerated on save
//   <!-- sidenote {"id":"...","color":"red",...} -->   <- machine data (one-line JSON)
//   <free Markdown body, editable by humans/AI>
//
//   ---
//
// Tolerance rules (never silently drop user text):
//   1. A block starts at a "## " line followed (blank lines allowed) by a sidenote marker.
//   2. A "## " line WITHOUT a marker starts a NEW comment only when it comes right after
//      a "---" line (or is the first block). Otherwise it is part of the previous body,
//      so headings written inside a comment body survive.
//   3. Legacy marker "<!-- side-note:ID -->" is accepted (id only).
//   4. Broken JSON in a marker: recover the id with a regex and report a warning.
//   5. Unknown JSON fields are kept as-is (forward compatibility).
//   6. Text before the first block is kept as the preamble.

export interface SidecarComment {
    id: string | null;            // null = written by hand/AI, plugin assigns one
    quote: string;                // text of the "## " heading
    body: string;
    meta: Record<string, unknown>; // everything in the marker JSON except id
}

export interface ParseResult {
    preamble: string;
    comments: SidecarComment[];
    warnings: string[];
}

const HEADING = /^## (.*)$/;
const MARKER = /^<!--\s*sidenote\s+(\{.*\})\s*-->\s*$/;
const LEGACY_MARKER = /^<!--\s*side-note:(\S+)\s*-->\s*$/;
const SEPARATOR = /^-{3,}\s*$/;

interface MarkerInfo { id: string | null; meta: Record<string, unknown>; warning?: string }

function readMarker(line: string): MarkerInfo | null {
    const legacy = LEGACY_MARKER.exec(line);
    if (legacy) return { id: legacy[1], meta: {} };

    const m = MARKER.exec(line);
    if (!m) {
        // Looks like our marker but is not well-formed: salvage the id if possible.
        if (/^<!--\s*sidenote\b/.test(line)) {
            const id = /"id"\s*:\s*"([^"]+)"/.exec(line)?.[1] ?? null;
            return { id, meta: {}, warning: `broken marker, recovered id=${id}` };
        }
        return null;
    }
    try {
        const { id, ...meta } = JSON.parse(m[1]);
        return { id: typeof id === "string" ? id : null, meta };
    } catch {
        const id = /"id"\s*:\s*"([^"]+)"/.exec(m[1])?.[1] ?? null;
        return { id, meta: {}, warning: `invalid JSON in marker, recovered id=${id}` };
    }
}

// Returns the marker on the first non-blank line after `index`, plus that line's index.
function findMarkerAfter(lines: string[], index: number): { info: MarkerInfo; at: number } | null {
    for (let i = index + 1; i < lines.length; i++) {
        if (lines[i].trim() === "") continue;
        const info = readMarker(lines[i]);
        return info ? { info, at: i } : null;
    }
    return null;
}

function previousNonBlank(lines: string[], index: number): string | null {
    for (let i = index - 1; i >= 0; i--) {
        if (lines[i].trim() !== "") return lines[i];
    }
    return null;
}

function trimBody(bodyLines: string[]): string {
    const out = [...bodyLines];
    // Drop trailing blanks and the block separator; keep separators inside the body.
    while (out.length && (out[out.length - 1].trim() === "" || SEPARATOR.test(out[out.length - 1]))) out.pop();
    while (out.length && out[0].trim() === "") out.shift();
    return out.join("\n");
}

export function parseSidecar(text: string): ParseResult {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const warnings: string[] = [];
    const comments: SidecarComment[] = [];
    const preambleLines: string[] = [];

    let current: { comment: SidecarComment; bodyLines: string[] } | null = null;
    const finish = () => {
        if (current) {
            current.comment.body = trimBody(current.bodyLines);
            comments.push(current.comment);
        }
    };

    let i = 0;
    // Skip YAML frontmatter, keeping it in the preamble.
    if (lines[0] === "---") {
        const end = lines.indexOf("---", 1);
        if (end > 0) {
            preambleLines.push(...lines.slice(0, end + 1));
            i = end + 1;
        }
    }

    for (; i < lines.length; i++) {
        const line = lines[i];
        const heading = HEADING.exec(line);

        if (heading) {
            const marker = findMarkerAfter(lines, i);
            const prev = previousNonBlank(lines, i);
            const startsNewUnmarked = !marker && (current === null || (prev !== null && SEPARATOR.test(prev)));

            if (marker || startsNewUnmarked) {
                finish();
                if (marker?.info.warning) warnings.push(`line ${marker.at + 1}: ${marker.info.warning}`);
                current = {
                    comment: { id: marker?.info.id ?? null, quote: heading[1].trim(), body: "", meta: marker?.info.meta ?? {} },
                    bodyLines: [],
                };
                if (marker) i = marker.at; // skip past the marker line
                continue;
            }
        }

        if (current) current.bodyLines.push(line);
        else preambleLines.push(line);
    }
    finish();

    // Duplicate ids (e.g. a block copy-pasted by hand): keep the first, re-id the rest.
    const seen = new Set<string>();
    for (const c of comments) {
        if (c.id && seen.has(c.id)) {
            warnings.push(`duplicate id ${c.id}; later copy treated as a new comment`);
            c.id = null;
        }
        if (c.id) seen.add(c.id);
    }

    return { preamble: trimBody(preambleLines), comments, warnings };
}

export function serializeSidecar(preamble: string, comments: SidecarComment[]): string {
    const blocks = comments.map(c => {
        const marker = `<!-- sidenote ${JSON.stringify({ id: c.id, ...c.meta })} -->`;
        return `## ${c.quote || "(note comment)"}\n${marker}\n${c.body}\n\n---`;
    });
    return [preamble, ...blocks].filter(s => s.length).join("\n\n") + "\n";
}
