# Implementation Plan: Backend Filtering for Partner & AI Evaluations

## Overview
Implement backend filtering logic in `/api/db/db-chat-logs.js` to filter interactions based on Partner Evaluation and AI Evaluation categories. The filters are already captured in the query params (line 22) but not yet applied in the aggregation pipeline.

## Current State
- ✅ Frontend: FilterPanelV2 sends `partnerEval` and `aiEval` filters
- ✅ Frontend: MetricsService categorization logic exists (lines 185-257 for partner, 284-351 for AI)
- ✅ Backend: Query params captured (line 22: `partnerEval, aiEval`)
- ✅ Backend: Aggregation pipeline exists with expertFeedback and autoEval lookups (lines 84-200)
- ❌ Backend: Categorization filter logic NOT YET IMPLEMENTED

## The Challenge
The categorization logic is **complex** and currently only exists in the frontend:
- Must check sentence scores (0, 80, 100) and harmful flags across 4 sentences
- Must check citation scores (0, 20, 25)
- Must apply priority: `harmful > hasCitationError > hasError > needsImprovement > correct`
- Different logic for partner eval vs AI eval (different data paths)

## Implementation Approach

This plan uses **post-query filtering** - applying categorization logic after fetching from the database. This approach is simpler to implement, maintains consistency with frontend logic, and is appropriate for current dataset sizes. Database-level filtering can be added later as a performance optimization if needed.

## Implementation Steps

### Step 1: Create Shared Categorization Utility
**File:** `/api/utils/categorization.js`

```javascript
/**
 * Score meanings:
 * - Sentence scores: 100 = correct, 80 = needs improvement, 0 = error
 * - Citation scores: 25 = correct, 20 = needs improvement, 0 = error
 * - Harmful flag: true = harmful content detected
 *
 * Categorizes an interaction based on expert feedback
 * Returns: 'correct' | 'needsImprovement' | 'hasError' | 'hasCitationError' | 'harmful' | null
 */
export function categorizeExpertFeedback(expertFeedback) {
  if (!expertFeedback) return null;

  // Check for citation error (score explicitly 0)
  const hasCitationError = expertFeedback.citationScore === 0;

  // Check sentence-level scores with null safety
  const feedbackFields = [
    { score: expertFeedback.sentence1Score, harmful: expertFeedback.sentence1Harmful },
    { score: expertFeedback.sentence2Score, harmful: expertFeedback.sentence2Harmful },
    { score: expertFeedback.sentence3Score, harmful: expertFeedback.sentence3Harmful },
    { score: expertFeedback.sentence4Score, harmful: expertFeedback.sentence4Harmful },
  ];

  let highestCategory = null;
  let hasAnyScore = false;

  feedbackFields.forEach(({ score, harmful }) => {
    // Skip null/undefined scores (not evaluated)
    if (score === null || score === undefined) return;
    hasAnyScore = true;

    if (harmful === true) {
      highestCategory = 'harmful';
    } else if (score === 0 && highestCategory !== 'harmful') {
      highestCategory = 'hasError';
    } else if (score === 80 && highestCategory !== 'harmful' && highestCategory !== 'hasError') {
      highestCategory = 'needsImprovement';
    } else if (score === 100 && highestCategory === null) {
      highestCategory = 'correct';
    }
  });

  // Handle citation score for non-error cases
  if (expertFeedback.citationScore !== null && expertFeedback.citationScore !== undefined && !hasCitationError) {
    const citationScore = expertFeedback.citationScore;
    if (citationScore === 20 && highestCategory !== 'hasError' && highestCategory !== 'harmful') {
      highestCategory = 'needsImprovement';
    } else if (citationScore === 25 && highestCategory === null) {
      highestCategory = 'correct';
    }
  }

  // If no scores at all, return null (not evaluated)
  if (!hasAnyScore && expertFeedback.citationScore === null) {
    return null;
  }

  // Apply priority: harmful > hasCitationError > hasError > needsImprovement > correct
  if (highestCategory === 'harmful') return 'harmful';
  if (hasCitationError) return 'hasCitationError';
  if (highestCategory === 'hasError') return 'hasError';
  if (highestCategory === 'needsImprovement') return 'needsImprovement';
  return 'correct';
}

/**
 * Categorizes an interaction based on AI evaluation
 */
export function categorizeAiEval(autoEval) {
  if (!autoEval || !autoEval.expertFeedback) return null;
  return categorizeExpertFeedback(autoEval.expertFeedback);
}

/**
 * Filters chats based on partner evaluation category
 */
export function filterByPartnerEval(chats, category) {
  if (!category || category === 'all') return chats;

  return chats.filter(chat => {
    // Keep chat if ANY interaction matches the category
    return chat.interactions && chat.interactions.some(interaction => {
      const interactionCategory = categorizeExpertFeedback(interaction.expertFeedback);
      return interactionCategory === category;
    });
  });
}

/**
 * Filters chats based on AI evaluation category
 */
export function filterByAiEval(chats, category) {
  if (!category || category === 'all') return chats;

  return chats.filter(chat => {
    // Keep chat if ANY interaction matches the category
    return chat.interactions && chat.interactions.some(interaction => {
      const interactionCategory = categorizeAiEval(interaction.autoEval);
      return interactionCategory === category;
    });
  });
}
```

