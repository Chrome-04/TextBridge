// Only demo Auth emulator OOB links; no production accounts or mailboxes.
export async function verifyEmulatorEmail(email) {
  const response = await fetch(
    'http://127.0.0.1:9099/emulator/v1/projects/demo-textbridge/oobCodes',
  )
  const { oobCodes = [] } = await response.json()
  const code = oobCodes
    .filter(
      (item) => item.email === email && item.requestType === 'VERIFY_EMAIL',
    )
    .at(-1)
  if (!code)
    throw new Error('No local verification link found for this test account.')
  const result = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oobCode: code.oobCode }),
    },
  )
  if (!result.ok) throw new Error('Local verification failed.')
}
