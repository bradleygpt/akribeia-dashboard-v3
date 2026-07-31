import { RouteLoading } from "../route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="Loading the Risk Radar"
      detail="Retrieving source-attributed risks, severity, horizon, watch signals and cross-source themes."
    />
  );
}