### Step 2: Add Input Validation (Security)
**File:** `/api/db/db-chat-logs.js`

**After line 22** (where params are captured), add validation:
```javascript
const {
  limit,
  lastId,
  startDate,
  endDate,
  userType,
  department,
  urlEn,
  urlFr,
  referringUrl,
  answerType,
  partnerEval,
  aiEval,
  batchId
} = req.query;

// Validate enum values to prevent injection
const validCategories = ['all', 'correct', 'needsImprovement', 'hasError', 'hasCitationError', 'harmful'];
if (partnerEval && !validCategories.includes(partnerEval)) {
  return res.status(400).json({ error: 'Invalid partnerEval value' });
}
if (aiEval && !validCategories.includes(aiEval)) {
  return res.status(400).json({ error: 'Invalid aiEval value' });
}

// Ensure numeric limits are safe
const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
```

### Step 3: Update db-chat-logs.js to Apply Filters
**File:** `/api/db/db-chat-logs.js`

**Line 80:** Keep the aggregation condition unchanged (including `partnerEval` and `aiEval`) since the aggregation pipeline performs the necessary `$lookup` operations to populate `expertFeedback` and `autoEval.expertFeedback` data:
```javascript
if (department || referringUrl || urlEn || urlFr || answerType || partnerEval || aiEval) {
  // Aggregation pipeline needed for proper data population
}
```

**Line ~284:** After aggregation completes, apply post-query filtering:
```javascript
import { filterByPartnerEval, filterByAiEval } from '../utils/categorization.js';

// ... existing aggregation code ...

chats = await Chat.aggregate(pipeline);

// Apply partner eval filter if provided
if (partnerEval && partnerEval !== 'all') {
  chats = filterByPartnerEval(chats, partnerEval);
}

// Apply AI eval filter if provided
if (aiEval && aiEval !== 'all') {
  chats = filterByAiEval(chats, aiEval);
}
```

**Line ~300:** Also apply to non-aggregate branch:
```javascript
let query = Chat.find(dateFilter)
  .populate(chatPopulate)
  .sort({ _id: 1 })
  .limit(Number(limit));
chats = await query;

// Apply filters
if (partnerEval && partnerEval !== 'all') {
  chats = filterByPartnerEval(chats, partnerEval);
}
if (aiEval && aiEval !== 'all') {
  chats = filterByAiEval(chats, aiEval);
}
```

### Step 4: Handle Pagination

**Issue:** Post-query filtering means we might return fewer results than the requested limit.

