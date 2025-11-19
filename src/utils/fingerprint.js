// Deterministic browser fingerprint utility
// - computeFingerprint() performs an async SHA-256 over a few stable attributes + canvas hash
// - initFingerprint() should be called at app startup to compute and cache the value
// - getFingerprint() is synchronous and returns a cached value (or a stable localStorage fallback)

let _cachedFp = null;
const STORAGE_KEY = 'aiAnswers.fp';

async function canvasHash() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('fp', 2, 15);
        const data = canvas.toDataURL();
        const encoded = new TextEncoder().encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        return '';
    }
}

async function computeFingerprint() {
    try {
        const parts = [
            navigator.userAgent || '',
            // userAgentData contains structured client hints when available
            (navigator.userAgentData ? JSON.stringify(navigator.userAgentData) : ''),
            navigator.language || '',
            // languages is often an array of preferred languages
            (navigator.languages ? navigator.languages.join(',') : ''),
            navigator.platform || '',
            // screen characteristics
            String(screen?.width || ''),
            String(screen?.height || ''),
            String(screen?.colorDepth || ''),
            String(screen?.availWidth || ''),
            String(screen?.availHeight || ''),
            // timezone name (more specific than offset) when available
            (typeof Intl !== 'undefined' && Intl.DateTimeFormat ? (Intl.DateTimeFormat().resolvedOptions().timeZone || '') : ''),
            // keep timezone offset (minutes) for environments where name may be absent
            String(new Date().getTimezoneOffset() || ''),
            // additional navigator properties useful for uniqueness
            String(navigator.hardwareConcurrency || ''),
            String(navigator.deviceMemory || ''),
            String(navigator.maxTouchPoints || ''),
            navigator.vendor || '',
            navigator.product || '',
            String(navigator.cookieEnabled || ''),
            String(navigator.doNotTrack || ''),
            String(navigator.webdriver || ''),
        ];
        const cHash = await canvasHash();
        // include canvas fingerprint last
        parts.push(cHash);
        const payload = parts.join('||');
        const encoded = new TextEncoder().encode(payload);
        const digest = await crypto.subtle.digest('SHA-256', encoded);
        const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        try { localStorage.setItem(STORAGE_KEY, hex); } catch (e) { /* ignore */ }
        return hex;
    } catch (e) {
        // fallback stable-ish id
        const uid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('fp-' + Math.random().toString(36).slice(2, 10));
        try { localStorage.setItem(STORAGE_KEY, uid); } catch (e) { /* ignore */ }
        return uid;
    }
}

// Call once at app startup to populate the cached fingerprint
export async function initFingerprint() {
    if (_cachedFp) return _cachedFp;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            _cachedFp = stored;
            // compute in background to refresh if needed
            computeFingerprint().then((v) => { if (v) _cachedFp = v; }).catch(() => { });
            return _cachedFp;
        }
    } catch (e) {
        // ignore
    }
    _cachedFp = await computeFingerprint();
    return _cachedFp;
}

// Async getter: ensures fingerprint is initialized and returns it.
// Callers should `await getFingerprint()`; this will return the cached
// deterministic fingerprint if available or block until initFingerprint
// completes and returns a stable id.
export async function getFingerprint() {
    try {
        if (_cachedFp) return _cachedFp;
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            _cachedFp = stored;
            // refresh in background
            computeFingerprint().then((v) => { if (v) _cachedFp = v; }).catch(() => { });
            return _cachedFp;
        }
    } catch (e) {
        // ignore
    }

    // Ensure initialization runs and return the computed value.
    _cachedFp = await initFingerprint();
    return _cachedFp;
}
