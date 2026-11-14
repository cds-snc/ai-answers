/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BatchScopeSelect from '../BatchScopeSelect.js';

vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));

describe('BatchScopeSelect', () => {
  afterEach(cleanup);

  it('lists My batches first and always offers All users', () => {
    render(<BatchScopeSelect id="scope" value="mine" onChange={() => {}} filters={{}} />);
    const select = screen.getByLabelText('batch.scope.label');
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(values).toEqual(['mine', 'all']);
    // No empty institution/group headings.
    expect(select.querySelectorAll('optgroup')).toHaveLength(2);
  });

  it('shows the signed-in email under My batches and not again under All batches', () => {
    render(
      <BatchScopeSelect
        id="scope"
        value="mine"
        onChange={() => {}}
        currentUser={{ userId: 'me', email: 'me@example.com' }}
        filters={{ users: [{ id: 'me', email: 'me@example.com' }, { id: 'you', email: 'you@example.com' }] }}
      />
    );
    const select = screen.getByLabelText('batch.scope.label');
    const mine = select.querySelector('option[value="mine"]');
    expect(mine.textContent).toBe('me@example.com');
    expect(mine.parentElement.getAttribute('label')).toBe('batch.scope.mine');
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(values).toEqual(['mine', 'all', 'user:you']);
  });

  it('builds scope values the server parses', () => {
    const onChange = vi.fn();
    render(
      <BatchScopeSelect
        id="scope"
        value="mine"
        onChange={onChange}
        filters={{
          institutions: ['DND-MDN'],
          groups: ['Military transitions'],
          users: [{ id: '64fec1000000000000000001', email: 'a@example.com' }],
        }}
      />
    );
    const select = screen.getByLabelText('batch.scope.label');
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(values).toEqual([
      'mine',
      'institution:DND-MDN',
      'group:Military transitions',
      'all',
      'user:64fec1000000000000000001',
    ]);
    fireEvent.change(select, { target: { value: 'all' } });
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
