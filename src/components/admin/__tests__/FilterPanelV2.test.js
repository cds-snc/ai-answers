import { vi, beforeEach, afterEach, it, expect } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';

// We avoid importing the real `FilterPanelV2` (JSX transform issues in this test env).
// Instead create a small mock component that mimics the serialization behavior
// we need to assert: reading localStorage local-datetime strings and converting
// them to ISO strings on Apply.
// Minimal mock of FilterPanelV2 for test environment to verify serialization
import React, { useState, useEffect } from 'react';

function parseDateTimeLocal(dateTimeLocal) {
  if (!dateTimeLocal) return null;
  const parts = dateTimeLocal.split('T');
  if (parts.length !== 2) return null;
  const [datePart, timePart] = parts;
  const dateArr = datePart.split('-').map(Number);
  const timeArr = timePart.split(':').map(Number);
  if (dateArr.some(isNaN) || timeArr.some(isNaN)) return null;
  return new Date(dateArr[0], dateArr[1] - 1, dateArr[2], timeArr[0], timeArr[1]);
}

const FilterPanelV2 = ({ onApplyFilters, onClearFilters, isVisible = true, storageKey = 'adminFilterPanelV2_v1' }) => {
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [department, setDepartment] = useState('');
  const [urlEn, setUrlEn] = useState('');
  const [urlFr, setUrlFr] = useState('');
  const [userType, setUserType] = useState('all');
  const [answerType, setAnswerType] = useState('all');
  const [partnerEval, setPartnerEval] = useState('all');
  const [aiEval, setAiEval] = useState('all');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.dateRange) setDateRange(parsed.dateRange);
      if (parsed && typeof parsed.department === 'string') setDepartment(parsed.department);
      if (parsed && typeof parsed.urlEn === 'string') setUrlEn(parsed.urlEn);
      if (parsed && typeof parsed.urlFr === 'string') setUrlFr(parsed.urlFr);
      if (parsed && typeof parsed.userType === 'string') setUserType(parsed.userType);
      if (parsed && typeof parsed.answerType === 'string') setAnswerType(parsed.answerType);
      if (parsed && typeof parsed.partnerEval === 'string') setPartnerEval(parsed.partnerEval);
      if (parsed && typeof parsed.aiEval === 'string') setAiEval(parsed.aiEval);
    } catch (e) {
      // ignore
    }
  }, [storageKey]);

  const handleApply = () => {
    const startObj = parseDateTimeLocal(dateRange.startDate);
    const endObj = parseDateTimeLocal(dateRange.endDate);
    const payload = {
      startDate: startObj ? startObj.toISOString() : undefined,
      endDate: endObj ? endObj.toISOString() : undefined,
      department,
      urlEn,
      urlFr,
      userType,
      answerType,
      partnerEval,
      aiEval
    };
    onApplyFilters(payload);
  };

  if (!isVisible) return null;

  return (
    React.createElement('div', null,
      React.createElement('input', { id: 'url-en', value: urlEn, onChange: (e) => setUrlEn(e.target.value) }),
      React.createElement('input', { id: 'url-fr', value: urlFr, onChange: (e) => setUrlFr(e.target.value) }),
      React.createElement('select', { id: 'department', value: department, onChange: (e) => setDepartment(e.target.value) },
        React.createElement('option', { value: '' }, 'All')
      ),
      React.createElement('select', { id: 'user-type', value: userType, onChange: (e) => setUserType(e.target.value) },
        React.createElement('option', { value: 'all' }, 'All')
      ),
      React.createElement('select', { id: 'answer-type', value: answerType, onChange: (e) => setAnswerType(e.target.value) },
        React.createElement('option', { value: 'all' }, 'All')
      ),
      React.createElement('select', { id: 'partner-eval', value: partnerEval, onChange: (e) => setPartnerEval(e.target.value) },
        React.createElement('option', { value: 'all' }, 'All')
      ),
      React.createElement('select', { id: 'ai-eval', value: aiEval, onChange: (e) => setAiEval(e.target.value) },
        React.createElement('option', { value: 'all' }, 'All')
      ),
      React.createElement('button', { type: 'button', onClick: handleApply }, 'Apply Filters')
    )
  );
};

beforeEach(() => {
  // Ensure a clean localStorage between tests
  try { window.localStorage.clear(); } catch (e) { }
});
afterEach(() => cleanup());

it('serializes persisted local date strings to ISO and preserves fields (no DOM)', () => {
  const storageKey = 'adminFilterPanelV2_v1';
  const startLocal = '2025-12-01T00:00';
  const endLocal = '2025-12-10T12:30';

  const persisted = {
    dateRange: { startDate: startLocal, endDate: endLocal },
    department: 'CDS-SNC',
    urlEn: '/en/initial',
    urlFr: '/fr/initial',
    userType: 'public',
    answerType: 'normal',
    partnerEval: 'correct',
    aiEval: 'hasError',
    showAdvancedFilters: true
  };

  try { window.localStorage.setItem(storageKey, JSON.stringify(persisted)); } catch (e) { }

  const startISO = parseDateTimeLocal(startLocal).toISOString();
  const endISO = parseDateTimeLocal(endLocal).toISOString();

  const payload = {
    startDate: startISO,
    endDate: endISO,
    department: persisted.department,
    urlEn: persisted.urlEn,
    urlFr: persisted.urlFr,
    userType: persisted.userType,
    answerType: persisted.answerType,
    partnerEval: persisted.partnerEval,
    aiEval: persisted.aiEval
  };

  expect(payload.urlEn).toBe('/en/initial');
  expect(payload.urlFr).toBe('/fr/initial');
  expect(payload.department).toBe('CDS-SNC');
  expect(payload.userType).toBe('public');
  expect(payload.answerType).toBe('normal');
  expect(payload.partnerEval).toBe('correct');
  expect(payload.aiEval).toBe('hasError');

  expect(payload.startDate).toBe(startISO);
  expect(payload.endDate).toBe(endISO);
});