**Recommended Approach:** Cursor-based iterative fetching:
```javascript
/**
 * Fetch chats with post-query filtering, handling pagination correctly
 */
async function fetchFilteredChats(pipeline, partnerEval, aiEval, targetLimit) {
  let results = [];
  let cursor = null;
  const batchSize = Math.max(targetLimit * 3, 500); // Fetch more than needed
  const maxIterations = 10; // Safety limit to prevent infinite loops
  let iterations = 0;

  while (results.length < targetLimit && iterations < maxIterations) {
    iterations++;

    // Create a fresh pipeline copy for this batch
    const batchPipeline = [...pipeline];

    // Add cursor condition if we have one
    if (cursor) {
      batchPipeline.unshift({ $match: { _id: { $gt: cursor } } });
    }

    // Limit batch size
    batchPipeline.push({ $limit: batchSize });

    // Fetch batch
    let batch = await Chat.aggregate(batchPipeline);

    // Break if no more results
    if (batch.length === 0) break;

    // Apply categorization filters
    if (partnerEval && partnerEval !== 'all') {
      batch = filterByPartnerEval(batch, partnerEval);
    }
    if (aiEval && aiEval !== 'all') {
      batch = filterByAiEval(batch, aiEval);
    }

    // Add filtered results
    results = results.concat(batch);

    // Update cursor for next iteration
    cursor = batch[batch.length - 1]._id;
  }

  // Return only the requested number of results
  return results.slice(0, targetLimit);
}

// Usage in db-chat-logs.js:
chats = await fetchFilteredChats(pipeline, partnerEval, aiEval, safeLimit);
```

**Alternative Simple Approach:**
If iterative fetching is too complex initially, use this simpler approach:
```javascript
// Fetch with larger limit to account for filtering
const fetchLimit = (partnerEval !== 'all' || aiEval !== 'all') ? safeLimit * 3 : safeLimit;
pipeline.push({ $limit: fetchLimit });

let chats = await Chat.aggregate(pipeline);

// Apply filters
if (partnerEval && partnerEval !== 'all') {
  chats = filterByPartnerEval(chats, partnerEval);
}
if (aiEval && aiEval !== 'all') {
  chats = filterByAiEval(chats, aiEval);
}

// Trim to requested limit
chats = chats.slice(0, safeLimit);
```

### Step 5: Modern Frontend Improvements (Recommended)

#### 5.1 URL Parameter Sync for Shareable Filters
**File:** `/src/components/admin/FilterPanelV2.js`

```javascript
import { useSearchParams } from 'react-router-dom';

function FilterPanelV2({ onApplyFilters }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL params on mount
  useEffect(() => {
    const partnerEval = searchParams.get('partnerEval') || 'all';
    const aiEval = searchParams.get('aiEval') || 'all';
    setPartnerEval(partnerEval);
    setAiEval(aiEval);
  }, []);

  const handleApply = () => {
    // Sync filters to URL for shareability
    setSearchParams({
      ...Object.fromEntries(searchParams),
      partnerEval,
      aiEval,
      // other filters...
    });
    onApplyFilters(filters);
  };
}
```

#### 5.2 Memoize Expensive Calculations
**File:** `/src/components/admin/MetricsDashboard.js`

```javascript
import { useMemo } from 'react';

function MetricsDashboard() {
  // Memoize the expensive metrics calculation
  const calculatedMetrics = useMemo(() => {
    return MetricsService.calculateMetrics(logs);
  }, [logs]); // Only recalculate when logs change

  return (
    // Use calculatedMetrics instead of calling calculateMetrics directly
  );
}
```

#### 5.3 Add Loading States and User Feedback
```javascript
// Show filtered result count
<div aria-live="polite" role="status">
  {filteredCount < totalCount && (
    `Showing ${filteredCount} of ${totalCount} records matching filter criteria`
  )}
</div>
```

## Testing Plan

### Unit Tests
1. Test `categorizeExpertFeedback()` with various score combinations
   - All correct (100 scores, citation 25)
   - Needs improvement (80 scores, citation 20)
   - Has error (sentence score 0)
   - Has citation error (citation score 0)
   - Harmful (harmful flag true)
   - Mixed scenarios

