/**
 * Shared test fixtures and fromTable mock builder for competition page tests.
 * Each test file imports what it needs and wires in only the specific operation
 * mocks it wants to assert against.
 */
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

export const EVENT_ID = "event-1";

export type SignupRow = { user_id: string; public_profiles: null };

export type ScenarioConfig = {
  userId: string | null;
  signups: SignupRow[];
  role?: "admin" | "user";
  rpcError?: string | null;
  eventPhase?: "active" | "ended";
  entries?: any[];
  likes?: any[];
  comments?: any[];
  publicProfiles?: any[];
};

/**
 * Operation-level mocks that test files can inject so they can assert on
 * specific Supabase calls without re-implementing the full table router.
 */
export type OperationMocks = {
  deleteSignupWhereEventMock?: any;
  deleteSignupWhereUserMock?: any;
  insertEntryLikeMock?: any;
  insertEntryCommentMock?: any;
  updateCommentMock?: any;
  deleteCommentWhereEventMock?: any;
  deleteEntriesWhereEventMock?: any;
};

// ---------------------------------------------------------------------------
// Default fixture data
// ---------------------------------------------------------------------------

export const defaultEntries = [
  {
    id: "entry-1",
    event_id: EVENT_ID,
    dog_id: "dog-1",
    added_by: "user-1",
    created_at: new Date().toISOString(),
    dogs: {
      id: "dog-1",
      name: "Bolt",
      breed: "Border Collie",
      owner_id: "owner-1",
      photo_urls: [],
      is_public: true,
      updated_at: null,
      age_years: null,
      created_at: new Date().toISOString(),
      dob: null,
    },
  },
];

export const defaultPublicProfiles = [
  { id: "owner-1", display_name: "Owner One", avatar_url: null },
  { id: "user-1", display_name: "Tester", avatar_url: null },
];

// ---------------------------------------------------------------------------
// Event factory
// ---------------------------------------------------------------------------

export function createEvent(eventPhase?: "active" | "ended") {
  const now = Date.now();
  return {
    id: EVENT_ID,
    creator_id: "creator-1",
    title: "Spring Dog Show",
    created_at: new Date().toISOString(),
    starts_at:
      eventPhase === "ended"
        ? new Date(now - 2 * 60 * 60 * 1000).toISOString()
        : new Date(now - 60 * 60 * 1000).toISOString(),
    ends_at:
      eventPhase === "ended"
        ? new Date(now - 60 * 60 * 1000).toISOString()
        : new Date(now + 60 * 60 * 1000).toISOString(),
    capacity: 20,
    status: "active",
    header_image_url: null,
    description: "Friendly local event",
  };
}

// ---------------------------------------------------------------------------
// fromTable implementation builder
//
// Returns a function suitable for `fromTableMock.mockImplementation(...)`.
// Pass only the operation mocks you want to assert against; everything else
// gets a silent no-op stub.
// ---------------------------------------------------------------------------

export function buildFromTableImpl(
  config: ScenarioConfig,
  mocks: OperationMocks = {}
): (tableName: string) => any {
  // Fall back to silent no-op stubs for mocks the caller doesn't need.
  const deleteSignupWhereUserFn =
    mocks.deleteSignupWhereUserMock ?? vi.fn(async () => ({ error: null }));
  const deleteSignupWhereEventFn =
    mocks.deleteSignupWhereEventMock ??
    vi.fn(() => ({ eq: deleteSignupWhereUserFn }));

  const insertEntryLikeFn =
    mocks.insertEntryLikeMock ?? vi.fn(async () => ({ error: null }));
  const insertEntryCommentFn =
    mocks.insertEntryCommentMock ?? vi.fn(async () => ({ error: null }));

  const updateCommentFn =
    mocks.updateCommentMock ??
    vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    }));

  const deleteCommentWhereEventFn =
    mocks.deleteCommentWhereEventMock ??
    vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    }));

  const deleteEntriesWhereEventFn =
    mocks.deleteEntriesWhereEventMock ??
    vi.fn(() => ({
      in: vi.fn(async () => ({ error: null })),
      eq: vi.fn(async () => ({ error: null })),
    }));

  const resolvedEntries = config.entries ?? defaultEntries;
  const resolvedLikes = config.likes ?? [];
  const resolvedComments = config.comments ?? [];
  const resolvedProfiles = config.publicProfiles ?? defaultPublicProfiles;
  const resolvedEvent = createEvent(config.eventPhase);

  return (tableName: string) => {
    if (tableName === "events") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: resolvedEvent, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: null, error: null })),
        })),
      };
    }

    if (tableName === "event_signups") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: config.signups, error: null })),
        })),
        delete: vi.fn(() => ({ eq: deleteSignupWhereEventFn })),
      };
    }

    if (tableName === "profiles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { role: config.role ?? "user" },
              error: null,
            })),
          })),
        })),
      };
    }

    if (tableName === "dogs") {
      // Admin-remove path: resolves dog-1 when looking up user-2's dogs.
      const eqDogsMock = vi.fn((column: string, value: string) => {
        if (column === "owner_id" && value === "user-2") {
          return Promise.resolve({ data: [{ id: "dog-1" }], error: null });
        }
        return { order: vi.fn(async () => ({ data: [], error: null })) };
      });
      return {
        select: vi.fn(() => ({ eq: eqDogsMock })),
      };
    }

    if (tableName === "event_entries") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: resolvedEntries, error: null })),
          })),
        })),
        insert: vi.fn(async () => ({ error: null })),
        delete: vi.fn(() => ({ eq: deleteEntriesWhereEventFn })),
      };
    }

    if (tableName === "public_profiles") {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({ data: resolvedProfiles, error: null })),
        })),
      };
    }

    if (tableName === "event_entry_likes") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ data: resolvedLikes, error: null })),
          })),
        })),
        insert: insertEntryLikeFn,
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        })),
      };
    }

    if (tableName === "event_entry_comments") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: resolvedComments,
                error: null,
              })),
            })),
          })),
        })),
        insert: insertEntryCommentFn,
        update: updateCommentFn,
        delete: vi.fn(() => ({ eq: deleteCommentWhereEventFn })),
      };
    }

    // Default fallback for any table the test doesn't care about.
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
          order: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    };
  };
}
