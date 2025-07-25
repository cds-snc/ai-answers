import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { GcdsButton, GcdsLink, GcdsText } from '@cdssnc/gcds-components-react';
import { getApiUrl } from '../utils/apiToUrl.js';
import { useTranslations } from '../hooks/useTranslations.js';
import AuthService from '../services/AuthService.js';
import { useAuth } from '../contexts/AuthContext.js';
import { usePageContext } from '../hooks/usePageParam.js';

DataTable.use(DT);

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'partner', label: 'Partner' },
];
const statusOptions = [
  { value: true, label: 'Active' },
  { value: false, label: 'Inactive' },
];

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
    // Update the ref directly (this persists across renders)
    console.log('Before change:', { 
      userId, field, value, 
      current: editStatesRef.current[userId] 
    });
    
    if (!editStatesRef.current[userId]) {
      // Initialize if it doesn't exist yet
      const matchingUser = users.find(u => u._id === userId);
      if (matchingUser) {
        editStatesRef.current[userId] = {
          role: matchingUser.role,
          active: matchingUser.active
        };
      } else {
        editStatesRef.current[userId] = {
          role: '',
          active: false
        };
      }
    }
    
    // Update the field
    editStatesRef.current[userId][field] = value;
    editStatesRef.current[userId].changed = true;
    
    console.log('After change:', { 
      userId, field, value, 
      current: editStatesRef.current[userId],
      allStates: {...editStatesRef.current} 
    });
    
    // Force a re-render to update UI
    setTriggerRender(prev => prev + 1);
  };

  const handleSave = async (userId) => {
    const edit = editStatesRef.current[userId];
    console.log('Save clicked, current state:', { 
      userId, 
      edit,
      allStates: {...editStatesRef.current} 
    });
    
    if (!edit || !edit.changed) {
      console.log('No changes to save');
      return;
    }

    try {
      const response = await fetch(getApiUrl('db-users'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...AuthService.getAuthHeader()
        },
        body: JSON.stringify({
          userId,
          active: edit.active,
          role: edit.role
        })
      });

      if (response.ok) {
        const updatedUser = await response.json();
        // Update users array
        setUsers(prevUsers => prevUsers.map(u => u._id === userId ? updatedUser : u));
        // Update ref
        editStatesRef.current[userId].changed = false;
        // Force re-render
        setTriggerRender(prev => prev + 1);
        console.log('Save successful, changes:', edit);
      } else {
        console.error('Failed to update user');
      }
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
      const response = await fetch(getApiUrl('db-users'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...AuthService.getAuthHeader()
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        // Remove from users array
        setUsers(prevUsers => prevUsers.filter(u => u._id !== userId));
        // Remove from ref
        delete editStatesRef.current[userId];
        // Force re-render
        setTriggerRender(prev => prev + 1);
      } else {
        console.error('Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  useEffect(() => {
    let didCancel = false;
    
    const fetchUsers = async () => {
      try {
        const response = await fetch(getApiUrl('db-users'), {
          headers: AuthService.getAuthHeader()
        });
        if (!didCancel) {
          const data = await response.json();
          setUsers(data);
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
        // Use ref value or fall back to the data
        const value = editStatesRef.current[userId]?.role ?? data;
        return `<select data-userid="${userId}" data-field="role">${roleOptions.map(opt => `<option value="${opt.value}"${opt.value === value ? ' selected' : ''}>${opt.label}</option>`).join('')}</select>`;
      }
    },
    {
      title: t('users.columns.status'),
      data: 'active',
      render: (data, type, row) => {
        const userId = row._id;
        // Use ref value or fall back to the data
        const value = editStatesRef.current[userId]?.active ?? data;
        return `<select data-userid="${userId}" data-field="active">${statusOptions.map(opt => `<option value="${opt.value}"${opt.value === value ? ' selected' : ''}>${t('users.status.' + (opt.value ? 'active' : 'inactive'))}</option>`).join('')}</select>`;
      }
    },
    { 
      title: t('users.columns.createdAt'), 
      data: 'createdAt',
      render: (data) => new Date(data).toLocaleDateString()
    },
    {
      title: t('users.columns.action'),
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
          paging: true,
          searching: true,
          ordering: true,
          order: [[3, 'desc']],
          createdRow: (row, data) => {
            // Attach select change handlers
            row.querySelectorAll('select').forEach(select => {              select.onchange = () => {
                const userId = select.getAttribute('data-userid');
                const field = select.getAttribute('data-field');
                let value = select.value;
                if (field === 'active') value = value === 'true';
                handleFieldChange(userId, field, value);
              };
            });
            
            // Render Save and Delete buttons
            const actionsCell = row.querySelector('td:last-child');
            actionsCell.innerHTML = '';
            const root = createRoot(actionsCell);
              // Render admin buttons (only admins should reach this page)
            root.render(
              <>
                <GcdsButton
                  size="small"
                  variant="primary"
                  onClick={() => handleSave(data._id)}
                  
                >
                  {t('users.actions.save')}
                </GcdsButton>
                <GcdsButton
                  size="small"
                  variant="danger"
                  onClick={() => handleDelete(data._id)}
                  style={{ marginLeft: 8 }}
                >
                  {t('users.actions.delete')}
                </GcdsButton>
              </>
            );
          },
        }}
      />
    </div>
  );
};


export default UsersPage;