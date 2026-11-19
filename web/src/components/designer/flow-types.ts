import type { Edge, Node } from "@xyflow/react";
import type { DeviceData, LinkData } from "@/lib/types";

export type DeviceNodeT = Node<DeviceData, "device">;
export type LinkEdgeT = Edge<LinkData, "link">;
