import React, { useState, useEffect } from 'react';
import { GcdsLink } from '@gcds-core/components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import UserService from '../../services/UserService.js';

const AdminNotifications = ({ lang = 'en' }) => {
    const { t } = useTranslations(lang);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let didCancel = false;

        const fetchStats = async () => {
            try {
                const data = await UserService.getStats();
                if (!didCancel) {
                    setStats(data);
                    setLoading(false);
                }
            } catch (err) {
                if (!didCancel) {
                    console.error('Error fetching user stats:', err);
                    setError(err.message);
                    setLoading(false);
                }
            }
        };

        fetchStats();
        return () => { didCancel = true; };
    }, []);

    // Don't show anything if loading or error or no items to show
    if (loading || error) return null;
    if (!stats || (stats.newInactiveCount === 0 && stats.totalInactiveCount === 0)) {
        return null;
    }

    return (
        // role="status" aria-live="polite": this content only exists once the
        // getStats() fetch above resolves, genuinely appearing after mount,
        // not present at initial paint — same "changing/appearing" category
        // as StatusMessage, just with its own bespoke layout (stat list +
        // action link) that doesn't map onto StatusMessage's single-message/
        // children shape, so it keeps this custom markup and just gets the
        // same aria wiring directly. polite, not assertive: these are
        // routine pending-account counts (api/user/user-stats.js's only two
        // fields), not an urgent failure. See
        // docs/coding-agent-docs/status-and-error-messaging.md.
        <section
            className="admin-notifications mb-400"
            aria-label={t('admin.notifications.ariaLabel', 'User notifications')}
            role="status"
            aria-live="polite"
        >
            <div className="admin-notifications-panel">
                <div className="admin-notifications-heading">
                    <span className="gcds-icon fa fa-solid fa-exclamation-circle admin-notifications-icon" aria-hidden="true"></span>
                    <h2 className="admin-notifications-title">
                        {t('admin.notifications.title', 'User notifications')}
                    </h2>
                </div>
                {/* role="list": Safari/VoiceOver computes the list/listitem
                    a11y roles from list-style, and .admin-notifications-list
                    sets list-style: none - without this override, VoiceOver
                    users on Safari get no list semantics at all. */}
                <ul className="admin-notifications-list" role="list">
                    {stats.newInactiveCount > 0 && (
                        <li className="admin-notifications-item admin-notifications-item--warning">
                            <span className="admin-notifications-count">{stats.newInactiveCount}</span>
                            <span className="admin-notifications-label font-size-text-sm-nr">
                                {t('admin.notifications.newInactive', 'new user(s) awaiting activation (last 7 days)')}
                            </span>
                        </li>
                    )}
                    {stats.totalInactiveCount > 0 && (
                        <li className="admin-notifications-item">
                            <span className="admin-notifications-count">{stats.totalInactiveCount}</span>
                            <span className="admin-notifications-label font-size-text-sm-nr">
                                {t('admin.notifications.totalInactive', 'total inactive user(s)')}
                            </span>
                        </li>
                    )}
                </ul>
                {/* TODO: each stat row above would be more useful as its own
                    link, deep-linking into UsersPage.js pre-filtered to that
                    stat, instead of one generic link to the unfiltered
                    table. Not a quick change: UsersPage.js has zero
                    useSearchParams/query-param support today, so this needs
                    real work there first, not just an href here.
                    - "total inactive": plausible - the Status column
                      already has a filter dropdown (active/inactive), just
                      not wired to a URL param yet.
                    - "new" (last 7 days): no filter mechanism exists to
                      link into at all - the createdAt column
                      (~line 250 in UsersPage.js) is a plain display column,
                      no filter type, no date-range/"last 7 days" concept.
                      Would need a new column filter built there first. */}
                <GcdsLink href={getPath('users', lang)} className="admin-notifications-action font-size-text-sm-nr">
                    {t('admin.notifications.viewUsers', 'View and manage users')}
                </GcdsLink>
            </div>
        </section>
    );
};

export default AdminNotifications;
