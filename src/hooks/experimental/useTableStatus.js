import { useState } from 'react';
import { useRepeatableStatus } from '../../components/admin/StatusMessage.js';
import { useFocusOnChange } from '../useFocusOnChange.js';

// Outcome of a row button in an experimental table, shown above that table.
// An action that rebuilds the table (or closes the panel) takes its button
// with it, so pass `focus: true` to move focus onto the message instead.
export function useTableStatus() {
    const status = useRepeatableStatus();
    const [focusCount, setFocusCount] = useState(0);
    const [movesFocus, setMovesFocus] = useState(false);
    const ref = useFocusOnChange(focusCount);
    const report = (text, { isError = false, focus = false } = {}) => {
        setMovesFocus(focus);
        status.announce(text, { isError });
        if (focus) setFocusCount(n => n + 1);
    };
    return { ...status, ref, movesFocus, report };
}