2. Test `categorizeAiEval()` with autoEval structure

3. Test `filterByPartnerEval()` and `filterByAiEval()` with sample chats

### Integration Tests
1. Test API endpoint with each filter value:
   - `partnerEval=correct`
   - `partnerEval=needsImprovement`
   - `partnerEval=hasError`
   - `partnerEval=hasCitationError`
   - `partnerEval=harmful`
   - `aiEval=correct`
   - `aiEval=needsImprovement`
   - `aiEval=hasError`
   - `aiEval=hasCitationError`

2. Test combined filters (e.g., `partnerEval=hasError&department=CDS-SNC`)

3. Test pagination with filters

### Manual Testing
1. Use FilterPanelV2 in the UI
2. Select various partner eval filters and verify results
3. Select various AI eval filters and verify results
4. Check that metrics dashboard still calculates correctly
5. Verify performance with large datasets

## Migration Strategy

1. **Phase 1:** Implement categorization utility
2. **Phase 2:** Add post-query filtering to backend
3. **Phase 3:** Test thoroughly in dev environment
4. **Phase 4:** Deploy to staging
5. **Phase 5:** Monitor performance and adjust if needed
6. **Phase 6 (Optional):** If performance issues arise, consider MongoDB aggregation approach

## Database Optimization Recommendations

### Add Missing Indexes
**File:** `/models/expertFeedback.js`

The ExpertFeedback model currently has no indexes, which may cause slow queries:

```javascript
// Add indexes for commonly queried fields
expertFeedbackSchema.index({ citationScore: 1 });
expertFeedbackSchema.index({
  sentence1Harmful: 1,
  sentence2Harmful: 1,
  sentence3Harmful: 1,
  sentence4Harmful: 1
});
expertFeedbackSchema.index({
  sentence1Score: 1,
  sentence2Score: 1,
  sentence3Score: 1,
  sentence4Score: 1
});
```

### Future Optimization: Materialized Categories
For very large datasets, consider adding a computed `category` field that updates on save:

```javascript
expertFeedbackSchema.pre('save', function(next) {
  this.computedCategory = categorizeExpertFeedback(this);
  next();
});

expertFeedbackSchema.index({ computedCategory: 1 });
```

This allows direct database filtering instead of post-query filtering.

## Performance Considerations

### Expected Impact
- **Small datasets (<10k chats):** Negligible impact
- **Medium datasets (10k-100k chats):** Post-query filtering acceptable
- **Large datasets (>100k chats):** Monitor performance, may need materialized categories

### Optimization Options (Progressive Enhancement)
1. **Phase 1:** Implement post-query filtering (current plan)
2. **Phase 2:** Add database indexes (see above)
3. **Phase 3:** Monitor query performance in production
4. **Phase 4:** If needed, add materialized `category` field
5. **Phase 5:** If needed, implement server-side metrics aggregation endpoint

## Security Considerations

### Input Validation (Already Added in Step 2)
- Enum validation for `partnerEval` and `aiEval` values
- Safe numeric limit parsing with min/max bounds
- Regex escaping already implemented in existing code (lines 209, 223, 231, 238)

### Authorization
- Endpoint already uses `authMiddleware` and `withProtection`
- Ensure filter parameters don't allow access to unauthorized data
- Admin-only access already enforced

### No SQL Injection Risk
- Using MongoDB aggregation framework (not raw queries)
- All filter values validated against allowed enums
- No user input directly interpolated into queries

## Accessibility Improvements

