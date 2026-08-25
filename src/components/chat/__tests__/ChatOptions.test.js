/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatOptions from '../ChatOptions.js';

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));

vi.mock('../../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsIcon: ({ name }) => <span data-icon={name} />,
  GcdsButton: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

const t = (key) => {
  const strings = {
    'homepage.chat.options.title': 'Evaluation options',
    'homepage.chat.options.workflow.label': 'Workflow:',
    'homepage.chat.options.model.label': 'Model family:',
    'homepage.chat.options.useSystemSettings': 'Use system settings',
    'homepage.chat.options.referringUrl.label': 'Referring Canada.ca URL (optional)',
    'homepage.chat.options.referringUrl.error': 'Enter a full URL, starting with https:// or http://',
    'homepage.chat.options.referringUrl.applyLabel': 'Apply URL',
    'homepage.chat.options.referringUrl.clearLabel': 'Clear URL',
    'homepage.chat.options.referringUrl.removedAnnouncement': 'Referring URL removed',
    'homepage.chat.options.referringUrl.appliedAnnouncement': 'Referring URL applied',
  };
  return strings[key] || key;
};

const renderOptions = (props = {}) => {
  const handleReferringUrlChange = vi.fn();
  const handleWorkflowChange = vi.fn();
  const handleAIToggle = vi.fn();
  const utils = render(
    <ChatOptions
      safeT={t}
      modelSelection=""
      handleAIToggle={handleAIToggle}
      workflowSelection=""
      handleWorkflowChange={handleWorkflowChange}
      referringUrl=""
      handleReferringUrlChange={handleReferringUrlChange}
      {...props}
    />
  );
  return { ...utils, handleReferringUrlChange, handleWorkflowChange, handleAIToggle };
};

const applyButton = () => screen.getByRole('button', { name: 'Apply URL' });
const urlInput = () => screen.getByLabelText(/Referring Canada.ca URL/);

describe('ChatOptions — referring URL explicit apply flow', () => {
  afterEach(() => {
    cleanup();
    mockUseAuth.mockReset();
  });

  it('renders nothing for a signed-out/unprivileged user', () => {
    mockUseAuth.mockReturnValue({ currentUser: null });
    renderOptions();
    expect(screen.queryByText('Options')).toBeNull();
  });

  it('does not apply on typing alone — only once Apply is clicked', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    const { handleReferringUrlChange } = renderOptions();

    fireEvent.change(urlInput(), { target: { value: 'https://www.canada.ca/en/services.html' } });
    expect(handleReferringUrlChange).not.toHaveBeenCalled();

    fireEvent.click(applyButton());
    expect(handleReferringUrlChange).toHaveBeenCalledWith({
      target: { value: 'https://www.canada.ca/en/services.html' },
    });
  });

  it('also applies on Enter (native form submit), not just the button', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    const { handleReferringUrlChange } = renderOptions();

    const input = urlInput();
    fireEvent.change(input, { target: { value: 'https://www.canada.ca/fr.html' } });
    fireEvent.submit(input.closest('form'));

    expect(handleReferringUrlChange).toHaveBeenCalledWith({ target: { value: 'https://www.canada.ca/fr.html' } });
  });

  it('rejects a malformed URL, shows the inline error, and moves focus to it', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    const { handleReferringUrlChange } = renderOptions();

    fireEvent.change(urlInput(), { target: { value: 'not a url' } });
    fireEvent.click(applyButton());

    expect(handleReferringUrlChange).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Enter a full URL/);
    // Explicit-submit failure: this is the standard focus-the-error pattern
    // (matching Settings' Save/DatabasePage's Import), unlike an implicit
    // trigger which shouldn't steal focus.
    expect(document.activeElement).toBe(alert);
  });

  it('does not error while typing, before Apply is pressed', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    renderOptions();

    fireEvent.change(urlInput(), { target: { value: 'not a url' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('normalizes untrimmed whitespace in the box once applied', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    renderOptions();

    fireEvent.change(urlInput(), { target: { value: '  https://www.canada.ca/fr.html  ' } });
    fireEvent.click(applyButton());

    expect(urlInput().value).toBe('https://www.canada.ca/fr.html');
  });

  it('does not let an external referringUrl change overwrite an in-progress edit', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    const { rerender } = renderOptions({ referringUrl: 'https://www.canada.ca/en.html' });

    const input = urlInput();
    input.focus();
    fireEvent.change(input, { target: { value: 'https://www.canada.ca/still-typing' } });

    // Parent's referringUrl changes externally (e.g. initialReferringUrl
    // resolving async in review mode) while the field is still focused.
    rerender(
      <ChatOptions
        safeT={t}
        modelSelection=""
        handleAIToggle={vi.fn()}
        workflowSelection=""
        handleWorkflowChange={vi.fn()}
        referringUrl="https://www.canada.ca/external-change"
        handleReferringUrlChange={vi.fn()}
      />
    );

    expect(input.value).toBe('https://www.canada.ca/still-typing');
  });

  it('treats an empty draft as valid (clears the override) instead of erroring', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    const { handleReferringUrlChange } = renderOptions({ referringUrl: 'https://www.canada.ca/en.html' });

    fireEvent.change(urlInput(), { target: { value: '' } });
    fireEvent.click(applyButton());

    expect(handleReferringUrlChange).toHaveBeenCalledWith({ target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces a successful apply to screen readers, not just validation errors', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    renderOptions();

    fireEvent.change(urlInput(), { target: { value: 'https://www.canada.ca/en/services.html' } });
    fireEvent.click(applyButton());

    expect(screen.getByText('Referring URL applied')).toBeTruthy();
  });

  it('disables Apply until the draft actually differs from the applied value', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    renderOptions({ referringUrl: 'https://www.canada.ca/en.html' });

    expect(applyButton().disabled).toBe(true);

    fireEvent.change(urlInput(), { target: { value: 'https://www.canada.ca/fr.html' } });
    expect(applyButton().disabled).toBe(false);
  });

  it('keeps the clear button mounted but disabled when no URL is applied', () => {
    // Stays mounted (not conditionally rendered) so it never unmounts —
    // GcdsButton uses aria-disabled, not native disabled, so this doesn't
    // pull it out of the tab order or force a focus jump the way hiding it
    // entirely would on every Clear click.
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });
    renderOptions();

    const clearButton = screen.queryByRole('button', { name: 'Clear URL' });
    expect(clearButton).not.toBeNull();
    expect(clearButton.disabled).toBe(true);
  });

  it('shows the clear button once a URL is actually applied, and clears it', async () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'partner' } });

    const { handleReferringUrlChange } = renderOptions({ referringUrl: 'https://www.canada.ca/en.html' });
    const clearButton = screen.getByRole('button', { name: 'Clear URL' });
    expect(clearButton.getAttribute('buttonRole')).toBe('secondary');

    fireEvent.click(clearButton);
    expect(handleReferringUrlChange).toHaveBeenCalledWith({ target: { value: '' } });
    expect(screen.getByText('Referring URL removed')).toBeTruthy();

    // Focus lands back in the input on the next frame, not synchronously.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(urlInput());
  });

  it('Workflow and Model apply live on change, with no draft/Apply step', () => {
    mockUseAuth.mockReturnValue({ currentUser: { role: 'admin' } });
    // The select is controlled by the (unchanged, since these mocks don't
    // update any state) workflowSelection/modelSelection props, so its DOM
    // value snaps back after React re-renders — capture the value at the
    // moment of the change event instead of reading the target afterward.
    let capturedWorkflow, capturedModel;
    const handleWorkflowChange = vi.fn((e) => { capturedWorkflow = e.target.value; });
    const handleAIToggle = vi.fn((e) => { capturedModel = e.target.value; });
    renderOptions({ handleWorkflowChange, handleAIToggle });

    fireEvent.change(screen.getByLabelText('Workflow:'), { target: { value: 'GenericGraph' } });
    fireEvent.change(screen.getByLabelText('Model family:'), { target: { value: 'azure' } });

    expect(handleWorkflowChange).toHaveBeenCalledTimes(1);
    expect(capturedWorkflow).toBe('GenericGraph');
    expect(handleAIToggle).toHaveBeenCalledTimes(1);
    expect(capturedModel).toBe('azure');
  });
});
