import { ScenarioOverrideService } from '../../services/ScenarioOverrideService.js';
import { requireLiteralString } from '../util/db-query.js';
import { SCENARIO_LOADERS, getScenarioLoader } from '../../agents/prompts/scenarios/scenario-loaders.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

async function loadDefaultScenarios(departmentKey) {
  if (departmentKey) {
    const loader = getScenarioLoader(departmentKey);
    if (!loader) {
      return null;
    }
    return loader();
  }

  const entries = await Promise.all(
    Object.entries(SCENARIO_LOADERS).map(async ([key, loader]) => {
      const text = await loader();
      return [key, text];
    })
  );
  return Object.fromEntries(entries);
}

async function handler(req, res) {
  try { console.log('scenario-overrides API hit', { method: req.method, query: req.query, body: req.body, user: req.user && { userId: req.user.userId, role: req.user.role } }); } catch (e) { /* ignore */ }
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.method === 'GET') {
    try {
      let { departmentKey, activeOnly } = req.query || {};

      // Lightweight path for the chat-page "a local scenario is applied"
      // banner: it only needs to know whether *any* department is currently
      // enabled for this user, not the full default-scenario text for all 24
      // supported departments (loadDefaultScenarios below), which this path
      // would otherwise pull on every chat page load.
      // Query params are always strings — `if (activeOnly)` would treat the
      // literal string 'false' as truthy. Only the one in-repo caller ever
      // sends 'true' today, but a direct/future ?activeOnly=false request
      // shouldn't silently take the active-only branch.
      if (activeOnly === 'true') {
        const overrides = await ScenarioOverrideService.getOverridesForUser(userId);
        const active = overrides.find((item) => item?.enabled) || null;
        return res.status(200).json({
          active: active ? { departmentKey: active.departmentKey, updatedAt: active.updatedAt } : null,
        });
      }

      if (departmentKey != null) {
        try {
          departmentKey = requireLiteralString(departmentKey, 'department key');
        } catch (error) {
          return res.status(400).json({ message: 'Invalid department key' });
        }
        if (!getScenarioLoader(departmentKey)) {
          return res.status(400).json({ message: 'Invalid department key' });
        }
      }
      const defaults = await loadDefaultScenarios(departmentKey);

      if (departmentKey) {
        // getOverride, not getActiveOverride: the editor needs to show a
        // saved-but-disabled draft too (saving is decoupled from the
        // "use this scenario for testing" checkbox), not just enabled ones —
        // see services/ScenarioOverrideService.js's getOverride comment.
        const override = await ScenarioOverrideService.getOverride(userId, departmentKey);
        return res.status(200).json({
          departmentKey,
          defaultText: defaults,
          override: override ? {
            overrideText: override.overrideText,
            enabled: override.enabled,
            updatedAt: override.updatedAt,
          } : null,
        });
      }

      const overrides = await ScenarioOverrideService.getOverridesForUser(userId);
      const overridesByKey = overrides.reduce((acc, item) => {
        acc[item.departmentKey] = item;
        return acc;
      }, {});

      const payload = Object.entries(defaults).map(([key, defaultText]) => {
        const override = overridesByKey[key];
        return {
          departmentKey: key,
          defaultText,
          overrideText: override ? override.overrideText : '',
          enabled: override ? override.enabled : false,
          updatedAt: override ? override.updatedAt : null,
        };
      });

      return res.status(200).json({ overrides: payload });
    } catch (error) {
      console.error('scenario overrides GET error:', error);
      return res.status(500).json({ message: 'Failed to load scenario overrides' });
    }
  }

  if (req.method === 'POST') {
    try {
      let { departmentKey, overrideText, enabled = true, expectedUpdatedAt = null } = req.body || {};
      try {
        departmentKey = requireLiteralString(departmentKey, 'department key');
      } catch (error) {
        return res.status(400).json({ message: 'Invalid department key' });
      }
      if (!getScenarioLoader(departmentKey)) {
        return res.status(400).json({ message: 'Invalid department key' });
      }
      if (typeof overrideText !== 'string' || !overrideText.trim()) {
        return res.status(400).json({ message: 'overrideText is required' });
      }

      // The editor UI only lets a user check "use this scenario for
      // testing" when overrideText actually differs from the department's
      // default (see ScenarioOverridesPage.js's hasMeaningfulText) — that's
      // a client-side-only rule, so re-enforce it here. Without this, a
      // direct POST with enabled:true and default-matching text is accepted
      // and still runs disableOtherOverrides below, silently turning off
      // the user's other real enabled override for no actual change.
      if (Boolean(enabled)) {
        const defaultText = await loadDefaultScenarios(departmentKey);
        if (typeof defaultText === 'string' && defaultText.trim() === overrideText.trim()) {
          return res.status(400).json({ message: 'overrideText must differ from the department default to enable testing' });
        }
      }

      let updated;
      try {
        updated = await ScenarioOverrideService.upsertOverride({
          userId,
          departmentKey,
          overrideText,
          enabled: Boolean(enabled),
          expectedUpdatedAt,
          updatedBy: userId,
        });
      } catch (error) {
        // Another tab/window saved this department after this caller last
        // loaded it — refuse the write instead of silently clobbering that
        // save. 409, not 500: this is an expected concurrent-edit outcome,
        // not a server failure.
        if (error?.code === 'SCENARIO_OVERRIDE_CONFLICT') {
          return res.status(409).json({ message: 'Scenario override was modified elsewhere', code: 'SCENARIO_OVERRIDE_CONFLICT' });
        }
        throw error;
      }

      // Enforce "one active scenario override at a time" (see
      // disableOtherOverrides' own comment) — only once this department's
      // save has actually succeeded, and only when it was enabled. Own
      // try/catch: this runs after upsertOverride has already committed, so
      // a failure here must not turn into a 500 for a save that genuinely
      // succeeded — the client would see a false failure, then a confusing
      // "modified elsewhere" conflict on retry (its stale expectedUpdatedAt
      // no longer matches the save that actually went through). Log and
      // continue instead; worst case is a stale other-department override
      // stays enabled until the next save touches it.
      if (updated.enabled) {
        try {
          await ScenarioOverrideService.disableOtherOverrides(userId, departmentKey);
        } catch (error) {
          console.error('scenario overrides disableOtherOverrides error (save itself succeeded):', error);
        }
      }

      return res.status(200).json({
        departmentKey,
        overrideText: updated.overrideText,
        enabled: updated.enabled,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      console.error('scenario overrides POST error:', error);
      return res.status(500).json({ message: 'Failed to save scenario override' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      let { departmentKey } = req.query || {};
      try {
        departmentKey = requireLiteralString(departmentKey, 'department key');
      } catch (error) {
        return res.status(400).json({ message: 'Invalid department key' });
      }
      if (!getScenarioLoader(departmentKey)) {
        return res.status(400).json({ message: 'Invalid department key' });
      }
      await ScenarioOverrideService.deleteOverride(userId, departmentKey);
      return res.status(204).end();
    } catch (error) {
      console.error('scenario overrides DELETE error:', error);
      return res.status(500).json({ message: 'Failed to delete scenario override' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ message: 'Method Not Allowed' });
}

export default function scenarioOverrideHandler(req, res) {
  return withProtection(handler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
