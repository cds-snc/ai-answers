import dotenv from 'dotenv';
import ServerLoggingService from './ServerLoggingService.js';
import NotifyClient from 'notifications-node-client';

dotenv.config();

const templateEnvKey = 'GC_NOTIFY_TEMPLATE_ID';

if (!process.env.GC_NOTIFY_API_KEY) {
  ServerLoggingService.error('GC Notify API key missing at startup', 'gc-notify-service');
}

const client = new NotifyClient.NotifyClient("https://api.notification.canada.ca",process.env.GC_NOTIFY_API_KEY);

async function sendEmail({ email, personalisation = {}, templateId = null, reference = null } = {}) {
  const tpl = templateId || process.env.GC_NOTIFY_2FA_TEMPLATE_ID || process.env[templateEnvKey];
  if (!tpl) throw new Error('GC notify template id missing');
  // notifications-node-client now expects an options object as the last argument
  const options = { personalisation };
  if (reference) options.reference = reference;
  const res = await client.sendEmail(tpl, email, options);
  ServerLoggingService.info('GC Notify sent email', 'gc-notify-service', { template: tpl, email, result: res });
  return { success: true, response: res };
}

async function sendSMS({ phone, personalisation = {}, templateId = null, reference = null } = {}) {
  const tpl = templateId || process.env[templateEnvKey];
  if (!tpl) throw new Error('GC notify template id missing');
  const options = { personalisation };
  if (reference) options.reference = reference;
  const res = await client.sendSms(tpl, phone, options);
  ServerLoggingService.info('GC Notify sent sms', 'gc-notify-service', { template: tpl, phone, result: res });
  return { success: true, response: res };
}

const GCNotifyService = {
  sendEmail,
  sendSMS,
};

export default GCNotifyService;
