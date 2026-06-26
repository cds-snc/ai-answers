# Single-analyzer experimental analysis (v1)

## Summary
Implement single-analyzer analysis runs with strict baseline compatibility and analyzer-owned output mapping. Keep graph execution in batch core, and let analyzers decide which source fields to use for their own outputs.

## Key changes
1. Enforce one analyzer per analysis batch
- Validate create-batch payload to require exactly one analyzer id.
- Update analysis UI to single-select analyzer.
- Keep read compatibility for old multi-analyzer rows; block new multi-analyzer creates.

2. Strict baseline compatibility
- If a baseline run is selected, require `baseline.analyzerId === current.analyzerId`.
- Reject mismatches with clear validation error.

3. Analyzer input contract (source-aware)
- Batch core passes a normalized context object containing:
  - item and batch metadata
  - run output snapshot from graph execution
  - original row data
  - baseline row context
  - optional chat-linked context (when available)
- Analyzer chooses source precedence (`run snapshot`, `chat context`, `originalData`) via helper utilities in `AnalyzerBase`.

4. Analyzer-owned export fields
- Analyzer returns:
  - `analysis` (verdict, flags, comparison logic)
  - `exportFields` (flat fields for spreadsheet output)
  - optional `statusOverride` (limited enum; validated by batch core)
- Batch core persists analyzer output and writes export fields under analyzer namespace for deterministic exports.

5. Lifecycle ownership
- Batch core remains final owner of item lifecycle (`completed`, `refused`, `failed`).
- Analyzer can request override, but core validates and applies deterministically.

6. Storage strategy
- Do not persist full raw graph artifact by default.
- Persist minimal shared run snapshot plus analyzer-produced export fields only.

## Test plan
1. Creating analysis batch with multiple analyzers fails.
2. Single analyzer create succeeds and processes normally.
3. Baseline mismatch analyzer id is rejected.
4. Baseline match succeeds and comparison fields populate.
5. Analyzer source-precedence tests:
- run snapshot available
- chat context missing fallback
- originalData fallback
6. Analyzer `exportFields` persist and appear in export endpoint output.
7. Valid `statusOverride` applied; invalid override rejected safely.
8. Regression: standard answer and export flows still pass.

## Assumptions
- v1 supports one analyzer per run only.
- Baseline compare is blocked for analyzer mismatch.
- Graph executes once per item in batch core.
- Analyzers return data; batch service performs all persistence.
