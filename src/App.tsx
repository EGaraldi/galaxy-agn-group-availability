import React, { useEffect, useMemo, useState } from "react";

/**
 * Group Availability Calendar (starter)
 * - Google-Calendar-like month grid
 * - Left rail = people list with multi-select
 * - Only selected people appear in the calendar rows
 * - Each person can be marked Available / Unavailable per day
 * - Simple shared password gate (client-side)
 *
 * Notes:
 * - This starter is front-end only and uses localStorage.
 * - Password gate is client-side: it blocks casual access but is not secure against a determined user.
 */

// --- Utilities ---
const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Monday-first grid (like many work calendars)
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const mondayFirstDow = (d: Date) => {
  const js = d.getDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // 0=Mon..6=Sun
};

// --- Storage ---
const LS_KEY = "group-availability.v1";
function loadState(): any | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveState(state: any) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// --- Demo data ---
type Person = { id: string; name: string; color: string };

const DEFAULT_PEOPLE: Person[] = [
  { id: "p1", name: "Alice", color: "#1a73e8" },
  { id: "p2", name: "Ben", color: "#34a853" },
  { id: "p3", name: "Chiara", color: "#fbbc05" },
  { id: "p4", name: "Diego", color: "#ea4335" },
  { id: "p5", name: "Eli", color: "#9334e6" },
  { id: "p6", name: "Fatima", color: "#12b5cb" },
  { id: "p7", name: "Gabe", color: "#ff6d01" },
  { id: "p8", name: "Hana", color: "#5f6368" },
  { id: "p9", name: "Ibrahim", color: "#0b8043" },
  { id: "p10", name: "Julia", color: "#c5221f" },
];

/**
 * Availability model:
 * availability[personId][YYYY-MM-DD] = true|false
 * (true = available, false = unavailable)
 * Default when missing = AVAILABLE
 */

type Availability = Record<string, Record<string, boolean>>;

type Status = "available" | "unavailable";

function getStatusFromAvailability(availability: Availability, personId: string, dateStr: string): Status {
  const per = availability?.[personId];
  if (!per || !(dateStr in per)) return "available";
  return per[dateStr] === true ? "available" : "unavailable";
}

function setStatusInAvailability(availability: Availability, personId: string, dateStr: string, nextStatus: Status): Availability {
  const next: Availability = { ...(availability || {}) };
  const per = { ...(next[personId] || {}) };
  per[dateStr] = nextStatus === "available";
  next[personId] = per;
  return next;
}

// --- Lightweight self-tests (run once in dev) ---
// NOTE: No Node-specific globals (like `process`) are used so this runs cleanly in browser builds.
function runSelfTests() {
  // Only run in non-production to avoid noise.
  // In Vite, environment mode is available via import.meta.env.MODE.
  // (Avoid using Node's `process` in browser TS builds.)
  const mode = (import.meta as any).env?.MODE as string | undefined;
  if (mode === "production") return;

  let a: Availability = {};
  console.assert(getStatusFromAvailability(a, "p1", "2026-02-01") === "available", "Default status should be available");

  a = setStatusInAvailability(a, "p1", "2026-02-01", "unavailable");
  console.assert(getStatusFromAvailability(a, "p1", "2026-02-01") === "unavailable", "Status should be unavailable after setting");

  a = setStatusInAvailability(a, "p1", "2026-02-02", "available");
  console.assert(getStatusFromAvailability(a, "p1", "2026-02-02") === "available", "Explicit available should be available");

  a = setStatusInAvailability(a, "p1", "2026-02-01", "available");
  console.assert(getStatusFromAvailability(a, "p1", "2026-02-01") === "available", "Status should be available after toggling back");

  console.assert(getStatusFromAvailability(a, "p2", "2026-02-01") === "available", "Other people default to available");
}

runSelfTests();

// --- Password gate (shared password for everyone) ---
// IMPORTANT: client-side only. For real protection, use server-side auth / basic auth.
const APP_PASSWORD = "changeme"; // TODO: change this.
const UNLOCK_KEY = `${LS_KEY}.unlocked`;

