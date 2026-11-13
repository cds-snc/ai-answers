import { describe, it, expect } from 'vitest';
import { auditActionLabelKey, formatAuditMetadata } from '../auditHistory.js';
import en from '../../../locales/en.json';
import fr from '../../../locales/fr.json';

const lookup = (dict, key) => key.split('.').reduce((node, part) => node?.[part], dict);

describe('auditActionLabelKey', () => {
  it('labels database exports and retired field removals, in both languages', () => {
    for (const action of ['database.exported', 'database.retired_fields_removed', 'database.retired_fields_removal_failed']) {
      const key = auditActionLabelKey(action);
      expect(typeof lookup(en, key)).toBe('string');
      expect(typeof lookup(fr, key)).toBe('string');
    }
  });

  it('does not call an unknown action a setting change', () => {
    expect(auditActionLabelKey('setting.updated')).toBe('settings.auditHistory.actions.settingUpdated');
    expect(auditActionLabelKey('something.new')).toBeNull();
  });
});

describe('formatAuditMetadata', () => {
  it('lists what an export covered, leaving out empty values', () => {
    expect(formatAuditMetadata({ collection: 'user', scope: 'expertEvalChats', startDate: '2026-09-27', endDate: null }))
      .toBe('collection: user, scope: expertEvalChats, startDate: 2026-09-27');
  });

  it('returns null when there is nothing to show', () => {
    expect(formatAuditMetadata(null)).toBeNull();
    expect(formatAuditMetadata({ endDate: null })).toBeNull();
  });
});
