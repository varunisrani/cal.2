import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field, type FieldProps } from './Field';

afterEach(cleanup);

/** A field that keeps its own text, like a form would. */
function Controlled(props: Omit<FieldProps, 'value'> & { readonly start?: string }) {
  const { start = '', onValueChange, ...rest } = props;
  const [value, setValue] = useState(start);
  return (
    <Field
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe('Field', () => {
  it('is named by its label and carries its data-ui hook', () => {
    render(<Field label="Food name" value="" data-ui="test.name" />);
    const input = screen.getByRole('textbox', { name: 'Food name' });
    expect(input).toHaveAttribute('data-ui', 'test.name');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('reports every edit as text', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled label="Food name" data-ui="test.name" onValueChange={onValueChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Food name' }), 'Rye');
    expect(onValueChange).toHaveBeenLastCalledWith('Rye');
    expect(screen.getByRole('textbox', { name: 'Food name' })).toHaveValue('Rye');
  });

  it('reads its unit and hint as its description', () => {
    render(
      <Field
        label="Energy"
        value="250"
        unit="kcal"
        hint="Whole numbers only"
        inputMode="numeric"
        data-ui="test.energy"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Energy' });
    expect(input).toHaveAccessibleDescription('kcal Whole numbers only');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('marks itself invalid and reads the error', () => {
    render(<Field label="Energy" value="" error="Enter an amount" data-ui="test.energy" />);
    const input = screen.getByRole('textbox', { name: 'Energy' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter an amount');
  });

  it('passes other input attributes through', () => {
    render(
      <Field
        label="Search"
        value=""
        type="search"
        autoComplete="off"
        maxLength={40}
        data-ui="test.search"
      />,
    );
    const input = screen.getByRole('searchbox', { name: 'Search' });
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('maxlength', '40');
  });
});
