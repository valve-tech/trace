import type { ForkInfo } from "../../api/testnets";
import { RpcUrlPanel } from "./ForkControls/RpcUrlPanel";
import { FaucetPanel } from "./ForkControls/FaucetPanel";
import { SnapshotsPanel } from "./ForkControls/SnapshotsPanel";
import { TimeTravelPanel } from "./ForkControls/TimeTravelPanel";
import { MineBlocksPanel } from "./ForkControls/MineBlocksPanel";
import { DestroyPanel } from "./ForkControls/DestroyPanel";

interface ForkControlsProps {
  fork: ForkInfo;
  onDestroyed: () => void;
  onRefresh: () => void;
}

export default function ForkControls({
  fork,
  onDestroyed,
  onRefresh,
}: ForkControlsProps) {
  return (
    <div className="space-y-stack mt-4">
      <RpcUrlPanel rpcUrl={fork.rpcUrl} />
      <FaucetPanel forkId={fork.id} />
      <SnapshotsPanel forkId={fork.id} onReverted={onRefresh} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-row">
        <TimeTravelPanel forkId={fork.id} onAdvanced={onRefresh} />
        <MineBlocksPanel forkId={fork.id} onMined={onRefresh} />
      </div>

      <DestroyPanel forkId={fork.id} onDestroyed={onDestroyed} />
    </div>
  );
}
