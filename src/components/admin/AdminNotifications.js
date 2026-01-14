import React, { useState, useEffect } from 'react';
import { GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import UserService from '../../services/UserService.js';
import './AdminNotifications.css';

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
        <section className="admin-notifications mb-400" aria-label={t('admin.notifications.ariaLabel', 'User notifications')}>
            <div className="admin-notifications-panel">
                <h2 className="admin-notifications-title">
                    {t('admin.notifications.title', 'User Notifications')}
                </h2>
                <ul className="admin-notifications-list">
                    {stats.newInactiveCount > 0 && (
                        <li className="admin-notifications-item admin-notifications-item--warning">
                            <span className="admin-notifications-count">{stats.newInactiveCount}</span>
                            <span className="admin-notifications-label">
                                {t('admin.notifications.newInactive', 'new user(s) awaiting activation (last 7 days)')}
                            </span>
                        </li>
                    )}
                    {stats.totalInactiveCount > 0 && (
                        <li className="admin-notifications-item">
                            <span className="admin-notifications-count">{stats.totalInactiveCount}</span>
                            <span className="admin-notifications-label">
                                {t('admin.notifications.totalInactive', 'total inactive user(s)')}
                            </span>
                        </li>
                    )}
                </ul>
                <GcdsLink href={`/${lang}/users`} className="admin-notifications-action">
                    {t('admin.notifications.viewUsers', 'View and manage users')}
                </GcdsLink>
            </div>
        </section>
    );
};

export default AdminNotifications;
