import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { RequestsExplorer } from "@/components/requests/RequestsExplorer";
import { RequestDetail } from "@/components/detail/RequestDetail";
import { ExecutionTimeline } from "@/components/timeline/ExecutionTimeline";
import type {
  RequestEvent,
  RequestListResponse,
  RequestSummary,
  RequestTimeline,
  TimelineExecutionEvent,
} from "@/lib/types";

const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => "/requests",
  useSearchParams: () => searchParams,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeRequest(overrides: Partial<RequestEvent> = {}): RequestEvent {
  return {
    request_id: "req-1",
    method: "GET",
    path: "/users/42",
    status_code: 200,
    started_at: "2026-01-01T00:00:00Z",
    duration_ms: 12.4,
    ...overrides,
  };
}

function listResponse(
  items: RequestEvent[],
  overrides: Partial<RequestListResponse> = {},
): RequestListResponse {
  return {
    items,
    total: items.length,
    limit: 20,
    offset: 0,
    ...overrides,
  };
}

describe("RequestsExplorer", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    pushMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify(
            listResponse([
              makeRequest(),
              makeRequest({
                request_id: "req-error",
                path: "/explode",
                status_code: 500,
                duration_ms: 3.1,
              }),
            ]),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders request list rows from the API", async () => {
    render(<RequestsExplorer />);

    await waitFor(() => {
      expect(screen.getByTestId("request-table")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("request-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("/users/42")).toBeInTheDocument();
    expect(screen.getByText("/explode")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("paginates by updating the offset search param", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify(
            listResponse([makeRequest()], { total: 40, limit: 20, offset: 0 }),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<RequestsExplorer />);
    await screen.findByTestId("request-table");

    await user.click(screen.getByTestId("pagination-next"));
    expect(pushMock).toHaveBeenCalledWith("/requests?offset=20");
  });

  it("applies method/path/status filters via URL search params", async () => {
    const user = userEvent.setup();
    render(<RequestsExplorer />);
    await screen.findByTestId("request-table");

    await user.selectOptions(screen.getByTestId("filter-method"), "GET");
    await user.clear(screen.getByTestId("filter-path"));
    await user.type(screen.getByTestId("filter-path"), "/users/42");
    await user.clear(screen.getByTestId("filter-status"));
    await user.type(screen.getByTestId("filter-status"), "200");
    await user.click(screen.getByTestId("apply-filters"));

    expect(pushMock).toHaveBeenCalled();
    const target = String(pushMock.mock.calls.at(-1)?.[0]);
    expect(target).toContain("method=GET");
    expect(target).toContain("path=%2Fusers%2F42");
    expect(target).toContain("status=200");
  });

  it("uses specialized APIs for quick filters", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(JSON.stringify(listResponse([])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<RequestsExplorer />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/requests?");

    searchParams = new URLSearchParams("filter=errors");
    rerender(<RequestsExplorer />);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/api/v1/requests/errors"),
        ),
      ).toBe(true);
    });

    searchParams = new URLSearchParams("filter=slow&threshold_ms=100");
    rerender(<RequestsExplorer />);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/api/v1/requests/slow"),
        ),
      ).toBe(true);
    });

    searchParams = new URLSearchParams("filter=exceptions");
    rerender(<RequestsExplorer />);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/api/v1/requests/exceptions"),
        ),
      ).toBe(true);
    });
  });

  it("shows empty state when API returns no items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(listResponse([])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<RequestsExplorer />);
    expect(await screen.findByText("No requests found")).toBeInTheDocument();
  });

  it("shows error state and retries after API failure", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "backend unavailable" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(listResponse([makeRequest()])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<RequestsExplorer />);
    expect(await screen.findByText("Failed to load requests")).toBeInTheDocument();
    expect(screen.getByText("backend unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("request-table")).toBeInTheDocument();
  });

  it("navigates to request detail when a row is clicked", async () => {
    const user = userEvent.setup();
    render(<RequestsExplorer />);
    await screen.findByTestId("request-table");

    const row = screen.getAllByTestId("request-row")[0];
    await user.click(row);
    expect(pushMock).toHaveBeenCalledWith("/requests/req-1");
  });
});

