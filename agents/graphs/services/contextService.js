import { departments_EN } from '../../prompts/scenarios/departments_EN.js';
import { departments_FR } from '../../prompts/scenarios/departments_FR.js';
import { isGovernmentUrl } from '../../../api/util/govHost.js';
import ServerLoggingService from '../../../services/ServerLoggingService.js';

// The context agent's <department> / <departmentUrl> go straight into the answer
// agent's system prompt, and the prompts treat <department-url>'s domain as an
// approved source. A user can try to steer the context agent with a crafted
// question, so:
// - department must be a real abbrKey from the department lists (case, spaces
//   and wrapping quotes tolerated; the listed spelling is returned);
// - departmentUrl must be one URL on a host the citation check accepts
//   (isGovernmentUrl). Not just the list's own URL: the context prompt also
//   sends CEO-BEC to several canada.ca pages, and its examples use older
//   department URLs.
// Anything else becomes '' (no department / no URL), which the prompts already
// handle. Rejections are logged so drops can be measured.
const ABBR_KEYS_BY_LOWER = new Map(
  [...departments_EN, ...departments_FR].map(({ abbrKey }) => [abbrKey.toLowerCase(), abbrKey])
);

const unwrap = (value) => value.trim().replace(/^["'`]+|["'`]+$/g, '').trim();

function listedDepartment(rawDepartment, rawUrl) {
  const department = ABBR_KEYS_BY_LOWER.get(unwrap(rawDepartment).toLowerCase()) || '';
  const url = unwrap(rawUrl);
  const departmentUrl = department && !/\s/.test(url) && isGovernmentUrl(url) ? url : '';
  return { department, departmentUrl };
}

// Raw values are model output: bound them before they go in a log.
const forLog = (value) => value.slice(0, 200);

export function parseContextMessage(context) {
  const departmentMatch = context.message.match(/<department>([\s\S]*?)<\/department>/);
  const departmentUrlMatch = context.message.match(/<departmentUrl>([\s\S]*?)<\/departmentUrl>/);

  // The context prompt's response format returns empty tags (<department></department>)
  // when nothing matches, so a missing tag means the same thing: no department. Return ''
  // rather than null — null gets interpolated into the answer prompt as the literal
  // string "null", which reads as a department actually named "null".
  const rawDepartment = departmentMatch ? departmentMatch[1] : '';
  const rawDepartmentUrl = departmentUrlMatch ? departmentUrlMatch[1] : '';
  const { department, departmentUrl } = listedDepartment(rawDepartment, rawDepartmentUrl);
  if ((rawDepartment.trim() && !department) || (rawDepartmentUrl.trim() && !departmentUrl)) {
    // Fire-and-forget, like the other graph logs.
    ServerLoggingService.warn('Context agent department rejected', context.chatId || null, {
      rawDepartment: forLog(rawDepartment),
      rawDepartmentUrl: forLog(rawDepartmentUrl),
      department,
      departmentUrl,
    });
  }
  return {
    department,
    departmentUrl,
    searchResults: context.searchResults,
    searchProvider: context.searchProvider,
    model: context.model,
    inputTokens: context.inputTokens,
    outputTokens: context.outputTokens,
  };
}
