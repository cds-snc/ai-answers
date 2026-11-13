import { useRef, useState } from 'react';
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
    // True while the message shown is a failed table load.
    const showingLoadErrorRef = useRef(false);
    const report = (text, { isError = false, focus = false } = {}) => {
        showingLoadErrorRef.current = false;
        setMovesFocus(focus);
        status.announce(text, { isError });
        if (focus) setFocusCount(n => n + 1);
    };
    // For ExperimentalServerDataTable's onError: shows a failed load once,
    // and clears it when a later load works. A row outcome is left alone.
    const reportLoad = (error, errorText) => {
        if (error) {
            if (showingLoadErrorRef.current) return;
            report(errorText, { isError: true });
            showingLoadErrorRef.current = true;
        } else if (showingLoadErrorRef.current) {
            showingLoadErrorRef.current = false;
            status.clear();
        }
    };
    return { ...status, ref, movesFocus, report, reportLoad };
}