describe("RequestDetail", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads summary and timeline and renders counts", async () => {
    const summary: RequestSummary = {
      request: makeRequest(),
      total_events: 2,
      event_counts: {
        HTTP_IN: 0,
        HTTP_OUT: 1,
        SQL: 1,
        EXCEPTION: 0,
      },
      total_execution_duration_ms: 0.62,
      has_error: false,
    };
    const timeline: RequestTimeline = {
      request: makeRequest(),
      events: [
        {
          event_id: "e1",
          event_type: "SQL",
          started_at: "2026-01-01T00:00:00.001Z",
          duration_ms: 0.31,
          metadata: { query: "SELECT id, name FROM users WHERE id = ?" },
        },
        {
          event_id: "e2",
          event_type: "HTTP_OUT",
          started_at: "2026-01-01T00:00:00.002Z",
          duration_ms: 0.31,
          metadata: {
            method: "GET",
            url: "http://profile-service.local/profiles/42",
            status_code: 200,
          },
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/summary")) {
          return new Response(JSON.stringify(summary), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(timeline), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    render(<RequestDetail requestId="req-1" />);

    expect(await screen.findByTestId("request-detail")).toBeInTheDocument();
    expect(screen.getByText("/users/42")).toBeInTheDocument();
    expect(screen.getByText("200 OK")).toBeInTheDocument();

    const counts = screen.getByTestId("event-counts");
    expect(within(counts).getByText("HTTP_IN").parentElement).toHaveTextContent("0");
    expect(within(counts).getByText("SQL").parentElement).toHaveTextContent("1");
    expect(within(counts).getByText("HTTP_OUT").parentElement).toHaveTextContent("1");
    expect(screen.getByText("SELECT id, name FROM users WHERE id = ?")).toBeInTheDocument();
    expect(
      screen.getByText("GET http://profile-service.local/profiles/42"),
    ).toBeInTheDocument();
  });

  it("shows loading then error for detail API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Event not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<RequestDetail requestId="missing" />);
    expect(screen.getByText("Loading request detail…")).toBeInTheDocument();
    expect(await screen.findByText("Failed to load request")).toBeInTheDocument();
    expect(screen.getByText("Event not found")).toBeInTheDocument();
  });
});

describe("ExecutionTimeline", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a zero-event timeline", () => {
    render(
      <ExecutionTimeline events={[]} requestLabel="GET /health" />,
    );
    expect(screen.getByTestId("timeline-empty")).toBeInTheDocument();
    expect(screen.getByText("GET /health")).toBeInTheDocument();
  });

  it("renders SQL, HTTP_OUT, and EXCEPTION events", () => {
    const events: TimelineExecutionEvent[] = [
      {
        event_id: "sql",
        event_type: "SQL",
        started_at: "2026-01-01T00:00:00Z",
        duration_ms: 0.31,
        metadata: { query: "SELECT 1" },
      },
      {
        event_id: "http",
        event_type: "HTTP_OUT",
        started_at: "2026-01-01T00:00:01Z",
        duration_ms: 1.2,
        metadata: {
          method: "GET",
          url: "https://example.com/x",
          status_code: 200,
        },
      },
      {
        event_id: "exc",
        event_type: "EXCEPTION",
        started_at: "2026-01-01T00:00:02Z",
        duration_ms: 0,
        metadata: {
          exception_type: "RuntimeError",
          message: "boom",
          traceback: [
            {
              filename: "app/main.py",
              function: "explode",
              line_number: 107,
            },
          ],
        },
      },
    ];

    render(
      <ExecutionTimeline events={events} requestLabel="GET /explode" />,
    );

    const nodes = screen.getAllByTestId("timeline-event");
    expect(nodes).toHaveLength(3);
    expect(screen.getByText("SELECT 1")).toBeInTheDocument();
    expect(screen.getByText("GET https://example.com/x")).toBeInTheDocument();
    expect(screen.getByText("Status 200")).toBeInTheDocument();
    expect(screen.getByText("RuntimeError: boom")).toBeInTheDocument();
    expect(screen.getByTestId("exception-traceback")).toHaveTextContent(
      "app/main.py:107 in explode",
    );
  });
});
