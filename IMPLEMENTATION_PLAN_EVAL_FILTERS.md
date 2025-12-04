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

### Option 1: Post-Query Filtering (RECOMMENDED - Easier)
**Pros:**
- Simpler to implement
- Reuses existing frontend categorization logic
- Easier to maintain consistency between frontend and backend
- Less risk of MongoDB aggregation complexity

**Cons:**
- Less efficient - filters AFTER fetching data
- May need to fetch more records to get desired result count

**Implementation:**
1. Extract categorization logic into a shared utility function
2. Apply filtering in Node.js after MongoDB query
3. Handle pagination carefully (may need to fetch in batches)

### Option 2: MongoDB Aggregation Pipeline (HARDER - More Efficient)
**Pros:**
- More efficient - filters at database level
- Better for large datasets
- Proper pagination support

**Cons:**
- Complex MongoDB $expr expressions needed
- Hard to maintain/debug
- Risk of logic inconsistency between frontend and backend

## Recommended Implementation Plan (Option 1)

### Step 1: Create Shared Categorization Utility
**File:** `/api/utils/categorization.js`

```javascript
/**
 * Categorizes an interaction based on expert feedback
 * Returns: 'correct' | 'needsImprovement' | 'hasError' | 'hasCitationError' | 'harmful' | null
 */
export function categorizeExpertFeedback(expertFeedback) {
  if (!expertFeedback) return null;

  // Check for citation error first (separate category)
  let hasCitationError = false;
  if (expertFeedback.citationScore !== null && expertFeedback.citationScore === 0) {
    hasCitationError = true;
  }

  // Check sentence-level scores
  const feedbackFields = [
    { score: expertFeedback.sentence1Score, harmful: expertFeedback.sentence1Harmful },
    { score: expertFeedback.sentence2Score, harmful: expertFeedback.sentence2Harmful },
    { score: expertFeedback.sentence3Score, harmful: expertFeedback.sentence3Harmful },
    { score: expertFeedback.sentence4Score, harmful: expertFeedback.sentence4Harmful },
  ];

  let highestCategory = null;
  feedbackFields.forEach(({ score, harmful }) => {
    if (harmful) {
      highestCategory = 'harmful';
    } else if (score === 0 && highestCategory !== 'harmful') {
      highestCategory = 'hasError';
    } else if (score === 80 && highestCategory !== 'harmful' && highestCategory !== 'hasError') {
      highestCategory = 'needsImprovement';
    }
  });

  // Include citationScore for non-error scoring (but not as hasError)
  if (expertFeedback.citationScore !== null && !hasCitationError) {
    const citationScore = expertFeedback.citationScore;
    if (citationScore === 20 && highestCategory !== 'hasError') {
      highestCategory = 'needsImprovement';
    } else if (citationScore === 25 && highestCategory === null) {
      highestCategory = 'correct';
    }
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

### Step 2: Update db-chat-logs.js to Apply Filters
**File:** `/api/db/db-chat-logs.js`

**Line ~80:** Change the condition check - remove `partnerEval` and `aiEval` from the aggregation condition since we'll filter post-query:
```javascript
// OLD (line 80):
if (department || referringUrl || urlEn || urlFr || answerType || partnerEval || aiEval) {

// NEW:
if (department || referringUrl || urlEn || urlFr || answerType) {
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

### Step 3: Handle Pagination Considerations

**Issue:** Post-query filtering means we might return fewer results than the requested limit.

**Solutions:**
1. **Simple approach:** Accept that results may be fewer than limit when filters are applied
   - Document this behavior
   - Frontend already handles variable result counts

2. **Better approach:** Iterative fetching
   ```javascript
   // Fetch in batches until we have enough results
   const targetCount = Number(limit);
   let results = [];
   let currentLastId = lastId;

   while (results.length < targetCount) {
     // Fetch batch
     let batch = await Chat.aggregate(pipeline).limit(targetCount * 2);

     // Apply filters
     if (partnerEval && partnerEval !== 'all') {
       batch = filterByPartnerEval(batch, partnerEval);
     }
     if (aiEval && aiEval !== 'all') {
       batch = filterByAiEval(batch, aiEval);
     }

     results.push(...batch);

     // Break if no more results available
     if (batch.length === 0) break;

     currentLastId = batch[batch.length - 1]._id;
   }

   chats = results.slice(0, targetCount);
   ```

### Step 4: Update Frontend (Optional but Recommended)
**File:** `/src/services/MetricsService.js`

Refactor to use the same categorization logic:
```javascript
// Import shared logic if we expose it via API endpoint
// Or keep frontend logic as-is for metrics calculation
// (filtering happens on backend, calculation can stay on frontend)
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

## Performance Considerations

### Expected Impact
- **Small datasets (<10k chats):** Negligible impact
- **Medium datasets (10k-100k chats):** Acceptable (<500ms additional)
- **Large datasets (>100k chats):** May need optimization

### Optimization Options (if needed)
1. Add database indexes on expertFeedback fields
2. Cache categorization results
3. Implement MongoDB aggregation approach (Option 2)
4. Add pagination warning in UI when filters are active

## Edge Cases to Handle

1. **Missing expertFeedback:** Return null category, exclude from filtered results
2. **Partial scores:** Handle null/undefined scores gracefully
3. **Empty interactions array:** Return empty results
4. **Combined filters:** Apply both partner and AI eval filters sequentially
5. **Null citation scores:** Handle as "no citation data"

## Files to Create/Modify

### New Files:
- `/api/utils/categorization.js` - Shared categorization logic
- `/api/utils/categorization.test.js` - Unit tests

### Modified Files:
- `/api/db/db-chat-logs.js` - Add post-query filtering logic
- (Optional) `/src/services/MetricsService.js` - Import shared categorization if exposed

## Timeline Estimate

- **Step 1 (Utility):** 2-3 hours
- **Step 2 (Backend):** 2-3 hours
- **Step 3 (Pagination):** 1-2 hours
- **Step 4 (Testing):** 3-4 hours
- **Total:** ~10-12 hours

## Alternative: Quick Prototype

For faster initial implementation, could add inline filtering directly in db-chat-logs.js without creating separate utility file. Once working, refactor into shared utility.

---

## Decision Required

**Choose implementation approach:**
- [ ] Option 1: Post-query filtering (Recommended - Simpler)
- [ ] Option 2: MongoDB aggregation (Harder - More efficient)

**Choose pagination strategy:**
- [ ] Simple (Accept variable result counts)
- [ ] Iterative fetching (More complex but consistent counts)
