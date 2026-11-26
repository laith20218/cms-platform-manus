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

// PR-2 (admin shell) — standardized page furniture: center headers, location
// breadcrumbs, zero-data and failure surfaces. EmptyState/ErrorState carry
// their a11y semantics (status / alert) inside the primitive.
export { PageHeader, type PageHeaderProps } from './components/PageHeader';
export { Breadcrumbs, type BreadcrumbsProps, type BreadcrumbItem } from './components/Breadcrumbs';
export { EmptyState, type EmptyStateProps } from './components/EmptyState';
export { ErrorState, type ErrorStateProps } from './components/ErrorState';

// PR-2 — the shared modal a11y contract, now public for app-level overlays
// that predate @cms/ui Dialog (AdminsCenter DialogLayer, NotificationCompose):
// focus trap, Escape, scroll lock and focus restore. New surfaces should
// prefer the Dialog/Drawer components; this hook exists for retrofitting.
export { useModalA11y, type UseModalA11yOptions } from './utils/useModalA11y';