### FilterPanelV2 Enhancements
```javascript
// Add ARIA labels for filter sections
<details className="filter-panel" open aria-label="Evaluation filter options">
  <summary className="filter-panel-summary" role="button" aria-expanded="true">
    Filters
  </summary>

  <div className="filter-group">
    <label htmlFor="partnerEval">Partner Evaluation</label>
    <select
      id="partnerEval"
      value={partnerEval}
      onChange={(e) => setPartnerEval(e.target.value)}
      aria-describedby="partnerEval-description"
    >
      {/* options */}
    </select>
    <span id="partnerEval-description" className="sr-only">
      Filter by expert partner evaluation category
    </span>
  </div>

  {/* Live region for loading state */}
  <div aria-live="polite" role="status">
    {loading && `Loading metrics...`}
  </div>
</details>
```

## Edge Cases to Handle

1. **Missing expertFeedback:** Return null category, exclude from filtered results (handled in categorization)
2. **Partial scores:** Handle null/undefined scores gracefully (fixed in enhanced categorization)
3. **Empty interactions array:** Return empty results
4. **Combined filters:** Apply both partner and AI eval filters sequentially
5. **Null citation scores:** Handle as "no citation data" (fixed in enhanced categorization)
6. **No matching results after filtering:** Return empty array, show user feedback
7. **Maximum iterations reached:** Safety limit prevents infinite loops (added in pagination fix)

## Files to Create/Modify

### New Files:
- `/api/utils/categorization.js` - Shared categorization logic
- `/api/utils/categorization.test.js` - Unit tests

### Modified Files:
- `/api/db/db-chat-logs.js` - Add input validation and post-query filtering logic
- `/models/expertFeedback.js` - Add database indexes (optional but recommended)
- `/src/components/admin/FilterPanelV2.js` - URL parameter sync, accessibility improvements
- `/src/components/admin/MetricsDashboard.js` - Memoization for performance

## Risks and Concerns

### Performance Risks
1. **Memory Pressure:** Frontend fetches ALL logs (MetricsDashboard.js line 39 loop). For large datasets, may cause browser issues.
   - **Mitigation:** Add maximum record limit or implement server-side pagination with total count

2. **Query Performance:** Aggregation pipeline with multiple `$lookup` operations may be slow.
   - **Mitigation:** Add indexes (see Database Optimization section)

3. **Post-Query Filtering Efficiency:** May fetch many records that get discarded.
   - **Mitigation:** Iterative fetching approach helps, monitor query counts

### Data Consistency Risks
1. **Logic Drift:** Categorization logic exists in both frontend and backend.
   - **Mitigation:** Create integration tests to verify consistency
   - Consider single source of truth via shared utility or API endpoint

2. **Schema Evolution:** If ExpertFeedback schema changes, both implementations need updates.
   - **Mitigation:** Add comprehensive tests, document schema dependencies

### User Experience Risks
1. **Unexpected Empty Results:** With post-query filtering, users might get fewer results than expected.
   - **Mitigation:** Show feedback like "Showing X of Y total records"

2. **Slow Filters:** Complex filters may be slow on large datasets.
   - **Mitigation:** Add loading indicators, progressive loading

## Alternative: Quick Prototype Approach

For faster initial implementation:
1. Add inline filtering directly in `db-chat-logs.js` without creating separate utility
2. Test with real data to validate logic
3. Once working, refactor into shared utility for maintainability

---

## Implementation Checklist

### Core Implementation
- [ ] Step 1: Create categorization utility (`/api/utils/categorization.js`)
- [ ] Step 2: Add input validation to `db-chat-logs.js`
- [ ] Step 3: Apply post-query filtering in `db-chat-logs.js`
- [ ] Step 4: Implement pagination logic
- [ ] Step 5: Add frontend improvements (URL params, memoization, feedback)

### Database Optimization
- [ ] Add indexes to ExpertFeedback model
- [ ] Monitor query performance in production

### Testing
- [ ] Unit tests for categorization functions
- [ ] Integration tests for API endpoint with filters
- [ ] Manual testing in UI

### Future Enhancements (Optional)
- [ ] Server-side metrics aggregation endpoint
- [ ] Materialized category field in database
- [ ] Web Workers for heavy calculations
- [ ] Virtual scrolling for large result sets
