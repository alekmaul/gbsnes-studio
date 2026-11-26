// react-dnd 2.x ships no types
declare module "react-dnd" {
  export type ConnectDragSource = any;
  export type ConnectDropTarget = any;
  export type DragSourceConnector = any;
  export type DragSourceMonitor = any;
  export type DropTargetConnector = any;
  export type DropTargetMonitor = any;
  export const DragSource: any;
  export const DropTarget: any;
  export const DragDropContext: any;
}

declare module "react-dnd-html5-backend";
