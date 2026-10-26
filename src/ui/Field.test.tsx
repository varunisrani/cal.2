import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field, type FieldProps } from './Field';

afterEach(cleanup);

function Harness(props: Partial<FieldProps> & { onText?: (text: string) => void }) {
  const [text, setText] = useState('');
  const { onText, ...rest } = props;
  return (
    <Field
      label="Protein"
      value={text}
      onChange={(next) => {
        setText(next);
        onText?.(next);
      }}
      data-ui="test.protein"
      {...rest}
    />
  );
}

describe('Field', () => {
  it('is a text input found by its label, with its data-ui hook', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Protein' });
    expect(input).toHaveAttribute('data-ui', 'test.protein');
    expect(input).not.toBeInvalid();
  });

  it('reports what is typed', async () => {
    const user = userEvent.setup();
    const onText = vi.fn();
    render(<Harness onText={onText} />);
    await user.type(screen.getByRole('textbox', { name: 'Protein' }), '12.5');
    expect(onText).toHaveBeenLastCalledWith('12.5');
    expect(screen.getByRole('textbox', { name: 'Protein' })).toHaveValue('12.5');
  });

  it('is described by its unit and hint', () => {
    render(<Harness unit="g" hint="Leave blank for 0" />);
    const input = screen.getByRole('textbox', { name: 'Protein' });
    expect(input).toHaveAccessibleDescription('g Leave blank for 0');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('is marked invalid and described by its error', () => {
    render(<Harness error="Enter a number" />);
    const input = screen.getByRole('textbox', { name: 'Protein' });
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Enter a number');
    expect(screen.getByText('Enter a number')).toBeInTheDocument();
  });

  it('passes inputMode and other input attributes through', () => {
    render(<Harness inputMode="decimal" placeholder="0" autoComplete="off" />);
    const input = screen.getByRole('textbox', { name: 'Protein' });
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('placeholder', '0');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });
});
