import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { TextField, ToggleField } from './fields';

describe('a text field', () => {
  it('ties the control to its label and is required unless optional', () => {
    render(
      <>
        <TextField id="name" label="Name" value="" onChange={() => undefined} />
        <TextField
          id="note"
          label="Note"
          optional
          multiline
          value=""
          onChange={() => undefined}
        />
      </>,
    );

    expect(screen.getByLabelText('Name')).toBeRequired();
    expect(screen.getByLabelText('Note (optional)')).not.toBeRequired();
    expect(screen.getByLabelText('Note (optional)').tagName).toBe('TEXTAREA');
  });

  it('is marked only while it carries a message', () => {
    const { rerender } = render(
      <TextField id="name" label="Name" value="" onChange={() => undefined} />,
    );
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');

    rerender(
      <TextField
        id="name"
        label="Name"
        value=""
        onChange={() => undefined}
        error="A check needs a name."
      />,
    );

    const control = screen.getByLabelText('Name');
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription('A check needs a name.');
  });
});

function Switch(): ReactElement {
  const [armed, setArmed] = useState<'on' | 'off' | null>(null);
  return (
    <ToggleField
      id="armed"
      label="Is it on?"
      choices={[
        { value: 'on', label: 'It is on' },
        { value: 'off', label: 'It is off' },
      ]}
      value={armed}
      onChange={setArmed}
    />
  );
}

describe('a toggle field', () => {
  it('groups its buttons under the label', () => {
    render(<Switch />);

    expect(
      screen.getByRole('group', { name: 'Is it on?' }),
    ).toBeInTheDocument();
  });

  it('presses one button at a time and never unpresses the chosen one', async () => {
    const user = userEvent.setup();
    render(<Switch />);
    const on = screen.getByRole('button', { name: 'It is on' });
    const off = screen.getByRole('button', { name: 'It is off' });
    expect(on).toHaveAttribute('aria-pressed', 'false');
    expect(off).toHaveAttribute('aria-pressed', 'false');

    await user.click(on);
    await user.click(on);
    expect(on).toHaveAttribute('aria-pressed', 'true');

    await user.click(off);
    expect(on).toHaveAttribute('aria-pressed', 'false');
    expect(off).toHaveAttribute('aria-pressed', 'true');
  });
});
