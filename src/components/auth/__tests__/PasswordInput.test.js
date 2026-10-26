/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PasswordInput from '../PasswordInput.js';

const renderInput = (props) => render(
  <PasswordInput id="password" name="password" label="Password" value="" onChange={() => {}} {...props} />
);

describe('PasswordInput', () => {
  afterEach(cleanup);

  it('links the hint to the field so it is read with it (SC 3.3.2)', () => {
    renderInput({ hint: 'At least 8 characters' });
    const input = document.getElementById('password');
    expect(input.getAttribute('aria-describedby')).toBe('password-hint');
    expect(screen.getByText('At least 8 characters').id).toBe('password-hint');
  });

  it('reads the hint first, then the error the page passes in', () => {
    renderInput({ hint: 'At least 8 characters', ariaDescribedBy: 'signup-error' });
    expect(document.getElementById('password').getAttribute('aria-describedby')).toBe('password-hint signup-error');
  });

  it('adds no hint and no describedby when given neither', () => {
    renderInput({});
    expect(document.getElementById('password').hasAttribute('aria-describedby')).toBe(false);
    expect(document.getElementById('password-hint')).toBeNull();
  });
});
