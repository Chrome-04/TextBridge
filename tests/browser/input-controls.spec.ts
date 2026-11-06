import { test, expect } from '@playwright/test'

test('receive code replacement, clipboard paste, clear, and narrow layout', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/receive')
  const input = page.getByLabel('Enter sharing code')
  await input.fill('AAAAAA')
  await input.pressSequentially('BBBBBB')
  await expect(input).toHaveValue('BBBBBB')
  await input.press('Home')
  await input.pressSequentially('C')
  await expect(input).toHaveValue('CBBBBB')
  await page.evaluate(() => navigator.clipboard.writeText(' abc - 234 '))
  await page.getByRole('button', { name: 'Paste code', exact: true }).click()
  await expect(input).toHaveValue('ABC234')
  await expect(page.getByRole('status')).toHaveText('Code pasted.')
  await page.evaluate(() => navigator.clipboard.writeText('AAAAAABBBBBB'))
  await page.getByRole('button', { name: 'Paste code', exact: true }).click()
  await expect(input).toHaveValue('ABC234')
  await expect(page.getByRole('status')).toContainText(
    'current code has not changed',
  )
  await page.getByRole('button', { name: 'Clear code', exact: true }).click()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('clipboard denial provides manual paste instructions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: () => Promise.reject(new Error('Permission denied')),
      },
    })
  })
  await page.goto('/receive')
  await page.getByLabel('Enter sharing code').fill('ABC234')
  await page.getByRole('button', { name: 'Paste code', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(
    'Clipboard access was blocked',
  )
  await expect(page.getByLabel('Enter sharing code')).toHaveValue('ABC234')
})

test('clear text and countdown on generated and received content expire on time', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByLabel('Text or link').fill('A draft')
  await page.getByRole('button', { name: 'Clear text', exact: true }).click()
  await expect(page.getByLabel('Text or link')).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Generate code' }),
  ).toBeDisabled()
  await page.getByLabel('Text or link').fill('Countdown sample')
  await page.getByRole('button', { name: 'Generate code' }).click()
  await expect(page.getByRole('timer')).toContainText('10:00 remaining')
  const code = await page.locator('.sharing-code').innerText()
  await page.clock.fastForward(61_000)
  await expect(page.getByRole('timer')).toContainText('8:59 remaining')
  await page.locator('#tab-receive').click()
  await page.getByLabel('Enter sharing code').fill(code)
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(page.locator('pre')).toHaveText('Countdown sample')
  await expect(page.getByRole('timer')).toContainText(/8:5[89] remaining/)
  await page.clock.fastForward(540_000)
  await expect(
    page.getByRole('heading', { name: 'Code not found or expired.' }),
  ).toBeVisible()
  await expect(page.locator('pre')).toHaveCount(0)
})
