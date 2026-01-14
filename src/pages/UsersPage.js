import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { GcdsButton, GcdsLink, GcdsText } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import UserService from '../services/UserService.js';
import { useAuth } from '../contexts/AuthContext.js';
import { usePageContext } from '../hooks/usePageParam.js';

DataTable.use(DT);

const roleOptions = [
  { value: 'admin', label: 'Admin', sortIndex: 0 },
  { value: 'partner', label: 'Partner', sortIndex: 1 },
];
const statusOptions = [
  { value: true, label: 'Active', sortIndex: 0 },
  { value: false, label: 'Inactive', sortIndex: 1 },
];
const NA_LABEL = 'N/A';

// Helper to normalize role values (handles bad data like uppercase 'User' or 'ADMIN')
const normalizeRole = (role) => {
  if (!role) return '';
  return String(role).toLowerCase();
};

// Convert truthy-ish values into booleans, otherwise null for unknowns
const toBooleanish = (value) => {
  if (typeof value === 'string') {
    const cleaned = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(cleaned)) return true;
    if (['false', '0', 'no', 'n'].includes(cleaned)) return false;
    return null;
  }
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
};

const UsersPage = ({ lang }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();
  const [users, setUsers] = useState([]);
  // Use a ref to store edit states persistently between DataTable renders
  const editStatesRef = useRef({});
  // This state is just used to trigger re-renders when editStatesRef changes
  // eslint-disable-next-line no-unused-vars
  const [triggerRender, setTriggerRender] = useState(0);
  const { currentUser } = useAuth();

  // Initialize editStates with data from users
  useEffect(() => {
    if (users.length > 0 && Object.keys(editStatesRef.current).length === 0) {
      users.forEach(user => {
        editStatesRef.current[user._id] = {
          role: user.role,
          active: user.active,
          changed: false
        };
      });
      // Force a re-render to reflect the initial values
      setTriggerRender(prev => prev + 1);
    }
  }, [users]);

  const handleFieldChange = (userId, field, value) => {
    // Update the ref directly for change tracking
    if (!editStatesRef.current[userId]) {
      const matchingUser = users.find(u => u._id === userId);
      editStatesRef.current[userId] = {
        role: matchingUser?.role || '',
        active: matchingUser?.active || false
      };
    }
    editStatesRef.current[userId][field] = value;
    editStatesRef.current[userId].changed = true;

    // Update the users state so DataTable re-renders and re-indexes
    setUsers(prevUsers => prevUsers.map(u =>
      u._id === userId ? { ...u, [field]: value } : u
    ));

    // Trigger render is handled by setUsers now, but we keep it for safety if needed
    setTriggerRender(prev => prev + 1);
  };

  const handleSave = async (userId) => {
    const edit = editStatesRef.current[userId];
    console.log('Save clicked, current state:', {
      userId,
      edit,
      allStates: { ...editStatesRef.current }
    });

    if (!edit || !edit.changed) {
      console.log('No changes to save');
      return;
    }

    try {
      const updatedUser = await UserService.update(userId, {
        active: edit.active,
        role: edit.role
      });

      // Update users array
      setUsers(prevUsers => prevUsers.map(u => u._id === userId ? updatedUser : u));
      // Update ref
      editStatesRef.current[userId].changed = false;
      // Force re-render
      setTriggerRender(prev => prev + 1);
      console.log('Save successful, changes:', edit);
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };
  const handleDelete = async (userId) => {
    // Check if user has admin role
    if (currentUser?.role !== 'admin') {
      alert(t('users.actions.adminOnly', 'Only administrators can delete users'));
      return;
    }

    if (!window.confirm(t('users.actions.confirmDelete'))) return;

    try {
      await UserService.delete(userId);

      // Remove from users array
      setUsers(prevUsers => prevUsers.filter(u => u._id !== userId));
      // Remove from ref
      delete editStatesRef.current[userId];
      // Force re-render
      setTriggerRender(prev => prev + 1);
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  useEffect(() => {
    let didCancel = false;

    const fetchUsers = async () => {
      try {
        const data = await UserService.getAll();
        if (!didCancel) {
          // Normalize role casing and coerce active flags for consistent sorting
          const sanitized = data.map(user => ({
            ...user,
            role: normalizeRole(user.role),
            active: toBooleanish(user.active),
          }));
          setUsers(sanitized);
        }
      } catch (error) {
        if (!didCancel) {
          console.error('Error fetching users:', error);
        }
      }
    };

    fetchUsers();
    return () => { didCancel = true; };
  }, []);

  const columns = [
    { title: t('users.columns.email'), data: 'email' },
    {
      title: t('users.columns.role'),
      data: 'role',
      render: (data, type, row) => {
        const userId = row._id;
        const rawValue = editStatesRef.current[userId]?.role ?? data;
        // Normalize the role value to handle bad data (e.g., 'User' vs 'user')
        const value = normalizeRole(rawValue);

        const option = roleOptions.find(opt => opt.value === value);
        // If role isn't a known option (including legacy 'user'), show N/A
        const label = option ? option.label : NA_LABEL;

        // For sorting/filtering, return a consistent sortable value
        if (type === 'sort' || type === 'type') {
          return option ? option.sortIndex : 999; // Unknown roles sort last
        }
        if (type === 'filter') {
          return label;
        }

        if (type === 'display') {
          const optionsHtml = roleOptions.map(opt => `<option value="${opt.value}"${opt.value === value ? ' selected' : ''}>${opt.label}</option>`).join('');
          const isKnownKey = roleOptions.some(opt => opt.value === value);
          // For unknown roles (including 'user'), show N/A placeholder with empty value
          const extraOption = !isKnownKey ? `<option value="" selected>${NA_LABEL}</option>` : '';

          return `<select data-userid="${userId}" data-field="role" style="width: 100%">${extraOption}${optionsHtml}</select>`;
        }
        return label;
      }
    },
    {
      title: t('users.columns.status'),
      data: 'active',
      render: (data, type, row) => {
        const userId = row._id;
        const rawValue = editStatesRef.current[userId]?.active ?? data;
        const value = toBooleanish(rawValue);
        const option = statusOptions.find(opt => opt.value === value);
        const label = option
          ? t('users.status.' + (value ? 'active' : 'inactive'))
          : (rawValue !== undefined && rawValue !== null ? String(rawValue) : NA_LABEL);

        // For sorting, return a consistent sortable value (Active=0, Inactive=1)
        if (type === 'sort' || type === 'type') {
          return option ? option.sortIndex : 999;
        }
        if (type === 'filter') {
          return label;
        }

        if (type === 'display') {
          // Only show N/A placeholder when status is unknown; otherwise show the two known options
          const placeholder = option ? '' : `<option value="" selected>${NA_LABEL}</option>`;
          const optionsHtml = statusOptions.map(opt => `<option value="${opt.value}"${opt.value === value ? ' selected' : ''}>${t('users.status.' + (opt.value ? 'active' : 'inactive'))}</option>`).join('');
          return `<select data-userid="${userId}" data-field="active" style="width: 100%">${placeholder}${optionsHtml}</select>`;
        }
        return label;
      }
    },
    {
      title: t('users.columns.createdAt'),
      data: 'createdAt',
      render: (data) => new Date(data).toLocaleDateString()
    },
    {
      title: t('users.columns.actions'),
      data: null,
      defaultContent: '',
    },
  ];
  return (
    <div className="container mt-4">
      <h1>{t('users.title')}</h1>

      <nav className="mb-400">
        <GcdsText>
          <GcdsLink href={`/${language}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>

      <DataTable
        data={users}
        columns={columns}
        options={{
          rowId: '_id',
          paging: true,
          searching: true,
          ordering: true,
          order: [[3, 'desc']],
          createdRow: (row, data) => {
            // Attach select change handlers
            row.querySelectorAll('select').forEach(select => {
              select.onchange = async () => {
                const userId = select.getAttribute('data-userid');
                const field = select.getAttribute('data-field');
                let value = select.value;
                if (field === 'active') {
                  value = toBooleanish(value);
                }
                handleFieldChange(userId, field, value);
                try {
                  await handleSave(userId);
                } catch (err) {
                  console.error('Autosave failed:', err);
                }
              };
            });

            // Render Save and Delete buttons
            const actionsCell = row.querySelector('td:last-child');
            actionsCell.innerHTML = '';
            const root = createRoot(actionsCell);
            // Render admin delete button (only admins should reach this page)
            root.render(
              <GcdsButton
                size="small"
                variant="danger"
                onClick={() => handleDelete(data._id)}
              >
                {t('users.actions.delete')}
              </GcdsButton>
            );
          },
        }}
      />
    </div>
  );
};


export default UsersPage;