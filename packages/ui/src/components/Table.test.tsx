import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableShell, Table, THead, TBody, TR, TH, TD } from './Table';

describe('Table shell', () => {
  it('renders a dense admin table with headers, rows and cells', () => {
    render(
      <TableShell data-testid="shell">
        <Table>
          <THead>
            <TR>
              <TH>المفتاح</TH>
              <TH>القيمة</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD>max_upload</TD>
              <TD>25</TD>
            </TR>
          </TBody>
        </Table>
      </TableShell>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'المفتاح' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'max_upload' })).toBeInTheDocument();
    expect(screen.getByTestId('shell').className).toContain('overflow-x-auto');
  });

  it('headers default to logical text-start so they flip with direction', () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH data-testid="th">عمود</TH>
          </TR>
        </THead>
      </Table>,
    );
    expect(screen.getByTestId('th').className).toContain('text-start');
  });

  it('forwards className overrides (tailwind-merge contract)', () => {
    render(
      <Table>
        <TBody>
          <TR>
            <TD data-testid="td" className="text-base font-bold">قيمة</TD>
          </TR>
        </TBody>
      </Table>,
    );
    const td = screen.getByTestId('td');
    expect(td.className).toContain('text-base');
    expect(td.className).toContain('font-bold');
  });
});