function PasswordGate({ children }: { children: React.ReactNode }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return localStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === APP_PASSWORD) {
      setUnlocked(true);
      setError(null);
      try {
        localStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        // ignore
      }
      return;
    }
    setError("Incorrect password");
  };

  const lock = () => {
    setUnlocked(false);
    setPw("");
    setError(null);
    try {
      localStorage.removeItem(UNLOCK_KEY);
    } catch {
      // ignore
    }
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#f6f8fc] text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6">
          <div className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="text-lg font-semibold tracking-tight">Group Availability</div>
            <div className="mt-1 text-sm text-slate-600">Enter the shared password to access the calendar.</div>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Password"
                autoFocus
              />
              {error ? <div className="text-sm text-rose-600">{error}</div> : null}
              <button
                type="submit"
                className="w-full rounded-xl bg-[#1a73e8] px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Unlock
              </button>
            </form>
            <div className="mt-4 text-xs text-slate-500">
              Note: this is simple client-side protection. It prevents casual access but is not secure against a determined user.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={lock}
          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"
          title="Lock this device"
        >
          Lock
        </button>
      </div>
      {children}
    </>
  );
}

export default function GroupAvailabilityCalendar() {
  const [today] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  // App state
  const [people, setPeople] = useState<Person[]>(DEFAULT_PEOPLE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(DEFAULT_PEOPLE.map((p) => p.id)));
  const [availability, setAvailability] = useState<Availability>(() => ({}));

  // Current user (demo: pick who you are, then click a day to toggle your status)
  const [currentUserId, setCurrentUserId] = useState(DEFAULT_PEOPLE[0].id);

  // Load persisted state
  useEffect(() => {
    const saved = loadState();
    if (!saved) return;
    if (Array.isArray(saved.people) && saved.people.length) setPeople(saved.people);
    if (Array.isArray(saved.selected)) setSelectedIds(new Set(saved.selected));
    if (saved.availability && typeof saved.availability === "object") setAvailability(saved.availability);
    if (saved.currentUserId) setCurrentUserId(saved.currentUserId);
    if (saved.cursor) {
      const d = new Date(saved.cursor);
      if (!Number.isNaN(d.getTime())) setCursor(startOfMonth(d));
    }
  }, []);

  // Persist state
  useEffect(() => {
    saveState({
      people,
      selected: Array.from(selectedIds),
      availability,
      currentUserId,
      cursor: cursor.toISOString(),
    });
  }, [people, selectedIds, availability, currentUserId, cursor]);

  const selectedPeople = useMemo(() => people.filter((p) => selectedIds.has(p.id)), [people, selectedIds]);

  const monthLabel = useMemo(() => cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }), [cursor]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);

    // Build a 6-week grid (42 cells), Monday-first
    const firstCell = addDays(start, -mondayFirstDow(start));
    const cells: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(firstCell, i);
      cells.push({
        date: d,
        inMonth: d.getMonth() === cursor.getMonth(),
        isToday: sameDay(d, today),
      });
    }

    return { start, end, cells };
  }, [cursor, today]);

  const toggleSelect = (personId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(people.map((p) => p.id)));
  const selectNone = () => setSelectedIds(new Set());

  const getStatus = (personId: string, dateStr: string): Status => getStatusFromAvailability(availability, personId, dateStr);

  const setStatus = (personId: string, dateStr: string, nextStatus: Status) => {
    setAvailability((prev) => setStatusInAvailability(prev, personId, dateStr, nextStatus));
  };

  // Click a calendar cell to toggle status for the CURRENT USER only.
  // toggle: available <-> unavailable
  const onDayClick = (dateObj: Date) => {
    const dStr = isoDate(dateObj);
    const cur = getStatus(currentUserId, dStr);
    const next: Status = cur === "available" ? "unavailable" : "available";
    setStatus(currentUserId, dStr, next);
  };

  const prevMonth = () => setCursor((c) => startOfMonth(new Date(c.getFullYear(), c.getMonth() - 1, 1)));
  const nextMonth = () => setCursor((c) => startOfMonth(new Date(c.getFullYear(), c.getMonth() + 1, 1)));
  const goToday = () => setCursor(startOfMonth(new Date()));

  return (
    <PasswordGate>
      <div className="min-h-screen bg-[#f6f8fc] text-slate-900">
        <div className="mx-auto max-w-[1400px] p-4">
          {/* Top bar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"
                onClick={goToday}
              >
                Today
              </button>
              <button
                className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"
                onClick={prevMonth}
                aria-label="Previous month"
              >
                ◀
              </button>
              <button
                className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"
                onClick={nextMonth}
                aria-label="Next month"
              >
                ▶
              </button>
              <div className="ml-2 text-xl font-semibold tracking-tight">{monthLabel}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
                <label className="mr-2 text-xs font-medium text-slate-600">I am</label>
                <select
                  className="rounded-lg bg-slate-50 px-2 py-1 text-sm ring-1 ring-black/5"
                  value={currentUserId}
                  onChange={(e) => setCurrentUserId(e.target.value)}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 text-sm text-slate-600">
                Click a day to toggle <span className="font-semibold">your</span> status: available ⇄ unavailable
              </div>
            </div>
          </div>

          {/* Main layout */}
          <div className="grid grid-cols-12 gap-4">
            {/* Left rail: people */}
            <div className="col-span-12 md:col-span-3 lg:col-span-2">
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm font-semibold">People</div>
                  <div className="flex gap-2 text-xs">
                    <button className="rounded-lg px-2 py-1 hover:bg-slate-50" onClick={selectAll}>
                      All
                    </button>
                    <button className="rounded-lg px-2 py-1 hover:bg-slate-50" onClick={selectNone}>
                      None
                    </button>
                  </div>
                </div>
                <div className="border-t border-slate-100" />
                <div className="max-h-[70vh] overflow-auto p-2">
                  {people.map((p) => {
                    const checked = selectedIds.has(p.id);
                    const isMe = p.id === currentUserId;
                    return (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 ${
                          isMe ? "bg-slate-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 rounded-full" style={{ background: p.color }} aria-hidden />
                          <div className="leading-tight">
                            <div className="text-sm font-medium">
                              {p.name} {isMe ? <span className="text-xs text-slate-500">(you)</span> : null}
                            </div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="text-sm font-semibold">Legend</div>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
                    Available (default)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full bg-rose-500" />
                    Unavailable
                  </div>
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="col-span-12 md:col-span-9 lg:col-span-10">
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                {/* Weekday header */}
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {weekdayLabels.map((w) => (
                    <div key={w} className="px-3 py-2 text-xs font-semibold text-slate-600">
                      {w}
                    </div>
                  ))}
                </div>

                {/* Month grid */}
                <div className="grid grid-cols-7">
                  {monthDays.cells.map((cell, idx) => {
                    const dStr = isoDate(cell.date);
                    return (
                      <button
                        key={`${dStr}-${idx}`}
                        onClick={() => onDayClick(cell.date)}
                        className={`relative min-h-[120px] border-b border-r border-slate-100 px-2 pb-2 pt-2 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-black/10 ${
                          idx % 7 === 6 ? "border-r-0" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                              cell.isToday ? "bg-[#1a73e8] text-white" : "text-slate-700"
                            } ${cell.inMonth ? "" : "opacity-40"}`}
                            title={dStr}
                          >
                            {cell.date.getDate()}
                          </div>
                        </div>

                        {/* Selected people rows */}
                        <div className="mt-2 space-y-1">
                          {selectedPeople.length === 0 ? (
                            <div className="text-xs text-slate-400">No people selected</div>
                          ) : (
                            selectedPeople.map((p) => {
                              const st = getStatus(p.id, dStr);
                              const dot = st === "available" ? "bg-emerald-500" : "bg-rose-500";
                              const isMe = p.id === currentUserId;
                              return (
                                <div key={p.id} className="flex items-center gap-2">
                                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                                  <span
                                    className={`truncate text-xs ${cell.inMonth ? "text-slate-700" : "text-slate-500"} ${
                                      isMe ? "font-semibold" : ""
                                    }`}
                                    title={p.name}
                                  >
                                    {p.name}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {!cell.inMonth && <div className="pointer-events-none absolute inset-0 bg-white/50" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer help */}
              <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="text-sm font-semibold">What this prototype already does</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  <li>Google-Calendar-like monthly grid.</li>
                  <li>Left rail is a multi-select list of people; only selected people are displayed inside each day cell.</li>
                  <li>Each person has an availability state per day (available / unavailable; default is available).</li>
                  <li>Demo “login”: pick yourself in the top-right; clicking a day toggles your state for that date.</li>
                  <li>Persists to localStorage (so refresh won’t wipe data on the same browser).</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PasswordGate>
  );
}

