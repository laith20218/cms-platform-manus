export { cn } from './utils/cn';

// Primitives
export { Box } from './components/Box';
export { Stack } from './components/Stack';
export { Text } from './components/Text';
export { Container } from './components/Container';
export { Grid } from './components/Grid';

// Components
export { Button, type ButtonProps } from './components/Button';
export { Input, type InputProps } from './components/Input';
export { Card } from './components/Card';
export { Badge } from './components/Badge';
export { Spinner } from './components/Spinner';
export { Skeleton } from './components/Skeleton';
// W15.0 — reusable accessible accordion (lecture/paragraph trees)
export { Accordion, type AccordionItemData, type AccordionProps } from './components/Accordion';

// W1 (admin-ui) — overlay + form + table surfaces for the admin console.
// Dialog/ConfirmDialog/Drawer share the modal a11y contract (portal, focus
// trap, Esc, scroll lock, focus restore); Select/Checkbox are styled native
// semantics; Table/Pagination are the dense-list shells.
export { Dialog, type DialogProps } from './components/Dialog';
export { ConfirmDialog, type ConfirmDialogProps } from './components/ConfirmDialog';
export { Drawer, type DrawerProps } from './components/Drawer';
export { Select, type SelectProps, type SelectOption } from './components/Select';
export { Checkbox, type CheckboxProps } from './components/Checkbox';
// Command Center P1 — anchored action menus for dense data tables (the row
// "⋮"). DropdownMenu is the primitive; RowActionsMenu is the table-row preset.
export { DropdownMenu, RowActionsMenu, type DropdownMenuItem, type DropdownMenuProps, type RowActionsMenuProps } from './components/DropdownMenu';
export {
  TableShell, Table, THead, TBody, TR, TH, TD,
  type TableShellProps,
} from './components/Table';
export { Pagination, type PaginationProps, type PaginationLabels } from './components/Pagination';
