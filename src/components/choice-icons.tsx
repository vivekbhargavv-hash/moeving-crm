import { BatteryCharging, Package, Plug, User, Users } from "lucide-react";

/**
 * One source for the driver and charging tiles, so the create sheet and the
 * edit sheet can never drift apart.
 *
 * Driver-cum-Delivery is a person beside a package: the driver who also drops
 * the goods. A truck was rejected — a truck already means "vehicle type"
 * elsewhere in the app and would read as the wrong field.
 */
export const DRIVER_ICONS: Record<string, React.ReactNode> = {
  driver_only: <User size={22} />,
  driver_plus_helper: <Users size={22} />,
  driver_cum_helper: (
    <>
      <User size={20} />
      <Package size={16} />
    </>
  ),
};

export const CHARGING_ICONS: Record<string, React.ReactNode> = {
  client: <Plug size={22} />,
  moeving: <BatteryCharging size={22} />,
};
