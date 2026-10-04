import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { parseSidecar, serializeSidecar } from "../src/core/sidecarFormat";

const sample = `---
sidenote-format: 2
source: "memo/問題発見.md"
---

# Side Notes for memo/問題発見.md

## とき、順番に
<!-- sidenote {"id":"a1","color":"red","author":"mofukuru","created":"2026-10-04T12:00:00+09:00","prefix":"その","suffix":"声を"} -->
ジブリ

**太字**もOK

---

## 別の箇所
<!-- sidenote {"id":"b2","resolved":true} -->
本文2

---
`;

test("round-trip: parse → serialize → parse is stable", () => {
    const a = parseSidecar(sample);
    const b = parseSidecar(serializeSidecar(a.preamble, a.comments));
    assert.deepEqual(b, a);
    assert.equal(a.comments.length, 2);
    assert.equal(a.comments[0].meta.color, "red");
    assert.equal(a.comments[0].body, "ジブリ\n\n**太字**もOK");
});

test("legacy v1 marker (timestamp id) is read", () => {
    const r = parseSidecar("# Side Notes for x.md\n\n## 引用\n<!-- side-note:1765860315950 -->\nジブリ\n\n---");
    assert.equal(r.comments[0].id, "1765860315950");
    assert.equal(r.comments[0].body, "ジブリ");
    assert.equal(r.preamble, "# Side Notes for x.md");
});

// Uses the owner's local dev vault; skipped elsewhere (e.g. CI). Move these files into
// tests/fixtures/ when the v2 migration is implemented.
const devVaultSidecars = "/mnt/e/Obsidian/for_develop/side-note-comments";
test("all real v1 sidecars in the dev vault parse without loss", { skip: !existsSync(devVaultSidecars) }, () => {
    const dir = devVaultSidecars;
    for (const f of readdirSync(dir)) {
        const text = readFileSync(`${dir}/${f}`, "utf8");
        const r = parseSidecar(text);
        const markers = (text.match(/<!-- side-note:/g) ?? []).length;
        assert.equal(r.comments.length, markers, f);
        assert.ok(r.comments.every(c => c.id), f);
    }
});

test("human edits the body (multi-line, CRLF) → body updated, metadata kept", () => {
    const edited = sample.replace("ジブリ", "ジブリ（追記）\n- 箇条書き").replace(/\n/g, "\r\n");
    const r = parseSidecar(edited);
    assert.equal(r.comments[0].body, "ジブリ（追記）\n- 箇条書き\n\n**太字**もOK");
    assert.equal(r.comments[0].meta.author, "mofukuru");
});

test("a ## heading inside a body stays in the body", () => {
    const r = parseSidecar(sample.replace("ジブリ", "ジブリ\n\n## 本文中の見出し\n続き"));
    assert.equal(r.comments.length, 2);
    assert.match(r.comments[0].body, /## 本文中の見出し\n続き/);
});

test("a --- inside a body that is not followed by a heading stays in the body", () => {
    const r = parseSidecar(sample.replace("ジブリ", "上\n\n---\n\n下"));
    assert.equal(r.comments[0].body, "上\n\n---\n\n下\n\n**太字**もOK");
});

test("AI/human appends a block without a marker → new comment with id=null", () => {
    const r = parseSidecar(sample + "\n## 新しく引用した文\nAIが書いたコメント\n");
    assert.equal(r.comments.length, 3);
    assert.deepEqual(r.comments[2], { id: null, quote: "新しく引用した文", body: "AIが書いたコメント", meta: {} });
});

test("broken marker JSON → id recovered, body kept, warning reported", () => {
    const r = parseSidecar(sample.replace('"color":"red",', '"color":red,'));
    assert.equal(r.comments[0].id, "a1");
    assert.equal(r.comments[0].body, "ジブリ\n\n**太字**もOK");
    assert.equal(r.warnings.length, 1);
});

test("marker deleted by hand → block becomes a new comment, text not lost", () => {
    const r = parseSidecar(sample.replace(/<!-- sidenote \{"id":"b2".*\n/, ""));
    assert.equal(r.comments.length, 2);
    assert.equal(r.comments[1].id, null);
    assert.equal(r.comments[1].body, "本文2");
});

test("copy-pasted duplicate block → second copy gets re-id'd", () => {
    const dup = sample + "\n## 別の箇所\n<!-- sidenote {\"id\":\"b2\"} -->\nコピー\n";
    const r = parseSidecar(dup);
    assert.equal(r.comments[2].id, null);
    assert.equal(r.warnings.length, 1);
});

test("unknown marker fields from a newer version are preserved", () => {
    const r = parseSidecar(sample.replace('"resolved":true', '"resolved":true,"futureField":[1,2]'));
    const out = serializeSidecar(r.preamble, r.comments);
    assert.match(out, /"futureField":\[1,2\]/);
});
