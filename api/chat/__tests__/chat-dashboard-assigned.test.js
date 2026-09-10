import { describe, it, expect } from 'vitest';
import handler from '../chat-dashboard.js';
import dbConnect from '../../db/db-connect.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { User } from '../../../models/user.js';

// Focused on the assignedTo filter / assignedToEmail projection added for
// the chat-assign feature (issue #1656) - not a full pipeline test, this
// file has none yet.

function createReq(query) {
  return {
    method: 'GET',
    query,
    path: '/api/chat/chat-dashboard',
    user: { role: 'admin', userId: 'dashboard-test' },
    isAuthenticated: () => true
  };
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function runGet(query) {
  const res = createRes();
  await handler(createReq({ startDate: '2020-01-01', endDate: '2030-01-01', length: 10, start: 0, ...query }), res);
  return res;
}

async function makeUser(overrides = {}) {
  return User.create({ email: `dashboard-${Date.now()}-${Math.random()}@example.com`, password: 'password123', role: 'partner', active: true, ...overrides });
}

describe('chat-dashboard assignedTo filter', () => {
  it('only returns chats assigned to the given user, with their email attached', async () => {
    await dbConnect();
    const assignee = await makeUser();
    const other = await makeUser();

    const interaction = await Interaction.create({});
    const assignedChat = await Chat.create({
      chatId: `chat-dashboard-assigned-${Date.now()}`,
      interactions: [interaction._id],
      assignedTo: assignee._id,
      assignedBy: other._id,
      assignedOn: new Date(),
      assignedNotes: 'please review',
    });

    const unassignedInteraction = await Interaction.create({});
    await Chat.create({
      chatId: `chat-dashboard-unassigned-${Date.now()}`,
      interactions: [unassignedInteraction._id],
    });

    const otherInteraction = await Interaction.create({});
    await Chat.create({
      chatId: `chat-dashboard-other-assignee-${Date.now()}`,
      interactions: [otherInteraction._id],
      assignedTo: other._id,
    });

    const res = await runGet({ assignedTo: assignee._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.data).toHaveLength(1);
    const row = res.payload.data[0];
    expect(row.chatId).toBe(assignedChat.chatId);
    expect(row.assignedTo).toBe(assignee._id.toString());
    expect(row.assignedToEmail).toBe(assignee.email);
    expect(row.assignedByEmail).toBe(other.email);
    expect(row.assignedNotes).toBe('please review');
  });

  it('rejects an invalid assignedTo value', async () => {
    const res = await runGet({ assignedTo: 'not-an-object-id' });
    expect(res.statusCode).toBe(400);
  });

  it('leaves assignedTo/assignedToEmail blank for an unassigned chat when not filtering by it', async () => {
    await dbConnect();
    const interaction = await Interaction.create({});
    const chat = await Chat.create({
      chatId: `chat-dashboard-blank-${Date.now()}`,
      interactions: [interaction._id],
    });

    const res = await runGet({});
    const row = res.payload.data.find((r) => r.chatId === chat.chatId);

    expect(row).toBeTruthy();
    expect(row.assignedTo).toBe('');
    expect(row.assignedToEmail).toBe('');
  });
});

describe('chat-dashboard sort by assignedTo (the Assign column, ChatDashboardPage.js)', () => {
  it('groups unassigned chats first when sorted ascending', async () => {
    await dbConnect();
    const assignee = await makeUser();
    const suffix = Date.now();

    const assignedInteraction = await Interaction.create({});
    await Chat.create({
      chatId: `sort-assigned-${suffix}`,
      interactions: [assignedInteraction._id],
      assignedTo: assignee._id,
    });

    const unassignedInteraction = await Interaction.create({});
    await Chat.create({
      chatId: `sort-unassigned-${suffix}`,
      interactions: [unassignedInteraction._id],
    });

    const res = await runGet({ orderBy: 'assignedTo', orderDir: 'asc', length: 2000 });

    // Scope to just this test's two rows (shared dev DB across test files).
    const rows = res.payload.data.filter((r) => r.chatId.includes(String(suffix)));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const unassignedIndex = rows.findIndex((r) => r.chatId === `sort-unassigned-${suffix}`);
    const assignedIndex = rows.findIndex((r) => r.chatId === `sort-assigned-${suffix}`);
    expect(unassignedIndex).toBeLessThan(assignedIndex);
  });
});

// AccountPage.js's "Your assigned chats for review" table columns.
describe('chat-dashboard sort by assignedOn/assignedByEmail (AccountPage.js)', () => {
  it('sorts by assignedOn ascending', async () => {
    await dbConnect();
    const assignee = await makeUser();
    const suffix = Date.now();

    // Created in the OPPOSITE order from their assignedOn values, and the
    // request also asks for orderDir=asc - so a broken orderBy (silently
    // falling back to the default createdAt sort, which also honours
    // orderDir) would report chats in *creation* order and get this
    // backwards. Only a real assignedOn sort passes.
    const laterInteraction = await Interaction.create({});
    await Chat.create({
      chatId: `sort-assignedon-later-${suffix}`,
      interactions: [laterInteraction._id],
      assignedTo: assignee._id,
      assignedOn: new Date('2024-06-01'),
    });

    const earlierInteraction = await Interaction.create({});
    await Chat.create({
      chatId: `sort-assignedon-earlier-${suffix}`,
      interactions: [earlierInteraction._id],
      assignedTo: assignee._id,
      assignedOn: new Date('2024-01-01'),
    });

    const res = await runGet({ assignedTo: assignee._id.toString(), orderBy: 'assignedOn', orderDir: 'asc', length: 2000 });

    const rows = res.payload.data.filter((r) => r.chatId.includes(String(suffix)));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const earlierIndex = rows.findIndex((r) => r.chatId === `sort-assignedon-earlier-${suffix}`);
    const laterIndex = rows.findIndex((r) => r.chatId === `sort-assignedon-later-${suffix}`);
    expect(earlierIndex).toBeLessThan(laterIndex);
  });

  it('sorts by assignedByEmail ascending', async () => {
    await dbConnect();
    const assignee = await makeUser();
    const assignerA = await makeUser({ email: `aaa-assigner-${Date.now()}@example.com` });
    const assignerZ = await makeUser({ email: `zzz-assigner-${Date.now()}@example.com` });
    const suffix = Date.now();

    // Same deliberate reversal as the assignedOn test above: created in the
    // opposite order from the expected assignedByEmail-ascending result, so
    // a fallback-to-createdAt sort would fail this instead of accidentally
    // passing.
    const interactionZ = await Interaction.create({});
    await Chat.create({
      chatId: `sort-assignedby-z-${suffix}`,
      interactions: [interactionZ._id],
      assignedTo: assignee._id,
      assignedBy: assignerZ._id,
    });

    const interactionA = await Interaction.create({});
    await Chat.create({
      chatId: `sort-assignedby-a-${suffix}`,
      interactions: [interactionA._id],
      assignedTo: assignee._id,
      assignedBy: assignerA._id,
    });

    const res = await runGet({ assignedTo: assignee._id.toString(), orderBy: 'assignedByEmail', orderDir: 'asc', length: 2000 });

    const rows = res.payload.data.filter((r) => r.chatId.includes(String(suffix)));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const aIndex = rows.findIndex((r) => r.chatId === `sort-assignedby-a-${suffix}`);
    const zIndex = rows.findIndex((r) => r.chatId === `sort-assignedby-z-${suffix}`);
    expect(aIndex).toBeLessThan(zIndex);
  });
});
