import { URL } from 'node:url';

import { expect, test } from '@playwright/test';

test('create an unarmed check and refuse its duplicate', async ({ page }) => {
  const name = 'Release check';
  const area = 'Walk';
  function replyTo(operation) {
    return page
      .waitForResponse((response) => {
        const url = new URL(response.url());
        if (url.pathname !== '/graphql') return false;
        const request = response.request();
        const name =
          request.method() === 'GET'
            ? url.searchParams.get('operationName')
            : request.postDataJSON()?.operationName;
        return name === operation;
      })
      .then((response) => response.json());
  }

  const [list, counts] = await Promise.all([
    replyTo('Checks'),
    replyTo('StatusCounts'),
    page.goto('/'),
  ]);
  expect(list).toMatchObject({ data: { checks: { matching: 0 } } });
  expect(counts).toMatchObject({ data: { statusCounts: { total: 0 } } });
  await expect(
    page.getByRole('heading', { name: 'No checks yet' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Add a check' }).click();

  async function submitCheck() {
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Area', { exact: true }).fill(area);
    await page.getByRole('button', { name: 'Save check' }).click();
  }
  const [detail] = await Promise.all([
    replyTo('CheckDetail'),
    (async () => {
      const [created] = await Promise.all([
        replyTo('CreateCheck'),
        submitCheck(),
      ]);
      expect(created).toMatchObject({
        data: { createCheck: { __typename: 'Check', name, status: 'UNARMED' } },
      });
    })(),
  ]);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  expect(detail).toMatchObject({
    data: { check: { name, protects: '', howToTellArmed: '' } },
  });
  await expect(page.getByText('Unarmed', { exact: true })).toBeVisible();
  for (const label of [
    'What it protects',
    'How you can tell it is switched on',
  ]) {
    await expect(page.getByRole('region', { name: label })).toContainText(
      'Not written down yet',
    );
  }
  await page
    .locator('main')
    .getByRole('link', { name: 'Checks', exact: true })
    .click();
  await expect(page.getByText('1 of 1 check', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Release check Walk Unarmed/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /1 Unarmed/ })).toBeVisible();

  await page.getByRole('link', { name: 'Add a check' }).click();
  const areaField = page.getByLabel('Area', { exact: true });
  await expect
    .poll(() =>
      areaField.evaluate((input) =>
        Array.from(input.list.options, (option) => option.value),
      ),
    )
    .toEqual([area]);
  const [duplicate] = await Promise.all([
    replyTo('CreateCheck'),
    submitCheck(),
  ]);
  expect(duplicate).toMatchObject({
    data: {
      createCheck: {
        __typename: 'ValidationErrors',
        errors: [
          { path: 'name', message: 'There is already a check with this name.' },
        ],
      },
    },
  });
  await expect(
    page.getByLabel('Name', { exact: true }),
  ).toHaveAccessibleDescription(/There is already a check with this name/);
});
