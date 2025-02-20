import React, { useState } from 'react';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import AdminCodeInput from './AdminCodeInput.js';
import { getApiUrl } from '../../utils/apiToUrl.js';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import ExportService from '../../services/ExportService.js';
DataTable.use(DT);

const ChatLogsDashboard = () => {
  const [timeRange, setTimeRange] = useState('1');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  // TODO this is in plain site we need an admin module
  const correctAdminCode = 'noPII';

  const fetchLogs = async () => {
    if (adminCode !== correctAdminCode) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(getApiUrl('db-chat-logs?days=') + timeRange);
      const data = await response.json();
      console.log('API Response:', data);

      if (data.success) {
        setLogs(data.logs || []);
      } else {
        console.error('API returned error:', data.error);
        alert(data.error || 'Failed to fetch logs');
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      alert(`Failed to fetch logs: ${error.message}`);
    }
    setLoading(false);
  };

  const filename = (ext) => {
    let name = 'chat-logs-' + timeRange + '-' + new Date().toISOString();
    return name + '.' + ext;
  };

  const downloadJSON = () => {
    const json = JSON.stringify(logs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename('json');
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    ExportService.export(logs, filename('csv'));
  };

  const downloadExcel = () => {
    ExportService.export(logs, filename('xlsx'));
  };

  const handleAdminCodeChange = (e) => {
    setAdminCode(e.target.value);
  };

  return (
    <div className="space-y-6">
      <AdminCodeInput
        code={adminCode}
        onChange={handleAdminCodeChange}
        correctCode={correctAdminCode}
        label="Enter Admin Code to view chat logs:"
      />

      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-48">
          <label htmlFor="timeRange" className="block text-sm font-medium text-gray-700 mb-1">
            Time range
          </label>
          <select
            id="timeRange"
            name="timeRange"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="1">Last 1 day</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </div>

        <GcdsButton
          onClick={fetchLogs}
          disabled={loading || adminCode !== correctAdminCode}
          className="me-400 hydrated mrgn-tp-1r"
        >
          {loading ? 'Loading...' : 'Get logs'}
        </GcdsButton>

        {logs.length > 0 && adminCode === correctAdminCode && (
          <>
            <GcdsButton
              onClick={downloadJSON}
              disabled={loading}
              className="me-400 hydrated mrgn-tp-1r"
            >
              Download JSON
            </GcdsButton>

            <GcdsButton
              onClick={downloadCSV}
              disabled={loading}
              className="me-400 hydrated mrgn-tp-1r"
            >
              Download CSV
            </GcdsButton>
            <GcdsButton
              onClick={downloadExcel}
              disabled={loading}
              className="me-400 hydrated mrgn-tp-1r"
            >
              Download Excel
            </GcdsButton>
          </>
        )}
      </div>

      <div className="bg-white shadow rounded-lg">
        {loading ? (
          <div className="p-4">
            <p className="text-gray-500">Loading logs...</p>
          </div>
        ) : logs.length > 0 ? (
          <div className="p-4">
            <p className="mb-4 text-gray-600">
              Found {logs.length} chat interactions. Download the logs to see the full set and
              details.
            </p>
            <DataTable
              data={logs}
              columns={[
                { title: 'Date', data: 'createdAt', render: (data) => (data ? data : '') },
                { title: 'Chat ID', data: 'chatId', render: (data) => (data ? data : '') },
                {
                  title: 'Interactions',
                  data: 'interactions',
                  render: (data) => (data ? data.length : 0),
                },
              ]}
              options={{
                paging: true,
                searching: true,
                ordering: true,
                order: [[0, 'desc']], // Order by Date (column index 0) descending
              }}
            />
          </div>
        ) : (
          <div className="p-4">
            <p className="text-gray-500">
              Select a time range and click 'Get logs' to view chat history
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatLogsDashboard;
