/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScenarioOverridesPage from '../ScenarioOverridesPage.js';

const renderWithRouter = (ui, { route } = {}) =>
  render(<MemoryRouter initialEntries={route ? [route] : undefined}>{ui}</MemoryRouter>);

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

vi.mock('../../hooks/usePageParam.js', () => ({
  usePageContext: () => ({ language: 'en' }),
}));

const { mockGetDepartmentScenario, mockSaveOverride, mockDeleteOverride } = vi.hoisted(() => ({
  mockGetDepartmentScenario: vi.fn(),
  mockSaveOverride: vi.fn(),
  mockDeleteOverride: vi.fn(),
}));

vi.mock('../../services/ScenarioOverrideService.js', () => ({
  default: {
    getDepartmentScenario: mockGetDepartmentScenario,
    saveOverride: mockSaveOverride,
    deleteOverride: mockDeleteOverride,
  },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
  GcdsButton: ({ children, onClick, disabled }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

const selectDepartment = async (value) => {
  const select = screen.getByLabelText('scenarioOverrides.departmentSelect.label');
  fireEvent.change(select, { target: { value } });
  await waitFor(() => {
    expect(mockGetDepartmentScenario).toHaveBeenCalledWith(value);
  });
};

describe('ScenarioOverridesPage', () => {
  afterEach(() => {
    cleanup();
    mockGetDepartmentScenario.mockReset();
    mockSaveOverride.mockReset();
  });

  it('shows the page-level intro even with no department selected, but hides the editor until one is', () => {
    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    // The conceptual "what is this page for" intro isn't department-specific,
    // so it's fine to show before any selection.
    expect(screen.getByText('scenarioOverrides.intro')).toBeTruthy();
    // The department-specific editing UI stays hidden until a department is
    // actually picked.
    expect(screen.queryByLabelText(/scenarioOverrides.editor.label/)).toBeNull();
  });

  it('pre-selects the department from ?department= — the chat page\'s "Return and edit scenario" link deep-links here', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Custom edited text',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />, { route: '/en/scenario-overrides?department=AAFC-AAC' });

    await waitFor(() => {
      expect(mockGetDepartmentScenario).toHaveBeenCalledWith('AAFC-AAC');
    });
    expect(screen.getByLabelText('scenarioOverrides.departmentSelect.label').value).toBe('AAFC-AAC');
    expect(await screen.findByLabelText('scenarioOverrides.editor.label')).toBeTruthy();
  });

  it('focuses the department heading once loaded, when arriving via #scenario-department-heading', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Custom edited text',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    window.location.hash = '#scenario-department-heading';

    renderWithRouter(<ScenarioOverridesPage lang="en" />, { route: '/en/scenario-overrides?department=AAFC-AAC' });

    const heading = await screen.findByRole('heading', { level: 2, name: 'AAFC-AAC' });
    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });

    window.location.hash = '';
  });

  it('ignores an unrecognized ?department= value rather than trusting the query string outright', () => {
    renderWithRouter(<ScenarioOverridesPage lang="en" />, { route: '/en/scenario-overrides?department=NOT-A-REAL-DEPARTMENT' });

    expect(mockGetDepartmentScenario).not.toHaveBeenCalled();
    expect(screen.getByLabelText('scenarioOverrides.departmentSelect.label').value).toBe('');
  });

  it('shows a full-page loading overlay (not a "saving" message) while a department\'s data is loading', async () => {
    let resolveScenario;
    mockGetDepartmentScenario.mockReturnValue(new Promise((resolve) => { resolveScenario = resolve; }));

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    const select = screen.getByLabelText('scenarioOverrides.departmentSelect.label');
    fireEvent.change(select, { target: { value: 'AAFC-AAC' } });

    // Nothing else is actionable on the page yet — see LoadingOverlay's own
    // "TODO" in AGENTS.md — so this is the full-page overlay, not the
    // status.saving text (nothing is being saved here at all).
    const overlay = await screen.findByText('common.loading');
    expect(overlay.closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByText('scenarioOverrides.status.saving')).toBeNull();

    resolveScenario({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Default scenario text',
      enabled: false,
      updatedAt: null,
    });
    await waitFor(() => {
      expect(screen.queryByText('common.loading')).toBeNull();
    });
  });

  it('rejects checking "use this scenario for testing" before any edit with an inline error, not by disabling the control', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Default scenario text',
      enabled: false,
      updatedAt: null,
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    const textarea = await screen.findByLabelText('scenarioOverrides.editor.label');

    // Always focusable/clickable — a disabled control with the reason only
    // in an aria-describedby hint is undiscoverable to keyboard/AT users
    // (the control itself is pulled out of the tab order).
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.disabled).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    const errorNode = await screen.findByRole('alert');
    expect(errorNode.id).toBe('scenario-enabled-error');
    expect(checkbox.getAttribute('aria-describedby')).toBe('scenario-enabled-error');

    // Editing the text clears the error and allows checking it.
    fireEvent.change(textarea, { target: { value: 'Edited text' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('lets an already-active department be turned off with no edits, and never shows the enabled error for it', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Custom edited text',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    await screen.findByLabelText('scenarioOverrides.editor.label');

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the test link on a plain revisit of an already-active department, not only right after saving', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Custom edited text',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    await screen.findByLabelText('scenarioOverrides.editor.label');

    // No save happened this session — the link reflects current state
    // (an active saved override exists), not "a save just occurred."
    expect(mockSaveOverride).not.toHaveBeenCalled();
    expect(screen.getByText('scenarioOverrides.testLink')).toBeTruthy();
  });

  it('hides the test link once the active override is turned off, and it\'s absent for a never-enabled department', async () => {
    mockGetDepartmentScenario.mockResolvedValueOnce({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: '',
      enabled: false,
      updatedAt: null,
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    await screen.findByLabelText('scenarioOverrides.editor.label');

    expect(screen.queryByText('scenarioOverrides.testLink')).toBeNull();
  });

  it('keeps Save disabled with no unsaved changes, but enables it on a text edit alone — saving and testing are separate actions', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Default scenario text',
      enabled: false,
      updatedAt: null,
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    await screen.findByLabelText('scenarioOverrides.editor.label');

    const saveButton = screen.getByRole('button', { name: 'scenarioOverrides.buttons.save' });
    // Nothing changed yet since load — no draft to persist.
    expect(saveButton.disabled).toBe(true);

    // A text edit alone is enough — Save doesn't require the "use this
    // scenario for testing" checkbox to be checked. You can save a draft
    // now and enable it for testing later (or never).
    fireEvent.change(screen.getByLabelText('scenarioOverrides.editor.label'), {
      target: { value: 'Edited text' },
    });
    expect(saveButton.disabled).toBe(false);
  });

  it('loads one department at a time, and names its section by that department', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: '',
      enabled: false,
      updatedAt: null,
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');

    const textarea = await screen.findByLabelText('scenarioOverrides.editor.label');
    expect(textarea).toBeTruthy();
    expect(textarea.getAttribute('aria-describedby')).toBeNull();

    // The editing section is named by an h2 (AAFC-AAC) via
    // aria-labelledby, not left as an unlabeled landmark.
    const heading = screen.getByRole('heading', { level: 2, name: 'AAFC-AAC' });
    const section = heading.closest('section');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
  });

  it('only renders the diff disclosure when the edited text actually differs from the default', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Same text',
      overrideText: 'Same text',
      enabled: false,
      updatedAt: null,
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    await screen.findByLabelText('scenarioOverrides.editor.label');

    expect(screen.queryByText('scenarioOverrides.diff.heading')).toBeNull();

    const textarea = screen.getByLabelText('scenarioOverrides.editor.label');
    fireEvent.change(textarea, { target: { value: 'Different text' } });

    expect(screen.getByText('scenarioOverrides.diff.heading')).toBeTruthy();
  });

  it('ties a failed save to the textarea via aria-describedby, and shows a test link after a successful enabled save', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Default scenario text',
      enabled: false,
      updatedAt: null,
    });
    mockSaveOverride.mockRejectedValueOnce(new Error('save failed'));

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    const textarea = await screen.findByLabelText('scenarioOverrides.editor.label');
    fireEvent.change(textarea, { target: { value: 'Edited text' } });
    // Save stays disabled until "use this scenario for testing" is checked
    // — this page never saves a draft that isn't also opted into testing.
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'scenarioOverrides.buttons.save' }));

    const errorNode = await screen.findByRole('alert');
    expect(errorNode.id).toBe('scenario-save-status');
    expect(textarea.getAttribute('aria-describedby')).toBe('scenario-save-status');

    // No test link on a failed save.
    expect(screen.queryByText('scenarioOverrides.testLink')).toBeNull();

    mockSaveOverride.mockResolvedValueOnce({
      departmentKey: 'AAFC-AAC',
      overrideText: 'Edited text',
      enabled: true,
      updatedAt: new Date().toISOString(),
    });
    fireEvent.change(textarea, { target: { value: 'Edited text again' } });
    fireEvent.click(screen.getByRole('button', { name: 'scenarioOverrides.buttons.save' }));

    await waitFor(() => {
      expect(screen.getByText('scenarioOverrides.testLink')).toBeTruthy();
    });
  });

  it('clears a stale save-outcome message on a click anywhere else on the page, not just on the next explicit action', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Default scenario text',
      enabled: false,
      updatedAt: null,
    });
    mockSaveOverride.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      overrideText: 'Edited text',
      enabled: true,
      updatedAt: new Date().toISOString(),
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    const textarea = await screen.findByLabelText('scenarioOverrides.editor.label');
    fireEvent.change(textarea, { target: { value: 'Edited text' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'scenarioOverrides.buttons.save' }));

    await screen.findByText('scenarioOverrides.status.saveSuccess');

    // Clicking the department heading isn't one of the explicit
    // save/revert/copy/checkbox/textarea handlers that already clear this —
    // it's the general "click elsewhere on the page" catch-all being
    // exercised.
    fireEvent.click(screen.getByRole('heading', { level: 2, name: 'AAFC-AAC' }));

    expect(screen.queryByText('scenarioOverrides.status.saveSuccess')).toBeNull();
  });

  it('shows a full-page loading overlay while saving, and keeps the Save button\'s own label static', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Default scenario text',
      enabled: false,
      updatedAt: null,
    });
    let resolveSave;
    mockSaveOverride.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    const textarea = await screen.findByLabelText('scenarioOverrides.editor.label');
    fireEvent.change(textarea, { target: { value: 'Edited text' } });

    const saveButton = screen.getByRole('button', { name: 'scenarioOverrides.buttons.save' });
    fireEvent.click(saveButton);

    // The overlay carries the "in progress" message now — the button's own
    // label doesn't swap to it any more (see the comment above these
    // buttons in ScenarioOverridesPage.js), since everything on the page is
    // already disabled for the same duration and a second signal on the
    // (now-covered) button would just be redundant.
    const overlay = await screen.findByText('scenarioOverrides.status.saving');
    expect(overlay.closest('[role="status"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'scenarioOverrides.buttons.save' })).toBeTruthy();

    resolveSave({
      departmentKey: 'AAFC-AAC',
      overrideText: 'Edited text',
      enabled: false,
      updatedAt: new Date().toISOString(),
    });
    await waitFor(() => {
      expect(screen.queryByText('scenarioOverrides.status.saving')).toBeNull();
    });
  });

  it('sends departmentKey/overrideText/enabled on save (no separate autosave path)', async () => {
    mockGetDepartmentScenario.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Default scenario text',
      enabled: false,
      updatedAt: null,
    });
    mockSaveOverride.mockResolvedValue({
      departmentKey: 'AAFC-AAC',
      overrideText: 'Default scenario text',
      enabled: true,
      updatedAt: new Date().toISOString(),
    });

    renderWithRouter(<ScenarioOverridesPage lang="en" />);
    await selectDepartment('AAFC-AAC');
    const textarea = await screen.findByLabelText('scenarioOverrides.editor.label');
    // Checking "use this scenario for testing" is rejected without an edit
    // this session — a no-op (same-value) change isn't reliable here (React
    // can skip firing onChange when a controlled input's value doesn't
    // actually change), so edit to a genuinely different value.
    fireEvent.change(textarea, { target: { value: 'Edited text for save test' } });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    // Toggling the checkbox alone must not trigger a save when there's an
    // unsaved text edit pending (updatedAt is still null here — nothing's
    // ever been saved for this department) — only the explicit Save button
    // does (SC 3.2.2: no unreviewed autosave of new/edited text into the
    // live production system prompt). Once a scenario is already saved and
    // reviewed, toggling the checkbox alone *does* apply/un-apply it
    // immediately — see the "already-active department" tests above; that's
    // just re-flipping enabled on already-saved text, not autosaving new
    // content.
    expect(mockSaveOverride).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'scenarioOverrides.buttons.save' }));

    await waitFor(() => {
      expect(mockSaveOverride).toHaveBeenCalledWith({
        departmentKey: 'AAFC-AAC',
        overrideText: 'Edited text for save test',
        enabled: true,
        expectedUpdatedAt: null,
      });
    });
  });

  describe('Revert', () => {
    const loadedDepartment = () => ({
      departmentKey: 'AAFC-AAC',
      defaultText: 'Default scenario text',
      overrideText: 'Custom edited text',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    afterEach(() => {
      mockDeleteOverride.mockReset();
      vi.restoreAllMocks();
    });

    it('is disabled until something has actually been saved for this department', async () => {
      mockGetDepartmentScenario.mockResolvedValue({
        departmentKey: 'AAFC-AAC',
        defaultText: 'Default scenario text',
        overrideText: '',
        enabled: false,
        updatedAt: null,
      });

      renderWithRouter(<ScenarioOverridesPage lang="en" />);
      await selectDepartment('AAFC-AAC');
      await screen.findByLabelText('scenarioOverrides.editor.label');

      const revertButton = screen.getByRole('button', { name: 'scenarioOverrides.buttons.revert' });
      expect(revertButton.disabled).toBe(true);
    });

    it('does nothing without confirmation, and deletes the saved override once confirmed', async () => {
      mockGetDepartmentScenario.mockResolvedValue(loadedDepartment());
      renderWithRouter(<ScenarioOverridesPage lang="en" />);
      await selectDepartment('AAFC-AAC');
      const textarea = await screen.findByLabelText('scenarioOverrides.editor.label');

      const revertButton = screen.getByRole('button', { name: 'scenarioOverrides.buttons.revert' });

      // Declined: nothing happens.
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      fireEvent.click(revertButton);
      expect(mockDeleteOverride).not.toHaveBeenCalled();

      // Confirmed: deletes, and resets the field back to the default text.
      mockDeleteOverride.mockResolvedValueOnce(undefined);
      vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
      fireEvent.click(revertButton);

      await waitFor(() => {
        expect(mockDeleteOverride).toHaveBeenCalledWith('AAFC-AAC');
      });
      expect(textarea.value).toBe('Default scenario text');
      expect(screen.getByRole('checkbox').checked).toBe(false);
      expect(await screen.findByText('scenarioOverrides.status.revertSuccess')).toBeTruthy();
    });
  });
});
