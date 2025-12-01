import { ScenarioOverrideService } from '../../services/ScenarioOverrideService.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

const SUPPORTED_DEPARTMENTS = {
  'CBSA-ASFC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-cbsa-asfc/cbsa-asfc-scenarios.js');
    return mod.CBSA_ASFC_SCENARIOS || '';
  },
  'CDS-SNC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-cds-snc/cds-snc-scenarios.js');
    return mod.CDS_SNC_SCENARIOS || '';
  },
  'CRA-ARC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-cra-arc/cra-arc-scenarios.js');
    return mod.CRA_ARC_SCENARIOS || '';
  },
  'ECCC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-eccc/eccc-scenarios.js');
    return mod.ECCC_SCENARIOS || '';
  },
  'EDSC-ESDC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-edsc-esdc/edsc-esdc-scenarios.js');
    return mod.EDSC_ESDC_SCENARIOS || '';
  },
  'FIN': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-fin/fin-scenarios.js');
    return mod.FIN_SCENARIOS || '';
  },
  'HC-SC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-hc-sc/hc-sc-scenarios.js');
    return mod.HC_SC_SCENARIOS || '';
  },
  'IRCC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-ircc/ircc-scenarios.js');
    return mod.IRCC_SCENARIOS || '';
  },
  'ISED-ISDE': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-ised-isde/ised-isde-scenarios.js');
    return mod.ISED_ISDE_SCENARIOS || '';
  },
  'NRCan-RNCan': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-nrcan-rncan/nrcan-rncan-scenarios.js');
    return mod.NRCAN_RNCAN_SCENARIOS || '';
  },
  'PSPC-SPAC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-pspc-spac/pspc-spac-scenarios.js');
    return mod.PSPC_SPAC_SCENARIOS || '';
  },
  'SAC-ISC': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-sac-isc/sac-isc-scenarios.js');
    return mod.SAC_ISC_SCENARIOS || '';
  },
  'TBS-SCT': async () => {
    const mod = await import('../../agents/prompts/scenarios/context-tbs-sct/tbs-sct-scenarios.js');
    return mod.TBS_SCT_SCENARIOS || '';
  },
};

async function loadDefaultScenarios(departmentKey) {
  if (departmentKey) {
    const loader = SUPPORTED_DEPARTMENTS[departmentKey];
    if (!loader) {
      return null;
    }
    return loader();
  }

  const entries = await Promise.all(
    Object.entries(SUPPORTED_DEPARTMENTS).map(async ([key, loader]) => {
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
      const { departmentKey } = req.query || {};
      const defaults = await loadDefaultScenarios(departmentKey);

      if (departmentKey) {
        const override = await ScenarioOverrideService.getActiveOverride(userId, departmentKey);
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
      const { departmentKey, overrideText, enabled = true } = req.body || {};
      if (!departmentKey || !SUPPORTED_DEPARTMENTS[departmentKey]) {
        return res.status(400).json({ message: 'Invalid department key' });
      }
      if (typeof overrideText !== 'string' || !overrideText.trim()) {
        return res.status(400).json({ message: 'overrideText is required' });
      }

      const updated = await ScenarioOverrideService.upsertOverride({
        userId,
        departmentKey,
        overrideText,
        enabled: Boolean(enabled),
        updatedBy: userId,
      });

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
      const { departmentKey } = req.query || {};
      if (!departmentKey || !SUPPORTED_DEPARTMENTS[departmentKey]) {
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
