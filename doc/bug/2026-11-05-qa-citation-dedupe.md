# 2026-11-05 QA citation duplicates  
  
## Symptom  
  
- One chat turn rendered 6 references for 3 unique chunks.  
- K1 and K2 were each shown twice. 
  
## Evidence  
  
- Session 1792823877410-gdph68lvf.  
- GET /api/sessions/{id}/events returned exactly two agent.citation events.  
- seq 14 toolCallId call_8be8ab31d35d4e26866eb793, refs K1 to K3.  
- seq 16 toolCallId call_1809725b54b2450bbcdad4c1, refs K1 to K3.  
- Both batches contain the same chunkIds for the same document version.  
- Each batch has its own citationId, so the citationId-first key treats them as different rows. 
  
## Root cause  
  
The page aggregates every agent.citation batch of one turn. Dedupe keys on citationId first. citationId is unique per retrieval call, so the same chunk is kept once per toolCallId.  
  
## Fix  
  
- Add documentId, versionId and chunkId to the Citation view model.  
- Build the dedupe key from expertId, documentId, versionId and chunkId, then fall back to citationId and toolCallId plus ref.  
- Merge with latest-wins: a later snapshot of the same chunk replaces the earlier one, so ref, rank and citationId follow the final retrieval. 
  
## Scope and verification  
  
- Frontend only. No backend change.  
- Replay the session and expect 3 reference rows with unique React keys.  
- Click a row to open CitationSheet and download the source document.  
- npx tsc --noEmit and npm run build must pass. 

## Resolution

- Added `documentId` / `versionId` / `chunkId` to the frontend `Citation` view model and mapped them in `toCitation()`.
- `citationKey()` now prefers the stable provenance key `expertId + documentId + versionId + chunkId`, and only falls back to `citationId` or `toolCallId + ref` when provenance is incomplete.
- Added `mergeCitations()` with latest-wins semantics: a later snapshot of the same chunk replaces the earlier `citationId`, `ref`, rank and scores; the merged list is re-sorted with `compareCitations()`.
- Demo citation fixtures were updated with consistent provenance fields.

## Verification

- Replayed session `1792823877410-gdph68lvf`: the turn now renders exactly 3 reference rows (K1/K2/K3) instead of 6.
- Opened K1: `CitationSheet` loaded the chunk, heading path and "所属章节全文" controls correctly.
- Clicked "下载原文": `/api/knowledge/citations/{id}/document` returned HTTP 200.
- Mobile 375px checks: `/admin/knowledge`, `/admin/experts`, the expert picker and the citation drawer have no horizontal overflow.
- `npx tsc --noEmit` passed.
- `npx eslint` on the touched files passed.
- `git diff --check` passed (only pre-existing LF/CRLF warnings).