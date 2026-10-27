import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { scan } from '../../../i18n/en/scan';
import { DigitsField } from './DigitsField';

const words = scan.scan.digits;

function mount() {
  const onSubmit = vi.fn();
  render(<DigitsField onSubmit={onSubmit} />);
  const field = screen.getByRole('textbox', { name: words.label });
  const button = screen.getByRole('button', { name: words.submit });
  const type = (text: string) => fireEvent.change(field, { target: { value: text } });
  return { onSubmit, field, button, type };
}

describe('DigitsField (D-16.18)', () => {
  it('hands on the digits without the spaces printed between them', () => {
    const { onSubmit, button, type } = mount();
    type('0 12345 67890 5');
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith('012345678905');
  });

  it('looks up on Enter too', () => {
    const { onSubmit, field, type } = mount();
    type('4006381333931');
    fireEvent.submit(field.closest('form') as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledWith('4006381333931');
  });

  it('refuses letters with a line under the field, which goes when the text changes', () => {
    const { onSubmit, field, button, type } = mount();
    type('40063A1333931');
    fireEvent.click(button);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(words.notDigits);

    type('4006381333931');
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(words.notDigits)).toBeNull();
  });

  it('refuses more than 24 digits', () => {
    const { onSubmit, button, type } = mount();
    type('1'.repeat(25));
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(words.tooLong)).toBeVisible();
  });

  it('keeps Look up off until something is typed', () => {
    const { onSubmit, field, button, type } = mount();
    expect(button).toBeDisabled();
    type('   ');
    expect(button).toBeDisabled();
    fireEvent.submit(field.closest('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(words.empty)).toBeVisible();
  });
});
