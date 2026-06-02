import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WagmiProvider, createConfig, http } from "wagmi";
import { wagmiConfig as productionWagmiConfig } from "../lib/wagmi";
import { mainnet, pulsechain, pulsechainV4 } from "wagmi/chains";
import { mock } from "wagmi/connectors";
import {
  privateKeyToAccount,
  generatePrivateKey,
} from "viem/accounts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { WalletConnectButton } from "../components/wallet/WalletConnectButton";

/**
 * UI-level tests for the wallet connect button. wagmi's `mock` connector
 * pretends an in-memory account is the connected provider — same hook
 * surface as a real injected wallet, no `window.ethereum` shim needed.
 *
 * The button has three states: connecting, connected, error. The
 * connecting → connected transition is what we exercise here; the
 * "no provider detected" path is unreachable when the mock connector is
 * registered.
 */

function makeWrappers(testAccount: ReturnType<typeof privateKeyToAccount>) {
  // Test config must declare the same chain tuple as the production
  // wagmiConfig in lib/wagmi.ts — main.tsx's `declare module "wagmi"`
  // pins WagmiProvider's accepted config type to that exact shape.
  const wagmiConfig = createConfig({
    chains: [mainnet, pulsechain, pulsechainV4],
    connectors: [
      mock({
        accounts: [testAccount.address],
      }),
    ],
    transports: {
      [mainnet.id]: http(),
      [pulsechain.id]: http(),
      [pulsechainV4.id]: http(),
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      // Cast through `as typeof productionWagmiConfig` — wagmi v2 pins the
      // WagmiProvider's accepted config type to the augmented Register
      // shape via main.tsx's `declare module "wagmi"`. The mock connector
      // is structurally compatible (same connector interface) but is not
      // type-identical to the production `injected()` connector, so the
      // assignment fails the strict tuple check. The behavioral shape we
      // exercise is intact.
      <WagmiProvider config={wagmiConfig as unknown as typeof productionWagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }
  return { Wrapper };
}

describe("<WalletConnectButton />", () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    user = userEvent.setup();
  });

  it("renders 'Connect wallet' when no account is connected", () => {
    const testAccount = privateKeyToAccount(generatePrivateKey());
    const { Wrapper } = makeWrappers(testAccount);
    render(
      <Wrapper>
        <WalletConnectButton />
      </Wrapper>,
    );
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("transitions to a truncated-address chip after a successful connect", async () => {
    const testAccount = privateKeyToAccount(generatePrivateKey());
    const { Wrapper } = makeWrappers(testAccount);
    render(
      <Wrapper>
        <WalletConnectButton />
      </Wrapper>,
    );
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));

    const expectedShort = `${testAccount.address.slice(0, 6)}…${testAccount.address.slice(-4)}`;
    await waitFor(() => {
      expect(screen.getByRole("button", { name: new RegExp(expectedShort) })).toBeInTheDocument();
    });
  });

  it("opens a disconnect popover showing the full address when the chip is clicked", async () => {
    const testAccount = privateKeyToAccount(generatePrivateKey());
    const { Wrapper } = makeWrappers(testAccount);
    render(
      <Wrapper>
        <WalletConnectButton />
      </Wrapper>,
    );
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));
    const expectedShort = `${testAccount.address.slice(0, 6)}…${testAccount.address.slice(-4)}`;
    const chip = await screen.findByRole("button", {
      name: new RegExp(expectedShort),
    });

    await user.click(chip);

    expect(screen.getByText(/connected/i)).toBeInTheDocument();
    expect(screen.getByText(testAccount.address)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("returns to the 'Connect wallet' state after Disconnect is clicked", async () => {
    const testAccount = privateKeyToAccount(generatePrivateKey());
    const { Wrapper } = makeWrappers(testAccount);
    render(
      <Wrapper>
        <WalletConnectButton />
      </Wrapper>,
    );
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));
    const expectedShort = `${testAccount.address.slice(0, 6)}…${testAccount.address.slice(-4)}`;
    await user.click(
      await screen.findByRole("button", { name: new RegExp(expectedShort) }),
    );
    await user.click(screen.getByRole("button", { name: /disconnect/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    });
  });
});
