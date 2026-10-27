import React, { useState, useEffect } from 'react';
import { GcdsIcon, GcdsLink } from '@gcds-core/components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import UserService from '../../services/UserService.js';
import { formatNumber, isSingular } from '../../utils/numberFormat.js';

const AdminNotifications = ({ lang = 'en' }) => {
    const { t } = useTranslations(lang);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // TODO: make this dynamic. Counts load once on mount, so an assignment or
    // signup from another session doesn't show until reload. Re-fetch on an
    // interval while the tab is visible and on visibilitychange, render each
    // box as a StatusMessage info box so changes announce through
    // liveAnnouncer.js (only when the text changes), then drop the
    // hand-rolled role="status" region below.
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

    // Admin-only fields are absent for partners (api/user/user-stats.js)
    const hasUserNotifications = stats && (stats.newInactiveCount > 0 || stats.totalInactiveCount > 0);
    const hasAssignedNotifications = stats && stats.pendingAssignedCount > 0;
    const hasNotifications = !loading && !error && (hasUserNotifications || hasAssignedNotifications);

    // Takes both translated strings (literal t() calls, which
    // scripts/find-dead-locale-keys.cjs can see) and picks one
    const countText = (count, one, other) =>
        (isSingular(count, lang) ? one : other).replace('{count}', () => formatNumber(count, lang));

    return (
        // role="status" aria-live="polite": mounted (empty) from initial
        // render — while loading, on error, and while there's nothing to
        // show — so the counts landing here once getStats() resolves are a
        // content *change* an AT picks up, not a fresh insertion with text
        // already in it. Returning null until the fetch resolved (the old
        // behaviour) is exactly the populated-on-insertion failure mode
        // src/utils/liveAnnouncer.js's own doc comment warns about — this
        // is the hand-rolled-markup equivalent, since the boxes' link-list
        // layout doesn't map onto StatusMessage's single-message/children
        // shape. polite, not assertive: these are routine pending-review/
        // pending-account counts (api/user/user-stats.js), not an urgent
        // failure. admin-notifications--empty zeroes the margin so an empty
        // region doesn't leave a visible gap — same purpose as
        // StatusMessage's status-message--empty. See
        // docs/coding-agent-docs/status-and-error-messaging.md.
        <section
            className={`admin-notifications${hasNotifications ? ' mb-400' : ' admin-notifications--empty'}`}
            aria-label={t('admin.notifications.ariaLabel')}
            role="status"
            aria-live="polite"
        >
            {hasAssignedNotifications && (
                <div className="admin-notifications-panel">
                    <div className="admin-notifications-heading">
                        {/* Same icon as StatusMessage's info variant */}
                        <GcdsIcon name="info-circle" className="admin-notifications-icon" />
                        <h2 className="admin-notifications-title">{t('admin.notifications.assignedHeading')}</h2>
                    </div>
                    <ul className="admin-notifications-list">
                        <li>
                            {/* ?show=pending is read by AccountPage.js, which filters its
                                assigned-questions table to the rows this counts */}
                            <GcdsLink href={`${getPath('account', lang)}?show=pending`} className="font-size-text-sm-nr">
                                {countText(stats.pendingAssignedCount, t('admin.notifications.pendingAssignedOne'), t('admin.notifications.pendingAssignedOther'))}
                            </GcdsLink>
                        </li>
                    </ul>
                </div>
            )}
            {hasUserNotifications && (
                <div className="admin-notifications-panel">
                    <div className="admin-notifications-heading">
                        <GcdsIcon name="info-circle" className="admin-notifications-icon" />
                        <h2 className="admin-notifications-title">{t('admin.notifications.accountsHeading')}</h2>
                    </div>
                    {/* ?show= is read by UsersPage.js, which filters to the
                        same rows these counts measure (api/user/user-stats.js) */}
                    <ul className="admin-notifications-list">
                        {stats.newInactiveCount > 0 && (
                            <li>
                                <GcdsLink href={`${getPath('users', lang)}?show=new`} className="font-size-text-sm-nr">
                                    {countText(stats.newInactiveCount, t('admin.notifications.newInactiveOne'), t('admin.notifications.newInactiveOther'))}
                                </GcdsLink>
                            </li>
                        )}
                        {stats.totalInactiveCount > 0 && (
                            <li>
                                <GcdsLink href={`${getPath('users', lang)}?show=inactive`} className="font-size-text-sm-nr">
                                    {countText(stats.totalInactiveCount, t('admin.notifications.totalInactiveOne'), t('admin.notifications.totalInactiveOther'))}
                                </GcdsLink>
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </section>
    );
};

export default AdminNotifications;
