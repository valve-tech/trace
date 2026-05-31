import { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Shared test helpers for component tests in __tests__/. Existing tests
 * roll their own QueryClient + MemoryRouter setup — extracting it here
 * keeps each test file focused on the assertions it cares about.
 *
 * Underscore prefix (`_test-utils`) keeps this file from being picked
 * up by the vitest `*.test.{ts,tsx}` glob.
 */

/**
 * Build a fresh QueryClient per test render to avoid cross-test cache
 * pollution. `retry: false` makes failed queries surface their error
 * immediately instead of attempting the default 3-attempt back-off.
 * `staleTime: Infinity` mirrors the production setup so test queries
 * don't refetch behind your back during the assertion phase.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

interface ProvidersProps {
  children: ReactNode;
  initialEntries?: string[];
  queryClient?: QueryClient;
}

export function Providers({
  children,
  initialEntries = ["/"],
  queryClient,
}: ProvidersProps): ReactElement {
  const client = queryClient ?? makeQueryClient();
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * Render a component wrapped in MemoryRouter + QueryClientProvider.
 * Returns the standard RTL render result plus the QueryClient instance
 * so a test can flush queries or assert cache state if needed.
 */
export function renderWithProviders(
  ui: ReactElement,
  opts: {
    initialEntries?: string[];
    queryClient?: QueryClient;
    renderOptions?: Omit<RenderOptions, "wrapper">;
  } = {},
) {
  const client = opts.queryClient ?? makeQueryClient();
  const result = render(ui, {
    ...opts.renderOptions,
    wrapper: ({ children }) => (
      <Providers initialEntries={opts.initialEntries} queryClient={client}>
        {children}
      </Providers>
    ),
  });
  return { ...result, queryClient: client };
}
