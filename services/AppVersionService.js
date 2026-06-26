const normalizeVersion = (value) => {
    const version = String(value || '').trim();
    return version || null;
};

export const getAppVersion = () => (
    normalizeVersion(process.env.APP_VERSION)
    || normalizeVersion(process.env.npm_package_version)
    || 'unknown'
);

export const getPersistedAppVersion = () => {
    const version = getAppVersion();
    return version === 'unknown' ? '' : version;
};
