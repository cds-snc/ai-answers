import { describe, it, expect, vi } from 'vitest';
import NotifyClient from 'notifications-node-client';
import GCNotifyService from '../GCNotifyService.js';

describe('GCNotifyService', () => {
  it('throws when API key missing', async () => {
    const originalKey = process.env.GC_NOTIFY_API_KEY;
    delete process.env.GC_NOTIFY_API_KEY;
    try {
      await expect(GCNotifyService.sendEmail({ email: 'a@b.c', personalisation: {} })).rejects.toThrow();
    } finally {
      process.env.GC_NOTIFY_API_KEY = originalKey;
    }
  });

  it('sends email using Notify client and returns success', async () => {
    process.env.GC_NOTIFY_API_KEY = 'test-key';
    process.env.GC_NOTIFY_TEMPLATE_ID = 'tpl-123';

    const sendEmailMock = vi.spyOn(NotifyClient.NotifyClient.prototype, 'sendEmail').mockResolvedValue({ id: 'notif-1' });

    const res = await GCNotifyService.sendEmail({ email: 'test@example.com', personalisation: { name: 'x' } });
    expect(sendEmailMock).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.response).toEqual({ id: 'notif-1' });
    sendEmailMock.mockRestore();
  });

  it('handles API error response gracefully', async () => {
    process.env.GC_NOTIFY_API_KEY = 'test-key';
    process.env.GC_NOTIFY_TEMPLATE_ID = 'tpl-123';

    const err = new Error('Bad Request');
    err.response = { status: 400, data: { errors: [{ message: 'bad' }] } };
    const sendSmsMock = vi.spyOn(NotifyClient.NotifyClient.prototype, 'sendSms').mockRejectedValue(err);

    await expect(GCNotifyService.sendSMS({ phone: '+15550001111', personalisation: {} })).rejects.toThrow('Bad Request');
    sendSmsMock.mockRestore();
  });
});
