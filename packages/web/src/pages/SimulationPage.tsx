import { useState } from "react";
import SimulationForm from "../components/SimulationForm";
import SimulationResultPanel from "../components/SimulationResult";
import type { SimulationResult } from "../types";

export default function SimulationPage() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SimulationForm
        onResult={setResult}
        onLoading={setLoading}
        onError={setError}
      />
      <SimulationResultPanel
        result={result}
        loading={loading}
        error={error}
      />
    </div>
  );
}
