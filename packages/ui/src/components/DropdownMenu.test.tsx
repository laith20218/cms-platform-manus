import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu, RowActionsMenu, type DropdownMenuItem } from './DropdownMenu';

const items: DropdownMenuItem[] = [
  { key: 'edit', label: 'تعديل', onSelect: vi.fn() },
  { key: 'view', label: 'عرض', onSelect: vi.fn() },
  { key: 'delete', label: 'حذف نهائي', danger: true, dividerBefore: true, onSelect: vi.fn() },
  { key: 'locked', label: 'معطّل', disabled: true, onSelect: vi.fn() },
];

const Harness = (props: Record<string, unknown> = {}) => (
  <div>
    <h1>الجدول</h1>
    <DropdownMenu
      items={items}
      triggerLabel="إجراءات السطر"
      trigger={<span aria-hidden="true">⋮</span>}
      {...(props as object)}
    />
  </div>
);

describe('DropdownMenu', () => {
  it('renders only the trigger while closed, with menu semantics', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'إجراءات السطر' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on click and exposes role=menu with menuitem entries', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'إجراءات السطر' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(items.length);
    expect(screen.getByRole('menuitem', { name: 'حذف نهائي' })).toBeInTheDocument();
  });

  it('selecting an item fires onSelect and closes the menu', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'إجراءات السطر' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'تعديل' }));
    expect(items[0].onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('Escape closes the menu and restores focus to the trigger', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'إجراءات السطر' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'إجراءات السطر' })).toHaveFocus();
  });

  it('closes on outside pointerdown', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'إجراءات السطر' }));
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('opens via ArrowDown on the trigger and moves focus to the first enabled item', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'إجراءات السطر' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'تعديل' })).toHaveFocus());
  });

  it('ArrowDown cycles through enabled items only', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'إجراءات السطر' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'تعديل' })).toHaveFocus());

    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'حذف نهائي' })).toHaveFocus();

    const dangerItem = screen.getByRole('menuitem', { name: 'حذف نهائي' });
    fireEvent.keyDown(dangerItem, { key: 'ArrowDown' });
    // skips the disabled item, wraps to the first enabled one
    expect(screen.getByRole('menuitem', { name: 'تعديل' })).toHaveFocus();
  });

  it('disabled items render aria-disabled and never fire onSelect', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'إجراءات السطر' }));
    const disabled = screen.getByRole('menuitem', { name: 'معطّل' });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(disabled);
    expect(items[3].onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('marks the destructive item and the divider semantically', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'إجراءات السطر' }));
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'حذف نهائي' }).className).toContain('danger');
  });
});

describe('RowActionsMenu', () => {
  it('renders the three-dots trigger and opens the shared menu', async () => {
    render(<RowActionsMenu label="إجراءات" items={[{ key: 'edit', label: 'تعديل', onSelect: vi.fn() }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'إجراءات' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'تعديل' })).toBeInTheDocument();
  });
});
